import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NumberStepperProps {
  /** The field's text, so an empty field stays empty instead of showing 0. */
  value: string;
  onChange: (value: string) => void;
  min?: number;
  label: string;
  className?: string;
}

/** − [n] + with buttons large enough for a thumb. */
export default function NumberStepper({ value, onChange, min = 0, label, className }: NumberStepperProps) {
  const n = parseFloat(value) || 0;
  const step = (d: number) => onChange(String(Math.max(min, n + d)));
  return (
    <div className={cn('flex items-stretch border border-lijn bg-white h-11', className)}>
      <button type="button" onClick={() => step(-1)} disabled={n <= min} className="w-11 flex items-center justify-center disabled:opacity-30" aria-label={`${label} minus 1`}>
        <Minus size={16} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        placeholder="0"
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className="w-14 min-w-0 text-center font-semibold border-x border-lijn outline-none"
      />
      <button type="button" onClick={() => step(1)} className="w-11 flex items-center justify-center" aria-label={`${label} plus 1`}>
        <Plus size={16} />
      </button>
    </div>
  );
}
