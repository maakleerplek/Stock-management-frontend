import { useState } from 'react';
import { PROFIT_SERIES, type ProfitBucket, type ProfitSeries } from '../lib/profitTrend';

// Categorical slots 1-8 in fixed order (dataviz reference palette, validated on white).
const COLORS: Record<ProfitSeries, string> = {
  'Drinks': '#2a78d6', 'Wood': '#eb6834', 'Filament': '#1baf7a', 'Other items': '#eda100',
  'Laser': '#e87ba4', 'Machines (3D print, CNC)': '#008300', 'Volunteer drinks': '#6250d6', 'Lab use': '#e34948',
};
const eur = (n: number) => `${n < 0 ? '−' : ''}€${Math.abs(n).toFixed(2)}`;

const W = 720, H = 260, M = { top: 18, right: 8, bottom: 26, left: 52 };

/**
 * Profit per period as stacked bars: what made money above zero, what cost
 * money (volunteer drinks, lab use) below it, the net as a dark tick with its value.
 */
export default function ProfitChart({ buckets }: { buckets: ProfitBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const series = PROFIT_SERIES.filter(s => buckets.some(b => Math.abs(b.bySeries[s]) > 0.005));
  if (!buckets.length || !series.length) return <p className="text-xs text-brand-black/50">No profit or costs in this period.</p>;

  const up = buckets.map(b => series.reduce((s, k) => s + Math.max(0, b.bySeries[k]), 0));
  const down = buckets.map(b => series.reduce((s, k) => s + Math.min(0, b.bySeries[k]), 0));
  const hi = Math.max(1, ...up, ...buckets.map(b => b.net)), lo = Math.min(0, ...down, ...buckets.map(b => b.net));
  const pw = W - M.left - M.right, ph = H - M.top - M.bottom;
  const y = (v: number) => M.top + ((hi - v) / (hi - lo)) * ph;
  const slot = pw / buckets.length, bw = Math.min(40, slot * 0.6);
  const step = Math.pow(10, Math.floor(Math.log10((hi - lo) / 4)));
  const tickStep = [1, 2, 5, 10].map(f => f * step).find(s => (hi - lo) / s <= 5) ?? step * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) ticks.push(v);
  const labelEvery = Math.ceil(buckets.length / 12);

  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[11px] text-brand-black/80" aria-label="Legend">
        {series.map(s => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[s] }} />{s}
          </li>
        ))}
        <li className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-brand-black" />Net profit</li>
      </ul>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Profit per period, split by source">
          {ticks.map(v => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#171717' : '#e9e8e3'} />
              <text x={M.left - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="#6b6b66">{eur(v).replace('.00', '')}</text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const cx = M.left + slot * i + slot / 2;
            let top = 0, bottom = 0;
            return (
              <g key={b.label + i}>
                {series.map(s => {
                  const v = b.bySeries[s];
                  if (Math.abs(v) < 0.005) return null;
                  const from = v > 0 ? top : bottom, to = from + v;
                  if (v > 0) top = to; else bottom = to;
                  const y0 = y(Math.max(from, to)), h = Math.max(1, Math.abs(y(from) - y(to)));
                  // 2px white edge: a gap between stacked segments.
                  return <rect key={s} x={cx - bw / 2} y={y0} width={bw} height={h} fill={COLORS[s]} stroke="#fff" strokeWidth={2} rx={2} />;
                })}
                <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={y(b.net)} y2={y(b.net)} stroke="#171717" strokeWidth={2} />
                {(buckets.length <= 13 || hover === i) && (
                  <text x={cx} y={y(Math.max(b.net, top)) - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#171717">{eur(b.net)}</text>
                )}
                {i % labelEvery === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={10} fill="#6b6b66">{b.label}</text>
                )}
                {/* Hit target: the whole column, wider than the bar. */}
                <rect x={M.left + slot * i} y={M.top} width={slot} height={ph} fill="transparent"
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)} />
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="absolute top-0 pointer-events-none bg-white border border-lijn shadow-sm p-2 text-[11px] min-w-44"
            style={{ left: `${Math.min(70, ((M.left + slot * hover + slot) / W) * 100)}%` }}>
            <div className="font-semibold mb-1">{buckets[hover].label}</div>
            {series.filter(s => Math.abs(buckets[hover].bySeries[s]) > 0.005).map(s => (
              <div key={s} className="flex items-center gap-1.5 justify-between">
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: COLORS[s] }} />{s}</span>
                <span className="tabular-nums font-mono">{eur(buckets[hover].bySeries[s])}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-lijn mt-1 pt-1 font-semibold"><span>Net profit</span><span className="tabular-nums font-mono">{eur(buckets[hover].net)}</span></div>
          </div>
        )}
      </div>
      <details className="mt-2 text-[11px]">
        <summary className="cursor-pointer text-brand-black/60">Table</summary>
        <table className="w-full mt-1">
          <tbody>
            {buckets.map((b, i) => (
              <tr key={b.label + i} className="border-b border-lijn-zacht">
                <td className="py-1">{b.label}</td>
                <td className="py-1 text-right tabular-nums font-mono">{eur(b.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
