import { cn } from '../lib/utils';

export function BrutalistBar({
  label,
  value,
  maxValue,
  prefix = '',
  color = 'bg-brand-black',
  decimals = 0,
}: {
  label: string;
  value: number;
  maxValue: number;
  prefix?: string;
  color?: string;
  decimals?: number;
}) {
  const displayValue = decimals > 0 ? value.toFixed(decimals) : value;
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2.5 border-b border-lijn last:border-0">
      <div className="w-28 sm:w-36 text-[10px] sm:text-xs font-bold truncate flex-shrink-0 text-brand-black" title={label}>
        {label}
      </div>
      <div className="flex-1 h-4 border border-lijn bg-brand-beige-dark relative overflow-hidden">
        <div
          className={cn('h-full transition-all duration-500', color)}
          style={{ width: `${Math.max(2, (value / maxValue) * 100)}%` }}
        />
      </div>
      <div className="text-xs font-mono font-semibold w-16 sm:w-20 text-right flex-shrink-0 tabular-nums">
        {prefix}{displayValue}
      </div>
    </div>
  );
}

export function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-brand-accent px-4 py-2 border border-lijn border-b-0">
        <h3 className="text-xs font-semibold flex items-center gap-2">
          <Icon size={13} />
          {title}
        </h3>
      </div>
      <div className="border border-lijn p-4 min-h-[80px]">
        {children}
      </div>
    </div>
  );
}

export function Empty({ text = 'No data' }: { text?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center py-6">
      <span className="text-xs font-bold text-brand-black/40 text-center">{text}</span>
    </div>
  );
}

/** A row of joined toggle buttons: date range, paid/volunteer, ... */
export function SegmentedButtons<T extends string>({ options, value, onChange, title }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  title?: string;
}) {
  return (
    <div className="flex border border-lijn" title={title}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'px-3 py-1.5 text-[10px] font-semibold border-r border-lijn last:border-r-0 transition-colors',
            value === o.value
              ? 'bg-brand-black text-white'
              : 'bg-brand-beige text-brand-black hover:bg-brand-beige-dark'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Row of KPI tiles, the same look on every analytics tab. */
export function StatCards({ cards }: {
  cards: { label: string; value: React.ReactNode; sub?: string; icon: React.ElementType; bg: string }[];
}) {
  return (
    // gap-px over a line-coloured background: clean borders however the tiles wrap.
    <div className={cn('grid grid-cols-2 gap-px bg-lijn border border-lijn',
      cards.length > 4 ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-4')}>
      {cards.map(s => (
        <div key={s.label} className={cn('p-4 flex flex-col gap-1', s.bg)}>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-brand-black/60">
            <s.icon size={11} />
            {s.label}
          </div>
          <div className="text-2xl font-semibold font-mono text-brand-black leading-none tabular-nums">
            {s.value}
          </div>
          {s.sub && <div className="text-[10px] font-mono text-brand-black/50">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
