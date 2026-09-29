"""Temporary storage in the cellar: the Storage tab.

Someone fills in who they are and what they leave. That becomes one stock item
(quantity 1) of the part STORAGE_PART at the location STORAGE_LOCATION in
InvenTree, with expiry_date = today + STORAGE_DAYS and the code (K-042, from
the stock item's pk) as batch. They write their name, the date and the code on
coloured tape on the item. The owner's e-mail and the reminder state are in
SQLite (storage_items).

Once an hour check() looks at every open item:
    - stock item gone, empty or moved elsewhere: closed, nothing to do.
    - expiry date reached: one reminder mail with a link to extend.
    - STORAGE_GRACE_DAYS after that mail: status may_remove. Volunteers
      decide; nothing is thrown away by the server.

To take it home, the owner scans the code at the kiosk (Interface-stock,
check_out_stored_item), after which the next check() closes the row, or fills
in the code and e-mail on the Storage tab (/storage/api/checkout).

Anyone may store and extend (nginx: /storage/api/). The list, pick-up and
extend-without-link are volunteer-only (nginx: /storage/api/admin/).
"""
import os
import re
import secrets
import threading
import time
from datetime import date, datetime, timedelta

import requests
from flask import Blueprint, request

import db
import mailer

# docker-compose passes unset settings as empty strings, hence the `or`.
LOCATION = os.environ.get('STORAGE_LOCATION') or 'Kelder - tijdelijke opslag'
SPOT = os.environ.get('STORAGE_SPOT') or 'the shelf marked "Tijdelijke opslag" in the cellar'
DAYS = int(os.environ.get('STORAGE_DAYS') or 90)
GRACE_DAYS = int(os.environ.get('STORAGE_GRACE_DAYS') or 14)
PUBLIC_URL = os.environ.get('PUBLIC_URL', '').rstrip('/')
# Fixed, not a setting: the app hides this category from the stock list.
CATEGORY = 'Tijdelijke opslag'
PART = 'Tijdelijke opslag'
KEEP_PERSONAL_DAYS = 30   # after closing, then name and e-mail are wiped
CHECK_SECONDS = 3600

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

bp = Blueprint('storage', __name__)
client = None             # inventree.InvenTree, set by app.py
_pks: dict[str, int] = {}  # location / part pk, looked up once


def init(inventree_client):
    global client
    client = inventree_client


def code_for(stock_pk: int) -> str:
    return f'K-{stock_pk:03d}'


def today() -> date:
    return date.today()


# ---------------------------------------------------------------- InvenTree

def _find_or_create(path: str, name: str, body: dict, **filters) -> int:
    for row in client.get(path, name=name, limit=500, **filters):
        if row['name'] == name:
            return row['pk']
    return client.post(path, {'name': name, **body})['pk']


def location_pk() -> int:
    if 'location' not in _pks:
        _pks['location'] = _find_or_create('stock/location/', LOCATION,
                                           {'description': 'Temporary storage, see the Storage tab'})
    return _pks['location']


def part_pk() -> int:
    if 'part' not in _pks:
        cat = _find_or_create('part/category/', CATEGORY, {'description': 'Temporary storage in the cellar'})
        _pks['part'] = _find_or_create('part/', PART, {
            'category': cat, 'active': True, 'salable': False, 'purchaseable': False,
            'component': False, 'description': 'Something a member left in the cellar'}, category=cat)
    return _pks['part']


def enable_expiry():
    """InvenTree only shows expiry dates with this setting on."""
    try:
        setting = client.get('settings/global/STOCK_ENABLE_EXPIRY/')
        if str(setting.get('value')).lower() != 'true':
            client.patch('settings/global/STOCK_ENABLE_EXPIRY/', {'value': True})
    except Exception as e:
        print(f'[storage] could not turn on STOCK_ENABLE_EXPIRY: {e}')


def stock_item(pk: int) -> dict | None:
    """The stock item, or None if it was deleted."""
    try:
        return client.get(f'stock/{pk}/')
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return None
        raise


def still_stored(item: dict | None) -> bool:
    return bool(item) and float(item.get('quantity') or 0) > 0 and item.get('location') == location_pk()


# ---------------------------------------------------------------- rows

def status(row: dict, on: date | None = None) -> str:
    on = on or today()
    if row['reminded_at']:
        reminded = datetime.fromisoformat(row['reminded_at']).date()
        return 'may_remove' if on >= reminded + timedelta(days=GRACE_DAYS) else 'reminded'
    return 'expired' if on >= date.fromisoformat(row['expires']) else 'ok'


def open_rows() -> list[dict]:
    return db.query('SELECT * FROM storage_items WHERE closed_at IS NULL ORDER BY expires')


def row_by_code(code: str) -> dict | None:
    rows = db.query('SELECT * FROM storage_items WHERE code = ? AND closed_at IS NULL',
                    (code.strip().upper(),))
    return rows[0] if rows else None


def public_row(row: dict) -> dict:
    return {'code': row['code'], 'firstName': row['first_name'], 'lastName': row['last_name'],
            'email': row['email'], 'content': row['content'], 'created': row['created'],
            'expires': row['expires'], 'remindedAt': row['reminded_at'], 'status': status(row)}


def close(row: dict, reason: str):
    db.execute('UPDATE storage_items SET closed_at = ?, closed_reason = ? WHERE stock_pk = ?',
               (datetime.now().isoformat(timespec='seconds'), reason, row['stock_pk']))


def extend(row: dict) -> str:
    expires = (today() + timedelta(days=DAYS)).isoformat()
    client.patch(f"stock/{row['stock_pk']}/", {'expiry_date': expires})
    db.execute('UPDATE storage_items SET expires = ?, reminded_at = NULL WHERE stock_pk = ?',
               (expires, row['stock_pk']))
    return expires


# ---------------------------------------------------------------- mails

def instructions(code: str, first: str, last: str, stored_on: str) -> str:
    return (f'1. Take a piece of coloured tape.\n'
            f'2. Write on it: {first} {last}, {stored_on}, {code}.\n'
            f'3. Stick it on the item and put the item on {SPOT}.\n')


def mail_stored(row: dict):
    mailer.send(row['email'], f"Stored in the cellar: {row['code']}",
                f"Hi {row['first_name']},\n\n"
                f"You stored this in the cellar:\n{row['content']}\n\n"
                + instructions(row['code'], row['first_name'], row['last_name'], row['created']) +
                f"\nWe keep it until {row['expires']}. Before then, take it home or extend it"
                f" on the Storage tab with your code {row['code']}.\n")


def mail_reminder(row: dict):
    link = f"{PUBLIC_URL}/#storage/extend/{row['token']}" if PUBLIC_URL else 'the Storage tab of the stock app'
    last_day = (today() + timedelta(days=GRACE_DAYS)).isoformat()
    mailer.send(row['email'], f"Your item in the cellar expires: {row['code']}",
                f"Hi {row['first_name']},\n\n"
                f"On {row['created']} you left this in the cellar:\n{row['content']}\n\n"
                f"Its {DAYS} days are over. Take it home, or keep it longer:\n"
                f"1. Extend it here: {link}\n"
                f"2. Put new tape on it with today's date and the code {row['code']}.\n\n"
                f"If it is still there and not extended after {last_day}, it may be removed.\n")


# ---------------------------------------------------------------- check

def close_gone() -> list[dict]:
    """Close the rows whose stock item left the cellar; returns the rest."""
    rows = []
    for row in open_rows():
        try:
            if still_stored(stock_item(row['stock_pk'])):
                rows.append(row)
            else:
                close(row, 'checked_out')
        except Exception as e:   # unknown: keep it open
            print(f"[storage] {row['code']}: {e}")
            rows.append(row)
    return rows


def check(on: date | None = None):
    """Close items that are gone, send due reminders, wipe old personal data."""
    on = on or today()
    for row in close_gone():
        try:
            if not row['reminded_at'] and on >= date.fromisoformat(row['expires']):
                mail_reminder(row)
                db.execute('UPDATE storage_items SET reminded_at = ? WHERE stock_pk = ?',
                           (datetime.now().isoformat(timespec='seconds'), row['stock_pk']))
        except Exception as e:   # try again next round
            print(f"[storage] {row['code']}: {e}")
    cutoff = (datetime.combine(on, datetime.min.time()) - timedelta(days=KEEP_PERSONAL_DAYS)).isoformat()
    db.execute("UPDATE storage_items SET first_name = '', last_name = '', email = '' "
               "WHERE closed_at IS NOT NULL AND closed_at < ? AND email != ''", (cutoff,))


def checker():
    if client is None:
        return
    enable_expiry()
    while True:
        check()
        time.sleep(CHECK_SECONDS)


# ---------------------------------------------------------------- routes

@bp.get('/storage/api/config')
def config():
    return {'spot': SPOT, 'days': DAYS, 'graceDays': GRACE_DAYS}


@bp.post('/storage/api/items')
def store():
    if client is None:
        return {'error': 'The storage service has no InvenTree connection'}, 503
    b = request.json or {}
    first = str(b.get('firstName') or '').strip()[:80]
    last = str(b.get('lastName') or '').strip()[:80]
    email = str(b.get('email') or '').strip()[:200]
    content = str(b.get('content') or '').strip()[:1000]
    if not (first and last and content):
        return {'error': 'First name, last name and what you store are required'}, 400
    if not EMAIL_RE.match(email):
        return {'error': 'That e-mail address does not look right'}, 400

    stored_on = today().isoformat()
    expires = (today() + timedelta(days=DAYS)).isoformat()
    # InvenTree refuses notes that look like HTML.
    notes = re.sub(r'[<>]', '', f'Owner: {first} {last} ({email})\n\n{content}')
    try:
        created = client.post('stock/', {'part': part_pk(), 'location': location_pk(), 'quantity': 1,
                                         'expiry_date': expires, 'notes': notes})
        pk = (created[0] if isinstance(created, list) else created)['pk']
        code = code_for(pk)
        client.patch(f'stock/{pk}/', {'batch': code})
    except Exception as e:
        print(f'[storage] storing failed: {e}')
        return {'error': 'InvenTree did not accept the item. Ask a volunteer.'}, 502
    db.execute('INSERT INTO storage_items (stock_pk, code, first_name, last_name, email, content, '
               'created, expires, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
               (pk, code, first, last, email, content, stored_on, expires, secrets.token_urlsafe(24)))
    [row] = db.query('SELECT * FROM storage_items WHERE stock_pk = ?', (pk,))
    try:
        mail_stored(row)
    except Exception as e:
        print(f'[storage] confirmation mail for {code}: {e}')
    return {'code': code, 'created': stored_on, 'expires': expires, 'spot': SPOT}


def owned_row(b: dict) -> dict | None:
    """The open row for the token from the reminder mail, or for code + e-mail."""
    if b.get('token'):
        rows = db.query('SELECT * FROM storage_items WHERE token = ? AND closed_at IS NULL', (str(b['token']),))
        return rows[0] if rows else None
    if b.get('code') and b.get('email'):
        row = row_by_code(str(b['code']))
        if row and row['email'].lower() == str(b['email']).strip().lower():
            return row
    return None


def take_out(row: dict, reason: str, note: str):
    """The stock item goes to 0 and the row is closed."""
    item = stock_item(row['stock_pk'])
    if item and float(item.get('quantity') or 0) > 0:
        client.post('stock/remove/', {'items': [{'pk': row['stock_pk'], 'quantity': item['quantity']}],
                                      'notes': f"{note} ({row['code']})"})
    close(row, reason)


@bp.post('/storage/api/extend')
def extend_public():
    if client is None:
        return {'error': 'The storage service has no InvenTree connection'}, 503
    row = owned_row(request.json or {})
    if row is None:
        return {'error': 'No stored item found for that code and e-mail'}, 404
    return {'code': row['code'], 'expires': extend(row)}


@bp.post('/storage/api/checkout')
def checkout_public():
    """The owner took the item home: same as scanning the code at the kiosk."""
    if client is None:
        return {'error': 'The storage service has no InvenTree connection'}, 503
    row = owned_row(request.json or {})
    if row is None:
        return {'error': 'No stored item found for that code and e-mail'}, 404
    take_out(row, 'checked_out', 'Taken home from temporary storage via the Storage tab')
    return {'code': row['code']}


@bp.get('/storage/api/admin/items')
def admin_items():
    return {'items': [public_row(r) for r in close_gone()], 'graceDays': GRACE_DAYS}


@bp.post('/storage/api/admin/items/<code>/extend')
def admin_extend(code):
    row = row_by_code(code)
    if row is None:
        return {'error': f'{code} is not in storage'}, 404
    return {'code': row['code'], 'expires': extend(row)}


@bp.post('/storage/api/admin/items/<code>/pickup')
def admin_pickup(code):
    """Taken home or thrown away: the stock item goes to 0."""
    row = row_by_code(code)
    if row is None:
        return {'error': f'{code} is not in storage'}, 404
    reason = 'removed' if (request.json or {}).get('reason') == 'removed' else 'picked_up'
    take_out(row, reason, 'Picked up from temporary storage' if reason == 'picked_up'
             else 'Removed from temporary storage after the reminder')
    return {'ok': True}
