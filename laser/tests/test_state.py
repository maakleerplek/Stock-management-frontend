import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as laser  # noqa: E402
import db  # noqa: E402


def test_restart_keeps_unassigned_time_and_catches_up_the_esp(tmp_path):
    db.connect(str(tmp_path / 'machineusage.db'))
    laser.esp_boot, laser.esp_on_ms, laser.global_time = None, 0, 0.0
    laser.esp_counter(True, 10_000, 'b1')      # first packet: baseline only
    laser.esp_counter(False, 476_000, 'b1')    # 466 s of laser time
    assert round(laser.global_time) == 466

    # A restart: the module state is gone, the database is not.
    laser.global_time, laser.esp_boot, laser.esp_on_ms = 0.0, None, 0
    laser.restore_state()
    assert round(laser.global_time) == 466

    # The ESP counted 60 s more while the service was down: added with its next packet.
    laser.esp_counter(False, 536_000, 'b1')
    assert round(laser.global_time) == 526

    assert laser.take_time() > 0
    laser.restore_state()
    assert laser.global_time == 0.0


def _fresh(tmp_path):
    db.connect(str(tmp_path / 'machineusage.db'))
    laser.esp_boot, laser.esp_on_ms, laser.global_time, laser.cut_started = 'b1', 0, 0.0, None
    laser.lightburn, laser.cut_job = None, None
    laser.laser_on, laser.on_since = False, None


def _open_cuts():
    return [s for s in laser.all_sessions() if s['name'].startswith('Cut ')]


def test_laser_off_for_the_gap_books_one_cut(tmp_path):
    _fresh(tmp_path)
    laser.esp_counter(True, 0, 'b1')
    laser.esp_counter(False, 60_000, 'b1')
    assert laser.close_cut_if_idle(time.time() + laser.CUT_GAP_S - 1) is None   # pause still too short
    sid = laser.close_cut_if_idle(time.time() + laser.CUT_GAP_S + 0.1)
    cuts = _open_cuts()
    assert sid and [c['id'] for c in cuts] == [sid]
    assert round(cuts[0]['total_time']) == 60 and cuts[0]['minutes'] == 1
    assert laser.global_time == 0.0 and laser.cut_started is None


def test_a_short_pause_stays_one_cut(tmp_path):
    _fresh(tmp_path)
    laser.esp_counter(True, 0, 'b1')
    laser.esp_counter(False, 20_000, 'b1')
    assert laser.close_cut_if_idle(time.time() + 3) is None
    laser.esp_counter(True, 20_000, 'b1')
    laser.esp_counter(False, 50_000, 'b1')
    laser.close_cut_if_idle(time.time() + laser.CUT_GAP_S + 0.1)
    assert [round(c['total_time']) for c in _open_cuts()] == [50]


def test_two_jobs_are_two_cuts_and_a_test_pulse_none(tmp_path):
    _fresh(tmp_path)
    for start, end in ((0, 30_000), (30_000, 31_000), (31_000, 91_000)):   # job, 1 s pulse, job
        laser.esp_counter(True, start, 'b1')
        laser.esp_counter(False, end, 'b1')
        laser.close_cut_if_idle(time.time() + laser.CUT_GAP_S + 0.1)
    assert sorted(round(c['total_time']) for c in _open_cuts()) == [30, 60]


def test_no_cut_while_the_laser_is_on(tmp_path):
    _fresh(tmp_path)
    laser.esp_counter(True, 0, 'b1')
    laser.esp_counter(True, 40_000, 'b1')
    assert laser.close_cut_if_idle(time.time() + 60) is None and not _open_cuts()


def test_restart_in_the_middle_of_a_cut_keeps_it(tmp_path):
    _fresh(tmp_path)
    laser.esp_counter(True, 0, 'b1')
    laser.esp_counter(False, 45_000, 'b1')
    started = laser.cut_started
    laser.global_time, laser.cut_started = 0.0, None        # the process is gone, the database is not
    laser.restore_state()
    assert round(laser.global_time) == 45 and laser.cut_started == started
    assert laser.close_cut_if_idle(time.time() + 1) is None   # the gap counts again from the restart
    laser.close_cut_if_idle(time.time() + laser.CUT_GAP_S + 0.1)
    assert [round(c['total_time']) for c in _open_cuts()] == [45]


PNG = b'\x89PNG\r\n\x1a\n' + b'0' * 40


def test_a_cut_takes_the_lightburn_file_open_when_it_started(tmp_path):
    import base64
    _fresh(tmp_path)
    c = laser.app.test_client()
    assert c.post('/laser/api/lightburn', json={'name': 'Sleutelhanger', 'thumb': base64.b64encode(PNG).decode()}).status_code == 200
    laser.esp_counter(True, 0, 'b1')
    laser.esp_counter(False, 30_000, 'b1')
    # Another file opened while the cut is still open: the cut keeps the one it started with.
    c.post('/laser/api/lightburn', json={'name': 'Onderzetter'})
    sid = laser.close_cut_if_idle(time.time() + laser.CUT_GAP_S + 0.1)
    cut = next(s for s in laser.all_sessions() if s['id'] == sid)
    assert (cut['name'], cut['file'], cut['has_preview']) == ('Sleutelhanger', 'Sleutelhanger', 1)
    r = c.get(f'/laser/api/sessions/{sid}/preview')
    assert r.status_code == 200 and r.data == PNG and r.mimetype == 'image/png'


def test_without_the_watcher_a_cut_is_named_after_its_start(tmp_path):
    _fresh(tmp_path)
    laser.lightburn = {'name': 'Old file', 'unsaved': False, 'thumb': None, 'at': time.time() - laser.LIGHTBURN_FRESH_S - 1}
    laser.esp_counter(True, 0, 'b1')
    laser.esp_counter(False, 30_000, 'b1')
    sid = laser.close_cut_if_idle(time.time() + laser.CUT_GAP_S + 0.1)
    cut = next(s for s in laser.all_sessions() if s['id'] == sid)
    assert cut['name'].startswith('Cut ') and cut['file'] is None and not cut['has_preview']
    assert laser.app.test_client().get(f'/laser/api/sessions/{sid}/preview').status_code == 404


def test_lightburn_input_is_checked(tmp_path):
    _fresh(tmp_path)
    c = laser.app.test_client()
    assert c.post('/laser/api/lightburn', json={}).status_code == 400
    assert c.post('/laser/api/lightburn', json={'name': 'x', 'thumb': 'bm90IGEgcG5n'}).status_code == 400   # "not a png"


LBRN = '''<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="2.1.04" MirrorX="True" MirrorY="True">
    <Shape Type="Rect" CutIndex="2" W="100" H="50" Cr="0"><XForm>1 0 0 1 50 25</XForm></Shape>
    <Shape Type="Group" CutIndex="0"><XForm>1 0 0 1 10 0</XForm><Children>
        <Shape Type="Path" CutIndex="0" VertID="1" PrimID="1"><XForm>1 0 0 1 0 0</XForm>
            <VertList>V0 0c0x1c1x1V20 0c0x1c1x1V20 20c0x30c0y30c1x1</VertList><PrimList>L0 1B1 2</PrimList></Shape>
        <Shape Type="Path" CutIndex="0" VertID="1" PrimID="1"><XForm>1 0 0 1 40 0</XForm></Shape>
    </Children></Shape>
</LightBurnProject>'''


def test_a_project_without_thumbnail_is_drawn(tmp_path):
    import base64
    import gzip
    import lbrn
    lines, mirror_x, mirror_y = lbrn.strokes(LBRN)
    assert (mirror_x, mirror_y) == (True, True)
    assert len(lines) == 3   # the rect, and the path twice: the second reuses VertID/PrimID 1
    assert lines[2][1][0] == (50.0, 0.0)   # group (+10) and its own XForm (+40)
    _fresh(tmp_path)
    c = laser.app.test_client()
    body = {'name': 'Untitled', 'unsaved': True, 'lbrn': base64.b64encode(gzip.compress(LBRN.encode())).decode()}
    assert c.post('/laser/api/lightburn', json=body).status_code == 200
    assert laser.lightburn['thumb'].startswith(b'\x89PNG')
    # A broken autosave keeps the picture it had.
    assert c.post('/laser/api/lightburn', json={'name': 'Untitled', 'lbrn': base64.b64encode(gzip.compress(b'<half')).decode()}).status_code == 200
    assert laser.lightburn['thumb'].startswith(b'\x89PNG')
