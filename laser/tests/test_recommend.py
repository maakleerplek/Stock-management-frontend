import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from recommend import MAX_POWER, Point, recommend

BASE = [Point(3, 20, 70, 1, 'clean', baseline=True), Point(5, 10, 85, 1, 'clean', baseline=True)]


def test_exact_baseline():
    r = recommend(BASE, 3, 'cut')
    assert (r['speed'], r['power'], r['passes']) == (20, 70, 1)
    assert r['confidence'] == 'baseline' and r['reportCount'] == 0


def test_no_data_outside_tolerance():
    r = recommend(BASE, 10, 'cut')
    assert r['speed'] is None and r['confidence'] == 'none' and r['nearestThickness'] == 5


def test_power_never_above_max():
    r = recommend([Point(3, 100, 80, 1, 'clean', baseline=True)], 3, 'engrave', strength=1.0)
    assert r['power'] == MAX_POWER and r['capped']


def test_strength_raises_power_lowers_speed():
    pts = [Point(3, 300, 30, 1, 'clean', baseline=True)]
    lo, mid, hi = (recommend(pts, 3, 'engrave', s) for s in (0, 0.5, 1))
    assert lo['power'] < mid['power'] < hi['power']
    assert lo['speed'] > mid['speed'] > hi['speed']
    assert (mid['speed'], mid['power']) == (300, 30)


def test_reports_outweigh_baseline_and_bad_ones_warn():
    pts = BASE + [Point(3, 16, 80, 1, 'clean')] * 3 + [Point(3, 30, 60, 1, 'failed')]
    r = recommend(pts, 3, 'cut')
    assert r['confidence'] == 'good' and r['reportCount'] == 3
    assert 70 < r['power'] <= 80
    assert '1 attempt at power 60' in r['avoidWarning']


def test_engrave_attempt_is_normalised():
    # logged at strength 1.0 (power x1.5, speed x0.5) = 30 % / 300 at default
    r = recommend([Point(3, 150, 45, 1, 'clean', strength=1.0)], 3, 'engrave', 0.5)
    assert (r['speed'], r['power']) == (300, 30)


def test_exact_library_row_is_not_blended_with_neighbours():
    pts = [Point(1, 50, 50, 1, 'clean', baseline=True), Point(2, 25, 85, 1, 'clean', baseline=True)]
    r = recommend(pts, 1, 'cut')
    assert (r['speed'], r['power']) == (50, 50)
    between = recommend(pts, 1.5, 'cut')                    # no row at 1.5 mm: still a blend
    assert 25 < between['speed'] < 50
