import { useEffect, useRef, useState } from 'react';
import { X, Trash2, ShoppingCart, AlertTriangle, Scissors, PenTool, Wifi, WifiOff, Gauge, Flame, FlameKindling, Repeat, Check, Tag, Folder, FolderPlus, Pencil, ChevronUp, FolderInput, Undo2 } from 'lucide-react';
import ImageDisplay from './ImageDisplay';
import { useStock } from './StockContext';
import { useVolunteer } from './VolunteerContext';
import { laserSessionPrice } from './Extras';
import LaserAnimation from './components/LaserAnimation';
import LaserLibrary from './components/LaserLibrary';
import { useToast } from './ToastContext';
import { cn } from './lib/utils';
import { PRICING } from './constants';
import { DISCARD_KIND_LABELS, type DiscardKind } from './lib/services';
import {
  laserApi, useLaserSocket, shortDuration, cutPreviewUrl, type LaserSession, type LaserProject,
  type LaserMaterial, type LaserOperation, type LaserOutcome, type LaserSetting,
} from './lib/laserApi';

interface LaserCutterPageProps {
  /** Put the ticked cuts in the checkout (on the laser service) and go there. */
  onCheckout: (sessionIds: string[]) => void;
  /** Go to the checkout, to buy material. */
  onShop: () => void;
  live: ReturnType<typeof useLaserSocket>;
}

const OUTCOMES: { id: LaserOutcome; label: string }[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'partial', label: 'Needs cleanup' },
  { id: 'failed', label: 'Did not work' },
  { id: 'risky', label: 'Fire / melting' },
];

// The laser asks for a max and a min power. It drops towards min where the
// head slows down (corners, curves, line ends), so those spots don't burn.
// Cutting: 10 points under max. Engraving: same as max for now, to be tuned.
const MIN_POWER_GAP: Record<LaserOperation, number> = { cut: 10, engrave: 0 };
const TUBE_MIN_POWER = 10; // the tube needs at least this (laser/app.py MIN_POWER)
const minPowerFor = (op: LaserOperation, power: number) =>
  Math.max(TUBE_MIN_POWER, Math.min(power, power - MIN_POWER_GAP[op]));

const CONFIDENCE: Record<LaserSetting['confidence'], string> = {
  none: 'No data for this thickness',
  baseline: 'Starting point from the material list',
  low: 'Based on few reports',
  good: 'Based on reports',
};

export default function LaserCutterPage({ onCheckout, onShop, live }: LaserCutterPageProps) {
  // Goes up after every library save, so the settings panel loads the new materials and thicknesses.
  const [libraryVersion, setLibraryVersion] = useState(0);
  return (
    <div className="flex-1 overflow-auto bg-brand-beige">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-lijn min-h-full">
        <TimePanel onCheckout={onCheckout} onShop={onShop} live={live} />
        <SettingsPanel libraryVersion={libraryVersion} />
        <LaserLibrary onSaved={() => setLibraryVersion(v => v + 1)} />
      </div>
    </div>
  );
}

// Cut cards: about 180 px on every screen (140 px on a phone, two per row), as many per row as fit;
// the leftover width is shared out so the row still lines up with the page edge. The minimum sits
// well under the size, so New cuts and the narrower project blocks end up with nearly the same cards.
const TICKED_KEY = 'laserTickedCuts';
const CUT_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] min-[480px]:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2';

/** What paying these cuts together costs: rounded up once, at least the machine minimum. */
const payPrice = (list: LaserSession[]) =>
  Math.max(laserSessionPrice(Math.ceil(list.reduce((t, s) => t + s.total_time, 0) / 60)), PRICING.LASER_MINIMUM);
const cutCount = (n: number) => (n === 1 ? '1 cut' : `${n} cuts`);
const LINK = 'text-sm font-semibold underline underline-offset-2 disabled:opacity-40 disabled:no-underline';

/** Where a dragged cut can go: a project, back to the new cuts, or a project still to be named. */
type DropTarget = string | 'new' | 'newproject';
interface CutDrag { cut: LaserSession; x: number; y: number; over: DropTarget | null }

/** Long-press (touch) or drag (mouse) a cut card to move it into a project.
 *  Drop zones carry data-drop; the card's click after a drag is swallowed so it does not tick. */
function useCutDrag(onDrop: (cut: LaserSession, target: DropTarget) => void) {
  const [drag, setDrag] = useState<CutDrag | null>(null);
  const dragRef = useRef<CutDrag | null>(null);
  dragRef.current = drag;
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  // While dragging, a finger must not scroll the page (needs a non-passive listener).
  useEffect(() => {
    const stop = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);

  const start = (cut: LaserSession, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    const touch = e.pointerType !== 'mouse';
    const card = e.currentTarget as HTMLElement;
    let active = false;
    // The card itself follows the finger: a copy at full size, held where it was grabbed.
    let ghost: HTMLElement | null = null;
    let grabX = 0, grabY = 0;
    const place = (x: number, y: number) => { if (ghost) ghost.style.translate = `${x - grabX}px ${y - grabY}px`; };
    const begin = (x: number, y: number) => {
      active = true;
      navigator.vibrate?.(15);
      const r = card.getBoundingClientRect();
      grabX = x0 - r.left;
      grabY = y0 - r.top;
      ghost = card.cloneNode(true) as HTMLElement;
      Object.assign(ghost.style, {
        position: 'fixed', left: '0', top: '0', width: `${r.width}px`, height: `${r.height}px`, margin: '0',
        zIndex: '60', pointerEvents: 'none', listStyle: 'none',
        // Only scale and shadow animate; translate follows the finger without lag.
        transformOrigin: `${grabX}px ${grabY}px`, scale: '1', boxShadow: '0 0 0 rgba(0,0,0,0)',
        transition: 'scale 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms ease-out',
      });
      document.body.appendChild(ghost);
      place(x, y);
      const g = ghost;
      requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(g.style, { scale: '0.8', boxShadow: '0 12px 28px rgba(0,0,0,0.3)' })));
      setDrag({ cut, x, y, over: null });
    };
    // Touch: hold still 350 ms. Mouse: just move 8 px with the button down.
    const timer = touch ? window.setTimeout(() => begin(x0, y0), 350) : undefined;
    const move = (ev: PointerEvent) => {
      const far = Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8;
      if (!active) {
        if (!far) return;
        if (touch) return cleanup();          // moved before the hold: it's a scroll
        begin(ev.clientX, ev.clientY);
      }
      place(ev.clientX, ev.clientY);
      // Near the tray it wins over the page; the cut's own place is no target.
      const zone = nearestTrayBox(ev.clientX, ev.clientY) ?? document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-drop]');
      const over = (zone?.dataset.drop as DropTarget | undefined) ?? null;
      const own = over === (cut.project_id ?? 'new');
      setDrag(d => d && { ...d, x: ev.clientX, y: ev.clientY, over: own ? null : over });
    };
    const up = () => {
      const d = dragRef.current;
      cleanup();
      if (!active) return;
      // The click that follows the release would tick or untick the card.
      window.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
      window.setTimeout(() => setDrag(null), 0);
      if (d?.over) dropRef.current(d.cut, d.over);
    };
    const cleanup = () => {
      ghost?.remove();
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const cancel = () => { cleanup(); setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  return { drag, start };
}

/** Near or on the drop tray, the closest box counts: less precise moving needed. */
function nearestTrayBox(x: number, y: number): HTMLElement | null {
  const tray = document.querySelector('[data-tray]');
  if (!tray || y < tray.getBoundingClientRect().top - 100) return null;
  let best: HTMLElement | null = null, bestDist = Infinity;
  for (const el of tray.querySelectorAll<HTMLElement>('[data-drop]')) {
    const r = el.getBoundingClientRect();
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (d < bestDist) { best = el; bestDist = d; }
  }
  return best;
}

/** Shows up at the bottom while a cut is dragged: one box per place it can go. */
function DropTray({ drag, projects }: { drag: CutDrag; projects: LaserProject[] }) {
  const from = drag.cut.project_id && projects.some(p => p.id === drag.cut.project_id) ? drag.cut.project_id : null;
  const box = (id: DropTarget, label: React.ReactNode, icon: React.ReactNode) => (
    <li key={id} data-drop={id}
      className={cn('min-h-24 px-3 py-3 border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-sm font-semibold text-center transition-colors',
        drag.over === id ? 'border-solid border-brand-black bg-laser-licht scale-[1.02]' : 'border-grafiet bg-white')}>
      {icon}<span className="line-clamp-2 break-words">{label}</span>
    </li>
  );
  return (
    <div data-tray className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-brand-black bg-brand-beige px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.15)]">
      {/* The card under the finger hides the box, so say where it will go. */}
      <p className="text-sm mb-2 truncate">
        {drag.over
          ? <>Let go: into <b>{drag.over === 'new' ? 'New cuts' : drag.over === 'newproject' ? 'a new project' : projects.find(p => p.id === drag.over)?.name}</b></>
          : <span className="text-grafiet">Drop <b>{drag.cut.name}</b> on a project</span>}
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {projects.filter(p => p.id !== from).map(p => box(p.id, p.name, <FolderInput size={26} className="shrink-0" aria-hidden />))}
        {from && box('new', 'Back to New cuts', <Undo2 size={26} className="shrink-0" aria-hidden />)}
        {box('newproject', 'New project…', <FolderPlus size={26} className="shrink-0" aria-hidden />)}
      </ul>
    </div>
  );
}

function TimePanel({ onCheckout, onShop, live }: LaserCutterPageProps) {
  const { connected, time, sessions, projects } = live;
  const { addToast } = useToast();
  // The cuts this visitor ticked. Unticking removes nothing: a cut stays until it is paid or deleted.
  // Ticks survive a reload (this browser only).
  const [ticked, setTicked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(TICKED_KEY) ?? '[]')); } catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(TICKED_KEY, JSON.stringify([...ticked])); } catch { /* storage blocked: ticks just don't persist */ }
  }, [ticked]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);   // the "Add to project" menu is open
  const [nameFirst, setNameFirst] = useState(false);   // ...straight at "New project…"

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { addToast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(false); }
  };

  const laserOn = time?.laser_state ?? false;
  const openCut = time?.global_time ?? 0;   // laser time not booked as a cut yet
  const sensorOk = connected && (time?.esp_connected || time?.simulate);
  const cuts = sessions.filter(s => s.total_time > 0);
  const projectIds = new Set(projects.map(p => p.id));
  const inProject = (s: LaserSession) => !!s.project_id && projectIds.has(s.project_id);
  // New cuts: not in a project (yet). Only these can be ticked.
  const loose = cuts.filter(s => !inProject(s));
  const dayAgo = Date.now() - 86_400_000;
  const recent = loose.filter(s => new Date(s.created).getTime() >= dayAgo);
  const older = loose.filter(s => new Date(s.created).getTime() < dayAgo);
  const picked = loose.filter(s => ticked.has(s.id) && !s.checkout_at);
  const pickedSeconds = picked.reduce((sum, s) => sum + s.total_time, 0);
  const pickedPrice = payPrice(picked);

  // Forget ticks of cuts that are paid, deleted or in the checkout. Not before the list has loaded.
  useEffect(() => {
    if (!sessions.length) return;
    setTicked(prev => {
      const open = new Set(sessions.filter(s => s.total_time > 0 && !s.checkout_at && !(s.project_id && projects.some(p => p.id === s.project_id))).map(s => s.id));
      const next = new Set([...prev].filter(id => open.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sessions, projects]);
  useEffect(() => { if (!picked.length) { setDeleting(false); setMoving(false); } }, [picked.length]);
  useEffect(() => { if (!moving) setNameFirst(false); }, [moving]);

  const toggle = (id: string) => setTicked(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const { drag, start: startDrag } = useCutDrag((cut, target) => {
    if (target === 'newproject') {
      // Needs a name first: back with the new cuts, ticked, and the menu open at "New project…".
      void run(async () => {
        if (cut.project_id) await laserApi.setProject(cut.id, null);
        setTicked(new Set([cut.id]));
        setNameFirst(true);
        setMoving(true);
      });
      return;
    }
    void run(() => laserApi.setProject(cut.id, target === 'new' ? null : target));
  });
  const dragProps = (s: LaserSession) => s.checkout_at ? undefined : {
    onPointerDown: (e: React.PointerEvent) => startDrag(s, e),
    dragging: drag?.cut.id === s.id,
  };

  const row = (s: LaserSession) => (
    <CutRow key={s.id} cut={s} ticked={ticked.has(s.id)} busy={busy} onToggle={() => toggle(s.id)} drag={dragProps(s)}
      onTakeOut={() => run(() => laserApi.setCheckout(s.id, false))} />
  );

  const moveTicked = (projectId: string) => run(async () => {
    for (const s of picked) await laserApi.setProject(s.id, projectId);
    setTicked(new Set());
    setMoving(false);
  });

  return (
    <section className="flex flex-col min-h-full">
      <div className="px-4 sm:px-6 pt-3 pb-3 border-b border-lijn">
        <HowItWorks busy={busy} onCreate={name => run(() => laserApi.createProject(name))} />
      </div>
      <div className={cn('px-4 sm:px-6 py-2 border-b bg-brand-beige-dark', laserOn ? 'border-b-[3px] border-laser' : 'border-lijn')}>
        <div className="flex items-center justify-between gap-3">
          <div className="shrink-0">
            <div className="flex items-center gap-2 font-semibold text-brand-black">
              <span className={cn('inline-block w-2.5 h-2.5 border', laserOn ? 'bg-laser border-laser' : 'bg-lijn border-grafiet')} />
              {laserOn ? 'Cutting' : 'Laser idle'}
            </div>
            <span className={cn('mt-1 text-xs font-semibold inline-flex items-center gap-1.5', sensorOk ? 'text-emerald-700' : 'text-amber-800')}>
              {sensorOk ? <Wifi size={13} aria-hidden /> : <WifiOff size={13} aria-hidden />}
              {!connected ? 'Laser service offline' : time?.esp_connected ? 'Timer connected' : time?.simulate ? 'Test mode (no sensor)' : 'Timer not connected'}
            </span>
          </div>
          {openCut > 0 && <div className="text-2xl font-semibold tabular-nums text-brand-black leading-none">{shortDuration(openCut)}</div>}
          {/* Decoration only: kept small so the cuts stay on screen. */}
          <div className="flex-1 min-w-[152px] max-w-[304px]"><LaserAnimation active={laserOn} /></div>
        </div>
        {time?.simulate && (
          <div className="flex gap-2 text-xs pb-1">
            <span className="text-grafiet self-center">Test:</span>
            <button className="brutalist-button px-3 py-1.5 bg-white" onClick={() => run(() => laserApi.simulate(!laserOn))}>
              Laser {laserOn ? 'off' : 'on'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-3">
        <div data-drop="new" className={cn('space-y-3', drag?.over === 'new' && 'outline-2 outline-dashed outline-brand-black outline-offset-4 bg-laser-licht/40')}>
        <div>
          <h2 className="text-base font-semibold text-brand-black">New cuts</h2>
          {projects.length > 0 && loose.length > 0 && <p className="text-xs text-grafiet">Tip: hold a cut and drag it onto a project.</p>}
          {loose.length > 0 && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-grafiet flex-1">Tick the cuts that are yours.</p>
              <button className={LINK} onClick={() => setTicked(new Set(loose.filter(c => !c.checkout_at).map(c => c.id)))}>
                Select all
              </button>
              <button className={LINK} disabled={!picked.length} onClick={() => setTicked(new Set())}>
                Clear
              </button>
            </div>
          )}
        </div>
        {openCut > 0 && (
          <div className="flex items-center gap-3 px-3 py-2.5 border border-lijn bg-brand-beige-dark">
            <span className="w-6 h-6 shrink-0 border-2 border-dashed border-grafiet" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{laserOn ? 'Cutting now' : 'Laser stopped'}{time?.job ? ` · ${time.job}` : ''}</div>
              <div className="text-xs text-grafiet">{laserOn ? `Shows up as a cut ${time?.cut_gap ?? 5} s after the laser stops` : 'Becomes a cut in a moment'}</div>
            </div>
            <div className="font-semibold tabular-nums">{shortDuration(openCut)}</div>
          </div>
        )}
        {loose.length === 0 && openCut <= 0 && (
          <p className="border border-dashed border-lijn p-4 text-center text-sm text-grafiet">
            No new cuts. When the laser stops, your cut shows up here.
          </p>
        )}
        {recent.length > 0 && <ul className={CUT_GRID}>{recent.map(row)}</ul>}
        {older.length > 0 && (
          <details className="border border-lijn bg-brand-beige-dark">
            <summary className="px-3 py-3 font-semibold text-sm cursor-pointer">Older than a day ({older.length})</summary>
            <ul className={cn(CUT_GRID, 'p-2 border-t border-lijn')}>{older.map(row)}</ul>
          </details>
        )}
        </div>

        {projects.length > 0 && <h2 className="pt-3 text-base font-semibold text-brand-black">Projects</h2>}
        {projects.map(p => (
          <ProjectBlock key={p.id} project={p} cuts={cuts.filter(s => s.project_id === p.id)} busy={busy} run={run} onCheckout={onCheckout}
            dragProps={dragProps} dropActive={drag?.over === p.id} />
        ))}

        <p className="text-sm text-grafiet">
          Laser time costs {`€${PRICING.LASER_PER_MINUTE.toFixed(2)}`}/min; machine use is at least {`€${PRICING.LASER_MINIMUM.toFixed(2)}`} per payment.
        </p>
        <WoodReminder onShop={onShop} />
      </div>

      {picked.length > 0 && (
        <div className="sticky bottom-0 border-t-2 border-brand-black bg-white px-4 sm:px-6 py-3 space-y-2">
          {deleting && (
            <DiscardConfirm
              what={`Delete ${picked.length === 1 ? '1 cut' : `${picked.length} cuts`} with ${shortDuration(pickedSeconds)} unpaid`}
              value={laserSessionPrice(Math.ceil(pickedSeconds / 60))}
              askKind
              busy={busy}
              onCancel={() => setDeleting(false)}
              onConfirm={(reason, kind) => run(async () => {
                for (const s of picked) await laserApi.deleteSession(s.id, reason, kind);
                setDeleting(false);
              })}
            />
          )}
          {moving && (
            <ProjectMenu projects={projects} busy={busy} startNaming={nameFirst} onPick={moveTicked} onCancel={() => setMoving(false)}
              onCreate={name => run(async () => {
                const { id } = await laserApi.createProject(name);
                for (const s of picked) await laserApi.setProject(s.id, id);
                setTicked(new Set());
                setMoving(false);
              })} />
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{cutCount(picked.length)} ticked, {shortDuration(pickedSeconds)} laser time</span>
            <span className="font-semibold">€{pickedPrice.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 basis-0 brutalist-button h-12 px-2 bg-emerald-400 text-brand-black font-semibold whitespace-nowrap flex items-center justify-center gap-1.5 disabled:opacity-40"
              disabled={busy} onClick={() => onCheckout(picked.map(s => s.id))}>
              <ShoppingCart size={16} aria-hidden /> Pay €{pickedPrice.toFixed(2)}
            </button>
            <button className={cn('flex-1 basis-0 brutalist-button h-12 px-2 text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-1.5 disabled:opacity-40', moving ? 'bg-laser-licht' : 'bg-white')}
              aria-expanded={moving} disabled={busy} onClick={() => { setMoving(m => !m); setDeleting(false); }}>
              <Folder size={16} className="shrink-0" aria-hidden /> Add to project <ChevronUp size={14} aria-hidden className={cn('shrink-0 transition-transform', !moving && 'rotate-180')} />
            </button>
            <button className={cn('brutalist-button h-12 w-12 shrink-0 flex items-center justify-center text-red-600', deleting ? 'bg-rose-50' : 'bg-white')}
              aria-label={`Delete the ${picked.length === 1 ? 'ticked cut' : `${picked.length} ticked cuts`} without paying`} title="Delete without paying"
              disabled={busy} onClick={() => { setDeleting(d => !d); setMoving(false); }}>
              <Trash2 size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}
      {drag && <DropTray drag={drag} projects={projects} />}
    </section>
  );
}

/** The line under a cut's name: the day (a cut's name holds its start time), or day and time for an old named session. */
function cutStart(name: string, iso: string) {
  const d = new Date(iso);
  const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return /^Cut \d\d:\d\d$/.test(name) ? day : `${day} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** One open cut as a card: LightBurn's picture of the job large on top, name, start and length under it.
 *  Tap to tick it for paying or deleting; in the checkout it can be taken out again. */
function CutRow({ cut, ticked, busy, onToggle, onTakeOut, onUngroup, drag }: {
  cut: LaserSession; ticked: boolean; busy: boolean; onToggle: () => void; onTakeOut: () => void;
  /** Set inside a project: the card gets an × that sends the cut back to the new cuts, instead of a tick. */
  onUngroup?: () => void;
  /** Hold (touch) or drag (mouse) to move the card to a project. */
  drag?: { onPointerDown: (e: React.PointerEvent) => void; dragging: boolean };
}) {
  const dragAttrs = drag && {
    onPointerDown: drag.onPointerDown,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),   // a long press must not open the menu
    style: { WebkitTouchCallout: 'none' } as React.CSSProperties,
  };
  const picture = (
    <span className="block aspect-[4/3] w-full bg-brand-beige-dark border-b border-lijn overflow-hidden" aria-hidden>
      {cut.has_preview
        ? <img src={cutPreviewUrl(cut.id)} alt="" draggable={false} className="w-full h-full object-contain p-2" loading="lazy" />
        : <span className="w-full h-full flex items-center justify-center"><Scissors size={36} className="text-lijn" /></span>}
    </span>
  );
  const info = (
    <span className="block p-2.5 space-y-0.5">
      <span className="block font-semibold text-sm leading-tight line-clamp-2 break-words">{cut.name}</span>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-grafiet truncate">{cut.checkout_at ? 'In the checkout' : cutStart(cut.name, cut.created)}</span>
        <span className="text-lg font-semibold tabular-nums">{shortDuration(cut.total_time)}</span>
      </span>
      {/* Unrounded: the till rounds up once for all ticked cuts together. */}
      <span className="flex justify-end">
        <span className="inline-flex items-center gap-1 border border-emerald-600 bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
          <Tag size={12} aria-hidden />€{laserSessionPrice(cut.total_time / 60).toFixed(2)}
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
      <label className={cn('relative flex flex-col h-full border-2 cursor-pointer bg-white', ticked ? 'border-laser bg-laser-licht/30' : 'border-lijn hover:border-grafiet')}>
        <input type="checkbox" checked={ticked} onChange={onToggle} className="sr-only peer" aria-label={`${cut.name}, ${shortDuration(cut.total_time)}`} />
        {picture}
        <span aria-hidden className={cn('absolute top-2 left-2 w-7 h-7 border-2 border-brand-black flex items-center justify-center peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
          ticked ? 'bg-brand-black text-white' : 'bg-white')}>
          {ticked && <Check size={18} />}
        </span>
        {info}
      </label>
    </li>
  );
}

/** Wood for the laser is sold at the checkout: a small reminder with a photo. Visitors only. */
/** Three steps for someone who has never seen the page, and the way into a project for a long session. */
function HowItWorks({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const [naming, setNaming] = useState(false);
  const step = (n: number, text: string) => (
    <li className="flex items-center gap-1.5">
      <span className="w-5 h-5 shrink-0 bg-brand-black text-white text-xs font-semibold flex items-center justify-center">{n}</span>{text}
    </li>
  );
  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        {step(1, 'Find your cut')}{step(2, 'Tick it')}{step(3, 'Pay')}
      </ol>
      {naming
        ? <ProjectNameForm label="Start" busy={busy} onCancel={() => setNaming(false)} onSave={name => { onCreate(name); setNaming(false); }} />
        : (
          <button className="w-full brutalist-button min-h-10 px-3 py-1.5 bg-white text-sm flex items-center gap-2 text-left" onClick={() => setNaming(true)}>
            <FolderPlus size={16} className="shrink-0" aria-hidden />
            <span><b>Cutting for longer?</b> Put your cuts into a project</span>
          </button>
        )}
    </div>
  );
}

/** Name field for a new project, as a small inline form. */
function ProjectNameForm({ initial = '', label, busy, onSave, onCancel }: {
  initial?: string; label: string; busy: boolean; onSave: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length >= 2;
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (ok) onSave(name.trim()); }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80}
        placeholder="Your name + what you make, e.g. Jan – lamp" aria-label="Project name"
        className="flex-1 min-w-0 h-10 px-2 border-2 border-brand-black bg-white text-sm" />
      <button type="submit" disabled={!ok || busy} className="brutalist-button h-10 px-3 bg-brand-black text-white text-sm font-semibold disabled:opacity-40">{label}</button>
      <button type="button" onClick={onCancel} aria-label="Cancel" className="brutalist-button h-10 w-10 shrink-0 bg-white flex items-center justify-center"><X size={16} aria-hidden /></button>
    </form>
  );
}

/** The bottom bar's "Add to project" choices: the open projects, or a new one. */
function ProjectMenu({ projects, busy, startNaming = false, onPick, onCreate, onCancel }: {
  projects: LaserProject[]; busy: boolean; startNaming?: boolean; onPick: (id: string) => void; onCreate: (name: string) => void; onCancel: () => void;
}) {
  const [naming, setNaming] = useState(startNaming || projects.length === 0);
  return (
    <div className="border-2 border-brand-black bg-brand-beige p-2 space-y-1.5">
      <p className="text-xs text-grafiet px-1">Add the ticked cuts to</p>
      {projects.map(p => (
        <button key={p.id} disabled={busy} onClick={() => onPick(p.id)}
          className="w-full brutalist-button h-10 px-3 bg-white text-sm font-semibold flex items-center gap-2 text-left disabled:opacity-40">
          <Folder size={16} aria-hidden /><span className="truncate">{p.name}</span>
        </button>
      ))}
      {naming
        ? <ProjectNameForm label="Add" busy={busy} onSave={onCreate} onCancel={projects.length ? () => setNaming(false) : onCancel} />
        : (
          <button className="w-full brutalist-button h-10 px-3 bg-white text-sm font-semibold flex items-center gap-2" onClick={() => setNaming(true)}>
            <FolderPlus size={16} aria-hidden /> New project…
          </button>
        )}
    </div>
  );
}

/** One project: its cuts (each with an × to give it back), the total and its own Pay. */
function ProjectBlock({ project, cuts, busy, run, onCheckout, dragProps, dropActive }: {
  project: LaserProject; cuts: LaserSession[]; busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>; onCheckout: (ids: string[]) => void;
  dragProps: (s: LaserSession) => React.ComponentProps<typeof CutRow>['drag']; dropActive: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const seconds = cuts.reduce((t, s) => t + s.total_time, 0);
  const price = payPrice(cuts);
  const atMinimum = laserSessionPrice(Math.ceil(seconds / 60)) < PRICING.LASER_MINIMUM;
  return (
    <section data-drop={project.id} className={cn('border-2 border-brand-black', dropActive ? 'bg-laser-licht' : 'bg-white')} aria-label={`Project ${project.name}`}>
      <div className="flex items-start gap-2 px-3 py-2 border-b border-lijn bg-brand-beige-dark">
        <Folder size={18} className="shrink-0 mt-0.5" aria-hidden />
        {renaming
          ? <div className="flex-1"><ProjectNameForm initial={project.name} label="Save" busy={busy} onCancel={() => setRenaming(false)}
              onSave={name => { void run(() => laserApi.renameProject(project.id, name)); setRenaming(false); }} /></div>
          : (<>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm break-words">{project.name}</div>
              <div className="text-xs text-grafiet">{cutCount(cuts.length)} · {shortDuration(seconds)}</div>
            </div>
            <button className="w-8 h-8 shrink-0 flex items-center justify-center" aria-label="Rename project" title="Rename" onClick={() => setRenaming(true)}>
              <Pencil size={15} aria-hidden />
            </button>
          </>)}
      </div>
      <div className="p-2 space-y-2">
        {cuts.length > 0
          ? (
            <ul className={CUT_GRID}>
              {cuts.map(s => (
                <CutRow key={s.id} cut={s} ticked={false} busy={busy} onToggle={() => {}}
                  onTakeOut={() => run(() => laserApi.setCheckout(s.id, false))}
                  onUngroup={s.checkout_at ? undefined : () => run(() => laserApi.setProject(s.id, null))} drag={dragProps(s)} />
              ))}
            </ul>
          )
          : <p className="border border-dashed border-lijn p-3 text-center text-sm text-grafiet">No cuts yet. Tick your cuts under New cuts and press <b>Add to project</b>.</p>}
        {cuts.length > 0 && <p className="text-xs text-grafiet">More cuts? Tick them under New cuts → <b>Add to project</b>. Not yours? Press × to put it back.</p>}
        <div className="flex gap-2">
          <button className="flex-1 brutalist-button h-12 bg-emerald-400 text-brand-black font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            disabled={busy || !cuts.some(s => !s.checkout_at)} onClick={() => onCheckout(cuts.filter(s => !s.checkout_at).map(s => s.id))}>
            <ShoppingCart size={16} aria-hidden /> Pay €{price.toFixed(2)}{atMinimum && cuts.length > 0 && <span className="text-xs font-normal">(minimum)</span>}
          </button>
          <button className="brutalist-button h-12 px-3 shrink-0 bg-white text-sm font-semibold disabled:opacity-40" disabled={busy}
            title="Ends the project; its cuts go back to New cuts" onClick={() => run(() => laserApi.deleteProject(project.id))}>
            Ungroup
          </button>
        </div>
      </div>
    </section>
  );
}

function WoodReminder({ onShop }: { onShop: () => void }) {
  const { items } = useStock();
  const { isVolunteerMode } = useVolunteer();
  const wood = items.filter(i => /wood|hout/i.test(i.category) && i.quantity > 0 && i.price > 0);
  if (isVolunteerMode || !wood.length) return null;
  const pic = wood.find(i => i.image) ?? wood[0];
  const from = Math.min(...wood.map(i => i.price));
  return (
    <div className="flex items-center gap-3 border border-amber-300 bg-amber-50 p-3">
      <div className="w-14 h-14 shrink-0 border border-lijn overflow-hidden bg-white">
        <ImageDisplay imagePath={pic.image} alt="" width={56} height={56} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Need wood for your job?</p>
        <p className="text-xs text-grafiet">MDF and poplar sheets for the laser, from €{from.toFixed(2)}.</p>
      </div>
      <button onClick={onShop} className="brutalist-button h-11 px-3 bg-white text-sm font-semibold shrink-0 flex items-center gap-1.5">
        <ShoppingCart size={16} className="text-emerald-600" aria-hidden /> See the wood
      </button>
    </div>
  );
}

/** Inline confirm before laser time leaves the app without a paid session. The
 *  time is logged for the analytics (it may or may not have been paid some
 *  other way), with an optional reason; value null means no time is involved. */
function DiscardConfirm({ what, value, askKind = false, busy, onCancel, onConfirm }: {
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
          {(['paid', 'workshop', 'volunteer', 'other'] as const).map(k => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={cn('brutalist-button px-2 py-1.5 text-xs', kind === k ? 'bg-brand-black text-white' : 'bg-white')}>
              {DISCARD_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      {value !== null && (
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={kind === 'other' ? 'Why? (required, e.g. test cut, wants an invoice)' : 'Note (optional, e.g. paid cash to Ruben)'}
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

function SettingsPanel({ libraryVersion }: { libraryVersion: number }) {
  const { addToast } = useToast();
  const [materials, setMaterials] = useState<LaserMaterial[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [material, setMaterial] = useState('');
  const materialRef = useRef(material);
  materialRef.current = material;
  const [thickness, setThickness] = useState<number | null>(null);
  const [ops, setOps] = useState<LaserOperation[]>(['cut']);
  const [strength, setStrength] = useState(50);
  const [results, setResults] = useState<LaserSetting[]>([]);
  const [reported, setReported] = useState<Record<string, boolean>>({});
  // "I used other settings": what was really used, per operation, as typed.
  const [used, setUsed] = useState<Record<string, { speed: string; power: string; passes: string }>>({});

  useEffect(() => {
    laserApi.materials()
      .then(d => {
        setMaterials(d.materials);
        // After a library save, keep what the visitor picked if that material still exists.
        if (d.materials.some(m => m.name === materialRef.current)) return;
        setMaterial(d.materials[0]?.name ?? '');
        setThickness(d.materials[0]?.thicknesses[0] ?? null);
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [libraryVersion]);

  useEffect(() => {
    if (!material || thickness === null || thickness <= 0 || !ops.length) { setResults([]); return; }
    // A slower answer for the previous material must not land next to the new
    // selection: that would show the wrong power and speed.
    let stale = false;
    const id = window.setTimeout(() => {
      laserApi.recommend(material, thickness, ops, strength)
        .then(d => { if (stale) return; setResults(d.results); setReported({}); setUsed({}); })
        .catch(e => { if (!stale) addToast(e instanceof Error ? e.message : String(e), 'error'); });
    }, 150);
    return () => { stale = true; window.clearTimeout(id); };
  }, [material, thickness, ops, strength, addToast, libraryVersion]);

  const current = materials?.find(m => m.name === material);
  const toggleOp = (op: LaserOperation) =>
    setOps(prev => prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op].sort() as LaserOperation[]);

  const report = async (r: LaserSetting, outcome: LaserOutcome) => {
    if (r.speed === null || r.power === null || thickness === null) return;
    const u = used[r.operation];
    const speed = u ? parseFloat(u.speed) : r.speed;
    const power = u ? parseFloat(u.power) : r.power;
    const passes = u ? parseInt(u.passes, 10) : r.passes ?? 1;
    if (!(speed > 0) || !(power > 0) || !(passes >= 1)) {
      addToast('Fill in the speed, power and passes you used.', 'warning');
      return;
    }
    try {
      await laserApi.logAttempt({
        material, thickness, operation: r.operation, speed, power,
        passes, outcome, ...(r.operation === 'engrave' ? { strength } : {}),
      });
      setReported(prev => ({ ...prev, [r.operation]: true }));
      addToast('Thanks, the advice learns from this.', 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), 'error');
    }
  };

  return (
    <section className="p-4 sm:p-6 space-y-5">
      <div className="border-b border-lijn pb-3">
        <h2 className="text-lg font-semibold text-brand-black">Laser settings</h2>
      </div>

      {loadError && <p className="text-sm text-rood">Material list unavailable: {loadError}</p>}
      {materials && !materials.length && <p className="text-sm text-grafiet">No materials in InvenTree yet (category Lasermaterialen).</p>}

      {!!materials?.length && (
        <>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-black/60 block">Material</label>
            <div className="flex flex-wrap gap-2">
              {materials.map(m => (
                <button key={m.name}
                  onClick={() => { setMaterial(m.name); setThickness(m.thicknesses[0] ?? null); }}
                  className={cn('px-4 py-2 border text-sm font-semibold transition-colors',
                    m.name === material ? 'bg-brand-black text-white border-brand-black' : 'bg-white border-lijn hover:border-brand-black')}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-black/60 block">Thickness (mm)</label>
            <div className="flex flex-wrap gap-2 items-center">
              {current?.thicknesses.map(t => (
                <button key={t} onClick={() => setThickness(t)}
                  className={cn('px-3 py-1.5 border text-sm font-mono transition-colors',
                    t === thickness ? 'bg-brand-black text-white border-brand-black' : 'bg-white border-lijn hover:border-brand-black')}>
                  {t}
                </button>
              ))}
              <input type="number" min={0.5} max={20} step={0.5}
                value={thickness ?? ''}
                onChange={e => setThickness(e.target.value === '' ? null : parseFloat(e.target.value))}
                className="w-20 h-9 px-2 border border-lijn bg-white text-sm font-mono" aria-label="Other thickness" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-black/60 block">What are you doing?</label>
            <div className="flex gap-2">
              {([['cut', 'Cut', Scissors], ['engrave', 'Engrave', PenTool]] as const).map(([op, label, Icon]) => (
                <button key={op} onClick={() => toggleOp(op)}
                  className={cn('flex-1 px-4 py-2.5 border text-sm font-semibold flex items-center justify-center gap-2 transition-colors',
                    ops.includes(op) ? 'bg-brand-black text-white border-brand-black' : 'bg-white border-lijn hover:border-brand-black')}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>

          {ops.includes('engrave') && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <label htmlFor="strength" className="text-xs font-semibold text-brand-black/60">Engraving strength</label>
                <span className="text-xs font-mono font-semibold">{strength}%</span>
              </div>
              <input id="strength" type="range" min={0} max={100} step={5} value={strength}
                onChange={e => setStrength(parseInt(e.target.value))} className="w-full accent-brand-black" />
              <div className="flex justify-between text-[10px] text-grafiet"><span>light</span><span>very deep</span></div>
            </div>
          )}

          <div className={cn('grid gap-3', results.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
            {results.map(r => (
              <div key={r.operation} className="border border-lijn bg-white">
                <div className="px-4 py-2 border-b border-lijn bg-brand-beige-dark text-sm font-semibold">
                  {r.operation === 'cut' ? 'Cut' : `Engrave · ${strength}%`}
                </div>
                {r.speed === null ? (
                  <p className="p-4 text-sm text-grafiet">
                    {CONFIDENCE.none}{r.nearestThickness !== null && ` — nearest is ${r.nearestThickness} mm`}.
                  </p>
                ) : (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <Stat icon={Gauge} label="Speed" value={`${r.speed}`} unit="mm/s" />
                      <Stat icon={Flame} label="Max power" value={`${r.power}`} unit="%" />
                      <Stat icon={FlameKindling} label="Min power" value={`${minPowerFor(r.operation, r.power ?? 0)}`} unit="%" />
                      <Stat icon={Repeat} label="Passes" value={`${r.passes}`} unit="×" />
                    </div>
                    <p className="text-[11px] text-grafiet">
                      <span className="font-semibold text-brand-black/70">Min power</span> is used where the head slows down,
                      in corners and curves, so those edges don't get more heat than the straight parts.
                      {r.operation === 'cut'
                        ? ' For cutting, set it about 10 % below max.'
                        : ' For engraving the head keeps a steady speed, so the same as max is a good start.'}
                    </p>
                    <p className="text-[11px] text-grafiet">
                      {CONFIDENCE[r.confidence]}{r.reportCount > 0 && ` (${r.reportCount})`}
                    </p>
                    {r.capped && <p className="text-[11px] text-grafiet">Power held at 90 %: more gives hardly any extra cut and wears the power supply.</p>}
                    {r.avoidWarning && (
                      <p className="text-[11px] text-rood flex gap-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{r.avoidWarning}</p>
                    )}
                    <div className="border-t border-lijn pt-3">
                      {reported[r.operation] ? (
                        <p className="text-xs text-emerald-600 font-semibold">Result saved.</p>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-2 mb-2">
                            <p className="text-[11px] font-semibold text-brand-black/60">Tried it? How did it go?</p>
                            {!used[r.operation] && (
                              <button
                                onClick={() => setUsed(prev => ({ ...prev, [r.operation]: { speed: String(r.speed), power: String(r.power), passes: String(r.passes ?? 1) } }))}
                                className="text-[11px] text-grafiet underline underline-offset-2 hover:text-brand-black"
                              >
                                I used other settings
                              </button>
                            )}
                          </div>
                          {used[r.operation] && (
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              {([['speed', 'Speed (mm/s)'], ['power', 'Power (%)'], ['passes', 'Passes']] as const).map(([field, label]) => (
                                <label key={field} className="text-[10px] font-semibold text-brand-black/60">
                                  {label}
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={field === 'passes' ? 1 : 0}
                                    value={used[r.operation][field]}
                                    onChange={e => setUsed(prev => ({ ...prev, [r.operation]: { ...prev[r.operation], [field]: e.target.value } }))}
                                    className="mt-0.5 w-full h-9 px-2 border border-lijn bg-white text-sm font-normal text-brand-black"
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {OUTCOMES.map(o => (
                              <button key={o.id} onClick={() => report(r, o.id)}
                                className="px-2.5 py-1 border border-lijn text-[11px] font-semibold hover:border-brand-black bg-white">
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ icon: Icon, label, value, unit }: { icon: React.ElementType; label: string; value: string; unit: string }) {
  return (
    <div className="border border-lijn py-2">
      <div className="text-[10px] font-semibold text-brand-black/60 flex items-center justify-center gap-1"><Icon size={11} />{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}<span className="text-xs text-grafiet ml-0.5">{unit}</span></div>
    </div>
  );
}
