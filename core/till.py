"""The till: prices a cart and books it as one InvenTree sales order.

The stock app and the touch kiosk both send their cart here instead of
pricing and booking it themselves, so the rules live in one place:

- a part costs its sale price (the price break with the smallest quantity);
- a 3D print costs grams x the filament's "3D-print prijs per gram";
- laser and CNC cost minutes x the sale price of their part in the category
  "machinegebruik"; all cuts in a cart are one Lasertime line, rounded up once;
- machine use (prints, laser, CNC) together costs at least the highest
  "Minimum" among them, per payment; drinks and products do not count. The
  top-up is spread over the machine lines in proportion to their price, so the
  analytics give each machine its share;
- volunteer machine use (kiosk VOLUNTEER) is booked at EUR 0.

A cart (JSON):
    items     [{part, quantity}]                 products
    prints    [{part, material, grams}]          part = the filament, for its price per gram
    machines  [{tool: laser|cnc, minutes}]       time typed in at the till
    cuts      [session id]                       laser cuts from the laser timer
    volunteer bool                               machine use at EUR 0; no products then
    source    "stock-app" | "interface-stock"    shown on the TV changelog
"""
import math
import os
import threading
import time

import requests

CURRENCY = 'EUR'
TILL_CUSTOMER = 'Walk-in customer'
MACHINE_CATEGORY = 'machinegebruik'
PRINT_PRICE_TEMPLATE = os.environ.get('PRINT_PRICE_TEMPLATE_NAME', '3D-print prijs per gram')
MINIMUM_TEMPLATE = 'Minimum'
# Used when InvenTree has no price for a machine or filament.
FALLBACK = {
    'laser': float(os.environ.get('COST_PER_MIN', '0.50')),
    'cnc': float(os.environ.get('CNC_PRICE_PER_MIN', '0.50')),
    'print': float(os.environ.get('PRINT_PRICE_PER_GRAM', '0.10')),
}
PRINT_MINIMUM = float(os.environ.get('PRINT_MINIMUM', '5'))
# tool -> (part name in MACHINE_CATEGORY, sales-order reference, label on the TV)
TOOLS = {'laser': ('Lasercutter', 'Lasertime', 'Lasercut'), 'cnc': ('CNC', 'CNC time', 'CNC')}
SO_STATUS_COMPLETE = 30
SHIPMENT_TIMEOUT_S = 30
PRICE_CACHE_S = 300
TV_URL = os.environ.get('TV_PRESENTATION_URL', '').rstrip('/')


class CartError(Exception):
    """Something the visitor can fix (or a volunteer has to): shown as is."""


class BookedError(Exception):
    """The order exists and its stock may be moving: the sale stands, it must not be booked again."""

    def __init__(self, reference: str, cause: Exception):
        super().__init__(f'{reference} is booked, but InvenTree did not finish it ({cause}). Check the order in InvenTree.')
        self.reference = reference


# ------------------------------------------------------------------ prices

class Prices:
    """What the till needs from InvenTree, loaded at most every PRICE_CACHE_S."""

    def __init__(self, sale: dict[int, float], names: dict[int, str], per_gram: dict[int, float],
                 machines: dict[str, tuple[float, float]]):
        self.sale, self.names, self.per_gram, self.machines = sale, names, per_gram, machines


_prices: tuple[float, Prices] | None = None
_prices_lock = threading.Lock()


def _parameter(inv, name: str) -> dict[int, float]:
    """Part pk -> the positive number in a part parameter."""
    template = next((t['pk'] for t in inv.get('parameter/template/', search=name, limit=50) if t['name'] == name), None)
    if template is None:
        return {}
    out = {}
    for r in inv.get('parameter/', model_type='part.part', template=template, limit=5000):
        try:
            v = float(str(r['data']).replace(',', '.').strip())
        except ValueError:
            continue
        if v > 0:
            out[r['model_id']] = v
    return out


def load_prices(inv) -> Prices:
    global _prices
    with _prices_lock:
        if _prices and time.time() - _prices[0] < PRICE_CACHE_S:
            return _prices[1]
        best: dict[int, tuple[float, float]] = {}   # cheapest-quantity price break, as the kiosk did
        for b in inv.get('part/sale-price/', limit=5000):
            q, p = float(b['quantity']), float(b['price'])
            if b['part'] not in best or q < best[b['part']][0]:
                best[b['part']] = (q, p)
        sale = {pk: p for pk, (_, p) in best.items()}
        parts = inv.get('part/', active=True, category_detail=True, limit=5000)
        names = {p['pk']: p['name'] for p in parts}
        minimums = _parameter(inv, MINIMUM_TEMPLATE)
        machines = {}
        for tool, (part_name, _, _) in TOOLS.items():
            pk = next((p['pk'] for p in parts if p['name'].lower() == part_name.lower()
                       and ((p.get('category_detail') or {}).get('name') or '').lower() == MACHINE_CATEGORY), None)
            machines[tool] = (sale.get(pk, FALLBACK[tool]), minimums.get(pk, 0.0))
        prices = Prices(sale, names, _parameter(inv, PRINT_PRICE_TEMPLATE), machines)
        _prices = (time.time(), prices)
        return prices


def forget_prices():
    global _prices
    with _prices_lock:
        _prices = None


def rates(prices: Prices) -> dict:
    """Machine prices for the screens: per minute / per gram and the minimum per payment."""
    return {**{tool: {'per_minute': rate, 'minimum': minimum} for tool, (rate, minimum) in prices.machines.items()},
            'print': {'per_gram': {str(k): v for k, v in prices.per_gram.items()}, 'default_per_gram': FALLBACK['print'],
                      'minimum': PRINT_MINIMUM}}


# ------------------------------------------------------------------ quote

def _int(v, what: str) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise CartError(f'{what} must be a whole number')
    if n <= 0:
        raise CartError(f'{what} must be more than 0')
    return n


def quote(cart: dict, prices: Prices, cuts: list[dict]) -> dict:
    """The bill for a cart. `cuts`: the unpaid laser sessions it names (id, name, total_time).

    Returns items and extras at their own price, `top_up` to the minimum and `total`.
    Every extra also has `booked_price`: its unit price with its share of the top-up.
    """
    volunteer = bool(cart.get('volunteer'))
    items = []
    for line in cart.get('items') or []:
        pk, qty = _int(line.get('part'), 'part'), _int(line.get('quantity'), 'quantity')
        name = prices.names.get(pk, f'Part {pk}')
        if pk not in prices.sale:
            # Never sell at 0 by accident: the kiosk showed 0 for these on purpose.
            raise CartError(f'No price for {name}. Ask a volunteer.')
        items.append({'part': pk, 'name': name, 'quantity': qty, 'unit_price': prices.sale[pk]})
    if volunteer and items:
        raise CartError('Volunteer checkout is for machine use only')

    extras = []   # machine lines, each with its minimum
    for p in cart.get('prints') or []:
        grams = _int(p.get('grams'), 'grams')
        part = p.get('part')
        extras.append({'kind': 'print', 'reference': '3D printing', 'description': str(p.get('material') or '')[:120],
                       'quantity': grams, 'unit': 'g', 'unit_price': prices.per_gram.get(part, FALLBACK['print']),
                       'minimum': PRINT_MINIMUM})
    if cuts:
        seconds = sum(c['total_time'] for c in cuts)
        rate, minimum = prices.machines['laser']
        extras.append({'kind': 'laser', 'reference': TOOLS['laser'][1],
                       'description': ', '.join(c['name'] for c in cuts)[:120],
                       'quantity': math.ceil(round(seconds, 3) / 60), 'unit': 'min', 'unit_price': rate,
                       'minimum': minimum, 'cuts': [c['id'] for c in cuts]})
    for m in cart.get('machines') or []:
        tool = m.get('tool')
        if tool not in TOOLS:
            raise CartError(f'Unknown machine {tool!r}')
        rate, minimum = prices.machines[tool]
        extras.append({'kind': tool, 'reference': TOOLS[tool][1], 'description': '',
                       'quantity': _int(m.get('minutes'), 'minutes'), 'unit': 'min', 'unit_price': rate,
                       'minimum': minimum})

    if volunteer:
        for e in extras:
            e['unit_price'] = 0.0
            e['minimum'] = 0.0
    raw = sum(e['quantity'] * e['unit_price'] for e in extras)
    top_up = max(0.0, max((e['minimum'] for e in extras), default=0.0) - raw)
    for e in extras:
        price = e['quantity'] * e['unit_price']
        share = top_up * price / raw if raw > 0 else top_up / len(extras)
        e['booked_price'] = (price + share) / e['quantity']
    total = sum(i['quantity'] * i['unit_price'] for i in items) + raw + top_up
    return {'items': items, 'extras': extras, 'top_up': round(top_up, 2), 'total': round(total, 2),
            'volunteer': volunteer}


# ------------------------------------------------------------------ booking

def _till_customer(inv) -> int:
    for c in inv.get('company/', is_customer=True, search=TILL_CUSTOMER, limit=50):
        if c['name'] == TILL_CUSTOMER:
            return c['pk']
    return inv.post('company/', {'name': TILL_CUSTOMER, 'description': 'Sales at the self-service till',
                                 'is_customer': True, 'is_supplier': False, 'is_manufacturer': False})['pk']


def _home_stock(inv, part: int) -> list[dict]:
    """The part's stock items that are still ours, largest first (as the stock app did)."""
    rows = inv.get('stock/', part=part, sent_to_customer=False, consumed=False, installed=False, limit=100)
    rows = [r for r in rows if not (r.get('customer') or r.get('sales_order') or r.get('belongs_to')
                                    or r.get('consumed_by') or r.get('is_building'))]
    return sorted(rows, key=lambda r: -float(r['quantity']))


def describe(bill: dict) -> str:
    parts = [f"{i['name']} x{i['quantity']}" for i in bill['items']]
    parts += [f"{e['reference']}{' – ' + e['description'] if e['description'] else ''} {e['quantity']} {e['unit']}"
              for e in bill['extras']]
    return ', '.join(parts)


def book(inv, bill: dict) -> dict:
    """One sales order: lines, extra lines, issue, ship the products, complete.

    Products the till thinks are out of stock are still sold: the line stays
    partly unshipped, which shows the difference in InvenTree instead of
    refusing the sale. Returns {reference, unshipped}.
    """
    order = inv.post('order/so/', {'customer': _till_customer(inv), 'description': describe(bill)[:250]})
    shipping = False   # once InvenTree's worker ships, cancelling could leave stock shipped on a cancelled order
    try:
        lines = []
        for i in bill['items']:
            created = inv.post('order/so-line/', {'order': order['pk'], 'part': i['part'], 'quantity': i['quantity'],
                                                  'sale_price': f"{i['unit_price']:.2f}", 'sale_price_currency': CURRENCY})
            lines.append((created['pk'], i))
        for e in bill['extras']:
            # Reference = the service, description = who / which filament: the analytics group on both.
            inv.post('order/so-extra-line/', {'order': order['pk'], 'reference': e['reference'],
                                              'description': e['description'], 'quantity': e['quantity'],
                                              'price': f"{e['booked_price']:.4f}", 'price_currency': CURRENCY})
        inv.post(f"order/so/{order['pk']}/issue/", {})

        allocations, unshipped = [], []
        for line_pk, i in lines:
            left = i['quantity']
            for s in _home_stock(inv, i['part']):
                take = min(left, float(s['quantity']))
                if take > 0:
                    allocations.append({'line_item': line_pk, 'stock_item': s['pk'], 'quantity': take})
                    left -= take
                if left <= 0:
                    break
            if left > 0:
                unshipped.append({'part': i['part'], 'quantity': left})
        if allocations:
            shipment = inv.post('order/so/shipment/', {'order': order['pk'], 'reference': '1'})
            inv.post(f"order/so/{order['pk']}/allocate/", {'items': allocations, 'shipment': shipment['pk']})
            inv.post(f"order/so/shipment/{shipment['pk']}/ship/", {})
            shipping = True
            # InvenTree's background worker sets shipment_date once the stock has moved.
            deadline = time.time() + SHIPMENT_TIMEOUT_S
            while not inv.get(f"order/so/shipment/{shipment['pk']}/").get('shipment_date'):
                if time.time() > deadline:
                    raise RuntimeError('still shipping after 30 s')
                time.sleep(0.4)
        # Without SALESORDER_SHIP_COMPLETE the first call only reaches "shipped".
        for _ in range(2):
            if inv.get(f"order/so/{order['pk']}/").get('status') == SO_STATUS_COMPLETE:
                break
            inv.post(f"order/so/{order['pk']}/complete/", {'accept_incomplete': True})
        return {'reference': order['reference'], 'unshipped': unshipped}
    except Exception as e:
        if shipping:
            raise BookedError(order['reference'], e) from e
        try:
            inv.post(f"order/so/{order['pk']}/cancel/", {})
        except Exception:
            pass
        raise


def tell_tv(bill: dict, source: str):
    """The TV's changelog, in the background: never holds up a sale."""
    if not TV_URL:
        return
    action = 'volunteer' if bill['volunteer'] else 'checkout'
    events = [{'item_name': i['name'], 'quantity': i['quantity'], 'price': round(i['quantity'] * i['unit_price'], 2)}
              for i in bill['items']]
    # No person: the TV is public.
    events += [{'item_name': f"{TOOLS[e['kind']][2] if e['kind'] in TOOLS else '3D print'} · {e['quantity']} {e['unit']}",
                'quantity': 1, 'price': round(e['quantity'] * e['booked_price'], 2)} for e in bill['extras']]

    def send():
        for ev in events:
            if action == 'volunteer' or not ev['price']:
                ev.pop('price')
            try:
                requests.post(f'{TV_URL}/api/changelog', json={'action': action, 'source': source, **ev}, timeout=3)
            except requests.RequestException:
                pass
    threading.Thread(target=send, daemon=True).start()

