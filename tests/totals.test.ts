import { describe, expect, it } from 'vitest';
import type { InvenTreeTrackingEntry } from '../src/api/types';
import { itemAnalytics, type PartPrice } from '../src/lib/itemAnalytics';
import { serviceRevenue, laserLedger, printsByMaterial, type ServiceLine, type DiscardRow } from '../src/lib/services';
import { buildTotals, spoolGrams } from '../src/lib/totals';
import { TRACKING } from '../src/lib/stockHistory';

const now = new Date('2026-09-28T12:00:00');
let pk = 0;
const entry = (part: number, date: string, type: number, deltas: InvenTreeTrackingEntry['deltas'], notes = '') =>
  ({ pk: ++pk, item: part, part, date, tracking_type: type, deltas, notes } as unknown as InvenTreeTrackingEntry);

const parts = new Map<number, PartPrice>([
  [1, { name: 'Cola', sellingPrice: 2, costPrice: 0.8, category: 'Drinks' }],
  [2, { name: 'Sticker', sellingPrice: 1, costPrice: 0, category: 'Misc' }],   // no supplier price
]);

const entries = [
  entry(1, '2026-09-27', TRACKING.SHIPPED_AGAINST_SALES_ORDER, { quantity: 3 }),          // 3 paid colas
  entry(1, '2026-09-27', TRACKING.STOCK_REMOVE, { removed: 2 }, 'Volunteer drink via Interface-stock'),
  entry(2, '2026-09-26', TRACKING.SHIPPED_AGAINST_SALES_ORDER, { quantity: 4 }),          // 4 stickers
  entry(1, '2026-09-26', TRACKING.STOCK_ADD, { added: 24 }),
  entry(1, '2026-07-01', TRACKING.SHIPPED_AGAINST_SALES_ORDER, { quantity: 10 }),         // outside 30 days
];

const line = (over: Partial<ServiceLine>): ServiceLine => ({
  reference: 'Lasertime', description: 'Ruben', quantity: 10, price: 0.5, date: '2026-09-20', orderStatus: 30, ...over,
});

describe('itemAnalytics', () => {
  it('splits paid revenue, cost of the paid units and volunteer drinks', () => {
    const a = itemAnalytics(entries, parts, 'all', 30, now);
    expect(a.totalRevenue).toBe(10);                       // 3 × 2 + 4 × 1
    expect(a.paidCost).toBeCloseTo(2.4);                   // 3 × 0.8, stickers cost 0
    expect(a.givenCost).toBeCloseTo(1.6);                  // 2 × 0.8
    expect(a.uncostedUnits).toBe(4);
    expect(a.totalAdded).toBe(24);
    expect(a.totalRevenue - a.paidCost - a.givenCost).toBeCloseTo(a.totalProfit);
  });

  it('counts everything without a period', () => {
    expect(itemAnalytics(entries, parts, 'all', undefined, now).totalRevenue).toBe(30);
  });
});

describe('serviceRevenue', () => {
  it('groups per service, old laser references included, and skips orders that are not money in', () => {
    const s = serviceRevenue([
      line({}),
      line({ reference: 'Lasertime – Jan (min)', description: '', quantity: 4 }),
      line({ reference: 'CNC time', quantity: 20 }),
      line({ orderStatus: 40, quantity: 15 }),                     // cancelled
      line({ date: '2026-07-01', quantity: 100 }),                 // outside 30 days
    ], 30, now);
    expect(s).toEqual([
      { reference: 'CNC time', quantity: 20, revenue: 10 },
      { reference: 'Lasertime', quantity: 14, revenue: 7 },
    ]);
  });
});

const noLaser = laserLedger([], [], [], 0, 0.5, 30, now);

describe('buildTotals', () => {
  it('adds the rows up to the total and keeps open and unverified laser time out of it', () => {
    const items = itemAnalytics(entries, parts, 'all', 30, now);
    const laser = laserLedger(
      [{ name: 'Wolf', created: '2026-09-27T09:00:00', total_time: 600, paid_at: null, order_ref: null }],
      [
        { seconds: 900, source: 'unassigned', session_name: null, reason: null, discarded_at: '2026-09-27T10:00:00' },
        { seconds: 240, source: 'session', session_name: 'Jan', reason: 'cash', kind: 'paid', discarded_at: '2026-09-27T11:00:00' },
      ],
      [], 0, 0.5, 30, now);
    const t = buildTotals(items, serviceRevenue([line({})], 30, now), laser);

    expect(t.rows.map(r => r.label)).toEqual(['Items sold · Drinks', 'Items sold · Misc', 'Volunteer drinks', 'Laser time', 'Laser time · paid outside checkout']);
    expect(t.total.revenue).toBeCloseTo(17);                // a deleted session counts as paid                // 10 items + 5 laser + 2 paid in cash
    expect(t.total.costs).toBeCloseTo(4);                   // 2.4 + 1.6
    expect(t.total.profit).toBeCloseTo(13);
    expect(t.total.profit).toBeCloseTo(t.rows.reduce((s, r) => s + r.profit, 0));
    expect(t.laserUnverified).toEqual({ minutes: 15, value: 7.5, count: 1 });
    expect(t.laserUnpaid).toEqual({ minutes: 10, value: 5, count: 1 });
    expect(t.profitWithUnpaidLaser).toBeCloseTo(18);
    expect(t.notes).toHaveLength(2);                        // uncosted stickers, machine costs
  });

  it('counts filament booked as a volunteer drink as lab use; empty-spool corrections not at all', () => {
    const filament = new Map(parts).set(3, { name: 'PLA White (1 kg)', sellingPrice: 25, costPrice: 20, category: 'Filament' });
    const withFil = [...entries,
      entry(3, '2026-09-27', TRACKING.STOCK_REMOVE, { removed: 1 }, 'Volunteer drink via Stock App'),
      entry(3, '2026-09-28', TRACKING.STOCK_REMOVE, { removed: 2 }, 'Removed via Stock App - Volunteer Mode (empty spool, photos in chat)'),
      entry(3, '2026-09-28', TRACKING.STOCK_REMOVE, { removed: 1 }, 'Removed via Stock App - Volunteer Mode'),   // a plain correction
    ];
    const t = buildTotals(itemAnalytics(withFil, filament, 'all', 30, now), [], noLaser);
    const base = buildTotals(itemAnalytics(entries, filament, 'all', 30, now), [], noLaser);
    expect(t.rows.find(r => r.label === 'Lab filament (3D printers)')).toMatchObject({ costs: 20 });   // only the "drink"
    expect(t.printing.grams).toBe(1000);
    expect(t.rows.find(r => r.label === 'Volunteer drinks')?.costs).toBe(base.rows.find(r => r.label === 'Volunteer drinks')?.costs);
  });

  it('counts lab use (filament for the open-lab printers) as a cost', () => {
    const filament = new Map(parts).set(3, { name: 'PLA 1 kg', sellingPrice: 25, costPrice: 20, category: 'Filament' });
    const withUse = [...entries, entry(3, '2026-09-27', TRACKING.STOCK_REMOVE, { removed: 2 }, 'Internal use via Stock App')];
    const items = itemAnalytics(withUse, filament, 'all', 30, now);
    const t = buildTotals(items, [], noLaser, new Map(), {}, 0.1);

    expect(t.rows.find(r => r.label === 'Lab filament (3D printers)')).toMatchObject({ revenue: 0, costs: 40, profit: -40 });
    expect(t.rows.map(r => r.label)).not.toContain('Lab & workshop use (wood, ...)');   // only filament used
    // 2 spools of 1 kg (from the name); nothing printed at the till yet.
    expect(t.printing).toMatchObject({ grams: 2000, cost: 40, paidGrams: 0, paidRevenue: 0 });
    expect(t.printing.potentialRevenue).toBeCloseTo(2000 * 0.1);
    expect(t.rows.map(r => r.label)).not.toContain('Items sold · Filament');
    expect(t.total.revenue).toBeCloseTo(10);                // the items only
    expect(t.total.profit).toBeCloseTo(10 - 2.4 - 1.6 - 40);
    expect(items.totalRemoved).toBe(3 + 2 + 4 + 2);         // paid, drinks and internal use
  });

  it('counts deleted sessions as paid, except workshop / HTL and volunteer use', () => {
    const del = (seconds: number, kind: DiscardRow['kind']): DiscardRow =>
      ({ seconds, source: 'session', session_name: 'X', reason: null, kind, discarded_at: '2026-09-27T11:00:00' });
    const laser = laserLedger([], [del(600, null), del(120, 'other'), del(6000, 'workshop'), del(60, 'volunteer')], [], 0, 0.5, 30, now);
    const t = buildTotals(itemAnalytics([], parts, 'all', 30, now), [], laser);
    expect(t.rows).toEqual([{ label: 'Laser time · paid outside checkout', revenue: 6, costs: 0, profit: 6 }]);
  });

  it('leaves rows with only zeros out', () => {
    const empty = itemAnalytics([], parts, 'all', 30, now);
    const t = buildTotals(empty, [], noLaser);
    expect(t.rows).toEqual([]);
    expect(t.total).toEqual({ label: 'Total', revenue: 0, costs: 0, profit: 0 });
    expect(t.notes).toEqual([]);
  });
});

describe('spoolGrams', () => {
  it('reads the spool weight from the name, 1 kg when it does not say', () => {
    expect(spoolGrams('PLA White (1 kg)')).toBe(1000);
    expect(spoolGrams('PETG Black 750g')).toBe(750);
    expect(spoolGrams('TPU 0,5 kg')).toBe(500);
    expect(spoolGrams('PLA Blue')).toBe(1000);
  });
});

describe('3D printing per filament', () => {
  it('sets the filament taken against the prints paid at the till, at the price per material', () => {
    const filament = new Map(parts).set(3, { name: 'PLA 1 kg', sellingPrice: 25, costPrice: 20, category: 'Filament' });
    const withUse = [...entries, entry(3, '2026-09-27', TRACKING.STOCK_REMOVE, { removed: 1 }, 'Internal use via Stock App')];
    const prints = printsByMaterial([
      line({ reference: '3D printing', description: 'PLA 1 kg', quantity: 50, price: 0.12, order: 'SO-0050' }),
      line({ reference: '3D printing', description: 'PLA 1 kg', quantity: 30, price: 0.12, order: 'SO-0051' }),
      line({ reference: '3D printing', description: '', quantity: 10, price: 0.1, order: 'SO-0052' }),
    ], 30, now);
    const t = buildTotals(itemAnalytics(withUse, filament, 'all', 30, now), [], noLaser, prints, { 'PLA 1 kg': 0.12 });

    const pla = t.printing.byMaterial.find(m => m.material === 'PLA 1 kg')!;
    expect(pla).toMatchObject({ grams: 1000, cost: 20, paidGrams: 80, prints: 2 });
    expect(pla.paidRevenue).toBeCloseTo(9.6);
    expect(pla.potentialRevenue).toBeCloseTo(120);                 // 1000 g × €0.12
    expect(t.printing.byMaterial.find(m => m.material === 'Unknown material')).toMatchObject({ grams: 0, paidGrams: 10 });
    expect(t.printing.prints).toBe(3);
  });
});
