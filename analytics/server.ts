/**
 * Feeds the Grafana dashboards: loads what the old Analytics page loaded (InvenTree, core, TV), runs the
 * existing lib functions on it (rows.ts) and serves the result as flat JSON arrays, one GET per panel.
 * Every endpoint takes ?from=<ms> (Grafana's ${__from}); the data is cached for 5 minutes.
 * Built to one file by `npm run build:analytics`, see analytics/Dockerfile.
 */
import { createServer } from 'node:http';
import { inventreeClient as api } from '../src/api/inventreeClient';
import { joinInventory, type Category, type PartRow } from '../src/features/inventory/joinInventory';
import { laserApi } from '../src/lib/laserApi';
import { checkoutApi } from '../src/lib/checkoutApi';
import type { Bucket, SaleKind } from '../src/lib/stockHistory';
import * as rows from './rows';
import type { AnalyticsData, ItemSort, Row } from './rows';

const INVENTREE = (process.env.INVENTREE_BACKEND_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.INVENTREE_TOKEN ?? '';
const CORE = (process.env.CORE_URL ?? 'http://core:5000').replace(/\/$/, '');
const TV = (process.env.TV_PRESENTATION_URL ?? '').replace(/\/$/, '');
const PORT = Number(process.env.PORT ?? 8080);
const TTL = 5 * 60_000;

// The shared API code fetches relative paths, as the browser does through nginx. Do what nginx does here.
const realFetch = globalThis.fetch;
globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  // A hung upstream would otherwise hold every panel for undici's 300 s.
  init = { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) };
  if (typeof input !== 'string' || !input.startsWith('/')) return realFetch(input, init);
  if (input.startsWith('/laser/') || input.startsWith('/api/checkout/')) return realFetch(CORE + input, init);
  if (input.startsWith('/tv/')) return realFetch(TV + input.slice('/tv'.length), init);
  const headers = { ...(init?.headers as Record<string, string> | undefined), Authorization: `Token ${TOKEN}` };
  return realFetch(INVENTREE + input, { ...init, headers });
};

/** Machine-side data may be missing (a failure there left the old page working): keep the last good copy. */
const optional = <T>(what: string, p: Promise<T>, last: T): Promise<T> =>
  p.catch(e => { console.warn(`[analytics] ${what}: ${e instanceof Error ? e.message : e}`); return last; });

async function load(prev?: AnalyticsData): Promise<AnalyticsData> {
  const [tracking, lines, parts, categories, supplierCosts, salePrices] = await Promise.all([
    api.getAllStockTracking(), api.getAllServiceLines(), api.getAllParts(), api.getCategories(),
    api.getSupplierCostPerPart().catch(() => ({})), api.getSalePricePerPart().catch(() => ({})),
  ]);
  const [discarded, sessions, rates, screen] = await Promise.all([
    optional('discarded', laserApi.discarded().then(d => d.rows), prev?.discarded ?? []),
    optional('sessions', laserApi.allSessions(), prev ? { sessions: prev.sessions, unassigned_seconds: prev.unassignedSeconds } : { sessions: [], unassigned_seconds: 0 }),
    optional('rates', checkoutApi.rates(), prev?.rates ?? null),
    optional('workshops', fetch('/tv/api/screen-data').then(r => { if (!r.ok) throw new Error(`TV ${r.status}`); return r.json(); }), { workshops: prev?.workshops ?? [] }),
  ]);
  const partMap: AnalyticsData['parts'] = new Map();
  for (const item of joinInventory({
    stock: [], parts: parts.results as PartRow[], categories: categories.results as Category[],
    supplierCosts, salePrices, imageUrl: () => null,
  })) {
    if (item.part_id != null && !partMap.has(item.part_id)) {
      partMap.set(item.part_id, { name: item.name, sellingPrice: item.price, costPrice: item.cost, category: item.category });
    }
  }
  return {
    tracking, lines, discarded, sessions: sessions.sessions, unassignedSeconds: sessions.unassigned_seconds,
    rates, parts: partMap, workshops: screen.workshops ?? [],
  };
}

let cache: { data: AnalyticsData; at: number } | null = null;
let inflight: Promise<AnalyticsData> | null = null;

/** Fresh for 5 minutes. A failed refresh keeps serving the last good data and retries after 30 s. */
function data(): Promise<AnalyticsData> {
  if (cache && Date.now() - cache.at < TTL) return Promise.resolve(cache.data);
  inflight ??= load(cache?.data)
    .then(d => { cache = { data: d, at: Date.now() }; return d; })
    .catch(e => {
      if (!cache) throw e;
      console.error(`[analytics] refresh failed, serving the last good data: ${e instanceof Error ? e.message : e}`);
      cache.at = Date.now() - TTL + 30_000;
      return cache.data;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

interface Query { days?: number; kind: SaleKind; bucket: Bucket; q: URLSearchParams }
const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T => allowed.find(a => a === v) ?? fallback;

const ROUTES: Record<string, (d: AnalyticsData, a: Query) => Row[]> = {
  '/totals': (d, a) => rows.totalsRows(d, a.days),
  '/totals-extra': (d, a) => rows.totalsExtraRows(d, a.days),
  '/profit-trend': (d, a) => rows.profitTrendRows(d, a.days),
  '/items': (d, a) => rows.itemRows(d, a.kind, a.days, pick<ItemSort>(a.q.get('sort'), ['removed', 'revenue', 'profit', 'given', 'added'], 'removed'), Number(a.q.get('limit')) || 500),
  '/items-summary': (d, a) => rows.itemSummaryRows(d, a.kind, a.days),
  '/items-categories': (d, a) => rows.itemCategoryRows(d, a.kind, a.days),
  '/parts': d => rows.partRows(d),
  '/stock-history': (d, a) => rows.stockLevelRows(d, Number(a.q.get('part')), a.days),
  '/stock-sales': (d, a) => rows.stockSalesRows(d, a.kind, a.days, a.bucket),
  '/laser': (d, a) => rows.laserSessionRows(d, a.days),
  '/laser-resets': (d, a) => rows.laserResetRows(d, a.days),
  '/laser-summary': (d, a) => rows.laserSummaryRows(d, a.days),
  '/print': (d, a) => rows.printRows(d, a.days),
  '/print-summary': (d, a) => rows.printSummaryRows(d, a.days),
  '/print-materials': (d, a) => rows.printMaterialRows(d, a.days),
  '/cnc': (d, a) => rows.cncRows(d, a.days),
  '/cnc-summary': (d, a) => rows.cncSummaryRows(d, a.days),
  '/workshops': d => rows.workshopRows(d),
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://analytics');
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') return send(405, { error: 'GET only' });
  if (url.pathname === '/health') return send(200, { ok: true });
  const route = ROUTES[url.pathname];
  if (!route) return send(404, { error: 'unknown endpoint' });
  const days = rows.daysFrom(url.searchParams.get('from'));
  const query: Query = {
    days, q: url.searchParams,
    kind: pick(url.searchParams.get('kind'), ['all', 'paid', 'volunteer'], 'all'),
    bucket: pick(url.searchParams.get('bucket'), ['day', 'week', 'month'], days === undefined ? 'month' : days <= 31 ? 'day' : 'week'),
  };
  data().then(d => send(200, route(d, query))).catch(e => {
    console.error(`[analytics] ${url.pathname}: ${e instanceof Error ? e.message : e}`);
    send(502, { error: 'source data unavailable' });
  });
}).listen(PORT, () => console.log(`[analytics] listening on :${PORT}`));

data().catch(() => {});   // warm up
