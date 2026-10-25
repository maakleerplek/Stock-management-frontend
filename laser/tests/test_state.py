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
