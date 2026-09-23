import type { Bucket } from '../lib/stockHistory';

interface Props {
  buckets: number[];
  bucket: Bucket;
  parts: number[];
  sold: Map<number, number[]>;
  colors: Map<number, string>;
  name: (p: number) => string;
}

/** One blue ramp: darker = more sold. White text from step 4 on. */
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

const header = (t: number, bucket: Bucket) => {
  const d = new Date(t);
  if (bucket === 'month') return d.toLocaleDateString('en-GB', { month: 'short' });
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/**
 * Item × period grid of units sold. The best seller of each period is outlined,
 * unless several items tie for first.
 */
export default function PopularityTable({ buckets, bucket, parts, sold, colors, name }: Props) {
  const rows = parts.map(p => ({ p, row: sold.get(p) ?? new Array(buckets.length).fill(0) }));
  const max = Math.max(1, ...rows.flatMap(r => r.row));
  const winners = buckets.map((_, i) => {
    const vals = rows.map(r => r.row[i]);
    const top = Math.max(...vals);
    return top > 0 && vals.filter(v => v === top).length === 1 ? top : null;
  });

  if (rows.length === 0) return null;

  return (
    <div className="border-t border-lijn">
      <div className="px-4 sm:px-5 pt-4 pb-1 flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-lg font-semibold">Most popular per {bucket}</h3>
        <span className="text-xs text-grafiet">Units sold · darker = more · outlined = best seller</span>
      </div>
      <div className="overflow-x-auto px-4 sm:px-5 pb-4">
        <table className="border-collapse text-[11px] tabular-nums mt-2">
          <thead>
            <tr>
              <th />
              {buckets.map(b => (
                <th key={b} className="font-medium text-grafiet px-0 py-1 w-7 min-w-7 text-center whitespace-nowrap">{header(b, bucket)}</th>
              ))}
              <th className="font-medium text-grafiet text-right pl-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, row }) => (
              <tr key={p}>
                <th className="text-left text-xs font-medium pr-3 whitespace-nowrap">
                  <span className="inline-block w-2.5 h-2.5 mr-2 align-middle" style={{ background: colors.get(p) }} />
                  {name(p)}
                </th>
                {row.map((v, i) => {
                  if (!v) return <td key={i} className="h-6 border-2 border-white bg-gray-50" />;
                  const k = Math.min(RAMP.length - 1, Math.floor(((v - 1) / max) * RAMP.length));
                  const top = winners[i] === v;
                  return (
                    <td
                      key={i}
                      title={`${name(p)}: ${v} sold`}
                      className="h-6 border-2 border-white text-center font-medium"
                      style={{
                        background: RAMP[k],
                        color: k >= 3 ? '#fff' : '#171717',
                        outline: top ? '2px solid #171717' : undefined,
                        outlineOffset: -2,
                        fontWeight: top ? 700 : undefined,
                      }}
                    >
                      {v}
                    </td>
                  );
                })}
                <td className="text-right pl-3 font-semibold">{row.reduce((a, b) => a + b, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
