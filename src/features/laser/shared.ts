import { useRates, type Rates } from '../../lib/checkoutApi';
import { useLaserSocket, type LaserSession, type LaserOperation, type LaserOutcome, type LaserSetting } from '../../lib/laserApi';

export interface LaserCutterPageProps {
  /** Put the ticked cuts in the checkout (on the laser service) and go there. */
  onCheckout: (sessionIds: string[]) => void;
  /** Go to the checkout, to buy material. */
  onShop: () => void;
  live: ReturnType<typeof useLaserSocket>;
}

export const OUTCOMES: { id: LaserOutcome; label: string }[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'partial', label: 'Needs cleanup' },
  { id: 'failed', label: 'Did not work' },
  { id: 'risky', label: 'Fire / melting' },
];

// The laser asks for a max and a min power. It drops towards min where the
// head slows down (corners, curves, line ends), so those spots don't burn.
// Cutting: 10 points under max. Engraving: same as max for now, to be tuned.
export const MIN_POWER_GAP: Record<LaserOperation, number> = { cut: 10, engrave: 0 };
export const TUBE_MIN_POWER = 10; // the tube needs at least this (core/app.py MIN_POWER)
export const minPowerFor = (op: LaserOperation, power: number) =>
  Math.max(TUBE_MIN_POWER, Math.min(power, power - MIN_POWER_GAP[op]));

// What most people cut, in this order on top; everything else sits in the "Other material" list.
export const POPULAR_MATERIALS = [/acrylic|plexi/i, /^mdf$/i, /plywood poplar/i, /^poplar$/i, /plywood hard/i, /^hdf$/i, /^cardboard$/i];
export const popularRank = (name: string) => POPULAR_MATERIALS.findIndex(re => re.test(name));

export const CONFIDENCE: Record<LaserSetting['confidence'], string> = {
  none: 'No data for this thickness',
  baseline: 'Starting point from the material list',
  low: 'Based on few reports',
  good: 'Based on reports',
};
// Cut cards: at least 160 px, as many per row as fit (two on a phone and in the laser PC bar);
// the leftover width is shared out so the row still lines up with the page edge.
export const TICKED_KEY = 'laserTickedCuts';
export const CUT_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2';

/** What paying these cuts together costs: rounded up once, at least the machine minimum. */
export const payPrice = (list: LaserSession[], rate: LaserRate) =>
  Math.max(laserSessionPrice(Math.ceil(list.reduce((t, s) => t + s.total_time, 0) / 60), rate), rate.minimum);
export type LaserRate = Rates['laser'];
/** Until the checkout server's rates are in. */
export const NO_RATE: LaserRate = { per_minute: 0, minimum: 0 };
export const laserSessionPrice = (minutes: number, rate: LaserRate) => minutes * rate.per_minute;
export const useLaserRate = () => useRates()?.laser ?? NO_RATE;
export const cutCount = (n: number) => (n === 1 ? '1 cut' : `${n} cuts`);
export const LINK = 'text-sm font-semibold underline underline-offset-2 disabled:opacity-40 disabled:no-underline';
