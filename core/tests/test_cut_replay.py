"""The cut logic on a real day of the laser (24 Oct 2026, 258 ON/OFF lines from the service log)."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'scripts'))
import replay_cuts  # noqa: E402

LOG = os.path.join(os.path.dirname(__file__), 'data', 'esp_2026-10-24.log')


def test_a_real_day_splits_into_the_same_cuts(monkeypatch):
    monkeypatch.setattr(time, 'time', time.time)   # replay swaps the clock and the gap; put both back afterwards
    monkeypatch.setattr(replay_cuts.laser, 'CUT_GAP_S', replay_cuts.laser.CUT_GAP_S)
    events = replay_cuts.parse(LOG)
    cuts = replay_cuts.replay(events, 5)
    assert len(events) == 258 and len(cuts) == 31
    # All laser time ends up in a cut, plus the short pauses inside a cut. The ESP rebooted once
    # that day, so the beam time is the sum of the counter's steps, starting again after the reset.
    steps = [b - a if b >= a else b for (_, _, a), (_, _, b) in zip(events, events[1:])]
    extra = sum(c['seconds'] for c in cuts) - sum(steps) / 1000
    assert 150 < extra < 180   # ~197 s of pauses billed, minus the cuts under MIN_CUT_SECONDS that are dropped
    # Pauses of 4-5 s inside a job stay one cut (12:09, 3:29); a 30 min job stays whole (14:54).
    by_start = {c['start'][11:16]: int(c['seconds']) for c in cuts}
    assert by_start['12:09'] == 214   # 209 s beam + its two pauses and by_start['14:54'] == 29 * 60 + 27


def test_a_longer_gap_only_merges(monkeypatch):
    monkeypatch.setattr(time, 'time', time.time)
    monkeypatch.setattr(replay_cuts.laser, 'CUT_GAP_S', replay_cuts.laser.CUT_GAP_S)
    events = replay_cuts.parse(LOG)
    assert [len(replay_cuts.replay(events, g)) for g in (3, 5, 8, 10)] == [39, 31, 29, 28]
