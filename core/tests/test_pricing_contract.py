"""Runs tests/contract/pricing-cases.json (shared with the TypeScript side) against checkout.quote."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import checkout  # noqa: E402

FIXTURE = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'tests', 'contract', 'pricing-cases.json')))
WORLD = FIXTURE['world']


class FakeInv:
    def __init__(self, patch):
        self.patch = patch

    def get(self, path, **q):
        drop = self.patch.get('drop_sale_prices', [])
        if path == 'part/sale-price/':
            return [b for b in WORLD['sale_breaks'] if b['part'] not in drop]
        if path == 'part/':
            return [{'pk': p['pk'], 'name': p['name'], **({'category_detail': {'name': p['category']}} if 'category' in p else {})}
                    for p in WORLD['parts']]
        if path == 'parameter/template/':
            return [{'pk': 10, 'name': 'Minimum'}, {'pk': 11, 'name': '3D-print prijs per gram'}]
        if path == 'parameter/':
            drop = self.patch.get('drop_minimums', [])
            src = ({int(k): v for k, v in WORLD['minimums'].items() if int(k) not in drop} if q['template'] == 10
                   else {int(k): v for k, v in WORLD['per_gram'].items()})
            return [{'model_id': k, 'data': str(v)} for k, v in src.items()]
        raise AssertionError(path)


def test_constants():
    assert checkout.TILL_CUSTOMER == FIXTURE['constants']['till_customer']
    d = WORLD['defaults']
    assert (checkout.FALLBACK['print'], checkout.PRINT_OWN_PER_GRAM, checkout.PRINT_MINIMUM) == \
        (d['print_per_gram'], d['own_per_gram'], d['print_minimum'])


@pytest.mark.parametrize('case', FIXTURE['cases'], ids=lambda c: c['name'])
def test_case(case):
    checkout.forget_prices()
    prices = checkout.load_prices(FakeInv(case.get('world_patch', {})))
    checkout.forget_prices()
    exp = case['expected']
    if 'error' in exp:
        with pytest.raises(checkout.CartError, match=exp['error']):
            checkout.quote(case['cart'], prices, case.get('cuts', []))
        return
    bill = checkout.quote(case['cart'], prices, case.get('cuts', []))
    assert bill['total'] == pytest.approx(exp['total'], abs=0.005)
    assert bill['top_up'] == pytest.approx(exp['top_up'], abs=0.005)
    for want, got in zip(exp.get('items', []), bill['items']):
        assert (got['part'], got['unit_price']) == (want['part'], pytest.approx(want['unit_price']))
    assert len(bill['extras']) == len(exp.get('extras', []))
    for want, got in zip(exp.get('extras', []), bill['extras']):
        assert got['kind'] == want['kind'] and got['quantity'] == want['quantity']
        assert got['unit_price'] == pytest.approx(want['unit_price'])
        assert got['booked_price'] == pytest.approx(want['booked_price'], abs=1e-6)
