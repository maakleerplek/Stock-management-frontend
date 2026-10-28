"""Laser cutter service for the Lasercutter tab.

Time tracking comes from LC-logger (branch server-esp, server/app.py): the
ESP32 on the laser (LC-logger esp/monitorOTA, 10.72.3.81) sends UDP straight
to this service on port 5005, {"state": "ON"|"OFF", "on_ms": …, "boot": …}
every second and on every change, and {"type": "heartbeat"} every 10 s, which
we answer with an ACK. The ESP is the clock: on_ms is its laser-on total since
boot, and we add the difference, so a lost packet costs nothing.
Laser-on time adds up in a global counter, the open cut. Once the laser has been
off for CUT_GAP_S the cut is booked as an open session named "Cut 14:32", which
the visitor ticks and pays. Settings advice comes from LaserLog (see recommend.py).

Everything is under /laser/ because nginx proxies that path here.
"""
import base64
import gzip
import io
import json
import math
import os
import socket
import threading
import time
from datetime import datetime, timedelta
from uuid import uuid4

import requests

from flask import Flask, Response, jsonify, request
from flask_socketio import SocketIO

import db
import feedback
import inventree
import lbrn
import checkout
from recommend import MAX_POWER, Point, recommend

COST_PER_MIN = float(os.environ.get('COST_PER_MIN', '0.50'))
COST_PER_SECOND = COST_PER_MIN / 60
UDP_PORT = int(os.environ.get('UDP_PORT', '5005'))
SIMULATE = os.environ.get('LASER_SIMULATE', '') == '1'
ESP_TIMEOUT = 30  # seconds without a packet before the ESP counts as gone
# Comma-separated sender IPs accepted on the UDP port (the ESP32). Empty accepts
# anyone on the network, who could then add or stop billed laser time.
ESP_ALLOWED_IPS = {ip.strip() for ip in os.environ.get('ESP_ALLOWED_IPS', '').split(',') if ip.strip()}
# Laser time is split into cuts: once the laser is off this long, the time so far is one cut.
# On the real laser 87 of 128 pauses inside the same month were under 5 s, 34 over 30 s.
CUT_GAP_S = float(os.environ.get('CUT_GAP_S', '5'))
MIN_CUT_SECONDS = db.MIN_LOGGED_SECONDS   # shorter is a test pulse, not a job: dropped

app = Flask(__name__)
socketio = SocketIO(app, path='/laser/socket.io', async_mode='threading', cors_allowed_origins='*')  # only nginx reaches it

_inventree = None
if os.environ.get('INVENTREE_BACKEND_URL') and os.environ.get('INVENTREE_TOKEN'):
    _inventree = inventree.InvenTree(os.environ['INVENTREE_BACKEND_URL'], os.environ['INVENTREE_TOKEN'])

# ---------------------------------------------------------------- laser state

state_lock = threading.Lock()
global_time = 0.0        # finished laser-on seconds, not yet assigned
laser_on = False
on_since: datetime | None = None
esp_ip: str | None = None
esp_last_seen = 0.0
esp_boot = None          # boot id and on_ms of the last counter packet
esp_on_ms = 0
esp_counter_at = 0.0     # when that packet came in
cut_started: float | None = None   # epoch when the open cut (global_time) began
last_on_at = 0.0         # epoch of the last moment the laser was on
# What LightBurn has open on the laser PC (laser-timer-widget/lightburn-watch.ps1):
# {'name', 'unsaved', 'thumb' (PNG bytes or None), 'at' (epoch)}.
lightburn: dict | None = None
LIGHTBURN_FRESH_S = 600  # older than this: the watcher is gone, do not trust the file name
cut_job: dict | None = None   # the LightBurn file when the open cut began


def save_state():
    """Keep the unassigned time and the ESP counter in the database (call with state_lock held):
    a restart or deploy used to lose the time not yet on a session."""
    db.save_state({'global_time': global_time, 'esp_boot': esp_boot, 'esp_on_ms': esp_on_ms, 'cut_started': cut_started})


def restore_state():
    """Back where the last run stopped. With the ESP's counter position known, the time it
    counted while this service was down is added with its next packet."""
    global global_time, esp_boot, esp_on_ms, cut_started, last_on_at
    saved = db.load_state()
    with state_lock:
        global_time = float(saved.get('global_time', 0.0))
        esp_boot = saved.get('esp_boot')
        esp_on_ms = int(saved.get('esp_on_ms', 0))
        cut_started = saved.get('cut_started') if global_time > 0 else None
        last_on_at = time.time()   # an open cut closes CUT_GAP_S after the restart at the earliest
    print(f'[state] restored: unassigned {global_time:.1f} s, ESP boot {esp_boot} at {esp_on_ms / 1000:.1f} s')


def current_time() -> float:
    """Unassigned seconds, including the block that is running now."""
    if laser_on and on_since:
        return global_time + (datetime.now() - on_since).total_seconds()
    return global_time


def current_job() -> dict | None:
    """The file LightBurn had open last, if the watcher reported it recently."""
    if lightburn and time.time() - lightburn['at'] < LIGHTBURN_FRESH_S:
        return lightburn
    return None


def begin_cut(at: float):
    """The open cut starts now: remember when, and which LightBurn file was open (call with state_lock held)."""
    global cut_started, cut_job
    cut_started, cut_job = at, current_job()


def time_payload() -> dict:
    return {
        'global_time': current_time(),
        'cut_started': datetime.fromtimestamp(cut_started).isoformat() if cut_started and current_time() > 0 else None,
        'cut_gap': CUT_GAP_S,
        # The file of the open cut, else what LightBurn has open now.
        'job': ((cut_job if current_time() > 0 else None) or current_job() or {}).get('name'),
        'laser_state': laser_on,
        'esp_connected': time.time() - esp_last_seen < ESP_TIMEOUT,
        'esp_ip': esp_ip,
        'simulate': SIMULATE,
    }


def set_laser(on: bool):
    global global_time, laser_on, on_since, cut_started, last_on_at
    with state_lock:
        now = datetime.now()
        if on or laser_on:
            last_on_at = time.time()
        if on and not laser_on and global_time <= 0 and cut_started is None:
            begin_cut(time.time())
        if laser_on and not on and on_since:
            global_time += (now - on_since).total_seconds()
            on_since = None
            save_state()
        elif not laser_on and on:
            on_since = now
        laser_on = on
        payload = time_payload()
    socketio.emit('time_update', payload)


def esp_counter(on: bool, on_ms: int, boot):
    """Add the laser-on ms the ESP counted since its last packet that reached us."""
    global global_time, laser_on, on_since, esp_boot, esp_on_ms, esp_counter_at, cut_started, last_on_at
    now = time.time()
    with state_lock:
        boot_changed = boot != esp_boot
        if boot_changed:
            # ESP rebooted: its counter restarted at 0. Right after our own start
            # we don't know what was already counted (nothing saved yet), so only take the baseline.
            added = on_ms if esp_boot is not None else 0
            print(f'[esp] boot {boot}: counter at {on_ms / 1000:.1f} s, added {added / 1000:.1f} s')
        else:
            added = max(0, on_ms - esp_on_ms)
            # A packet comes every second: a longer gap means packets got lost.
            if now - esp_counter_at > 3:
                print(f'[esp] {now - esp_counter_at:.0f} s without packets, caught up {added / 1000:.1f} s')
        if on != laser_on:
            print(f'[esp] {"ON" if on else "OFF"}: counter {on_ms / 1000:.1f} s, unassigned {global_time + added / 1000:.1f} s')
        esp_boot, esp_on_ms, esp_counter_at = boot, on_ms, now
        changed = added > 0 or laser_on != on or on_since is not None
        if added > 0 and global_time <= 0:
            begin_cut(now - added / 1000)
        if added > 0 or on or laser_on:
            last_on_at = now
        global_time += added / 1000
        laser_on, on_since = on, None  # the counter is the time, nothing runs here
        if added > 0 or boot_changed:
            save_state()
        payload = time_payload()
    if changed:
        socketio.emit('time_update', payload)


def take_time() -> float:
    """Empty the counter and return what was in it. A running block restarts now."""
    global global_time, on_since, cut_started
    with state_lock:
        seconds = current_time()
        global_time = 0.0
        if laser_on:
            begin_cut(time.time())
        else:
            cut_started = None
        save_state()
        if laser_on:
            on_since = datetime.now()
        return seconds


def udp_server():
    global esp_ip, esp_last_seen
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('0.0.0.0', UDP_PORT))
    while True:
        try:
            data, addr = sock.recvfrom(1024)
            if ESP_ALLOWED_IPS and addr[0] not in ESP_ALLOWED_IPS:
                continue
            message = json.loads(data.decode())
            esp_ip, esp_last_seen = addr[0], time.time()
            if message.get('type') == 'heartbeat':
                sock.sendto(json.dumps({'type': 'ack'}).encode(), addr)
            elif message.get('state') in ('ON', 'OFF') and 'on_ms' in message:
                esp_counter(message['state'] == 'ON', int(message['on_ms']), message.get('boot'))
            elif message.get('state') in ('ON', 'OFF'):  # old firmware: time by arrival
                print(f"[esp] old firmware packet: {message['state']}")
                set_laser(message['state'] == 'ON')
        except Exception as e:
            print(f'[udp] {e}')


def stop_if_esp_silent(now: float | None = None):
    """The ESP32 sends a heartbeat every 10 s. If it goes silent while the laser
    is on (Wi-Fi drop, power cut, lost OFF packet on the way out), stop the
    block at the last sign of life instead of billing the time that follows."""
    global global_time, laser_on, on_since, last_on_at
    if SIMULATE:
        return
    now = time.time() if now is None else now
    with state_lock:
        if not (laser_on and on_since) or now - esp_last_seen < ESP_TIMEOUT:
            return
        last = datetime.fromtimestamp(esp_last_seen)
        global_time += max(0.0, (last - on_since).total_seconds())
        laser_on, on_since, last_on_at = False, None, esp_last_seen
        save_state()
    print('[udp] ESP32 silent while the laser was on: block closed at its last heartbeat')


def ticker():
    while True:
        # One failed emit or DB call used to end this thread for good: no more
        # live updates and no ESP timeout, while the health check stayed OK.
        try:
            stop_if_esp_silent()
            close_cut_if_idle()
            with state_lock:
                payload = time_payload()
            socketio.emit('time_update', payload)
        except Exception as e:
            print(f'[ticker] {e}')
        time.sleep(0.5)

def close_cut_if_idle(now: float | None = None) -> str | None:
    """Once the laser has been off for CUT_GAP_S, book the time so far as one cut: an
    open session named after its start time, so checkout, kiosk and analytics take it
    like any session. Returns the new session id."""
    global global_time, cut_started, cut_job
    now = time.time() if now is None else now
    with state_lock:
        if laser_on or global_time <= 0 or now - last_on_at < CUT_GAP_S:
            return None
        seconds, started, job = global_time, cut_started or now - global_time, cut_job
        global_time, cut_started, cut_job = 0.0, None, None
        save_state()
    if seconds < MIN_CUT_SECONDS:
        print(f'[cut] {seconds:.1f} s is a test pulse, not booked')
        return None
    start = datetime.fromtimestamp(started)
    sid = str(uuid4())
    # Named after the LightBurn file when the watcher told us; otherwise its start time.
    name = job['name'] if job else f'Cut {start:%H:%M}'
    db.execute('INSERT INTO sessions (id, name, created, file, preview) VALUES (?, ?, ?, ?, ?)',
               (sid, name[:80], start.isoformat(), job['name'] if job else None, job['thumb'] if job else None))
    book_time(sid, seconds)
    print(f'[cut] {seconds:.1f} s from {start:%H:%M:%S} booked as {sid}')
    broadcast_sessions()
    with state_lock:
        socketio.emit('time_update', time_payload())
    return sid


# ---------------------------------------------------------------- sessions


def book_time(sid: str, seconds: float):
    """Add laser seconds to a session, with a time block as its history."""
    db.execute('UPDATE sessions SET total_time = total_time + ?, total_cost = total_cost + ? WHERE id = ?',
               (seconds, seconds * COST_PER_SECOND, sid))
    db.execute('INSERT INTO time_blocks (session_id, seconds, flushed_at) VALUES (?, ?, ?)', (sid, seconds, datetime.now().isoformat()))


def all_sessions() -> list[dict]:
    """Open sessions: not paid yet. Paid ones stay in the table as history."""
    rows = db.query('SELECT id, name, email, created, total_time, total_cost, checkout_at, paid_at, order_ref, file, project_id, '
                    'preview IS NOT NULL AS has_preview FROM sessions WHERE paid_at IS NULL ORDER BY created DESC')
    for r in rows:
        r['minutes'] = math.ceil(round(r['total_time'], 3) / 60)   # what the till charges
    return rows


def open_projects() -> list[dict]:
    """Projects with unpaid cuts, and empty ones made in the last day (just started, or all cuts taken out)."""
    since = (datetime.now() - timedelta(days=1)).isoformat()
    return db.query('SELECT id, name, created FROM projects p WHERE closed_at IS NULL AND (created >= ? OR EXISTS '
                    '(SELECT 1 FROM sessions s WHERE s.project_id = p.id AND s.paid_at IS NULL)) ORDER BY created', (since,))


def sessions_payload() -> dict:
    return {'sessions': all_sessions(), 'projects': open_projects()}


def broadcast_sessions():
    socketio.emit('sessions', sessions_payload())


def client_name() -> str:
    """Who is on the other end, for the log: address and a short user agent."""
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    return f"{ip} {request.headers.get('User-Agent', '?')[-60:]}"


@socketio.on('connect')
def on_connect():
    print(f'[socket] connect {request.sid} from {client_name()}')
    with state_lock:
        payload = time_payload()
    socketio.emit('time_update', payload, to=request.sid)
    socketio.emit('sessions', sessions_payload(), to=request.sid)


@socketio.on('disconnect')
def on_disconnect(*_):
    print(f'[socket] disconnect {request.sid}')


@app.post('/laser/api/client-log')
def client_log():
    """What a page shows of the laser (on/off, connection, its build), so a page that
    disagrees with the [esp] lines can be found in the log afterwards."""
    body = json.dumps(request.get_json(silent=True) or {}, ensure_ascii=False)[:400]
    print(f'[client] {client_name()}: {body}')
    return {'ok': True}


@app.get('/laser/api/health')
def health():
    return {'ok': True}


@app.get('/laser/api/config')
def config():
    return {'costPerMin': COST_PER_MIN, 'maxPower': MAX_POWER, 'simulate': SIMULATE}


@app.post('/laser/api/lightburn')
def post_lightburn():
    """The watcher on the laser PC: the file LightBurn has open, with its thumbnail (PNG, base64),
    or, for a working copy without one, the project itself (gzip, base64) to draw it from.
    With neither, the last picture of the same file is kept."""
    global lightburn
    b = request.get_json(silent=True) or {}
    name = str(b.get('name') or '').strip()[:120]
    if not name:
        return {'error': 'name is required'}, 400
    thumb = None
    drawn = True
    if b.get('thumb'):
        try:
            thumb = base64.b64decode(b['thumb'], validate=True)
        except ValueError:
            return {'error': 'thumb must be base64'}, 400
        if not thumb.startswith(b'\x89PNG') or len(thumb) > 512_000:
            return {'error': 'thumb must be a PNG under 500 kB'}, 400
    elif b.get('lbrn'):
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(b['lbrn'], validate=True))) as f:
                xml = f.read(80_000_000)   # a 14 MB autosave is normal; this is the cap
            thumb = lbrn.render(xml.decode('utf-8', 'replace'))
        except Exception as e:   # a half-written autosave: keep the last picture
            print(f'[lightburn] could not draw {name}: {e}')
            drawn = False
    with state_lock:
        if thumb is None and lightburn and lightburn['name'] == name:
            thumb = lightburn['thumb']
        changed = not lightburn or lightburn['name'] != name
        lightburn = {'name': name, 'unsaved': bool(b.get('unsaved')), 'thumb': thumb, 'at': time.time()}
    if changed:
        print(f'[lightburn] {name}{" (unsaved)" if b.get("unsaved") else ""}{", thumbnail" if thumb else ""}')
    # False after a restart of this service: the watcher then sends the picture again.
    # drawn False: the autosave was caught half-written, the watcher sends it again next round.
    return {'ok': True, 'has_thumb': thumb is not None, 'drawn': drawn}


@app.get('/laser/api/lightburn')
def get_lightburn():
    job = current_job()
    return {'name': job['name'], 'unsaved': job['unsaved'], 'has_thumb': job['thumb'] is not None,
            'age_s': round(time.time() - job['at'])} if job else {'name': None}


@app.get('/laser/api/sessions/<sid>/preview')
def session_preview(sid):
    rows = db.query('SELECT preview FROM sessions WHERE id = ?', (sid,))
    if not rows or rows[0]['preview'] is None:
        return {'error': 'No preview'}, 404
    # A cut's preview never changes.
    return Response(rows[0]['preview'], mimetype='image/png', headers={'Cache-Control': 'public, max-age=604800, immutable'})


@app.get('/laser/api/sessions')
def get_sessions():
    return sessions_payload()


@app.get('/laser/api/sessions/all')
def get_all_sessions():
    """For the analytics: every session, open and paid, and the unassigned time now on the counter."""
    rows = db.query('SELECT s.id, s.name, s.created, s.total_time, s.checkout_at, s.paid_at, s.order_ref, p.name AS project_name '
                    'FROM sessions s LEFT JOIN projects p ON p.id = s.project_id ORDER BY s.created DESC')
    with state_lock:
        unassigned = current_time()
    return {'sessions': rows, 'unassigned_seconds': unassigned}


@app.post('/laser/api/sessions')
def create_session():
    name = ((request.json or {}).get('name') or '').strip()
    if len(name) < 2:
        return {'error': 'Enter at least 2 characters'}, 400
    sid = str(uuid4())
    db.execute('INSERT INTO sessions (id, name, created) VALUES (?, ?, ?)',
               (sid, name[:80], datetime.now().isoformat()))
    broadcast_sessions()
    return {'id': sid}


@app.patch('/laser/api/sessions/<sid>')
def rename_session(sid):
    name = ((request.json or {}).get('name') or '').strip()
    if len(name) < 2:
        return {'error': 'Enter at least 2 characters'}, 400
    if not db.query('SELECT id FROM sessions WHERE id = ? AND paid_at IS NULL', (sid,)):
        return {'error': 'Session not found'}, 404
    db.execute('UPDATE sessions SET name = ? WHERE id = ?', (name[:80], sid))
    broadcast_sessions()
    return {'ok': True}


def reason_from_body() -> str | None:
    return (((request.get_json(silent=True) or {}).get('reason') or '').strip()[:200]) or None


DISCARD_KINDS = {'paid', 'workshop', 'volunteer', 'other'}


def kind_from_body() -> str | None:
    kind = (request.get_json(silent=True) or {}).get('kind')
    return kind if kind in DISCARD_KINDS else None


def log_discard(seconds: float, source: str, session_name: str | None, reason: str | None, kind: str | None = None):
    if seconds < db.MIN_LOGGED_SECONDS:
        return
    db.execute('INSERT INTO discarded_time (seconds, source, session_name, reason, kind, discarded_at) VALUES (?, ?, ?, ?, ?, ?)',
               (seconds, source, session_name, reason, kind, datetime.now().isoformat()))


@app.delete('/laser/api/sessions/<sid>')
def delete_session(sid):
    rows = db.query('SELECT * FROM sessions WHERE id = ?', (sid,))
    if not rows:
        return {'error': 'Session not found'}, 404
    s = rows[0]
    if s['paid_at'] is None and s['total_time'] > 0:
        log_discard(s['total_time'], 'session', s['name'], reason_from_body(), kind_from_body())
    db.execute('DELETE FROM time_blocks WHERE session_id = ?', (sid,))
    db.execute('DELETE FROM sessions WHERE id = ?', (sid,))
    broadcast_sessions()
    # Without the picture: bytes don't go into JSON.
    return {'deleted': {k: v for k, v in s.items() if k != 'preview'}}


@app.post('/laser/api/sessions/<sid>/checkout')
def checkout_session(sid):
    """Put the session in the checkout (Pay), or take it back out."""
    on = bool((request.json or {}).get('on', True))
    rows = db.query('SELECT total_time FROM sessions WHERE id = ? AND paid_at IS NULL', (sid,))
    if not rows:
        return {'error': 'Session not found'}, 404
    if on and rows[0]['total_time'] <= 0:
        return {'error': 'No laser time on this session yet'}, 400
    db.execute('UPDATE sessions SET checkout_at = ? WHERE id = ?', (datetime.now().isoformat() if on else None, sid))
    broadcast_sessions()
    return {'ok': True}


def mark_paid(sid: str, order: str | None) -> bool:
    """Keep the session as history with its order; False if it is not open."""
    rows = db.query('SELECT total_time FROM sessions WHERE id = ? AND paid_at IS NULL', (sid,))
    if not rows:
        return False
    if rows[0]['total_time'] <= 0:
        # Nothing was lasered: not a session worth keeping, it would only skew the analytics.
        db.execute('DELETE FROM time_blocks WHERE session_id = ?', (sid,))
        db.execute('DELETE FROM sessions WHERE id = ?', (sid,))
    else:
        db.execute('UPDATE sessions SET paid_at = ?, order_ref = ? WHERE id = ?', (datetime.now().isoformat(), order, sid))
    # A project is done once all its cuts are paid; it stays as history for the analytics.
    db.execute('UPDATE projects SET closed_at = ? WHERE closed_at IS NULL '
               'AND id IN (SELECT project_id FROM sessions WHERE paid_at IS NOT NULL) '
               'AND id NOT IN (SELECT project_id FROM sessions WHERE paid_at IS NULL AND project_id IS NOT NULL)',
               (datetime.now().isoformat(),))
    return True


@app.post('/laser/api/sessions/<sid>/paid')
def paid_session(sid):
    """The checkout went through: keep the session as history with its order."""
    order = ((request.json or {}).get('order') or '')[:40] or None
    if not mark_paid(sid, order):
        return {'error': 'Session not found'}, 404
    broadcast_sessions()
    return {'ok': True}


# ---------------------------------------------------------------- checkout

# One sale at a time: two carts with the same cut must not both sell it.
_checkout_lock = threading.Lock()


def cart_cuts(cart: dict) -> list[dict]:
    """The open laser cuts the cart names; refuses a cut that is paid or gone."""
    ids = list(dict.fromkeys(str(i) for i in cart.get('cuts') or []))
    if not ids:
        return []
    rows = db.query(f'SELECT id, name, total_time FROM sessions WHERE paid_at IS NULL AND id IN ({",".join("?" * len(ids))}) ORDER BY created, rowid',
                    tuple(ids))
    if len(rows) != len(ids):
        raise checkout.CartError('A laser cut in this cart is already paid or deleted. Take it out and try again.')
    return rows


def priced_bill(cart: dict):
    """(bill, None) or (None, error response)."""
    if _inventree is None:
        return None, ({'error': 'InvenTree is not configured on the server'}, 503)
    try:
        return checkout.quote(cart, checkout.load_prices(_inventree), cart_cuts(cart)), None
    except checkout.CartError as e:
        return None, ({'error': str(e)}, 400)
    except requests.RequestException as e:
        return None, ({'error': f'Cannot reach InvenTree: {e}'}, 502)


@app.get('/api/checkout/rates')
def checkout_rates():
    if _inventree is None:
        return {'error': 'InvenTree is not configured on the server'}, 503
    try:
        return checkout.rates(checkout.load_prices(_inventree))
    except requests.RequestException as e:
        return {'error': f'Cannot reach InvenTree: {e}'}, 502


@app.post('/api/checkout/quote')
def checkout_quote():
    """The bill for a cart, as the checkout would book it."""
    bill, err = priced_bill(request.get_json(silent=True) or {})
    return err or bill


@app.post('/api/checkout/')
def checkout_book():
    """Book the cart as one sales order and mark its cuts paid.

    `key` (from the client, new per sale) makes a retry safe: the same key
    gets the first answer back instead of a second order.
    """
    cart = request.get_json(silent=True) or {}
    key = str(cart.get('key') or '')[:64]
    if len(key) < 8:
        return {'error': 'key is required'}, 400
    with _checkout_lock:
        [row] = db.query('SELECT state, result FROM checkouts WHERE key = ?', (key,)) or [None]
        if row and row['state'] == 'done':
            return json.loads(row['result'])
        if row and row['state'] == 'booking':
            # Only after a crash halfway: whether the order exists is unknown.
            return {'error': 'This sale was being booked when the server stopped. Check InvenTree before trying again.'}, 409
        bill, err = priced_bill(cart)
        if err:
            return err
        if not bill['items'] and not bill['extras']:
            return {'error': 'The cart is empty'}, 400
        db.execute('INSERT OR REPLACE INTO checkouts (key, created, state) VALUES (?, ?, ?)',
                   (key, datetime.now().isoformat(), 'booking'))
        warning = None
        try:
            booked = checkout.book(_inventree, bill)
            reference, unshipped = booked['reference'], booked['unshipped']
        except checkout.BookedError as e:
            reference, unshipped, warning = e.reference, [], str(e)
        except Exception as e:
            db.execute("UPDATE checkouts SET state = 'failed', result = ? WHERE key = ?", (json.dumps({'error': str(e)}), key))
            print(f'[checkout] checkout failed: {e}', flush=True)
            return {'error': f'The sale was not booked: {e}'}, 502
        for e in bill['extras']:
            for sid in e.get('cuts', []):
                mark_paid(sid, reference)
        result = {'reference': reference, 'unshipped': unshipped, 'warning': warning, 'bill': bill}
        db.execute("UPDATE checkouts SET state = 'done', result = ? WHERE key = ?", (json.dumps(result), key))
    print(f'[checkout] {reference}: {checkout.describe(bill)} = {bill["total"]:.2f}', flush=True)
    broadcast_sessions()
    checkout.tell_tv(bill, str(cart.get('source') or 'checkout')[:30])
    return result


def name_from_body():
    name = ((request.get_json(silent=True) or {}).get('name') or '').strip()
    return name[:80] if len(name) >= 2 else None


@app.post('/laser/api/projects')
def create_project():
    name = name_from_body()
    if not name:
        return {'error': 'Enter at least 2 characters'}, 400
    pid = str(uuid4())
    db.execute('INSERT INTO projects (id, name, created) VALUES (?, ?, ?)', (pid, name, datetime.now().isoformat()))
    broadcast_sessions()
    return {'id': pid}


@app.patch('/laser/api/projects/<pid>')
def rename_project(pid):
    name = name_from_body()
    if not name:
        return {'error': 'Enter at least 2 characters'}, 400
    if not db.query('SELECT id FROM projects WHERE id = ?', (pid,)):
        return {'error': 'Project not found'}, 404
    db.execute('UPDATE projects SET name = ? WHERE id = ?', (name, pid))
    broadcast_sessions()
    return {'ok': True}


@app.delete('/laser/api/projects/<pid>')
def delete_project(pid):
    """Only the group goes: its unpaid cuts go back to the new cuts. A paid project stays history."""
    if not db.query('SELECT id FROM projects WHERE id = ? AND closed_at IS NULL', (pid,)):
        return {'error': 'Project not found'}, 404
    db.execute('UPDATE sessions SET project_id = NULL WHERE project_id = ? AND paid_at IS NULL', (pid,))
    if db.query('SELECT 1 FROM sessions WHERE project_id = ? AND paid_at IS NOT NULL', (pid,)):
        db.execute('UPDATE projects SET closed_at = ? WHERE id = ?', (datetime.now().isoformat(), pid))
    else:
        db.execute('DELETE FROM projects WHERE id = ?', (pid,))
    broadcast_sessions()
    return {'ok': True}


@app.post('/laser/api/sessions/<sid>/project')
def set_session_project(sid):
    """Put an unpaid cut in a project, or (project_id null) back with the new cuts."""
    pid = (request.get_json(silent=True) or {}).get('project_id')
    if pid is not None and not db.query('SELECT id FROM projects WHERE id = ?', (pid,)):
        return {'error': 'Project not found'}, 404
    if not db.query('SELECT id FROM sessions WHERE id = ? AND paid_at IS NULL', (sid,)):
        return {'error': 'Session not found'}, 404
    db.execute('UPDATE sessions SET project_id = ? WHERE id = ?', (pid, sid))
    broadcast_sessions()
    return {'ok': True}


@app.post('/laser/api/flush')
def flush():
    sid = (request.json or {}).get('session_id')
    if not sid or not db.query('SELECT id FROM sessions WHERE id = ? AND paid_at IS NULL', (sid,)):
        return {'error': 'Invalid session'}, 400
    seconds = take_time()
    if seconds <= 0:
        return {'error': 'No time to assign'}, 400
    book_time(sid, seconds)
    broadcast_sessions()
    with state_lock:
        socketio.emit('time_update', time_payload())
    return {'flushed_time': seconds, 'flushed_cost': seconds * COST_PER_SECOND}


@app.post('/laser/api/reset')
def reset():
    seconds = take_time()
    if seconds > 0:
        log_discard(seconds, 'unassigned', None, reason_from_body())
    with state_lock:
        socketio.emit('time_update', time_payload())
    return {'reset_amount': seconds}


@app.get('/laser/api/discarded')
def get_discarded():
    return {'rows': db.query('SELECT * FROM discarded_time ORDER BY discarded_at DESC')}


@app.patch('/laser/api/admin/discarded/<int:row_id>')
def set_discard_kind(row_id):
    """Classify a deleted session afterwards (paid outside checkout, workshop, ...)."""
    kind = kind_from_body()
    if not kind:
        return {'error': f'kind must be one of {sorted(DISCARD_KINDS)}'}, 400
    if not db.query('SELECT id FROM discarded_time WHERE id = ?', (row_id,)):
        return {'error': 'Not found'}, 404
    db.execute('UPDATE discarded_time SET kind = ? WHERE id = ?', (kind, row_id))
    return {'ok': True}


@app.post('/laser/api/simulate')
def simulate():
    """Test switch for a server without the ESP32 (LASER_SIMULATE=1)."""
    if not SIMULATE:
        return {'error': 'Simulation is off'}, 404
    wanted = ((request.json or {}).get('state') or '').upper()
    if wanted not in ('ON', 'OFF'):
        return {'error': 'state must be ON or OFF'}, 400
    set_laser(wanted == 'ON')
    return {'laser_state': laser_on}

# ---------------------------------------------------------------- settings


@app.get('/laser/api/materials')
def get_materials():
    try:
        rows = inventree.materials(_inventree)
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502
    grouped: dict[str, list[float]] = {}
    for r in rows:
        if r['thickness'] is not None:
            grouped.setdefault(r['material'], []).append(r['thickness'])
    return {'materials': [{'name': k, 'thicknesses': sorted(set(v))} for k, v in sorted(grouped.items())]}


def points_for(material: str, operation: str) -> list[Point]:
    points = []
    for r in inventree.materials(_inventree):
        s = r[operation]
        if r['material'].lower() == material.lower() and s and r['thickness'] is not None:
            points.append(Point(r['thickness'], s['speed'], s['power'], s['passes'], 'clean', baseline=True))
    for a in feedback.load(_inventree):
        if a['material'].lower() == material.lower() and a['operation'] == operation:
            points.append(Point(a['thickness_mm'], a['speed'], a['power'], a['passes'], a['outcome'],
                                days_old=feedback.days_old(a),
                                strength=a['strength'] if operation == 'engrave' else None))
    return points


MIN_POWER = 10  # the tube needs at least this; note on page 1 of the binder
POWER_FIELDS = ('cutPower', 'cutPowerMin', 'linePower', 'linePowerMin', 'fillPower')
NUMBER_FIELDS = ('thickness', 'cutSpeed', 'cutPasses', 'lineSpeed', 'fillSpeed') + POWER_FIELDS


def clean_row(b: dict) -> tuple[dict | None, str | None]:
    """Validate a library row from the form. Returns (row, error)."""
    row = {f: str(b.get(f) or '').strip()[:200] for f in inventree.TEXT_FIELDS}
    if not row['material']:
        return None, 'Material name is required'
    for f in NUMBER_FIELDS:
        v = b.get(f)
        if v in (None, ''):
            row[f] = None
            continue
        try:
            row[f] = float(str(v).replace(',', '.'))
        except ValueError:
            return None, f'{f} must be a number'
        if row[f] <= 0:
            return None, f'{f} must be above 0'
        if f in POWER_FIELDS and not (MIN_POWER <= row[f] <= MAX_POWER):
            return None, f'Power must be {MIN_POWER}-{MAX_POWER} %'
    for hi, lo in (('cutPower', 'cutPowerMin'), ('linePower', 'linePowerMin')):
        if row[hi] is not None and row[lo] is not None and row[lo] > row[hi]:
            return None, 'Min power cannot be above max power'
    if row['cutPasses'] is not None:
        row['cutPasses'] = int(row['cutPasses'])
    return row, None


@app.get('/laser/api/library')
def get_library():
    """The whole material library. nginx lets anyone read it and only
    volunteers write it (POST/PUT/DELETE below)."""
    try:
        rows = inventree.materials(_inventree)
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502
    rows = sorted(rows, key=lambda r: (r['group'].lower(), r['material'].lower(), r['thickness'] or 0))
    return {'rows': rows, 'minPower': MIN_POWER, 'maxPower': MAX_POWER}


def _save(part_id: int | None):
    if _inventree is None:
        return {'error': 'InvenTree is not configured'}, 503
    row, err = clean_row(request.json or {})
    if err:
        return {'error': err}, 400
    try:
        pk = _inventree.save_row(part_id, row)
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502
    return {'partId': pk}


@app.post('/laser/api/library')
def add_library_row():
    return _save(None)


@app.put('/laser/api/library/<int:part_id>')
def update_library_row(part_id):
    return _save(part_id)


@app.delete('/laser/api/library/<int:part_id>')
def delete_library_row(part_id):
    if _inventree is None:
        return {'error': 'InvenTree is not configured'}, 503
    try:
        _inventree.delete_row(part_id)
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502
    return {'deleted': part_id}


@app.get('/laser/api/recommend')
def get_recommend():
    material = request.args.get('material', '')
    try:
        thickness = float(request.args.get('thickness', ''))
        strength = float(request.args.get('strength', '50')) / 100
    except ValueError:
        return {'error': 'thickness and strength must be numbers'}, 400
    ops = [o for o in request.args.get('ops', 'cut').split(',') if o in ('cut', 'engrave')]
    try:
        results = [recommend(points_for(material, op), thickness, op, strength) for op in ops]
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502
    return {'material': material, 'thickness': thickness, 'results': results}


@app.post('/laser/api/attempts')
def add_attempt():
    b = request.json or {}
    try:
        material = str(b['material']).strip()
        thickness = float(b['thickness'])
        operation = b['operation']
        speed, power = float(b['speed']), float(b['power'])
        passes = int(b.get('passes') or 1)
        outcome = b['outcome']
        strength = float(b['strength']) / 100 if operation == 'engrave' and b.get('strength') is not None else None
    except (KeyError, TypeError, ValueError):
        return {'error': 'material, thickness, operation, speed, power and outcome are required'}, 400
    if operation not in ('cut', 'engrave') or outcome not in ('failed', 'risky', 'partial', 'clean'):
        return {'error': 'Unknown operation or outcome'}, 400
    if not (0 < power <= MAX_POWER) or speed <= 0 or not (1 <= passes <= 20) or not material:
        return {'error': f'Power must be 1-{MAX_POWER} %, speed above 0'}, 400
    if _inventree is None:
        return {'error': 'InvenTree is not configured'}, 503
    try:
        pk = feedback.save(_inventree, {
            'material': material, 'thickness_mm': thickness, 'operation': operation, 'speed': speed,
            'power': power, 'passes': passes, 'strength': strength, 'outcome': outcome,
            'submitted_by': (b.get('submitted_by') or '')[:80] or None})
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502
    return {'ok': True, 'id': pk}


# ---------------------------------------------------------------- feedback (volunteers)
# nginx lets only volunteers reach /laser/api/admin/.

GOOD = ('clean', 'partial')
DIFFERS_MIN_REPORTS = 3     # from here the advice says "Based on reports"
DIFFERS_FRACTION = 0.10


def library_setting(material: str, thickness: float, operation: str) -> dict | None:
    for r in inventree.materials(_inventree):
        if r['material'].lower() == material.lower() and r['thickness'] == thickness:
            return {'partId': r['partId'], 'setting': r[operation]}
    return None


def differs(advice: dict, setting: dict | None) -> bool:
    if advice.get('speed') is None or not setting:
        return advice.get('speed') is not None
    return any(abs(advice[k] - setting[k]) > DIFFERS_FRACTION * setting[k] for k in ('speed', 'power'))


def feedback_groups(reports: list[dict]) -> list[dict]:
    """One group per material, thickness and operation, with the library row
    and what the advice says now."""
    groups: dict[tuple, dict] = {}
    for r in reports:
        key = (r['material'].lower(), r['thickness_mm'], r['operation'])
        g = groups.setdefault(key, {'material': r['material'], 'thickness': r['thickness_mm'],
                                    'operation': r['operation'], 'last': r['created_at'],
                                    'counts': {'clean': 0, 'partial': 0, 'failed': 0, 'risky': 0}})
        g['counts'][r['outcome']] += 1
        g['last'] = max(g['last'], r['created_at'])
    out = []
    for g in groups.values():
        lib = library_setting(g['material'], g['thickness'], g['operation'])
        points = points_for(g['material'], g['operation'])
        # advice: what the laser page shows (library row and reports blended).
        # reported: the reports alone. That is what goes into the library; the
        # blend would count the same reports again once the row has changed.
        advice = recommend(points, g['thickness'], g['operation'])
        reported = recommend([p for p in points if not p.baseline], g['thickness'], g['operation'])
        good = g['counts']['clean'] + g['counts']['partial']
        out.append({**g, 'library': lib, 'advice': advice, 'reported': reported,
                    'differs': good >= DIFFERS_MIN_REPORTS and differs(reported, lib and lib['setting'])})
    return sorted(out, key=lambda g: g['last'], reverse=True)


@app.get('/laser/api/admin/feedback')
def get_feedback():
    try:
        reports = feedback.load(_inventree)
        days = request.args.get('days')
        if days:
            reports = [r for r in reports if feedback.days_old(r) <= float(days)]
        return {'reports': reports, 'groups': feedback_groups(reports)}
    except ValueError:
        return {'error': 'days must be a number'}, 400
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502


@app.delete('/laser/api/admin/attempts/<int:report_id>')
def delete_attempt(report_id):
    if _inventree is None:
        return {'error': 'InvenTree is not configured'}, 503
    if report_id not in {r['id'] for r in feedback.load(_inventree)}:
        return {'error': 'No such report'}, 404
    try:
        feedback.delete(_inventree, report_id)
    except Exception as e:
        return {'error': f'InvenTree: {e}'}, 502
    return {'deleted': report_id}


def migrate_feedback():
    """Reports used to be in the SQLite db; move any that are left to InvenTree."""
    if _inventree is None:
        return
    try:
        moved = feedback.migrate_from_sqlite(_inventree, db)
        if moved:
            print(f'[feedback] moved {moved} report(s) from machineusage.db to InvenTree')
    except Exception as e:
        print(f'[feedback] moving reports to InvenTree failed, retried at the next start: {e}')


def start():
    """Database, saved laser state and the background threads. Once per process (wsgi.py)."""
    db.connect()
    restore_state()
    threading.Thread(target=udp_server, daemon=True).start()
    threading.Thread(target=ticker, daemon=True).start()
    threading.Thread(target=migrate_feedback, daemon=True).start()


if __name__ == '__main__':
    # Local development only; the container runs gunicorn (Dockerfile).
    start()
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
