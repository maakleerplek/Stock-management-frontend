import os
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as laser  # noqa: E402
import db  # noqa: E402
import feedback  # noqa: E402
import inventree  # noqa: E402


class FakeInvenTree:
    """Categories, parts and parameters: what feedback.py uses."""

    def __init__(self):
        self.pk = 0
        self.categories, self.templates, self.parts, self.params = [], [], {}, []

    def _next(self):
        self.pk += 1
        return self.pk

    def get(self, path, **q):
        if path == 'part/category/':
            return [c for c in self.categories if c['name'] == q.get('name')]
        if path == 'parameter/template/':
            return list(self.templates)
        if path == 'part/':
            return [p for p in self.parts.values() if p['category'] == q.get('category')]
        if path == 'parameter/':
            return [p for p in self.params if p['template'] == q.get('template')]
        raise AssertionError(path)

    def post(self, path, body):
        row = {'pk': self._next(), **body}
        if path == 'part/category/':
            self.categories.append(row)
        elif path == 'parameter/template/':
            self.templates.append(row)
        elif path == 'parameter/':
            self.params.append(row)
        elif path == 'part/':
            self.parts[row['pk']] = row
        else:
            raise AssertionError(path)
        return row

    def delete(self, path):
        pk = int(path.split('/')[1])
        assert not self.parts[pk]['active'], 'InvenTree refuses to delete an active part'
        del self.parts[pk]
        self.params = [p for p in self.params if p['model_id'] != pk]


LIBRARY = [{'partId': 900, 'material': 'MDF', 'thickness': 3.0, 'group': '',
            'cut': {'speed': 20.0, 'power': 60.0, 'passes': 1}, 'engrave': None}]


@pytest.fixture
def env(tmp_path, monkeypatch):
    db.connect(str(tmp_path / 'laser.db'))
    inv = FakeInvenTree()
    monkeypatch.setattr(laser, '_inventree', inv)
    monkeypatch.setattr(inventree, 'materials', lambda client: LIBRARY)
    feedback._cache.update(at=0.0, reports=None)
    return laser.app.test_client(), inv


def report(c, **over):
    body = {'material': 'MDF', 'thickness': 3, 'operation': 'cut', 'speed': 20, 'power': 60,
            'passes': 1, 'outcome': 'clean', **over}
    return c.post('/laser/api/attempts', json=body)


def test_report_is_stored_in_inventree(env):
    c, inv = env
    r = report(c, speed=15, outcome='partial')
    assert r.status_code == 200
    [part] = inv.parts.values()
    assert part['virtual'] and not part['active'] and inv.categories[0]['name'] == feedback.CATEGORY
    [rep] = feedback.load(inv)
    assert rep['id'] == part['pk'] and rep['speed'] == 15.0 and rep['outcome'] == 'partial'
    assert rep['thickness_mm'] == 3.0 and rep['passes'] == 1 and rep['created_at']


def test_reports_steer_the_advice(env):
    c, _ = env
    before = c.get('/laser/api/recommend?material=MDF&thickness=3&ops=cut').json['results'][0]
    for _ in range(3):
        report(c, speed=10, power=70)
    after = c.get('/laser/api/recommend?material=MDF&thickness=3&ops=cut').json['results'][0]
    assert before['confidence'] == 'baseline' and after['confidence'] == 'good'
    assert after['speed'] < before['speed'] and after['power'] > before['power']


def test_groups_count_and_flag_a_difference(env):
    c, _ = env
    report(c, speed=10, power=70)
    report(c, speed=10, power=70)
    [g] = c.get('/laser/api/admin/feedback').json['groups']
    assert g['counts'] == {'clean': 2, 'partial': 0, 'failed': 0, 'risky': 0}
    assert g['library']['partId'] == 900 and not g['differs']      # 2 good reports: too few
    report(c, speed=10, power=70, outcome='partial')
    report(c, outcome='risky', power=85)
    [g] = c.get('/laser/api/admin/feedback').json['groups']
    assert g['differs'] and g['counts']['risky'] == 1
    assert 'fire / melting' in g['advice']['avoidWarning']


def test_no_library_row_differs_once_there_is_advice(env):
    c, _ = env
    for _ in range(3):
        report(c, material='Acryl', thickness=5)
    [g] = c.get('/laser/api/admin/feedback').json['groups']
    assert g['library'] is None and g['differs']


def test_delete_removes_the_report(env):
    c, inv = env
    rid = report(c).json['id']
    assert c.delete(f'/laser/api/admin/attempts/{rid}').status_code == 200
    assert inv.parts == {} and c.get('/laser/api/admin/feedback').json['reports'] == []
    assert c.delete(f'/laser/api/admin/attempts/{rid}').status_code == 404


def test_days_filters_old_reports(env):
    c, inv = env
    old = (datetime.now() - timedelta(days=40)).isoformat(timespec='seconds')
    feedback.save(inv, {'material': 'MDF', 'thickness_mm': 3.0, 'operation': 'cut', 'speed': 20.0,
                        'power': 60.0, 'passes': 1, 'outcome': 'clean', 'created_at': old})
    report(c)
    assert len(c.get('/laser/api/admin/feedback?days=30').json['reports']) == 1
    assert len(c.get('/laser/api/admin/feedback').json['reports']) == 2


def test_old_sqlite_reports_move_to_inventree(env):
    _, inv = env
    db.execute("INSERT INTO attempts (material, thickness_mm, operation, speed, power, passes, outcome, created_at) "
               "VALUES ('MDF', 3, 'cut', 20, 60, 1, 'clean', '2026-09-26 13:13:19')")
    laser.migrate_feedback()
    assert db.query('SELECT * FROM attempts') == []
    [rep] = feedback.load(inv)
    assert rep['created_at'] == '2026-09-26T13:13:19' and rep['outcome'] == 'clean'


def test_update_library_ends_the_difference(env, monkeypatch):
    c, _ = env
    for _ in range(3):
        report(c, speed=10, power=70)
    [g] = c.get('/laser/api/admin/feedback').json['groups']
    assert g['differs'] and (g['reported']['speed'], g['reported']['power']) == (10, 70)
    # the library row now holds what the reports say
    row = {**LIBRARY[0], 'cut': {'speed': 10.0, 'power': 70.0, 'passes': 1}}
    monkeypatch.setattr(inventree, 'materials', lambda client: [row])
    [g] = c.get('/laser/api/admin/feedback').json['groups']
    assert not g['differs'] and g['advice']['speed'] == 10
