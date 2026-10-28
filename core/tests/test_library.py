import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as laser  # noqa: E402
import inventree  # noqa: E402


def test_clean_row_accepts_a_full_row():
    row, err = laser.clean_row({'material': ' MDF ', 'thickness': '3', 'cutSpeed': '25', 'cutPower': 50,
                                'linePower': '60', 'linePowerMin': '40', 'cutPasses': '2', 'comment': 'x'})
    assert err is None
    assert row['material'] == 'MDF' and row['thickness'] == 3.0 and row['cutPasses'] == 2
    assert row['fillSpeed'] is None and row['group'] == ''


def test_clean_row_rejects_bad_values():
    assert laser.clean_row({'thickness': 3})[1] == 'Material name is required'
    assert 'Power' in laser.clean_row({'material': 'MDF', 'cutPower': 95})[1]
    assert 'Power' in laser.clean_row({'material': 'MDF', 'cutPower': 5})[1]      # below the tube minimum
    assert 'Min power' in laser.clean_row({'material': 'MDF', 'linePower': 40, 'linePowerMin': 60})[1]
    assert 'number' in laser.clean_row({'material': 'MDF', 'cutSpeed': 'fast'})[1]


def test_row_without_thickness_is_engrave_only():
    row = inventree.row_from_values(7, {inventree.P_MATERIAL: 'bamboo', inventree.P_LINE_SPEED: '400',
                                        inventree.P_LINE_POWER: '10', inventree.P_ENGRAVE_SPEED: '400',
                                        inventree.P_ENGRAVE_POWER: '50'})
    assert row['thickness'] is None and row['cut'] is None
    assert row['engrave'] == {'speed': 400.0, 'power': 50.0, 'passes': 1}
    assert inventree.part_name(row) == 'bamboo'
    assert inventree.part_name({'material': 'MDF', 'thickness': 3.0}) == 'MDF 3 mm'
    assert inventree.part_name({'material': 'plywood', 'thickness': '3.5'}) == 'plywood 3.5 mm'


def test_writes_without_inventree_are_refused(tmp_path):
    laser._inventree, saved = None, laser._inventree
    try:
        c = laser.app.test_client()
        assert c.post('/laser/api/library', json={'material': 'MDF'}).status_code == 503
    finally:
        laser._inventree = saved
