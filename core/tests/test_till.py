import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as core  # noqa: E402
import db  # noqa: E402
import till  # noqa: E402

COLA, PLA, LASER, CNC = 1, 2, 97, 98


class FakeInvenTree:
    """The InvenTree endpoints the till uses, with a log of every write."""

    def __init__(self):
        self.posts = []
        self.fail_on = None
        self.stock = {COLA: [{'pk': 501, 'quantity': 3}]}

    def get(self, path, **q):
        if path == 'part/sale-price/':
            return [{'part': COLA, 'quantity': 1, 'price': '1.50'}, {'part': COLA, 'quantity': 6, 'price': '1.20'},
                    {'part': LASER, 'quantity': 1, 'price': '0.50'}, {'part': CNC, 'quantity': 1, 'price': '1.00'}]
        if path == 'part/':
            mg = {'name': 'Machinegebruik'}
            return [{'pk': COLA, 'name': 'Cola'}, {'pk': PLA, 'name': 'PLA Black (1 kg)'},
                    {'pk': LASER, 'name': 'Lasercutter', 'category_detail': mg}, {'pk': CNC, 'name': 'CNC', 'category_detail': mg}]
        if path == 'parameter/template/':
            return [{'pk': 10, 'name': 'Minimum'}, {'pk': 11, 'name': '3D-print prijs per gram'}]
        if path == 'parameter/':
            return {10: [{'model_id': LASER, 'data': '5'}, {'model_id': CNC, 'data': '5'}],
                    11: [{'model_id': PLA, 'data': '0,08'}]}[q['template']]
        if path == 'company/':
            return [{'pk': 7, 'name': 'Walk-in customer'}]
        if path == 'stock/':
            return self.stock.get(q['part'], [])
        if path.startswith('order/so/shipment/'):
            return {'shipment_date': '2026-10-28'}
        if path.startswith('order/so/'):
            return {'status': 30 if any(p.endswith('/complete/') for p, _ in self.posts) else 20}
        raise AssertionError(path)

    def post(self, path, body):
        if self.fail_on and self.fail_on in path:
            raise RuntimeError(f'POST {path}: 500')
        self.posts.append((path, body))
        if path == 'order/so/':
            return {'pk': 42, 'reference': 'SO-0042'}
        return {'pk': len(self.posts)}

    def paths(self):
        return [p for p, _ in self.posts]


@pytest.fixture
def env(tmp_path, monkeypatch):
    db.connect(str(tmp_path / 'machineusage.db'))
    inv = FakeInvenTree()
    monkeypatch.setattr(core, '_inventree', inv)
    monkeypatch.setattr(till, 'TV_URL', '')
    till.forget_prices()
    return core.app.test_client(), inv


def cut(name, seconds):
    sid = core.app.test_client().post('/laser/api/sessions', json={'name': name}).json['id']
    db.execute('UPDATE sessions SET total_time = ? WHERE id = ?', (seconds, sid))
    return sid


def test_products_use_the_smallest_price_break_and_minimum_skips_them(env):
    c, _ = env
    bill = c.post('/api/till/quote', json={'items': [{'part': COLA, 'quantity': 2}]}).json
    assert bill['items'][0]['unit_price'] == 1.5
    assert bill['top_up'] == 0 and bill['total'] == 3.0


def test_cuts_are_one_line_rounded_up_once_with_the_minimum_spread(env):
    c, _ = env
    a, b = cut('Ruben', 61), cut('Kristian', 61)          # 122 s = 3 min, not 2 + 2
    bill = c.post('/api/till/quote', json={'cuts': [a, b], 'machines': [{'tool': 'cnc', 'minutes': 1}]}).json
    laser, cnc = bill['extras']
    assert laser['quantity'] == 3 and laser['description'] == 'Ruben, Kristian'
    # 1.50 laser + 1.00 CNC = 2.50, minimum 5: top-up 2.50 spread 3:2
    assert bill['top_up'] == 2.5 and bill['total'] == 5.0
    assert laser['booked_price'] * 3 == pytest.approx(3.0) and cnc['booked_price'] == pytest.approx(2.0)


def test_print_price_per_gram_from_the_filament(env):
    c, _ = env
    bill = c.post('/api/till/quote', json={'prints': [{'part': PLA, 'material': 'PLA', 'grams': 100}]}).json
    assert bill['extras'][0]['unit_price'] == 0.08 and bill['total'] == 8.0


def test_volunteer_machine_use_is_free_and_no_products(env):
    c, _ = env
    bill = c.post('/api/till/quote', json={'volunteer': True, 'machines': [{'tool': 'laser', 'minutes': 4}]}).json
    assert bill['total'] == 0 and bill['extras'][0]['booked_price'] == 0
    r = c.post('/api/till/quote', json={'volunteer': True, 'items': [{'part': COLA, 'quantity': 1}]})
    assert r.status_code == 400


def test_part_without_price_is_refused(env):
    c, _ = env
    r = c.post('/api/till/quote', json={'items': [{'part': PLA, 'quantity': 1}]})
    assert r.status_code == 400 and 'No price for PLA Black' in r.json['error']


def test_checkout_books_one_order_and_marks_cuts_paid(env):
    c, inv = env
    sid = cut('Ruben', 300)
    r = c.post('/api/till/checkout', json={'key': 'sale-0001', 'items': [{'part': COLA, 'quantity': 5}], 'cuts': [sid]})
    assert r.status_code == 200 and r.json['reference'] == 'SO-0042'
    assert r.json['unshipped'] == [{'part': COLA, 'quantity': 2}]    # 3 in stock, 5 sold
    assert inv.paths() == ['order/so/', 'order/so-line/', 'order/so-extra-line/', 'order/so/42/issue/',
                           'order/so/shipment/', 'order/so/42/allocate/', 'order/so/shipment/5/ship/', 'order/so/42/complete/']
    [row] = db.query('SELECT paid_at, order_ref FROM sessions WHERE id = ?', (sid,))
    assert row['order_ref'] == 'SO-0042'


def test_same_key_twice_books_once(env):
    c, inv = env
    body = {'key': 'sale-0002', 'items': [{'part': COLA, 'quantity': 1}]}
    first = c.post('/api/till/checkout', json=body).json
    n = len(inv.posts)
    assert c.post('/api/till/checkout', json=body).json == first
    assert len(inv.posts) == n


def test_failed_booking_cancels_and_can_be_retried(env):
    c, inv = env
    sid = cut('Ruben', 60)
    inv.fail_on = 'issue'
    r = c.post('/api/till/checkout', json={'key': 'sale-0003', 'cuts': [sid]})
    assert r.status_code == 502 and inv.paths()[-1] == 'order/so/42/cancel/'
    assert db.query('SELECT paid_at FROM sessions WHERE id = ?', (sid,))[0]['paid_at'] is None
    inv.fail_on = None
    assert c.post('/api/till/checkout', json={'key': 'sale-0003', 'cuts': [sid]}).status_code == 200


def test_paid_cut_cannot_be_sold_again(env):
    c, _ = env
    sid = cut('Ruben', 60)
    assert c.post('/api/till/checkout', json={'key': 'sale-0004', 'cuts': [sid]}).status_code == 200
    r = c.post('/api/till/checkout', json={'key': 'sale-0005', 'cuts': [sid]})
    assert r.status_code == 400 and 'already paid' in r.json['error']


def test_rates_for_the_screens(env):
    c, _ = env
    r = c.get('/api/till/rates').json
    assert r['laser'] == {'per_minute': 0.5, 'minimum': 5.0} and r['cnc']['per_minute'] == 1.0
    assert r['print']['per_gram'] == {str(PLA): 0.08} and r['print']['minimum'] == 5.0
