/**
 * Laser settings in the notation of the binder next to the laser:
 *   25/80        speed (mm/s) / power (%)
 *   100/50-10    max power 50, min power 10 (the laser drops to it in corners)
 *   20/80 ×2     two passes
 *   300/?        power not known yet
 */

export interface ParsedSetting {
  speed: number | null;
  power: number | null;
  min: number | null;
  passes: number | null;
}

export const MIN_POWER = 10;  // the tube needs at least this (laser/app.py MIN_POWER)
export const MAX_POWER = 90;  // laser/recommend.py MAX_POWER

export function formatSetting(speed: number | null, power: number | null, min?: number | null, passes?: number | null): string {
  if (speed === null && power === null) return '';
  let s = `${speed ?? '?'}/${power ?? '?'}`;
  if (min != null) s += `-${min}`;
  if (passes != null && passes > 1) s += ` ×${passes}`;
  return s;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?|\?)`;
const PATTERN = new RegExp(String.raw`^${NUM}\s*/\s*${NUM}(?:\s*-\s*${NUM})?(?:\s*[×xX*]\s*(\d+))?$`);

const num = (s: string | undefined) => (s === undefined || s === '?' ? null : parseFloat(s.replace(',', '.')));

/**
 * Text as typed in the table → numbers. Empty text = nothing known.
 * `allowMin`/`allowPasses` say whether this column has a min power or passes.
 */
export function parseSetting(text: string, opts: { allowMin?: boolean; allowPasses?: boolean } = {}): ParsedSetting | { error: string } {
  const t = text.trim();
  if (!t) return { speed: null, power: null, min: null, passes: null };
  const m = PATTERN.exec(t);
  if (!m) return { error: `"${t}" is not speed/power, e.g. 25/80` };
  const [, s, p, mn, ps] = m;
  const result: ParsedSetting = { speed: num(s), power: num(p), min: num(mn), passes: ps ? parseInt(ps, 10) : null };
  if (result.min !== null && !opts.allowMin) return { error: 'This column has no min power' };
  if (result.passes !== null && !opts.allowPasses) return { error: 'This column has no passes' };
  if (result.speed !== null && result.speed <= 0) return { error: 'Speed must be above 0' };
  for (const v of [result.power, result.min]) {
    if (v !== null && (v < MIN_POWER || v > MAX_POWER)) return { error: `Power must be ${MIN_POWER}-${MAX_POWER} %` };
  }
  if (result.power !== null && result.min !== null && result.min > result.power) {
    return { error: 'Min power cannot be above max power' };
  }
  if (result.passes !== null && (result.passes < 1 || result.passes > 20)) return { error: 'Passes must be 1-20' };
  return result;
}
