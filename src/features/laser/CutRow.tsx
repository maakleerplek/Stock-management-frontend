import { X, ShoppingCart, Scissors, Check, Tag } from 'lucide-react';
import { cn } from '../../lib/utils';
import { shortDuration, cutPreviewUrl, NEW_TAG, type LaserSession } from '../../lib/laserApi';
import { laserSessionPrice, useLaserRate } from './shared';

/** The line under a cut's name: the day (a cut's name holds its start time), or day and time for an old named session. */
export function cutStart(name: string, iso: string) {
  const d = new Date(iso);
  // Short, so it never gets cut off next to the price: "Today", "Fri" this week, "6/11" before.
  const day = d.toDateString() === new Date().toDateString() ? 'Today'
    : Date.now() - d.getTime() < 6 * 86400e3 ? d.toLocaleDateString('en-GB', { weekday: 'short' })
    : `${d.getDate()}/${d.getMonth() + 1}`;
  return /^Cut \d\d:\d\d$/.test(name) ? day : `${day} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** One open cut as a card: LightBurn's picture of the job large on top, name, start and length under it.
 *  Tap to tick it for paying or deleting; in the checkout it can be taken out again. */
export function CutRow({ cut, ticked, fresh = false, busy, onToggle, onTakeOut, onUngroup, drag, preview = false, onHover }: {
  cut: LaserSession; ticked: boolean;
  /** Made in the last 20 minutes: NEW tag and a laser edge, so people spot their own cut. */
  fresh?: boolean; busy: boolean; onToggle: (shift: boolean) => void; onTakeOut: () => void;
  /** Shift is held and this card is in the range a shift-click would tick. */
  preview?: boolean;
  onHover?: (on: boolean) => void;
  /** Set inside a project: the card gets an × that sends the cut back to the new cuts, instead of a tick. */
  onUngroup?: () => void;
  /** Hold (touch) or drag (mouse) to move the card to a project. */
  drag?: { onPointerDown: (e: React.PointerEvent) => void; dragging: boolean };
}) {
  const rate = useLaserRate();
  const dragAttrs = drag && {
    'data-cut': cut.id,   // found again when a ticked group is dragged along
    onPointerDown: drag.onPointerDown,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),   // a long press must not open the menu
    style: { WebkitTouchCallout: 'none' } as React.CSSProperties,
  };
  const picture = (
    <span className="block aspect-[4/3] w-full bg-white border-b border-lijn overflow-hidden" aria-hidden>
      {cut.has_preview
        ? <img src={cutPreviewUrl(cut.id)} alt="" draggable={false} className="w-full h-full object-contain p-1" loading="lazy" />
        : <span className="w-full h-full flex items-center justify-center"><Scissors size={36} className="text-lijn" /></span>}
    </span>
  );
  const info = (
    <span className="block p-2 space-y-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-sm leading-tight truncate">{cut.name}</span>
        <span className="text-base font-semibold tabular-nums leading-tight">{shortDuration(cut.total_time)}</span>
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs text-grafiet whitespace-nowrap">{cut.checkout_at ? 'In the checkout' : cutStart(cut.name, cut.created)}</span>
        {/* Unrounded: the till rounds up once for all ticked cuts together. */}
        <span className="shrink-0 inline-flex items-center gap-1 border border-emerald-600 bg-emerald-50 text-emerald-700 px-1 text-xs font-semibold tabular-nums">
          <Tag size={11} aria-hidden />€{laserSessionPrice(cut.total_time / 60, rate).toFixed(2)}
        </span>
      </span>
    </span>
  );
  if (cut.checkout_at) {
    return (
      <li className="flex flex-col border-2 border-emerald-600 bg-emerald-50">
        <span className="relative">
          {picture}
          <ShoppingCart size={18} className="absolute top-2 left-2 text-emerald-700" aria-hidden />
        </span>
        {info}
        <button className="mt-auto mx-2.5 mb-2.5 brutalist-button h-10 bg-white text-xs font-semibold flex items-center justify-center gap-1.5" disabled={busy} onClick={onTakeOut}>
          <X size={14} aria-hidden /> Take out
        </button>
      </li>
    );
  }
  if (onUngroup) {
    return (
      <li {...dragAttrs} className={cn('relative flex flex-col border-2 border-lijn bg-white select-none', drag?.dragging && 'opacity-30')}>
        {picture}
        <button className="absolute top-1.5 right-1.5 w-8 h-8 border-2 border-brand-black bg-white flex items-center justify-center disabled:opacity-40"
          aria-label={`Take ${cut.name} out of the project`} title="Not mine: back to New cuts" disabled={busy} onClick={onUngroup}>
          <X size={16} aria-hidden />
        </button>
        {info}
      </li>
    );
  }
  return (
    <li {...dragAttrs} className={cn('select-none', drag?.dragging && 'opacity-30')}>
      {/* The card toggles itself: Firefox does not pass a Shift-click on a label on to its checkbox, and
          Chrome passes it on without Shift. Space on the focused checkbox also lands here (target = input). */}
      <label onClick={e => { e.preventDefault(); onToggle(e.shiftKey); }}
        onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}
        // Hover darkens the whole card and a press sinks it: the card itself is the button, not only the checkbox.
        className={cn('group relative flex flex-col h-full border-2 cursor-pointer bg-white transition-[filter,scale] duration-100 hover:brightness-95 active:brightness-90 active:scale-[0.98]',
          ticked ? 'border-laser bg-laser-licht/30' : preview ? 'border-laser border-dashed bg-laser-licht/20' : fresh ? 'border-brand-black' : 'border-lijn hover:border-brand-black')}>
        <input type="checkbox" checked={ticked} readOnly className="sr-only peer" aria-label={`${cut.name}, ${shortDuration(cut.total_time)}`} />
        {picture}
        <span aria-hidden className={cn('absolute top-2 left-2 w-7 h-7 border-2 border-brand-black flex items-center justify-center peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
          ticked ? 'bg-brand-black text-white' : preview ? 'bg-laser-licht' : 'bg-white')}>
          {/* On hover a faint tick shows what a tap does. */}
          <Check size={18} className={cn(ticked ? '' : preview ? 'opacity-50' : 'opacity-0 group-hover:opacity-40')} />
        </span>
        {fresh && <span className={cn('absolute top-2 right-2', NEW_TAG)}>NEW</span>}
        {info}
      </label>
    </li>
  );
}
