"""Load the material cutting library (laser/data/material_library.csv) into InvenTree.

    INVENTREE_BACKEND_URL=http://10.72.3.68 INVENTREE_TOKEN=... python scripts/seed_inventree.py

The CSV is the binder next to the laser, typed over. Every row becomes a
virtual part in "Lasermaterialen" (see inventree.py for the parameters).
Rows are matched on material + thickness: a rerun updates them from the CSV.
With --prune it also removes parts that are not in the CSV (the old test data).

After the first load the library lives in InvenTree and volunteers edit it in
the Lasercutter tab. Running this again overwrites their changes to the rows
that are in the CSV, so only do that on purpose.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import inventree as it  # noqa: E402

CSV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'material_library.csv')

# CSV column -> row field
COLUMNS = {
    'group': 'group', 'material_en': 'material', 'material_nl': 'materialNl', 'thickness_mm': 'thickness',
    'cut_speed': 'cutSpeed', 'cut_power': 'cutPower', 'cut_power_min': 'cutPowerMin',
    'line_speed': 'lineSpeed', 'line_power_max': 'linePower', 'line_power_min': 'linePowerMin',
    'fill_speed': 'fillSpeed', 'fill_power': 'fillPower', 'comment': 'comment',
}


def key(material, thickness) -> tuple[str, float | None]:
    return material.strip().lower(), it._num(thickness)


def main():
    prune = '--prune' in sys.argv
    api = it.InvenTree(os.environ['INVENTREE_BACKEND_URL'], os.environ['INVENTREE_TOKEN'])
    with open(CSV, newline='', encoding='utf-8') as f:
        rows = [{field: (r.get(col) or '').strip() for col, field in COLUMNS.items()} for r in csv.DictReader(f)]

    existing = {key(r['material'], r['thickness']): r['partId'] for r in api.load_materials()}
    seen = set()
    for row in rows:
        k = key(row['material'], row['thickness'])
        seen.add(k)
        pk = api.save_row(existing.get(k), row)
        print(f"{'updated' if k in existing else 'created'} {it.part_name(row)} = {pk}")

    if prune:
        cat = api.category_pk()
        keys = {r['partId']: key(r['material'], r['thickness']) for r in api.load_materials()}
        for part in api.get('part/', category=cat, limit=500):
            if keys.get(part['pk']) not in seen:
                api.delete_row(part['pk'])
                print(f"removed {part['name']}")


if __name__ == '__main__':
    main()
