import { cn } from '../lib/utils';

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
