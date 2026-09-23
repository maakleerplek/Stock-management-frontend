import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InvenTreeTrackingEntry } from '../api/types';
import { cn } from '../lib/utils';
import {
  assignColors, bucketRange, levelAt, nextBucket, salesPerBucket, stockLevels,
  type Bucket, type PartInfo,
} from '../lib/stockHistory';
import PopularityTable from './PopularityTable';

type Measure = 'stock' | 'sold';

interface Props {
  entries: InvenTreeTrackingEntry[];
  parts: Map<number, PartInfo>;
  /** Days to show, or null for the whole history. */
  days: number | null;
}

const H = 320;
const M = { top: 16, right: 16, bottom: 30, left: 40 };
const DAY = 86_400_000;

function Toggle<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex border border-lijn">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-2.5 py-1 text-xs border-l border-lijn first:border-l-0 transition-colors',
            value === o.value ? 'bg-brand-black text-white' : 'bg-white hover:bg-brand-beige-dark'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Round the axis maximum up to a friendly number and return the tick step. */
function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 5, step: 1 };
  const raw = v / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  return { max: Math.ceil(v / step) * step, step };
}

const HOUR = 3_600_000;
const MIN_SPAN = HOUR;

/**
 * Ticks for any zoom level: the smallest calendar-aligned step that keeps
 * roughly `maxTicks` labels on screen.
 */
function timeTicks(from: number, to: number, maxTicks: number): { t: number; label: string }[] {
  const span = to - from;
  const steps: { ms: number; unit: 'h' | 'd' | 'mo'; n: number }[] = [
    { ms: HOUR, unit: 'h', n: 1 }, { ms: 3 * HOUR, unit: 'h', n: 3 }, { ms: 6 * HOUR, unit: 'h', n: 6 },
    { ms: 12 * HOUR, unit: 'h', n: 12 }, { ms: DAY, unit: 'd', n: 1 }, { ms: 2 * DAY, unit: 'd', n: 2 },
    { ms: 7 * DAY, unit: 'd', n: 7 }, { ms: 14 * DAY, unit: 'd', n: 14 }, { ms: 30 * DAY, unit: 'mo', n: 1 },
    { ms: 91 * DAY, unit: 'mo', n: 3 }, { ms: 182 * DAY, unit: 'mo', n: 6 }, { ms: 365 * DAY, unit: 'mo', n: 12 },
  ];
  const step = steps.find(st => span / st.ms <= maxTicks) ?? steps[steps.length - 1];

  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  if (step.unit === 'h') d.setHours(Math.ceil(d.getHours() / step.n) * step.n);
  if (step.unit === 'd') {
    d.setHours(0);
    if (d.getTime() < from) d.setDate(d.getDate() + 1);
    if (step.n === 7 || step.n === 14) d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); // Mondays
  }
  if (step.unit === 'mo') {
    d.setHours(0);
    d.setDate(1);
    d.setMonth(Math.ceil((d.getMonth() + (d.getTime() < from ? 1 : 0)) / step.n) * step.n);
  }

  const out: { t: number; label: string }[] = [];
  for (let guard = 0; d.getTime() <= to && guard < 200; guard++) {
    const t = d.getTime();
    let label: string;
    if (step.unit === 'h' && (d.getHours() !== 0 || step.n < 6))
      label = d.getHours() === 0
        ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    else if (step.unit === 'mo')
      label = d.getMonth() === 0
        ? String(d.getFullYear())
        : d.toLocaleDateString('en-GB', { month: 'short', year: step.n >= 6 ? 'numeric' : undefined });
    else label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    out.push({ t, label });
    if (step.unit === 'h') d.setHours(d.getHours() + step.n);
    else if (step.unit === 'd') d.setDate(d.getDate() + step.n);
    else d.setMonth(d.getMonth() + step.n);
  }
  return out;
}

const fmtMoment = (t: number, span: number) =>
  new Date(t).toLocaleString('en-GB', span < 3 * DAY
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });

const bucketLabel = (t: number, bucket: Bucket) =>
  bucket === 'month'
    ? new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : `${bucket === 'week' ? 'Week of ' : ''}${new Date(t).toLocaleDateString('en-GB', { weekday: bucket === 'day' ? 'short' : undefined, day: 'numeric', month: 'short' })}`;

export default function StockHistoryChart({ entries, parts, days }: Props) {
  const [measure, setMeasure] = useState<Measure>('stock');
  const [bucket, setBucket] = useState<Bucket>('week');
  const [offCategories, setOffCategories] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [focus, setFocus] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Only parts we know (i.e. still exist) and that have history.
  const partIds = useMemo(
    () => [...new Set(entries.map(e => e.part))].filter(p => parts.has(p)),
    [entries, parts]
  );
  const categories = useMemo(
    () => [...new Set(partIds.map(p => parts.get(p)!.category))].sort(),
    [partIds, parts]
  );
  // First visit: show only Drinks when that category exists.
  const [initialised, setInitialised] = useState(false);
  useEffect(() => {
    if (initialised || categories.length === 0) return;
    if (categories.includes('Drinks')) setOffCategories(new Set(categories.filter(c => c !== 'Drinks')));
    setInitialised(true);
  }, [categories, initialised]);

  const colors = useMemo(() => assignColors(entries, partIds), [entries, partIds]);
  const levels = useMemo(() => stockLevels(entries), [entries]);

  // The whole history is the zoom limit; the page's 7D/30D/90D/ALL sets the start view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [entries]);
  const histStart = useMemo(() => {
    const first = Math.min(...entries.map(e => Date.parse(e.date)));
    return Number.isFinite(first) ? first - DAY : now - 30 * DAY;
  }, [entries, now]);
  const [view, setView] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => { setView(null); }, [days]);
  const from = view?.from ?? (days ? Math.max(histStart, now - days * DAY) : histStart);
  const to = view?.to ?? now;

  /** Keep a window inside the history, at least MIN_SPAN wide. */
  const clampView = useCallback((f: number, t: number) => {
    const span = Math.min(Math.max(t - f, MIN_SPAN), now - histStart);
    let nf = f;
    if (nf < histStart) nf = histStart;
    if (nf + span > now) nf = now - span;
    return { from: nf, to: nf + span };
  }, [histStart, now]);

  const inCategory = partIds.filter(p => !offCategories.has(parts.get(p)!.category));
  const visible = inCategory.filter(p => !hidden.has(p));
  // Colour order doubles as legend order: best sellers first.
  const byColorOrder = (a: number, b: number) =>
    [...colors.keys()].indexOf(a) - [...colors.keys()].indexOf(b);
  inCategory.sort(byColorOrder);
  visible.sort(byColorOrder);

  const buckets = useMemo(() => bucketRange(from, to, bucket), [from, to, bucket]);
  const sold = useMemo(() => salesPerBucket(entries, buckets, bucket), [entries, buckets, bucket]);

  const pw = width - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - from) / (to - from || 1)) * pw;
  const bucketMid = (i: number) => (buckets[i] + Math.min(nextBucket(buckets[i], bucket), to)) / 2;

  // Series in screen space.
  const series = visible.map(p => {
    if (measure === 'sold') {
      const row = sold.get(p) ?? new Array(buckets.length).fill(0);
      return { p, pts: row.map((v, i) => ({ t: Math.max(from, bucketMid(i)), v })), last: row.reduce((a, b) => a + b, 0) };
    }
    const all = levels.get(p) ?? [];
    const start = levelAt(all, from);
    const pts: { t: number; v: number; step?: boolean }[] = [];
    if (start !== null) pts.push({ t: from, v: start, step: true });
    for (const pt of all) if (pt.t > from && pt.t <= to) pts.push({ t: pt.t, v: pt.level });
    const last = pts.length ? pts[pts.length - 1].v : 0;
    if (pts.length) pts.push({ t: to, v: last, step: true });
    return { p, pts, last };
  });

  const { max, step } = niceMax(Math.max(0, ...series.flatMap(s => s.pts.map(pt => pt.v))));
  const y = (v: number) => M.top + ph - (v / max) * ph;

  const path = (pts: { t: number; v: number }[]) => {
    if (!pts.length) return '';
    let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      // Stock stays flat until the next change: draw a step. Sales per period: straight segments.
      if (measure === 'stock') d += `H${x(pts[i].t).toFixed(1)}`;
      d += `L${x(pts[i].t).toFixed(1)},${y(pts[i].v).toFixed(1)}`;
    }
    return d;
  };

  // Hover: snap to the nearest bucket for sales, to the pointer time for stock.
  let hoverT: number | null = null;
  let hoverRows: { p: number; v: number }[] = [];
  let hoverTitle = '';
  if (hoverX !== null) {
    const t = from + ((hoverX - M.left) / pw) * (to - from);
    if (measure === 'sold') {
      let best = 0;
      buckets.forEach((_, i) => { if (Math.abs(bucketMid(i) - t) < Math.abs(bucketMid(best) - t)) best = i; });
      hoverT = Math.max(from, bucketMid(best));
      hoverTitle = bucketLabel(buckets[best], bucket);
      hoverRows = visible.map(p => ({ p, v: sold.get(p)?.[best] ?? 0 }));
    } else {
      hoverT = Math.min(to, Math.max(from, t));
      hoverTitle = `In stock on ${new Date(hoverT).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${new Date(hoverT).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
      hoverRows = visible.map(p => ({ p, v: levelAt(levels.get(p) ?? [], hoverT!) ?? 0 }));
    }
    hoverRows.sort((a, b) => b.v - a.v);
  }

  // Direct labels at the right end when few enough lines are visible.
  const endLabels = series.length <= 4
    ? series.map(s => ({ p: s.p, y: y(s.pts.length ? s.pts[s.pts.length - 1].v : 0) })).sort((a, b) => a.y - b.y)
    : [];
  for (let i = 1; i < endLabels.length; i++)
    if (endLabels[i].y - endLabels[i - 1].y < 13) endLabels[i].y = endLabels[i - 1].y + 13;

  // Wheel zooms around the pointer; React's onWheel is passive, so bind natively.
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef({ from, to, pw });
  viewRef.current = { from, to, pw };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { from: f, to: t, pw: w } = viewRef.current;
      const px = e.clientX - el.getBoundingClientRect().left - M.left;
      const span = t - f;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        const shift = ((e.shiftKey ? e.deltaY : e.deltaX) / w) * span;
        setView(clampView(f + shift, t + shift));
        return;
      }
      const anchor = f + (Math.min(Math.max(px, 0), w) / w) * span;
      const factor = Math.exp(e.deltaY * 0.0015);
      const next = Math.min(Math.max(span * factor, MIN_SPAN), now - histStart);
      const nf = anchor - (anchor - f) * (next / span);
      setView(clampView(nf, nf + next));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampView, histStart, now, visible.length]);

  const drag = useRef<{ x: number; from: number; to: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const toggleSet = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };

  const name = (p: number) => parts.get(p)?.name ?? `Part #${p}`;
  const unit = measure === 'stock' ? 'in stock' : 'sold';

  return (
    <section className="border border-lijn">
      <div className="px-4 sm:px-5 pt-4 pb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-lg font-semibold">{measure === 'stock' ? 'Stock over time' : 'Sales over time'}</h3>
        <span className="text-xs text-grafiet">
          {measure === 'stock' ? 'Amount in stock after every change' : `Units sold per ${bucket}`}
        </span>
      </div>

      <div className="px-4 sm:px-5 py-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-lijn-zacht text-xs text-grafiet font-medium">
        <label className="flex items-center gap-2">Show
          <Toggle value={measure} onChange={setMeasure} options={[{ value: 'stock', label: 'Amount in stock' }, { value: 'sold', label: 'Sold' }]} />
        </label>
        <label className="flex items-center gap-2">Per
          <Toggle value={bucket} onChange={setBucket} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </label>
        <div className="flex items-center gap-2 flex-wrap">Categories
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setOffCategories(s => toggleSet(s, c))}
              aria-pressed={!offCategories.has(c)}
              className={cn(
                'px-2.5 py-1 text-xs border transition-colors',
                offCategories.has(c)
                  ? 'border-lijn bg-white text-grafiet line-through'
                  : 'border-brand-black bg-brand-black text-white'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-5 pt-3 flex flex-wrap gap-1.5">
        {inCategory.map(p => {
          const off = hidden.has(p);
          const s = series.find(s => s.p === p);
          return (
            <button
              key={p}
              onClick={() => setHidden(h => toggleSet(h, p))}
              onMouseEnter={() => !off && setFocus(p)}
              onMouseLeave={() => setFocus(null)}
              aria-pressed={!off}
              className={cn(
                'flex items-center gap-1.5 px-2 py-1 text-xs font-medium border border-lijn bg-white transition-opacity',
                off && 'opacity-40'
              )}
            >
              <span className="w-2.5 h-2.5" style={{ background: off ? 'transparent' : colors.get(p), outline: `1.5px solid ${colors.get(p)}`, outlineOffset: -1.5 }} />
              {name(p)}
              {s && <span className="text-grafiet tabular-nums">{Math.round(s.last)} {unit}</span>}
            </button>
          );
        })}
      </div>

      <div ref={wrapRef} className="relative px-2 sm:px-3 pb-2">
        {visible.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-xs text-grafiet">Nothing selected</div>
        ) : (
          <svg
            ref={svgRef}
            width={width}
            height={H}
            className={cn('block select-none touch-none', dragging ? 'cursor-grabbing' : 'cursor-crosshair')}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, from, to };
              setDragging(true);
            }}
            onPointerMove={e => {
              const r = e.currentTarget.getBoundingClientRect();
              if (drag.current) {
                const d = drag.current;
                const shift = -((e.clientX - d.x) / pw) * (d.to - d.from);
                if (Math.abs(e.clientX - d.x) > 2) setView(clampView(d.from + shift, d.to + shift));
                setHoverX(null);
                return;
              }
              const px = e.clientX - r.left;
              setHoverX(px >= M.left && px <= M.left + pw ? px : null);
            }}
            onPointerUp={() => { drag.current = null; setDragging(false); }}
            onPointerLeave={() => { if (!drag.current) setHoverX(null); }}
            onDoubleClick={() => setView(null)}
          >
            <defs>
              <clipPath id="plot-clip">
                <rect x={M.left} y={0} width={pw} height={H} />
              </clipPath>
            </defs>
            {timeTicks(from, to, Math.max(3, Math.floor(pw / 90))).map(tk => (
              <g key={tk.t}>
                <line x1={x(tk.t)} x2={x(tk.t)} y1={M.top} y2={M.top + ph} stroke="#f1f0ec" />
                <text x={x(tk.t)} y={H - 10} textAnchor="middle" className="fill-grafiet text-[11px]">{tk.label}</text>
              </g>
            ))}
            {Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step).map(v => (
              <g key={v}>
                <line x1={M.left} x2={M.left + pw} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#171717' : '#e9e8e3'} />
                <text x={M.left - 8} y={y(v) + 4} textAnchor="end" className="fill-grafiet text-[11px] tabular-nums">{v}</text>
              </g>
            ))}

            {hoverT !== null && (
              <line x1={x(hoverT)} x2={x(hoverT)} y1={M.top} y2={M.top + ph} stroke="#171717" strokeDasharray="3 3" />
            )}

            <g clipPath="url(#plot-clip)">
            {[...series].reverse().map(s => {
              const dim = focus !== null && focus !== s.p;
              const c = colors.get(s.p);
              return (
                <g key={s.p} opacity={dim ? 0.15 : 1}>
                  <path d={path(s.pts)} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" />
                  {s.pts.filter(pt => !('step' in pt && pt.step)).map((pt, i) => (
                    <circle key={i} cx={x(pt.t)} cy={y(pt.v)} r={3.5} fill={c} stroke="#fff" strokeWidth={1.5} />
                  ))}
                </g>
              );
            })}

            </g>

            {endLabels.map(l => (
              <text key={l.p} x={M.left + pw - 4} y={l.y - 6} textAnchor="end" className="fill-brand-black text-[11px] font-semibold">
                {name(l.p)}
              </text>
            ))}
          </svg>
        )}

        {hoverT !== null && hoverRows.length > 0 && (
          <div
            className="absolute top-3 bg-white border border-brand-black px-3 py-2 text-xs pointer-events-none min-w-[180px] z-10"
            style={x(hoverT) > width / 2 ? { right: width - x(hoverT) + 12 } : { left: x(hoverT) + 20 }}
          >
            <div className="font-semibold mb-1">{hoverTitle}</div>
            {hoverRows.map(r => (
              <div key={r.p} className="grid grid-cols-[12px_1fr_auto] items-center gap-2 leading-relaxed">
                <span className="w-2.5 h-2.5" style={{ background: colors.get(r.p) }} />
                <span>{name(r.p)}</span>
                <b className="tabular-nums">{Math.round(r.v)}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <Overview
          histStart={histStart}
          now={now}
          from={from}
          to={to}
          width={width}
          series={visible.map(p => ({ color: colors.get(p)!, points: levels.get(p) ?? [] }))}
          onMove={(f, t) => setView(clampView(f, t))}
        />
      )}
      <div className="px-4 sm:px-5 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-grafiet">
        <span className="font-medium text-brand-black tabular-nums">
          {fmtMoment(from, to - from)} – {fmtMoment(to, to - from)}
        </span>
        <span>Scroll on the chart to zoom, drag to move, double-click to reset</span>
        {view && (
          <button onClick={() => setView(null)} className="underline underline-offset-4 hover:text-brand-black">
            Reset zoom
          </button>
        )}
      </div>

      <PopularityTable
        buckets={buckets}
        bucket={bucket}
        parts={inCategory}
        sold={sold}
        colors={colors}
        name={name}
      />
    </section>
  );
}

/**
 * The whole history in a thin strip, with the visible window marked.
 * Click or drag to move the window; its width stays the same.
 */
function Overview({ histStart, now, from, to, width, series, onMove }: {
  histStart: number;
  now: number;
  from: number;
  to: number;
  width: number;
  series: { color: string; points: { t: number; level: number }[] }[];
  onMove: (from: number, to: number) => void;
}) {
  const h = 40;
  const pw = width - M.left - M.right;
  const x = (t: number) => M.left + ((t - histStart) / (now - histStart)) * pw;
  const max = Math.max(1, ...series.flatMap(s => s.points.map(p => p.level)));
  const y = (v: number) => 4 + (h - 8) * (1 - v / max);
  const moveTo = (clientX: number, el: Element) => {
    const t = histStart + ((clientX - el.getBoundingClientRect().left - M.left) / pw) * (now - histStart);
    const span = to - from;
    onMove(t - span / 2, t + span / 2);
  };
  const dragging = useRef(false);

  return (
    <div className="px-2 sm:px-3 pb-2">
      <svg
        width={width}
        height={h}
        className="block cursor-pointer select-none touch-none"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; moveTo(e.clientX, e.currentTarget); }}
        onPointerMove={e => { if (dragging.current) moveTo(e.clientX, e.currentTarget); }}
        onPointerUp={() => { dragging.current = false; }}
      >
        <rect x={M.left} y={0} width={pw} height={h} fill="#f7f6f3" stroke="#e9e8e3" />
        {series.map((s, i) => {
          if (!s.points.length) return null;
          let d = `M${x(s.points[0].t).toFixed(1)},${y(s.points[0].level).toFixed(1)}`;
          for (const p of s.points.slice(1)) d += `H${x(p.t).toFixed(1)}V${y(p.level).toFixed(1)}`;
          d += `H${x(now).toFixed(1)}`;
          return <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={1} opacity={0.6} />;
        })}
        <rect
          x={x(from)}
          y={0.5}
          width={Math.max(3, x(to) - x(from))}
          height={h - 1}
          fill="#171717"
          fillOpacity={0.08}
          stroke="#171717"
        />
      </svg>
    </div>
  );
}
