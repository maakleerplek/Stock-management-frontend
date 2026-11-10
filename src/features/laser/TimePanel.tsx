import { useEffect, useRef, useState } from 'react';
import { Trash2, ShoppingCart, Scissors, Wifi, WifiOff, Gauge, Folder, ChevronUp } from 'lucide-react';
import LaserAnimation from '../../components/LaserAnimation';
import { useToast } from '../../ToastContext';
import { cn } from '../../lib/utils';
import { laserApi, shortDuration, isNewCut, useNow, type LaserSession } from '../../lib/laserApi';
import { type LaserCutterPageProps, TICKED_KEY, CUT_GRID, payPrice, laserSessionPrice, useLaserRate, cutCount, LINK } from './shared';
import { useCutDrag } from './useCutDrag';
import { DropTray } from './DropTray';
import { CutRow } from './CutRow';
import { HowItWorks } from './HowItWorks';
import { NewProject, ProjectMenu } from './ProjectMenu';
import { ProjectBlock } from './ProjectBlock';
import { WoodReminder } from './WoodReminder';
import { DiscardConfirm } from './DiscardConfirm';

export type LaserTab = 'cuts' | 'projects' | 'settings';

export function TimePanel({ onCheckout, onShop, live, tab, setTab }: LaserCutterPageProps & { tab: LaserTab; setTab: (t: LaserTab) => void }) {
  const rate = useLaserRate();
  const { connected, time, sessions, projects } = live;
  const { addToast } = useToast();
  const now = useNow();
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
  const pickedPrice = payPrice(picked, rate);

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

  // Shift-click ticks every new cut between the last clicked card and this one (as in photo apps);
  // while Shift is held, hovering shows that range first.
  const lastClicked = useRef<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => setShiftHeld(e.shiftKey);
    const off = () => setShiftHeld(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off); };
  }, []);
  const tickable = loose.filter(c => !c.checkout_at).map(c => c.id);
  const range = (to: string | null): string[] => {
    const a = lastClicked.current ? tickable.indexOf(lastClicked.current) : -1, b = to ? tickable.indexOf(to) : -1;
    return a >= 0 && b >= 0 ? tickable.slice(Math.min(a, b), Math.max(a, b) + 1) : [];
  };
  const preview = new Set(shiftHeld ? range(hovered) : []);
  const toggle = (id: string, shift = false) => {
    const order = tickable;
    const from = lastClicked.current ? order.indexOf(lastClicked.current) : -1, to = order.indexOf(id);
    lastClicked.current = id;
    setTicked(prev => {
      const next = new Set(prev);
      if (shift && from >= 0 && to >= 0) {
        for (const c of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(c);
      } else if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  // Dragging a ticked cut takes all ticked cuts along; an unticked one goes alone.
  const dragGroup = (cut: LaserSession) => ticked.has(cut.id) && picked.length > 1 ? picked : [cut];
  const { drag, start: startDrag } = useCutDrag((cut, target) => {
    const group = dragGroup(cut);
    if (target === 'newproject') {
      // Needs a name first: back with the new cuts, ticked, and the menu open at "New project…".
      void run(async () => {
        if (cut.project_id) await laserApi.setProject(cut.id, null);
        setTicked(new Set(group.map(c => c.id)));
        setNameFirst(true);
        setMoving(true);
      });
      return;
    }
    void run(async () => {
      for (const c of group) await laserApi.setProject(c.id, target === 'new' ? null : target);
      if (group.length > 1) setTicked(new Set());
    });
  });
  const dragProps = (s: LaserSession) => s.checkout_at ? undefined : {
    onPointerDown: (e: React.PointerEvent) => startDrag(s, e, dragGroup(s).map(c => c.id)),
    dragging: !!drag && (drag.cut.id === s.id || (ticked.has(drag.cut.id) && ticked.has(s.id))),
  };

  const row = (s: LaserSession) => (
    <CutRow key={s.id} cut={s} ticked={ticked.has(s.id)} fresh={isNewCut(s, now)} busy={busy} onToggle={shift => toggle(s.id, shift)} drag={dragProps(s)}
      preview={preview.has(s.id) && !ticked.has(s.id)} onHover={on => setHovered(on ? s.id : null)}
      onTakeOut={() => run(() => laserApi.setCheckout(s.id, false))} />
  );

  const moveTicked = (projectId: string) => run(async () => {
    for (const s of picked) await laserApi.setProject(s.id, projectId);
    setTicked(new Set());
    setMoving(false);
  });

  return (
    // On the Settings tab (narrow) only the top of this panel shows; the settings come right under it.
    <section className={cn('flex flex-col', tab === 'settings' ? 'lg:min-h-full' : 'min-h-full')}>
      <div className="px-4 sm:px-6 pt-3 pb-3 border-b border-lijn">
        <HowItWorks />
      </div>
      <div className={cn('px-4 sm:px-6 py-2 border-b bg-brand-beige-dark', laserOn ? 'border-b-[3px] border-laser' : 'border-lijn')}>
        <div className="flex items-center justify-between gap-3">
          <div className="shrink-0 min-w-0">
            <div className="flex items-center gap-2 font-semibold text-brand-black">
              <span className={cn('inline-block w-2.5 h-2.5 border', laserOn ? 'bg-laser border-laser' : 'bg-lijn border-grafiet')} />
              {laserOn ? 'Cutting' : 'Laser idle'}
              {/* All fine = just the icon; a problem gets words. */}
              <span className={cn('text-xs inline-flex items-center gap-1.5', sensorOk ? 'text-emerald-700' : 'text-amber-800')} title={sensorOk ? 'Timer connected' : undefined}>
                {sensorOk ? <Wifi size={13} aria-label="Timer connected" /> : <WifiOff size={13} aria-hidden />}
                {!sensorOk && (!connected ? 'Laser service offline' : time?.simulate ? 'Test mode (no sensor)' : 'Timer not connected')}
              </span>
            </div>
          </div>
          {openCut > 0 && <div className="text-2xl font-semibold tabular-nums text-brand-black leading-none">{shortDuration(openCut)}</div>}
          {/* Decoration only: the full cutter where there is room, just the head on a narrow screen. */}
          <div className="hidden sm:block flex-1 min-w-[152px] max-w-[304px]"><LaserAnimation active={laserOn} /></div>
          <div className="sm:hidden flex-1 min-w-0 flex justify-center"><div className="w-full max-w-[240px]"><LaserAnimation active={laserOn} compact /></div></div>
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

      {/* Two sections, one at a time: a tab bar says clearly which one you are in. */}
      <div role="tablist" className="flex border-b border-lijn bg-white">
        {([['cuts', 'New cuts', loose.length], ['projects', 'Projects', projects.length], ['settings', 'Settings', 0]] as const).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('flex-1 h-11 text-sm font-semibold border-b-[3px] -mb-px flex items-center justify-center gap-1.5', id === 'settings' && 'lg:hidden',
              tab === id ? 'border-brand-black text-brand-black' : 'border-transparent text-grafiet hover:text-brand-black')}>
            {id === 'cuts' ? <Scissors size={15} aria-hidden /> : id === 'projects' ? <Folder size={15} aria-hidden /> : <Gauge size={15} aria-hidden />}{label}
            {n > 0 && <span className={cn('px-1.5 text-xs tabular-nums', tab === id ? 'bg-brand-black text-white' : 'bg-lijn text-brand-black')}>{n}</span>}
          </button>
        ))}
      </div>

      <div className={cn('flex-1 p-4 sm:p-6 space-y-3', tab === 'settings' && 'hidden lg:block')}>
        {(tab === 'cuts' || tab === 'settings') && (
        <div data-drop="new" className={cn('space-y-3', drag?.over === 'new' && 'outline-2 outline-dashed outline-brand-black outline-offset-4 bg-laser-licht/40')}>
        {loose.length > 0 && (
          <div className="flex items-center justify-end gap-3">
            <button className={LINK} onClick={() => setTicked(new Set(loose.filter(c => !c.checkout_at).map(c => c.id)))}>
              Select all
            </button>
            <button className={LINK} disabled={!picked.length} onClick={() => setTicked(new Set())}>
              Clear
            </button>
          </div>
        )}
        {loose.length === 0 && (
          <p className="border border-dashed border-lijn p-4 text-center text-sm text-grafiet">No new cuts</p>
        )}
        {recent.length > 0 && <ul className={CUT_GRID}>{recent.map(row)}</ul>}
        {older.length > 0 && (
          <details className="border border-lijn bg-brand-beige-dark">
            <summary className="px-3 py-3 font-semibold text-sm cursor-pointer">Older than a day ({older.length})</summary>
            <ul className={cn(CUT_GRID, 'p-2 border-t border-lijn')}>{older.map(row)}</ul>
          </details>
        )}
        </div>
        )}

        {tab === 'projects' && (<>
          <NewProject busy={busy} onCreate={name => run(() => laserApi.createProject(name))} />
          {projects.length === 0 && <p className="border border-dashed border-lijn p-4 text-center text-sm text-grafiet">No projects</p>}
          {projects.map(p => (
            <ProjectBlock key={p.id} project={p} cuts={cuts.filter(s => s.project_id === p.id)} busy={busy} run={run} onCheckout={onCheckout}
              dragProps={dragProps} dropActive={drag?.over === p.id} />
          ))}
        </>)}

        <WoodReminder onShop={onShop} />
      </div>

      {picked.length > 0 && (
        <div className="sticky bottom-0 border-t-2 border-brand-black bg-white px-4 sm:px-6 py-3 space-y-2">
          {deleting && (
            <DiscardConfirm
              what={`Delete ${picked.length === 1 ? '1 cut' : `${picked.length} cuts`} with ${shortDuration(pickedSeconds)} unpaid`}
              value={laserSessionPrice(Math.ceil(pickedSeconds / 60), rate)}
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
            {/* Says where Pay goes: people did not know the cuts are paid at the checkout. */}
            <button className="flex-1 basis-0 brutalist-button h-12 px-2 bg-emerald-400 text-brand-black font-semibold whitespace-nowrap flex flex-col items-center justify-center leading-tight disabled:opacity-40"
              disabled={busy} onClick={() => onCheckout(picked.map(s => s.id))}>
              <span className="flex items-center gap-1.5"><ShoppingCart size={16} aria-hidden /> Pay €{pickedPrice.toFixed(2)} →</span>
              <span className="text-[11px] font-normal">at the checkout</span>
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
