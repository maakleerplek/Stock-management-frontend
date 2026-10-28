/**
 * The till on the core service (core/till.py): it prices a cart and books it as
 * one InvenTree sales order. The app only sends what is in the cart; prices,
 * the machine minimum and the laser rounding are the server's.
 */
import { useEffect, useState } from 'react';

/** Machine time typed in at the till: a 3D print, or laser / CNC minutes. */
export type TypedJob =
  | { kind: 'print'; grams: number; part?: number; material: string }
  | { kind: 'laser' | 'cnc'; minutes: number };

export interface TillCart {
  items: { part: number; quantity: number }[];
  prints: { part?: number; material: string; grams: number }[];
  machines: { tool: 'laser' | 'cnc'; minutes: number }[];
  cuts: string[];
  volunteer?: boolean;
}

export interface BillItem { part: number; name: string; quantity: number; unit_price: number }
export interface BillExtra {
  kind: 'print' | 'laser' | 'cnc';
  reference: string;      // Lasertime, CNC time, 3D printing
  description: string;    // who (the cuts' names) or which filament
  quantity: number;
  unit: string;
  unit_price: number;
  booked_price: number;   // unit price with its share of the minimum top-up
  minimum: number;
  cuts?: string[];
}
export interface Bill { items: BillItem[]; extras: BillExtra[]; top_up: number; total: number; volunteer: boolean }
export interface Sale { reference: string; unshipped: { part: number; quantity: number }[]; warning: string | null; bill: Bill }

export interface Rates {
  laser: { per_minute: number; minimum: number };
  cnc: { per_minute: number; minimum: number };
  print: { per_gram: Record<string, number>; default_per_gram: number; minimum: number };
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/till${path}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('The till server is unreachable');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Till: ${res.status}`);
  return data as T;
}

export const tillApi = {
  rates: () => call<Rates>('/rates'),
  quote: (cart: TillCart) => call<Bill>('/quote', cart),
  /** `key`: new per sale, the same on a retry, so a retry never books twice. */
  checkout: (cart: TillCart, key: string, source = 'stock-app') => call<Sale>('/checkout', { ...cart, key, source }),
};

export const typedToCart = (jobs: TypedJob[]): Pick<TillCart, 'prints' | 'machines'> => ({
  prints: jobs.flatMap(j => (j.kind === 'print' ? [{ part: j.part, material: j.material, grams: j.grams }] : [])),
  machines: jobs.flatMap(j => (j.kind !== 'print' ? [{ tool: j.kind, minutes: j.minutes }] : [])),
});

export const extraLabel = (e: BillExtra) => (e.description ? `${e.reference} – ${e.description}` : e.reference);

let ratesCache: Promise<Rates> | null = null;

/** The machine rates, loaded once per page (the server caches InvenTree for 5 min). Null until loaded. */
export function useRates(): Rates | null {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    ratesCache ??= tillApi.rates().catch(e => { ratesCache = null; throw e; });
    ratesCache.then(setRates, () => {});
  }, []);
  return rates;
}

/** The server's bill for the cart, refreshed when the cart changes. */
export function useBill(cart: TillCart): { bill: Bill | null; error: string | null } {
  const key = JSON.stringify(cart);
  const [state, setState] = useState<{ key: string; bill: Bill | null; error: string | null }>({ key: '', bill: null, error: null });
  useEffect(() => {
    let live = true;
    tillApi.quote(JSON.parse(key)).then(
      bill => live && setState({ key, bill, error: null }),
      e => live && setState({ key, bill: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => { live = false; };
  }, [key]);
  // A bill for an older cart is never shown as this cart's price.
  return state.key === key ? { bill: state.bill, error: state.error } : { bill: null, error: null };
}
