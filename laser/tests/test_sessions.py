import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as laser  # noqa: E402
import db  # noqa: E402


def client(tmp_path):
    db.connect(str(tmp_path / 'laser.db'))
    return laser.app.test_client()


def test_checkout_then_paid_keeps_history(tmp_path):
    c = client(tmp_path)
    sid = c.post('/laser/api/sessions', json={'name': 'Ruben'}).json['id']
    db.execute('UPDATE sessions SET total_time = 301 WHERE id = ?', (sid,))

    assert c.post(f'/laser/api/sessions/{sid}/checkout', json={'on': True}).status_code == 200
    [s] = c.get('/laser/api/sessions').json['sessions']
    assert s['checkout_at'] and s['minutes'] == 6          # 5 min 1 s is charged as 6

    c.post(f'/laser/api/sessions/{sid}/checkout', json={'on': False})
    assert c.get('/laser/api/sessions').json['sessions'][0]['checkout_at'] is None

    assert c.post(f'/laser/api/sessions/{sid}/paid', json={'order': 'SO-0042'}).status_code == 200
    assert c.get('/laser/api/sessions').json['sessions'] == []
    [row] = db.query('SELECT paid_at, order_ref FROM sessions WHERE id = ?', (sid,))
    assert row['paid_at'] and row['order_ref'] == 'SO-0042'
    # paid once, not twice
    assert c.post(f'/laser/api/sessions/{sid}/paid', json={'order': 'SO-0043'}).status_code == 404


def test_old_database_gets_new_columns(tmp_path):
    import sqlite3
    path = tmp_path / 'old.db'
    old = sqlite3.connect(path)
    old.execute('CREATE TABLE sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, created TEXT NOT NULL, '
                'total_time REAL NOT NULL DEFAULT 0, total_cost REAL NOT NULL DEFAULT 0)')
    old.execute("INSERT INTO sessions (id, name, created) VALUES ('a', 'x', '2026-09-25')")
    old.commit()
    old.close()
    db.connect(str(path))
    assert db.query('SELECT checkout_at, paid_at, order_ref FROM sessions') == [
        {'checkout_at': None, 'paid_at': None, 'order_ref': None}]


def test_silent_esp_closes_the_running_block(tmp_path):
    import time as _time
    from datetime import datetime, timedelta
    laser.global_time, laser.laser_on = 0.0, True
    t0 = _time.time()
    laser.on_since = datetime.fromtimestamp(t0 - 100)   # on for 100 s
    laser.esp_last_seen = t0 - 40                       # last heard 40 s ago
    laser.stop_if_esp_silent(now=t0)
    assert laser.laser_on is False
    assert abs(laser.global_time - 60) < 0.01           # billed until the last heartbeat
    laser.stop_if_esp_silent(now=t0)                    # nothing left to close
    assert abs(laser.global_time - 60) < 0.01
    laser.global_time = 0.0


def test_time_cannot_go_to_a_paid_session(tmp_path):
    c = client(tmp_path)
    sid = c.post('/laser/api/sessions', json={'name': 'Ruben'}).json['id']
    c.post(f'/laser/api/sessions/{sid}/paid', json={'order': 'SO-1'})
    laser.global_time = 30.0
    assert c.post('/laser/api/flush', json={'session_id': sid}).status_code == 400
    laser.global_time = 0.0
