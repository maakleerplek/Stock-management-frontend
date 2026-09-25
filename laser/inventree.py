"""The material cutting library, kept in InvenTree.

Every row of the library (a material, optionally at one thickness) is a
virtual part in the category LASER_CATEGORY ("Lasermaterialen") with these
part parameters. All but the material name are optional:

    Laser groep            text, e.g. "Hout" (the binder's chapter)
    Laser materiaal        text, English name, e.g. "MDF"
    Laser materiaal NL     text, Dutch name
    Dikte                  mm (empty: the row holds engrave settings only)
    Laser snij-speed       mm/s
    Laser snij-power       %, the max power
    Laser snij-power min   %, the min power (slows down in corners)
    Laser snij-passes      count, default 1
    Laser lijn-speed       mm/s, engrave line
    Laser lijn-power       %, max
    Laser lijn-power min   %
    Laser graveer-speed    mm/s, engrave fill
    Laser graveer-power    %
    Laser opmerking        text

Being in InvenTree, the library is part of the InvenTree backup. Volunteers
edit it from the Lasercutter tab (save_row).
"""
import os
import threading
import time

import requests

CATEGORY = os.environ.get('LASER_CATEGORY', 'Lasermaterialen')
CACHE_SECONDS = 300

P_MATERIAL = 'Laser materiaal'
P_THICKNESS = 'Dikte'
P_CUT_SPEED = 'Laser snij-speed'
P_CUT_POWER = 'Laser snij-power'
P_CUT_PASSES = 'Laser snij-passes'
P_ENGRAVE_SPEED = 'Laser graveer-speed'
P_ENGRAVE_POWER = 'Laser graveer-power'
P_GROUP = 'Laser groep'
P_MATERIAL_NL = 'Laser materiaal NL'
P_CUT_POWER_MIN = 'Laser snij-power min'
P_LINE_SPEED = 'Laser lijn-speed'
P_LINE_POWER = 'Laser lijn-power'
P_LINE_POWER_MIN = 'Laser lijn-power min'
P_COMMENT = 'Laser opmerking'

# Row field -> (parameter, units). The order is the order of the form.
FIELDS = {
    'group': (P_GROUP, ''),
    'material': (P_MATERIAL, ''),
    'materialNl': (P_MATERIAL_NL, ''),
    'thickness': (P_THICKNESS, 'mm'),
    'cutSpeed': (P_CUT_SPEED, 'mm/s'),
    'cutPower': (P_CUT_POWER, '%'),
    'cutPowerMin': (P_CUT_POWER_MIN, '%'),
    'cutPasses': (P_CUT_PASSES, ''),
    'lineSpeed': (P_LINE_SPEED, 'mm/s'),
    'linePower': (P_LINE_POWER, '%'),
    'linePowerMin': (P_LINE_POWER_MIN, '%'),
    'fillSpeed': (P_ENGRAVE_SPEED, 'mm/s'),
    'fillPower': (P_ENGRAVE_POWER, '%'),
    'comment': (P_COMMENT, ''),
}
TEXT_FIELDS = ('group', 'material', 'materialNl', 'comment')

_cache: dict = {'at': 0.0, 'materials': None}
_lock = threading.Lock()


class InvenTree:
    def __init__(self, base_url: str, token: str):
        self.base = base_url.rstrip('/')
        self.http = requests.Session()
        self.http.headers['Authorization'] = f'Token {token}'
        self.http.verify = False

    def get(self, path: str, **params):
        r = self.http.get(f'{self.base}/api/{path}', params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        return data['results'] if isinstance(data, dict) and 'results' in data else data

    def post(self, path: str, body: dict):
        r = self.http.post(f'{self.base}/api/{path}', json=body, timeout=10)
        if not r.ok:
            raise RuntimeError(f'POST {path}: {r.status_code} {r.text[:300]}')
        return r.json()

    def patch(self, path: str, body: dict):
        r = self.http.patch(f'{self.base}/api/{path}', json=body, timeout=10)
        if not r.ok:
            raise RuntimeError(f'PATCH {path}: {r.status_code} {r.text[:300]}')
        return r.json()

    def delete(self, path: str):
        r = self.http.delete(f'{self.base}/api/{path}', timeout=10)
        if not r.ok:
            raise RuntimeError(f'DELETE {path}: {r.status_code} {r.text[:300]}')

    def category_pk(self) -> int | None:
        for c in self.get('part/category/', name=CATEGORY, limit=50):
            if c['name'] == CATEGORY:
                return c['pk']
        return None

    def _values(self) -> tuple[dict[str, int], dict[int, dict[str, dict]]]:
        """Template name -> pk, and per part: template name -> parameter row."""
        templates = {t['name']: t['pk'] for t in self.get('parameter/template/', limit=500)}
        names = {pk: name for name, pk in templates.items()}
        values: dict[int, dict[str, dict]] = {}
        for p in self.get('parameter/', model_type='part.part', limit=5000):
            values.setdefault(p['model_id'], {})[names.get(p['template'], '')] = p
        return templates, values

    def load_materials(self) -> list[dict]:
        """One row per part of the library, see row_from_values."""
        cat = self.category_pk()
        if cat is None:
            return []
        parts = self.get('part/', category=cat, limit=500)
        _, values = self._values()
        out = []
        for part in parts:
            v = {name: p['data'] for name, p in values.get(part['pk'], {}).items()}
            row = row_from_values(part['pk'], v)
            if row['material']:
                out.append(row)
        return out

    def save_row(self, part_id: int | None, row: dict) -> int:
        """Create or update one library row. Empty fields remove the parameter."""
        cat = self.category_pk()
        if cat is None:
            cat = self.post('part/category/', {'name': CATEGORY, 'description': 'Laser material library'})['pk']
        name = part_name(row)
        if part_id is None:
            part_id = self.post('part/', {'name': name, 'category': cat, 'virtual': True, 'active': True,
                                          'salable': False, 'purchaseable': False, 'component': False,
                                          'description': 'Laser material library'})['pk']
        else:
            self.patch(f'part/{part_id}/', {'name': name})
        templates, values = self._values()
        current = values.get(part_id, {})
        for field, (tname, units) in FIELDS.items():
            if tname not in templates:
                templates[tname] = self.post('parameter/template/', {'name': tname, 'units': units,
                                                                     'model_type': 'part.part'})['pk']
            value = row.get(field)
            data = '' if value is None else str(value).strip()
            existing = current.get(tname)
            if not data:
                if existing:
                    self.delete(f"parameter/{existing['pk']}/")
            elif existing is None:
                self.post('parameter/', {'template': templates[tname], 'model_type': 'part.part',
                                         'model_id': part_id, 'data': data})
            elif existing['data'] != data:
                self.patch(f"parameter/{existing['pk']}/", {'data': data})
        invalidate()
        return part_id

    def delete_row(self, part_id: int):
        self.patch(f'part/{part_id}/', {'active': False})
        self.delete(f'part/{part_id}/')
        invalidate()


def part_name(row: dict) -> str:
    t = row.get('thickness')
    base = row.get('material') or '?'
    return f'{base} {_fmt(t)} mm' if t not in (None, '') else base


def _fmt(n) -> str:
    f = _num(n)
    return '' if f is None else (str(int(f)) if f == int(f) else str(f))


def row_from_values(part_id: int, v: dict[str, str]) -> dict:
    """A library row. Numbers are floats or None, text is '' when missing.

    cut/engrave keep the shape the recommender reads (speed, power, passes);
    engrave is the engrave fill.
    """
    row = {'partId': part_id}
    for field, (tname, _) in FIELDS.items():
        row[field] = (v.get(tname) or '').strip() if field in TEXT_FIELDS else _num(v.get(tname))
    row['cut'] = _setting(v, P_CUT_SPEED, P_CUT_POWER, v.get(P_CUT_PASSES))
    row['engrave'] = _setting(v, P_ENGRAVE_SPEED, P_ENGRAVE_POWER, None)
    return row


def _num(value) -> float | None:
    try:
        return float(str(value).replace(',', '.').split()[0])
    except (TypeError, ValueError, IndexError):
        return None


def _setting(v: dict, speed_key: str, power_key: str, passes) -> dict | None:
    speed, power = _num(v.get(speed_key)), _num(v.get(power_key))
    if speed is None or power is None:
        return None
    return {'speed': speed, 'power': power, 'passes': int(_num(passes) or 1)}


def invalidate():
    with _lock:
        _cache['at'] = 0.0


def materials(client: InvenTree | None) -> list[dict]:
    """Cached material list. On an InvenTree error the last good list is kept."""
    if client is None:
        return []
    with _lock:
        if _cache['materials'] is not None and time.time() - _cache['at'] < CACHE_SECONDS:
            return _cache['materials']
        try:
            _cache['materials'] = client.load_materials()
            _cache['at'] = time.time()
        except Exception as e:  # keep serving the old list
            print(f'[inventree] loading materials failed: {e}')
            if _cache['materials'] is None:
                raise
        return _cache['materials']
