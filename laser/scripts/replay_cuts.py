"""Replay a laser log through the cut logic and show the cuts it makes.

    docker compose logs --no-color --timestamps laser | grep -F '[esp]' > esp.log
    python laser/scripts/replay_cuts.py esp.log --gap 3 5 8 10

Reads the "[esp] ON/OFF: counter X s" lines, feeds them to esp_counter() with a fake
clock and runs close_cut_if_idle() in between, in a throwaway database. Per gap value
it prints the cuts (start, length) and the pauses that are just above the gap, where
one job could have been split in two.
"""
import argparse
import os
import re
import sys
import tempfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as laser  # noqa: E402
import db  # noqa: E402

LINE = re.compile(r'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?)\d*Z \[esp\] (ON|OFF): counter ([\d.]+) s')


def parse(path: str) -> list[tuple[float, bool, int]]:
    """(epoch, on, on_ms) per state change, in order."""
    events = []
    for line in open(path):
        m = LINE.search(line)
        if m:
            events.append((datetime.fromisoformat(m.group(1)).timestamp(), m.group(2) == 'ON', round(float(m.group(3)) * 1000)))
    return events


def replay(events, gap: float) -> list[dict]:
    """The cuts the service would have booked: [{'start', 'seconds'}]."""
    now = [0.0]
    laser.time.time = lambda: now[0]          # esp_counter and close_cut_if_idle read the clock here
    laser.CUT_GAP_S = gap
    with tempfile.TemporaryDirectory() as tmp:
        db.connect(os.path.join(tmp, 'replay.db'))
        laser.esp_boot, laser.esp_on_ms, laser.global_time, laser.cut_started = None, 0, 0.0, None
        laser.laser_on, laser.on_since = False, None
        laser.lightburn, laser.cut_job = None, None   # no LightBurn files in a replay: cuts are named after their start
        boot, last_ms = 0, None
        for t, on, on_ms in events:
            now[0] = t
            laser.close_cut_if_idle(t)
            if last_ms is not None and on_ms < last_ms:
                boot += 1                         # the ESP rebooted: its counter started again
            if laser.esp_boot is None:
                laser.esp_boot, laser.esp_on_ms = f'b{boot}', on_ms   # the first line is the baseline
            laser.esp_counter(on, on_ms, f'b{boot}')
            last_ms = on_ms
        if events:
            now[0] = events[-1][0] + gap + 1
            laser.close_cut_if_idle(now[0])
        rows = db.query("SELECT created, total_time FROM sessions WHERE name LIKE 'Cut %' ORDER BY created")
    return [{'start': r['created'], 'seconds': r['total_time']} for r in rows]


def pauses(events) -> list[tuple[float, float]]:
    """(epoch of the OFF, seconds until the next ON)."""
    out, off_at = [], None
    for t, on, _ in events:
        if not on:
            off_at = t
        elif off_at is not None:
            out.append((off_at, t - off_at))
            off_at = None
    return out


def mmss(seconds: float) -> str:
    return f'{int(seconds // 60)}:{int(seconds % 60):02d}'


def main():
    ap = argparse.ArgumentParser(description='Replay a laser log through the cut logic.')
    ap.add_argument('log')
    ap.add_argument('--gap', type=float, nargs='+', default=[laser.CUT_GAP_S])
    args = ap.parse_args()
    events = parse(args.log)
    if not events:
        sys.exit('No "[esp] ON/OFF: counter" lines in the log')
    print(f'{len(events)} state changes, {datetime.fromtimestamp(events[0][0]):%Y-%m-%d %H:%M} to '
          f'{datetime.fromtimestamp(events[-1][0]):%Y-%m-%d %H:%M}')
    p = pauses(events)
    for gap in args.gap:
        cuts = replay(events, gap)
        total = sum(c['seconds'] for c in cuts)
        print(f'\n== gap {gap:g} s: {len(cuts)} cuts, {mmss(total)} laser time')
        for c in cuts:
            print(f"  {c['start'][:16].replace('T', ' ')}  {mmss(c['seconds']):>6}")
        near = [(t, d) for t, d in p if gap <= d < 3 * gap]
        if near:
            print(f'  pauses of {gap:g}-{3 * gap:g} s, where one job may now be two cuts:')
            for t, d in near:
                print(f'    {datetime.fromtimestamp(t):%H:%M:%S}  {d:.1f} s')


if __name__ == '__main__':
    main()
