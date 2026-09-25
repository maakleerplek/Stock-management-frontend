"""Laser cutter service for the Lasercutter tab.

Time tracking comes from LC-logger (branch server-esp, server/app.py): the
ESP32 on the laser sends UDP on port 5005, {"state": "ON"|"OFF"} on every
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

from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO

import db
import inventree
from recommend import MAX_POWER, Point, recommend

COST_PER_MIN = float(os.environ.get('COST_PER_MIN', '0.50'))
COST_PER_SECOND = COST_PER_MIN / 60
UDP_PORT = int(os.environ.get('UDP_PORT', '5005'))
SIMULATE = os.environ.get('LASER_SIMULATE', '') == '1'
ESP_TIMEOUT = 30  # seconds without a packet before the ESP counts as gone

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
            message = json.loads(data.decode())
            esp_ip, esp_last_seen = addr[0], time.time()
            if message.get('type') == 'heartbeat':
                sock.sendto(json.dumps({'type': 'ack'}).encode(), addr)
            elif message.get('state') in ('ON', 'OFF'):
                set_laser(message['state'] == 'ON')
        except Exception as e:
            print(f'[udp] {e}')


def ticker():
    while True:
        with state_lock:
            payload = time_payload()
        socketio.emit('time_update', payload)
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


RELAY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'relay')
RELAY_FILES = ('esp_relay.py', 'start_relay.bat', 'README.md')


@app.get('/laser/relay/')
def relay_index():
    """Download page for the relay on the laser PC (the repo is private)."""
    links = ''.join(f'<li><a href="{f}" download>{f}</a></li>' for f in RELAY_FILES)
    return (f'<!doctype html><meta charset="utf-8"><title>ESP32 relay</title>'
            f'<h1>ESP32 relay for the laser PC</h1><p>Download both files into one folder, '
            f'then double-click <code>start_relay.bat</code>. See the README.</p><ul>{links}</ul>')


@app.get('/laser/relay/<name>')
def relay_file(name):
    if name not in RELAY_FILES:
        return {'error': 'not found'}, 404
    return send_from_directory(RELAY_DIR, name, as_attachment=True)


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


@app.delete('/laser/api/sessions/<sid>')
def delete_session(sid):
    rows = db.query('SELECT * FROM sessions WHERE id = ?', (sid,))
    if not rows:
        return {'error': 'Session not found'}, 404
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
    if not sid or not db.query('SELECT id FROM sessions WHERE id = ?', (sid,)):
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
    with state_lock:
        socketio.emit('time_update', time_payload())
    return {'reset_amount': seconds}


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
        grouped.setdefault(r['material'], []).append(r['thickness'])
    return {'materials': [{'name': k, 'thicknesses': sorted(set(v))} for k, v in sorted(grouped.items())]}


def points_for(material: str, operation: str) -> list[Point]:
    points = []
    for r in inventree.materials(_inventree):
        s = r[operation]
        if r['material'].lower() == material.lower() and s:
            points.append(Point(r['thickness'], s['speed'], s['power'], s['passes'], 'clean', baseline=True))
    for a in db.query(
            "SELECT *, julianday('now') - julianday(created_at) AS days_old FROM attempts "
            'WHERE lower(material) = lower(?) AND operation = ?', (material, operation)):
        points.append(Point(a['thickness_mm'], a['speed'], a['power'], a['passes'], a['outcome'],
                            days_old=a['days_old'] or 0,
                            strength=a['strength'] if operation == 'engrave' else None))
    return points


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
    db.execute('INSERT INTO attempts (material, thickness_mm, operation, speed, power, passes, strength, '
               'outcome, submitted_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
               (material, thickness, operation, speed, power, passes, strength, outcome,
                (b.get('submitted_by') or '')[:80] or None, (b.get('notes') or '')[:500] or None))
    return {'ok': True}


if __name__ == '__main__':
    db.connect()
    threading.Thread(target=udp_server, daemon=True).start()
    threading.Thread(target=ticker, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
