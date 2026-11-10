import { useState } from 'react';
import { cn } from '../../lib/utils';
import { DISCARD_KIND_LABELS, type DiscardKind } from '../../lib/services';

/** Inline confirm before laser time leaves the app without a paid session. The
 *  time is logged for the analytics (it may or may not have been paid some
 *  other way), with an optional reason; value null means no time is involved. */
export function DiscardConfirm({ what, value, askKind = false, busy, onCancel, onConfirm }: {
  what: string;
  value: number | null;
  /** A session with time: say why it goes (paid outside checkout, workshop, ...). */
  askKind?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string, kind?: DiscardKind) => void;
}) {
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState<DiscardKind | null>(null);
  const missing = askKind && (!kind || (kind === 'other' && !reason.trim()));
  return (
    <form
      className="border border-lijn bg-rose-50 p-3 space-y-2"
      onSubmit={e => { e.preventDefault(); if (!missing) onConfirm(reason.trim() || undefined, kind ?? undefined); }}
    >
      <div className="text-xs font-semibold text-brand-black">
        {what}{value !== null && ` · €${value.toFixed(2)}`}?
      </div>
      {askKind && (
        <div className="grid grid-cols-2 gap-1.5">
          {(['paid', 'volunteer', 'other'] as const).map(k => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={cn('brutalist-button px-2 py-1.5 text-xs', k === 'other' && 'col-span-2', kind === k ? 'bg-brand-black text-white' : 'bg-white')}>
              {DISCARD_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      {value !== null && (
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={kind === 'other' ? 'Why? (required, e.g. test cut, wants a receipt)' : 'Note (optional, e.g. paid cash to Ruben)'}
          className="w-full h-9 px-3 border border-lijn bg-white text-sm"
          maxLength={200}
          autoFocus
        />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="brutalist-button px-3 py-1.5 bg-white text-xs" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy || missing} className="brutalist-button px-3 py-1.5 bg-brand-black text-white text-xs font-semibold disabled:opacity-40">
          {value !== null && !askKind ? 'Clear' : 'Delete'}
        </button>
      </div>
      {value !== null && <p className="text-[10px] text-grafiet">Shown in Analytics → Laser{askKind ? '; paid outside checkout counts as paid.' : ' as time not verified.'}</p>}
    </form>
  );
}
