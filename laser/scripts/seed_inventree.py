"""Put test laser settings in InvenTree: category, parameter templates, one
virtual part per material + thickness, with random but plausible values.

    INVENTREE_BACKEND_URL=http://10.72.3.68 INVENTREE_TOKEN=... python scripts/seed_inventree.py

Safe to run twice: it finds what exists and only fills in what is missing.
With --overwrite it also replaces existing values. The real settings go in
through the InvenTree panel later.
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import inventree as it  # noqa: E402

# material: {thickness: ((cut speed range), (cut power range))}, (engrave speed range), (engrave power range)
MATERIALS = {
    'Plexi':     ({3: ((12, 18), (65, 80)), 5: ((7, 10), (80, 90))},                         (250, 350), (20, 35)),
    'MDF':       ({3: ((15, 20), (65, 75)), 6: ((6, 9), (85, 90))},                          (300, 400), (18, 28)),
    'Multiplex': ({3: ((14, 20), (60, 72)), 4: ((10, 14), (70, 80)), 6: ((6, 9), (82, 90))}, (300, 400), (18, 28)),
    'Populier':  ({3: ((18, 25), (55, 65)), 4: ((14, 18), (60, 72))},                        (350, 450), (15, 25)),
}

TEMPLATES = [
    (it.P_MATERIAL, ''), (it.P_THICKNESS, 'mm'),
    (it.P_CUT_SPEED, 'mm/s'), (it.P_CUT_POWER, '%'), (it.P_CUT_PASSES, ''),
    (it.P_ENGRAVE_SPEED, 'mm/s'), (it.P_ENGRAVE_POWER, '%'),
]


def main():
    overwrite = '--overwrite' in sys.argv
    api = it.InvenTree(os.environ['INVENTREE_BACKEND_URL'], os.environ['INVENTREE_TOKEN'])

    cat = api.category_pk()
    if cat is None:
        cat = api.post('part/category/', {'name': it.CATEGORY,
                                          'description': 'Laserinstellingen per materiaal en dikte (Lasercutter-tab)'})['pk']
        print(f'category {it.CATEGORY} = {cat}')

    templates = {t['name']: t['pk'] for t in api.get('parameter/template/', limit=500)}
    for name, units in TEMPLATES:
        if name not in templates:
            templates[name] = api.post('parameter/template/', {'name': name, 'units': units,
                                                               'model_type': 'part.part'})['pk']
            print(f'template {name}')

    existing_parts = {p['name']: p['pk'] for p in api.get('part/', category=cat, limit=500)}
    params = {(p['model_id'], p['template']): p for p in api.get('parameter/', model_type='part.part', limit=5000)}

    for material, (cuts, eng_speed, eng_power) in MATERIALS.items():
        for thickness, (cut_speed, cut_power) in cuts.items():
            name = f'{material} {thickness} mm'
            pk = existing_parts.get(name)
            if pk is None:
                pk = api.post('part/', {'name': name, 'category': cat, 'virtual': True, 'active': True,
                                        'salable': False, 'purchaseable': False, 'component': False,
                                        'description': f'Laserinstellingen {material.lower()} {thickness} mm'})['pk']
                print(f'part {name} = {pk}')
            values = {
                it.P_MATERIAL: material,
                it.P_THICKNESS: str(thickness),
                it.P_CUT_SPEED: str(round(random.uniform(*cut_speed))),
                it.P_CUT_POWER: str(min(90, round(random.uniform(*cut_power)))),
                it.P_CUT_PASSES: '1',
                it.P_ENGRAVE_SPEED: str(int(round(random.uniform(*eng_speed), -1))),
                it.P_ENGRAVE_POWER: str(round(random.uniform(*eng_power))),
            }
            for tname, value in values.items():
                tpk = templates[tname]
                current = params.get((pk, tpk))
                if current is None:
                    api.post('parameter/', {'template': tpk, 'model_type': 'part.part', 'model_id': pk, 'data': value})
                elif overwrite and tname not in (it.P_MATERIAL, it.P_THICKNESS):
                    api.patch(f"parameter/{current['pk']}/", {'data': value})
            print(f'  {name}: cut {values[it.P_CUT_SPEED]} mm/s {values[it.P_CUT_POWER]} %, '
                  f'engrave {values[it.P_ENGRAVE_SPEED]} mm/s {values[it.P_ENGRAVE_POWER]} %')


if __name__ == '__main__':
    main()
