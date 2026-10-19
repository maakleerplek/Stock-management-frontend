import os
import sys

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
