"""Laser cutter service for the Lasercutter tab.

Time tracking comes from LC-logger (branch server-esp, server/app.py): the
ESP32 on the laser (LC-logger esp/monitorOTA, 10.72.3.81) sends UDP straight
to this service on port 5005, {"state": "ON"|"OFF"} on every
change and {"type": "heartbeat"} every 10 s, which we answer with an ACK.
Laser-on time adds up in a global counter until someone assigns it to their
session. Settings advice comes from LaserLog (see recommend.py).

Everything is under /laser/ because nginx proxies that path here.
"""
import json
import math
import os
import socket
import threading
import time
from datetime import datetime
from uuid import uuid4

from flask import Flask, jsonify, request
from flask_socketio import SocketIO

import db
import feedback
import inventree
from recommend import MAX_POWER, Point, recommend

COST_PER_MIN = float(os.environ.get('COST_PER_MIN', '0.50'))
COST_PER_SECOND = COST_PER_MIN / 60
UDP_PORT = int(os.environ.get('UDP_PORT', '5005'))
SIMULATE = os.environ.get('LASER_SIMULATE', '') == '1'
ESP_TIMEOUT = 30  # seconds without a packet before the ESP counts as gone
# Comma-separated sender IPs accepted on the UDP port (the ESP32). Empty accepts
# anyone on the network, who could then add or stop billed laser time.
ESP_ALLOWED_IPS = {ip.strip() for ip in os.environ.get('ESP_ALLOWED_IPS', '').split(',') if ip.strip()}

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


def current_time() -> float:
    """Unassigned seconds, including the block that is running now."""
    if laser_on and on_since:
        return global_time + (datetime.now() - on_since).total_seconds()
    return global_time


def time_payload() -> dict:
    return {
        'global_time': current_time(),
        'laser_state': laser_on,
        'esp_connected': time.time() - esp_last_seen < ESP_TIMEOUT,
        'esp_ip': esp_ip,
        'simulate': SIMULATE,
    }


def set_laser(on: bool):
    global global_time, laser_on, on_since
    with state_lock:
        now = datetime.now()
        if laser_on and not on:
            global_time += (now - on_since).total_seconds()
            on_since = None
        elif not laser_on and on:
            on_since = now
        laser_on = on
        payload = time_payload()
    socketio.emit('time_update', payload)


def take_time() -> float:
    """Empty the counter and return what was in it. A running block restarts now."""
    global global_time, on_since
    with state_lock:
        seconds = current_time()
        global_time = 0.0
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
            elif message.get('state') in ('ON', 'OFF'):
                set_laser(message['state'] == 'ON')
        except Exception as e:
            print(f'[udp] {e}')


def stop_if_esp_silent(now: float | None = None):
    """The ESP32 sends a heartbeat every 10 s. If it goes silent while the laser
    is on (Wi-Fi drop, power cut, lost OFF packet on the way out), stop the
    block at the last sign of life instead of billing the time that follows."""
    global global_time, laser_on, on_since
    if SIMULATE:
        return
    now = time.time() if now is None else now
    with state_lock:
        if not (laser_on and on_since) or now - esp_last_seen < ESP_TIMEOUT:
            return
        last = datetime.fromtimestamp(esp_last_seen)
        global_time += max(0.0, (last - on_since).total_seconds())
        laser_on, on_since = False, None
    print('[udp] ESP32 silent while the laser was on: block closed at its last heartbeat')


def ticker():
    while True:
        # One failed emit or DB call used to end this thread for good: no more
        # live updates and no ESP timeout, while the health check stayed OK.
        try:
            stop_if_esp_silent()
            with state_lock:
                payload = time_payload()
            socketio.emit('time_update', payload)
        except Exception as e:
            print(f'[ticker] {e}')
        time.sleep(0.5)

# ---------------------------------------------------------------- sessions


def all_sessions() -> list[dict]:
    """Open sessions: not paid yet. Paid ones stay in the table as history."""
    rows = db.query('SELECT * FROM sessions WHERE paid_at IS NULL ORDER BY created DESC')
    for r in rows:
        r['minutes'] = math.ceil(round(r['total_time'], 3) / 60)   # what the till charges
    return rows


def broadcast_sessions():
    socketio.emit('sessions', {'sessions': all_sessions()})


@socketio.on('connect')
def on_connect():
    with state_lock:
        payload = time_payload()
    socketio.emit('time_update', payload, to=request.sid)
    socketio.emit('sessions', {'sessions': all_sessions()}, to=request.sid)


@app.get('/laser/api/health')
def health():
    return {'ok': True}


@app.get('/laser/api/config')
def config():
    return {'costPerMin': COST_PER_MIN, 'maxPower': MAX_POWER, 'simulate': SIMULATE}


@app.get('/laser/api/sessions')
def get_sessions():
    return {'sessions': all_sessions()}


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


def reason_from_body() -> str | None:
    return (((request.get_json(silent=True) or {}).get('reason') or '').strip()[:200]) or None


def log_discard(seconds: float, source: str, session_name: str | None, reason: str | None):
    db.execute('INSERT INTO discarded_time (seconds, source, session_name, reason, discarded_at) VALUES (?, ?, ?, ?, ?)',
               (seconds, source, session_name, reason, datetime.now().isoformat()))


@app.delete('/laser/api/sessions/<sid>')
def delete_session(sid):
    rows = db.query('SELECT * FROM sessions WHERE id = ?', (sid,))
    if not rows:
        return {'error': 'Session not found'}, 404
    s = rows[0]
    if s['paid_at'] is None and s['total_time'] > 0:
        log_discard(s['total_time'], 'session', s['name'], reason_from_body())
    db.execute('DELETE FROM time_blocks WHERE session_id = ?', (sid,))
    db.execute('DELETE FROM sessions WHERE id = ?', (sid,))
    broadcast_sessions()
    return {'deleted': rows[0]}


@app.post('/laser/api/sessions/<sid>/checkout')
def checkout_session(sid):
    """Put the session in the checkout (Pay), or take it back out."""
    on = bool((request.json or {}).get('on', True))
    if not db.query('SELECT id FROM sessions WHERE id = ? AND paid_at IS NULL', (sid,)):
        return {'error': 'Session not found'}, 404
    db.execute('UPDATE sessions SET checkout_at = ? WHERE id = ?', (datetime.now().isoformat() if on else None, sid))
    broadcast_sessions()
    return {'ok': True}


@app.post('/laser/api/sessions/<sid>/paid')
def paid_session(sid):
    """The checkout went through: keep the session as history with its order."""
    order = ((request.json or {}).get('order') or '')[:40] or None
    if not db.query('SELECT id FROM sessions WHERE id = ? AND paid_at IS NULL', (sid,)):
        return {'error': 'Session not found'}, 404
    db.execute('UPDATE sessions SET paid_at = ?, order_ref = ? WHERE id = ?', (datetime.now().isoformat(), order, sid))
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
    cost = seconds * COST_PER_SECOND
    now = datetime.now().isoformat()
    db.execute('UPDATE sessions SET total_time = total_time + ?, total_cost = total_cost + ? WHERE id = ?',
               (seconds, cost, sid))
    db.execute('INSERT INTO time_blocks (session_id, seconds, flushed_at) VALUES (?, ?, ?)', (sid, seconds, now))
    broadcast_sessions()
    with state_lock:
        socketio.emit('time_update', time_payload())
    return {'flushed_time': seconds, 'flushed_cost': cost}


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
    """Reports used to be in laser.db; move any that are left to InvenTree."""
    if _inventree is None:
        return
    try:
        moved = feedback.migrate_from_sqlite(_inventree, db)
        if moved:
            print(f'[feedback] moved {moved} report(s) from laser.db to InvenTree')
    except Exception as e:
        print(f'[feedback] moving reports to InvenTree failed, retried at the next start: {e}')


if __name__ == '__main__':
    db.connect()
    threading.Thread(target=udp_server, daemon=True).start()
    threading.Thread(target=ticker, daemon=True).start()
    threading.Thread(target=migrate_feedback, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
