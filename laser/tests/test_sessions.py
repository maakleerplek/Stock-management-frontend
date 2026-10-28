import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as laser  # noqa: E402
import db  # noqa: E402


def client(tmp_path):
    db.connect(str(tmp_path / 'machineusage.db'))
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


def test_esp_counter_survives_lost_packets():
    laser.global_time, laser.esp_boot = 0.0, None
    laser.esp_counter(True, 1000, 7)       # first packet after our start: baseline
    assert laser.global_time == 0
    laser.esp_counter(False, 61000, 7)     # packets in between lost, OFF still counts
    assert abs(laser.global_time - 60) < 0.001 and laser.laser_on is False
    laser.esp_counter(False, 61000, 7)     # repeats add nothing
    laser.esp_counter(False, 500, 7)       # never negative
    assert abs(laser.global_time - 60) < 0.001
    laser.esp_counter(True, 5000, 8)       # ESP rebooted: its whole new count
    assert abs(laser.global_time - 65) < 0.001 and laser.on_since is None
    laser.global_time, laser.esp_boot, laser.laser_on = 0.0, None, False


def test_time_cannot_go_to_a_paid_session(tmp_path):
    c = client(tmp_path)
    sid = c.post('/laser/api/sessions', json={'name': 'Ruben'}).json['id']
    c.post(f'/laser/api/sessions/{sid}/paid', json={'order': 'SO-1'})
    laser.global_time = 30.0
    assert c.post('/laser/api/flush', json={'session_id': sid}).status_code == 400
    laser.global_time = 0.0


def test_thrown_away_time_is_logged(tmp_path):
    c = client(tmp_path)
    laser.global_time = 902.0                               # 15 min 2 s unassigned
    assert c.post('/laser/api/reset', json={'reason': 'test cut'}).status_code == 200
    laser.global_time = 0.0
    c.post('/laser/api/reset')                              # nothing to throw away: no row

    sid = c.post('/laser/api/sessions', json={'name': 'Ruben'}).json['id']
    db.execute('UPDATE sessions SET total_time = 120 WHERE id = ?', (sid,))
    assert c.delete(f'/laser/api/sessions/{sid}').status_code == 200    # no body, no reason
    empty = c.post('/laser/api/sessions', json={'name': 'Empty'}).json['id']
    c.delete(f'/laser/api/sessions/{empty}', json={'reason': 'typo'})   # no time: no row

    rows = sorted(c.get('/laser/api/discarded').json['rows'], key=lambda r: r['id'])
    assert [(r['source'], r['seconds'], r['session_name'], r['reason']) for r in rows] == [
        ('unassigned', 902.0, None, 'test cut'),
        ('session', 120.0, 'Ruben', None),
    ]

    # A deleted session gets a kind, at delete time or afterwards; junk kinds are refused.
    sid = c.post('/laser/api/sessions', json={'name': 'HTL'}).json['id']
    db.execute('UPDATE sessions SET total_time = 300 WHERE id = ?', (sid,))
    c.delete(f'/laser/api/sessions/{sid}', json={'kind': 'workshop'})
    assert c.patch(f"/laser/api/admin/discarded/{rows[1]['id']}", json={'kind': 'paid'}).status_code == 200
    assert c.patch(f"/laser/api/admin/discarded/{rows[1]['id']}", json={'kind': 'free'}).status_code == 400
    assert [r['kind'] for r in db.query('SELECT kind FROM discarded_time ORDER BY id')] == [None, 'paid', 'workshop']


def test_empty_session_is_never_billed_or_kept(tmp_path):
    c = client(tmp_path)
    sid = c.post('/laser/api/sessions', json={'name': 'Nobody'}).json['id']
    assert c.post(f'/laser/api/sessions/{sid}/checkout', json={'on': True}).status_code == 400
    assert c.post(f'/laser/api/sessions/{sid}/paid', json={'order': 'SO-9'}).status_code == 200
    assert db.query('SELECT id FROM sessions') == []
    assert db.query('SELECT id FROM discarded_time') == []


def test_a_test_pulse_is_not_logged_but_a_short_cut_is(tmp_path):
    c = client(tmp_path)
    pulse = c.post('/laser/api/sessions', json={'name': 'Test'}).json['id']
    db.execute('UPDATE sessions SET total_time = 1 WHERE id = ?', (pulse,))
    c.delete(f'/laser/api/sessions/{pulse}')
    assert db.query('SELECT id FROM discarded_time') == []
    cut = c.post('/laser/api/sessions', json={'name': 'Cut 14:32'}).json['id']
    db.execute('UPDATE sessions SET total_time = 5 WHERE id = ?', (cut,))
    c.delete(f'/laser/api/sessions/{cut}', json={'kind': 'workshop'})
    assert [(r['seconds'], r['kind']) for r in db.query('SELECT seconds, kind FROM discarded_time')] == [(5, 'workshop')]


def test_old_tiny_discards_are_cleaned_up(tmp_path):
    db.connect(str(tmp_path / 'machineusage.db'))
    for seconds in (1, 120):
        db.execute("INSERT INTO discarded_time (seconds, source, discarded_at) VALUES (?, 'unassigned', '2026-09-29')", (seconds,))
    db.connect(str(tmp_path / 'machineusage.db'))
    assert [r['seconds'] for r in db.query('SELECT seconds FROM discarded_time')] == [120]


def test_all_sessions_for_analytics(tmp_path):
    c = client(tmp_path)
    paid = c.post('/laser/api/sessions', json={'name': 'Ruben'}).json['id']
    db.execute('UPDATE sessions SET total_time = 120 WHERE id = ?', (paid,))
    c.post(f'/laser/api/sessions/{paid}/paid', json={'order': 'SO-0042'})
    c.post('/laser/api/sessions', json={'name': 'Wolf'})

    body = c.get('/laser/api/sessions/all').json
    assert {s['name']: s['order_ref'] for s in body['sessions']} == {'Ruben': 'SO-0042', 'Wolf': None}
    assert 'unassigned_seconds' in body


def test_old_laser_db_is_moved_to_its_new_name(tmp_path):
    old = tmp_path / 'laser.db'
    db.connect(str(old))
    db.execute("INSERT INTO sessions (id, name, created) VALUES ('s1', 'Ruben', '2026-10-13')")
    db._conn.close()
    new = tmp_path / 'machineusage.db'
    db.connect(str(new))
    assert not old.exists()
    assert [r['name'] for r in db.query('SELECT name FROM sessions')] == ['Ruben']


def test_rename_open_session_only(tmp_path):
    c = client(tmp_path)
    sid = c.post('/laser/api/sessions', json={'name': 'Ruben'}).json['id']
    assert c.patch(f'/laser/api/sessions/{sid}', json={'name': 'x'}).status_code == 400
    assert c.patch(f'/laser/api/sessions/{sid}', json={'name': '  Box for Jan  '}).status_code == 200
    assert c.get('/laser/api/sessions').json['sessions'][0]['name'] == 'Box for Jan'
    db.execute('UPDATE sessions SET paid_at = ? WHERE id = ?', ('2026-10-15', sid))
    assert c.patch(f'/laser/api/sessions/{sid}', json={'name': 'Later'}).status_code == 404


def test_projects_group_cuts_and_go_once_paid(tmp_path):
    c = client(tmp_path)
    a = c.post('/laser/api/sessions', json={'name': 'Cut 10:00'}).json['id']
    b = c.post('/laser/api/sessions', json={'name': 'Cut 10:20'}).json['id']
    db.execute('UPDATE sessions SET total_time = 120')
    assert c.post('/laser/api/projects', json={'name': 'x'}).status_code == 400
    pid = c.post('/laser/api/projects', json={'name': 'Ruben lamp'}).json['id']
    assert c.post(f'/laser/api/sessions/{a}/project', json={'project_id': 'nope'}).status_code == 404
    for sid in (a, b):
        assert c.post(f'/laser/api/sessions/{sid}/project', json={'project_id': pid}).status_code == 200
    c.post(f'/laser/api/sessions/{b}/project', json={'project_id': None})   # taken out again
    data = c.get('/laser/api/sessions').json
    assert {s['id']: s['project_id'] for s in data['sessions']} == {a: pid, b: None}
    assert [p['name'] for p in data['projects']] == ['Ruben lamp']

    # Deleting the project keeps its cuts, as new cuts.
    c.delete(f'/laser/api/projects/{pid}')
    data = c.get('/laser/api/sessions').json
    assert data['projects'] == [] and all(s['project_id'] is None for s in data['sessions'])

    # Paying the last cut of a project closes it; another open project stays.
    pid = c.post('/laser/api/projects', json={'name': 'Ruben lamp'}).json['id']
    other = c.post('/laser/api/projects', json={'name': 'Empty'}).json['id']
    c.post(f'/laser/api/sessions/{a}/project', json={'project_id': pid})
    c.post(f'/laser/api/sessions/{a}/paid', json={'order': 'SO-0050'})
    assert [p['id'] for p in c.get('/laser/api/sessions').json['projects']] == [other]
