"""Reports from the laser page ("Tried it? How did it go?"), kept in InvenTree.

Every report is an inactive virtual part in the category CATEGORY
("Lasermeldingen") with these part parameters, so it is part of the InvenTree
backup like the material library (inventree.py):

    Laser melding materiaal    text
    Laser melding dikte        mm
    Laser melding bewerking    cut | engrave
    Laser melding speed        mm/s
    Laser melding power        %
    Laser melding passes       count
    Laser melding sterkte      0..1, engrave strength (empty for cut)
    Laser melding uitkomst     clean | partial | failed | risky
    Laser melding datum        ISO date and time
    Laser melding door         who reported it (optional)

recommend.py reads them through load(); Analytics shows them per material.
"""
import os
import threading
import time
from datetime import datetime

CATEGORY = os.environ.get('LASER_FEEDBACK_CATEGORY', 'Lasermeldingen')
CACHE_SECONDS = 300

# Report field -> (parameter, units)
FIELDS = {
    'material': ('Laser melding materiaal', ''),
    'thickness_mm': ('Laser melding dikte', 'mm'),
    'operation': ('Laser melding bewerking', ''),
    'speed': ('Laser melding speed', 'mm/s'),
    'power': ('Laser melding power', '%'),
    'passes': ('Laser melding passes', ''),
    'strength': ('Laser melding sterkte', ''),
    'outcome': ('Laser melding uitkomst', ''),
    'created_at': ('Laser melding datum', ''),
    'submitted_by': ('Laser melding door', ''),
}
NUMBERS = ('thickness_mm', 'speed', 'power', 'strength')

_cache: dict = {'at': 0.0, 'reports': None}
_lock = threading.Lock()


def invalidate():
    with _lock:
        _cache['at'] = 0.0


def _category_pk(client, create: bool) -> int | None:
    for c in client.get('part/category/', name=CATEGORY, limit=50):
        if c['name'] == CATEGORY:
            return c['pk']
    if not create:
        return None
    return client.post('part/category/', {'name': CATEGORY, 'description': 'Reports from the laser page'})['pk']


def _templates(client, create: bool) -> dict[str, int]:
    """Parameter name -> template pk, for the names in FIELDS."""
    wanted = {name: units for name, units in FIELDS.values()}
    have = {t['name']: t['pk'] for t in client.get('parameter/template/', limit=500) if t['name'] in wanted}
    if create:
        for name, units in wanted.items():
            if name not in have:
                have[name] = client.post('parameter/template/', {'name': name, 'units': units,
                                                                 'model_type': 'part.part'})['pk']
    return have


def _to_value(field: str, data: str):
    if field in NUMBERS:
        try:
            return float(data)
        except (TypeError, ValueError):
            return None
    if field == 'passes':
        try:
            return int(float(data))
        except (TypeError, ValueError):
            return 1
    return data


def save(client, report: dict) -> int:
    """Store one report; returns the part pk, which is the report's id."""
    cat = _category_pk(client, create=True)
    templates = _templates(client, create=True)
    report = {**report, 'created_at': report.get('created_at') or datetime.now().isoformat(timespec='seconds')}
    t = report['thickness_mm']
    name = f"{report['material']} {t:g} mm {report['operation']} {report['outcome']} {report['created_at']}"
    pk = client.post('part/', {'name': name[:100], 'category': cat, 'virtual': True, 'active': False,
                               'salable': False, 'purchaseable': False, 'component': False,
                               'description': 'Laser report'})['pk']
    for field, (tname, _) in FIELDS.items():
        value = report.get(field)
        if value is None or value == '':
            continue
        client.post('parameter/', {'template': templates[tname], 'model_type': 'part.part',
                                   'model_id': pk, 'data': str(value)})
    invalidate()
    return pk


def _load(client) -> list[dict]:
    cat = _category_pk(client, create=False)
    if cat is None:
        return []
    ids = {p['pk'] for p in client.get('part/', category=cat, limit=10000)}
    names = {pk: name for name, pk in _templates(client, create=False).items()}
    fields = {tname: field for field, (tname, _) in FIELDS.items()}
    reports: dict[int, dict] = {}
    for template_pk, tname in names.items():
        for p in client.get('parameter/', model_type='part.part', template=template_pk, limit=10000):
            if p['model_id'] in ids:
                reports.setdefault(p['model_id'], {'id': p['model_id']})[fields[tname]] = _to_value(fields[tname], p['data'])
    out = []
    for r in reports.values():
        if r.get('material') and r.get('thickness_mm') is not None and r.get('operation') in ('cut', 'engrave') \
                and r.get('outcome') in ('clean', 'partial', 'failed', 'risky') and r.get('speed') and r.get('power'):
            r.setdefault('passes', 1)
            r.setdefault('strength', None)
            r.setdefault('submitted_by', None)
            r.setdefault('created_at', '')
            out.append(r)
    return sorted(out, key=lambda r: r['created_at'], reverse=True)


def load(client) -> list[dict]:
    """All reports, newest first. Cached; on an InvenTree error the last good list is kept."""
    if client is None:
        return []
    with _lock:
        if _cache['reports'] is not None and time.time() - _cache['at'] < CACHE_SECONDS:
            return _cache['reports']
        try:
            _cache['reports'] = _load(client)
            _cache['at'] = time.time()
        except Exception as e:
            print(f'[feedback] loading reports failed: {e}')
            if _cache['reports'] is None:
                raise
        return _cache['reports']


def delete(client, pk: int):
    """InvenTree only deletes inactive parts; reports are stored inactive."""
    client.delete(f'part/{pk}/')
    invalidate()


def days_old(report: dict, now: datetime | None = None) -> float:
    try:
        return max(0.0, ((now or datetime.now()) - datetime.fromisoformat(report['created_at'])).total_seconds() / 86400)
    except (TypeError, ValueError):
        return 0.0


def migrate_from_sqlite(client, db) -> int:
    """Move reports that are still in laser.db to InvenTree. Each row is
    deleted only after it is stored, so a failure halfway loses nothing."""
    moved = 0
    for a in db.query('SELECT * FROM attempts ORDER BY id'):
        save(client, {
            'material': a['material'], 'thickness_mm': a['thickness_mm'], 'operation': a['operation'],
            'speed': a['speed'], 'power': a['power'], 'passes': a['passes'], 'strength': a['strength'],
            'outcome': a['outcome'], 'submitted_by': a['submitted_by'],
            'created_at': str(a['created_at']).replace(' ', 'T'),
        })
        db.execute('DELETE FROM attempts WHERE id = ?', (a['id'],))
        moved += 1
    return moved
