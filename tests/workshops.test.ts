import { describe, expect, it } from 'vitest';
import { htlWorkshops, type Workshop } from '../src/lib/workshops';

const w = (over: Partial<Workshop>): Workshop => ({
  slug: 's', title: 'T', dateISO: '2026-11-01', time: '19:00 - 22:00', price: '€30', link: '',
  location: 'High Tech Lab', category: 'Workshop', ...over,
});

describe('HTL workshops', () => {
  it('keeps High Tech Lab workshops only, by date', () => {
    const list = htlWorkshops({ workshops: [
      w({ title: 'Vinyl', dateISO: '2026-11-17' }),
      w({ title: 'Naailes', location: 'TextielLab' }),
      w({ title: 'Open lab', category: 'Open Lab' }),
      w({ title: 'CNC', dateISO: '2026-10-24' }),
    ] });
    expect(list.map(x => x.title)).toEqual(['CNC', 'Vinyl']);
  });

  it('copes with no data', () => {
    expect(htlWorkshops({})).toEqual([]);
  });
});
