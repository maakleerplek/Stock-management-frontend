import os
import sys
from datetime import date, timedelta

import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as laser  # noqa: E402
import db  # noqa: E402
import storage  # noqa: E402


class FakeInvenTree:
    """Just enough of the InvenTree API for storage.py."""

    def __init__(self):
        self.rows = {'stock/location/': [], 'part/category/': [], 'part/': []}
        self.stock: dict[int, dict] = {}
        self.next_pk = 0          # location, category, part
        self.next_stock_pk = 42

    def get(self, path, **params):
        if path in self.rows:
            return [r for r in self.rows[path] if r['name'] == params.get('name')]
        pk = int(path.split('/')[1])
        if pk not in self.stock:
            r = requests.Response()
            r.status_code = 404
            raise requests.HTTPError(response=r)
        return dict(self.stock[pk])

    def post(self, path, body):
        if path in self.rows:
            self.next_pk += 1
            self.rows[path].append({'pk': self.next_pk, **body})
            return {'pk': self.next_pk}
        if path == 'stock/':
            pk = self.next_stock_pk
            self.next_stock_pk += 1
            self.stock[pk] = {'pk': pk, **body}
            return [{'pk': pk}]
        if path == 'stock/remove/':
            for it in body['items']:
                self.stock[it['pk']]['quantity'] -= it['quantity']
            return {}
        raise AssertionError(path)

    def patch(self, path, body):
        self.stock[int(path.split('/')[1])].update(body)


@pytest.fixture
def env(tmp_path, monkeypatch):
    db.connect(str(tmp_path / 'laser.db'))
    inv = FakeInvenTree()
    storage.init(inv)
    storage._pks.clear()
    sent = []
    monkeypatch.setattr(storage.mailer, 'send', lambda to, subject, text: sent.append((to, subject, text)))
    return laser.app.test_client(), inv, sent


def store(c, **over):
    body = {'firstName': 'Ruben', 'lastName': 'Ryckaert', 'email': 'r@example.com', 'content': 'A box of wood'}
    return c.post('/storage/api/items', json={**body, **over})


def test_store_makes_a_stock_item_and_mails(env):
    c, inv, sent = env
    r = store(c)
    assert r.status_code == 200
    code = r.json['code']
    assert code == 'K-042'
    item = inv.stock[42]
    assert item['batch'] == code and item['quantity'] == 1
    assert item['expiry_date'] == (date.today() + timedelta(days=storage.DAYS)).isoformat()
    assert item['location'] == storage.location_pk()
    assert sent[0][0] == 'r@example.com' and code in sent[0][2]


def test_store_refuses_bad_input(env):
    c, inv, _ = env
    assert store(c, email='not-an-address').status_code == 400
    assert store(c, content='  ').status_code == 400
    assert inv.stock == {}


def test_one_reminder_then_may_remove(env):
    c, _, sent = env
    code = store(c).json['code']
    sent.clear()
    due = date.today() + timedelta(days=storage.DAYS)
    storage.check(on=due - timedelta(days=1))
    assert sent == []
    storage.check(on=due)
    storage.check(on=due)
    assert len(sent) == 1 and code in sent[0][1]
    [row] = storage.open_rows()
    assert storage.status(row) == 'reminded'
    assert storage.status(row, on=date.today() + timedelta(days=storage.GRACE_DAYS)) == 'may_remove'


def test_checked_out_at_the_kiosk_closes_the_row(env):
    c, inv, sent = env
    store(c)
    inv.stock[42]['quantity'] = 0          # the kiosk removed it
    assert c.get('/storage/api/admin/items').json['items'] == []
    storage.check(on=date.today() + timedelta(days=storage.DAYS))
    assert len(sent) == 1                  # only the confirmation, no reminder


def test_deleted_stock_item_closes_the_row(env):
    c, inv, _ = env
    store(c)
    del inv.stock[42]
    storage.check()
    assert storage.open_rows() == []


def test_extend_resets_the_reminder(env):
    c, inv, _ = env
    store(c)
    storage.check(on=date.today() + timedelta(days=storage.DAYS))
    [row] = storage.open_rows()
    assert row['reminded_at']
    db.execute('UPDATE storage_items SET expires = ? WHERE stock_pk = 42', (date.today().isoformat(),))
    r = c.post('/storage/api/extend', json={'code': row['code'], 'email': row['email']})
    assert r.status_code == 200
    [row] = storage.open_rows()
    assert row['reminded_at'] is None
    assert row['expires'] == inv.stock[42]['expiry_date'] == (date.today() + timedelta(days=storage.DAYS)).isoformat()


def test_extend_with_code_needs_the_right_email(env):
    c, _, _ = env
    code = store(c).json['code']
    assert c.post('/storage/api/extend', json={'code': code, 'email': 'other@example.com'}).status_code == 404
    assert c.post('/storage/api/extend', json={'code': code.lower(), 'email': 'R@Example.com '}).status_code == 200


def test_volunteer_pickup_empties_the_stock_item(env):
    c, inv, _ = env
    code = store(c).json['code']
    assert c.post(f'/storage/api/admin/items/{code}/pickup', json={}).status_code == 200
    assert inv.stock[42]['quantity'] == 0
    [row] = db.query('SELECT closed_reason FROM storage_items')
    assert row['closed_reason'] == 'picked_up'
    assert c.post(f'/storage/api/admin/items/{code}/pickup', json={}).status_code == 404


def test_personal_data_wiped_30_days_after_closing(env):
    c, inv, _ = env
    store(c)
    del inv.stock[42]
    storage.check()
    storage.check(on=date.today() + timedelta(days=storage.KEEP_PERSONAL_DAYS + 1))
    [row] = db.query('SELECT email, first_name FROM storage_items')
    assert row == {'email': '', 'first_name': ''}


def test_owner_checks_out_on_the_page(env):
    c, inv, _ = env
    code = store(c).json['code']
    assert c.post('/storage/api/checkout', json={'code': code, 'email': 'x@example.com'}).status_code == 404
    assert inv.stock[42]['quantity'] == 1
    assert c.post('/storage/api/checkout', json={'code': code, 'email': 'r@example.com'}).status_code == 200
    assert inv.stock[42]['quantity'] == 0
    [row] = db.query('SELECT closed_reason FROM storage_items')
    assert row['closed_reason'] == 'checked_out'
    assert c.post('/storage/api/checkout', json={'code': code, 'email': 'r@example.com'}).status_code == 404
