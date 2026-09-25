"""Material list and baseline settings, read from InvenTree.

Every material + thickness is a virtual part in the category LASER_CATEGORY
("Lasermaterialen") with these part parameters:

    Laser materiaal       text, e.g. "Plexi"
    Dikte                 mm
    Laser snij-speed      mm/s
    Laser snij-power      %
    Laser snij-passes     count (optional, default 1)
    Laser graveer-speed   mm/s
    Laser graveer-power   %

Being in InvenTree, the list is part of the InvenTree backup.
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

    def category_pk(self) -> int | None:
        for c in self.get('part/category/', name=CATEGORY, limit=50):
            if c['name'] == CATEGORY:
                return c['pk']
        return None

    def load_materials(self) -> list[dict]:
        """One entry per part: {partId, material, thickness, cut: {...}, engrave: {...}}."""
        cat = self.category_pk()
        if cat is None:
            return []
        parts = self.get('part/', category=cat, limit=500)
        templates = {t['pk']: t['name'] for t in self.get('parameter/template/', limit=500)}
        values: dict[int, dict[str, str]] = {}
        for p in self.get('parameter/', model_type='part.part', limit=5000):
            values.setdefault(p['model_id'], {})[templates.get(p['template'], '')] = p['data']

        out = []
        for part in parts:
            v = values.get(part['pk'], {})
            thickness = _num(v.get(P_THICKNESS))
            material = (v.get(P_MATERIAL) or '').strip()
            if not material or thickness is None:
                continue
            out.append({
                'partId': part['pk'],
                'material': material,
                'thickness': thickness,
                'cut': _setting(v, P_CUT_SPEED, P_CUT_POWER, v.get(P_CUT_PASSES)),
                'engrave': _setting(v, P_ENGRAVE_SPEED, P_ENGRAVE_POWER, None),
            })
        return out


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
