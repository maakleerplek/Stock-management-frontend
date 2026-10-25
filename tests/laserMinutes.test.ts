import { describe, expect, it } from 'vitest';
import { laserMinutes } from '../src/lib/laserApi';

describe('laserMinutes', () => {
  it('rounds the cuts up once together, not per cut', () => {
    // 3 cuts of 1:10 = 3:30 → 4 min; per cut it would be 3 × 2 = 6 min.
    expect(laserMinutes([{ total_time: 70 }, { total_time: 70 }, { total_time: 70 }])).toBe(4);
  });
  it('a whole minute stays that minute, despite float noise', () => {
    expect(laserMinutes([{ total_time: 59.9999999 }, { total_time: 0.0000001 }])).toBe(1);
    expect(laserMinutes([{ total_time: 120 }])).toBe(2);
  });
  it('no cuts is no minutes', () => {
    expect(laserMinutes([])).toBe(0);
  });
});
