import { describe, expect, it } from 'vitest';
import { formatSetting, parseSetting } from '../src/lib/laserSetting';

const cut = { allowMin: true, allowPasses: true };

describe('parseSetting', () => {
  it('reads the binder notations', () => {
    expect(parseSetting('25/80')).toEqual({ speed: 25, power: 80, min: null, passes: null });
    expect(parseSetting('100/50-10', cut)).toEqual({ speed: 100, power: 50, min: 10, passes: null });
    expect(parseSetting('20/80 ×2', cut)).toEqual({ speed: 20, power: 80, min: null, passes: 2 });
    expect(parseSetting('20 / 80 x2', cut)).toEqual({ speed: 20, power: 80, min: null, passes: 2 });
    expect(parseSetting('300/?')).toEqual({ speed: 300, power: null, min: null, passes: null });
    expect(parseSetting('12,5/40')).toEqual({ speed: 12.5, power: 40, min: null, passes: null });
  });

  it('empty is nothing known', () => {
    expect(parseSetting('  ')).toEqual({ speed: null, power: null, min: null, passes: null });
  });

  it('refuses what the server would refuse', () => {
    expect(parseSetting('abc')).toHaveProperty('error');
    expect(parseSetting('25/')).toHaveProperty('error');
    expect(parseSetting('25/95')).toEqual({ error: 'Power must be 10-90 %' });
    expect(parseSetting('25/5')).toEqual({ error: 'Power must be 10-90 %' });
    expect(parseSetting('25/80-90', cut)).toEqual({ error: 'Min power cannot be above max power' });
    expect(parseSetting('0/50')).toEqual({ error: 'Speed must be above 0' });
    expect(parseSetting('25/80-20')).toEqual({ error: 'This column has no min power' });
    expect(parseSetting('25/80 ×2', { allowMin: true })).toEqual({ error: 'This column has no passes' });
  });

  it('round-trips with formatSetting', () => {
    for (const t of ['25/80', '100/50-10', '20/80 ×2', '300/?']) {
      const p = parseSetting(t, cut);
      if ('error' in p) throw new Error(p.error);
      expect(formatSetting(p.speed, p.power, p.min, p.passes)).toBe(t);
    }
  });
});
