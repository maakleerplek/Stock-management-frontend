import { useEffect, useState } from 'react';
import { Zap, X, Plus, RotateCcw, ArrowRightLeft, Trash2, ShoppingCart, AlertTriangle, Scissors, PenTool, Wifi, WifiOff, Gauge, Flame, FlameKindling, Repeat, Check, Pencil } from 'lucide-react';
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
  laserApi, useLaserSocket, formatDuration,
  type LaserMaterial, type LaserOperation, type LaserOutcome, type LaserSetting,
} from './lib/laserApi';

interface LaserCutterPageProps {
  /** Put the session's minutes in the checkout and go there. */
  /** Put the session in the checkout (on the laser service) and go there. */
  onCheckout: (sessionId: string) => void;
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
  return (
    <div className="flex-1 overflow-auto bg-brand-beige">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-lijn min-h-full">
        <TimePanel onCheckout={onCheckout} onShop={onShop} live={live} />
        <SettingsPanel />
        <LaserLibrary />
      </div>
    </div>
  );
}

function TimePanel({ onCheckout, onShop, live }: LaserCutterPageProps) {
  const { connected, time, sessions } = live;
  const { addToast } = useToast();
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // What the throw-away confirm is open for: the unassigned time or one session.
  const [discarding, setDiscarding] = useState<'unassigned' | string | null>(null);
  // The session whose name is being edited, and the new name.
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  // Keep a valid selection when sessions come and go.
  useEffect(() => {
    if (sessions.length && !sessions.some(s => s.id === selected)) setSelected(sessions[0].id);
    if (!sessions.length) setSelected('');
  }, [sessions, selected]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { addToast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(false); }
  };

  const createSession = () => run(async () => {
    const { id } = await laserApi.createSession(newName);
    setNewName('');
    setSelected(id);
  });

  const renameSession = () => renaming && run(async () => {
    await laserApi.renameSession(renaming.id, renaming.name);
    setRenaming(null);
  });

  const laserOn = time?.laser_state ?? false;
  const pending = time?.global_time ?? 0;
  const target = sessions.find(s => s.id === selected);
  const sensorOk = connected && (time?.esp_connected || time?.simulate);
  const assignBlocked = !target ? 'Start a session first (step 1)' : pending <= 0 ? 'No new laser time yet' : null;
  const toPay = sessions.filter(s => s.total_time > 0);

  return (
    <section className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 border-b border-lijn pb-3">
        <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2"><Zap size={20} className="text-laser" aria-hidden /> Laser time</h2>
        <span className={cn('text-xs font-semibold flex items-center gap-1.5 px-2 py-1 border',
          sensorOk ? 'bg-emerald-50 border-emerald-600 text-emerald-700' : 'bg-amber-50 border-amber-500 text-amber-800')}>
          {sensorOk ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />}
          {!connected ? 'Laser service offline' : time?.esp_connected ? 'Timer connected' : time?.simulate ? 'Test mode (no sensor)' : 'Timer not connected'}
        </span>
      </div>

      <Step n={1} title="Start a session" done={sessions.length > 0}>
        <p className="text-sm text-grafiet">Your name or project, so the laser time is yours.</p>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); createSession(); }}>
          <label htmlFor="laser-session-name" className="sr-only">Your name or project</label>
          <input
            id="laser-session-name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Your name or project"
            className="flex-1 min-w-0 h-11 px-3 border border-lijn bg-white text-base"
            maxLength={80}
          />
          <button type="submit" disabled={busy || newName.trim().length < 2}
            className={cn('brutalist-button h-11 px-4 text-sm font-semibold flex items-center gap-2 shrink-0 whitespace-nowrap disabled:opacity-40',
              sessions.length ? 'bg-white' : 'bg-brand-black text-white')}>
            <Plus size={16} aria-hidden /> Start session
          </button>
        </form>
        {sessions.length > 0 && (
          <div role="radiogroup" aria-label="Session to put the time on" className="flex flex-wrap gap-2">
            {sessions.map(s => renaming?.id === s.id ? (
              <form key={s.id} className="flex" onSubmit={e => { e.preventDefault(); renameSession(); }}>
                <label htmlFor="laser-rename" className="sr-only">New name for {s.name}</label>
                <input id="laser-rename" autoFocus value={renaming.name} maxLength={80}
                  onChange={e => setRenaming({ id: s.id, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Escape') setRenaming(null); }}
                  className="h-11 w-48 min-w-0 px-3 border border-lijn bg-white text-base" />
                <button type="submit" disabled={busy || renaming.name.trim().length < 2}
                  className="h-11 px-3 border border-l-0 border-lijn bg-brand-black text-white text-xs font-semibold disabled:opacity-40">Save</button>
                <button type="button" onClick={() => setRenaming(null)} aria-label="Cancel renaming"
                  className="h-11 px-2 border border-l-0 border-lijn bg-white"><X size={14} aria-hidden /></button>
              </form>
            ) : (
              <div key={s.id} className="flex">
                <button role="radio" aria-checked={s.id === selected} onClick={() => setSelected(s.id)}
                  className={cn('h-11 px-3 border text-sm font-semibold flex items-center gap-2',
                    s.id === selected ? 'bg-brand-black text-white border-brand-black' : 'bg-white border-lijn hover:bg-brand-beige-dark')}>
                  {s.id === selected && <Check size={14} aria-hidden />}{s.name}
                  <span className={cn('font-mono text-xs', s.id === selected ? 'text-white/70' : 'text-grafiet')}>{formatDuration(s.total_time)}</span>
                </button>
                <button onClick={() => setRenaming({ id: s.id, name: s.name })} disabled={busy}
                  aria-label={`Rename the session ${s.name}`}
                  className="h-11 px-2 border border-l-0 border-lijn bg-white text-grafiet hover:bg-brand-beige-dark disabled:opacity-40">
                  <Pencil size={14} aria-hidden />
                </button>
                {/* No laser time on it: nothing to account for, so it goes without a reason. With time: step 3. */}
                {s.total_time <= 0 && (
                  <button onClick={() => run(() => laserApi.deleteSession(s.id))} disabled={busy}
                    aria-label={`Delete the session ${s.name}`}
                    className="h-11 px-2 border border-l-0 border-lijn bg-white text-red-600 text-xs font-semibold flex items-center gap-1 hover:bg-red-50 disabled:opacity-40">
                    <Trash2 size={14} aria-hidden /> Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step n={2} title="Put the laser time on your session" done={false}>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 px-4 py-3 border border-lijn bg-white">
          {/* Phone (and the laser PC's side bar): the time on top, the animation full width under it, so its text stays readable. */}
          <div className="order-last sm:order-first min-w-0 w-full sm:max-w-[304px]">
            <LaserAnimation active={laserOn} />
          </div>
          <div className="text-left sm:text-right shrink-0">
            <div className={cn('text-xs font-semibold flex items-center sm:justify-end gap-1.5 mb-1', laserOn ? 'text-laser' : 'text-grafiet')}>
              <span className={cn('inline-block w-2 h-2', laserOn ? 'bg-laser' : 'bg-lijn')} />
              {laserOn ? 'Laser is cutting' : 'Laser idle'}
            </div>
            <div className="text-3xl font-mono tabular-nums text-brand-black">{formatDuration(pending)}</div>
            <div className="text-xs text-grafiet">new laser time, not on a session yet</div>
          </div>
        </div>

        {time?.simulate && (
          <div className="flex gap-2 text-xs">
            <span className="text-grafiet self-center">Test:</span>
            <button className="brutalist-button px-3 py-1.5 bg-white" onClick={() => run(() => laserApi.simulate(!laserOn))}>
              Laser {laserOn ? 'off' : 'on'}
            </button>
          </div>
        )}

        <button
          className="w-full brutalist-button h-12 bg-laser text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={busy || !!assignBlocked}
          onClick={() => run(() => laserApi.flush(selected))}
        >
          <ArrowRightLeft size={16} aria-hidden /> {assignBlocked ?? `Put ${formatDuration(pending)} on ${target!.name}`}
        </button>
        {pending > 0 && (
          <button
            className="text-xs font-semibold text-grafiet underline underline-offset-4 flex items-center gap-1.5 disabled:opacity-40"
            disabled={busy}
            onClick={() => setDiscarding(discarding === 'unassigned' ? null : 'unassigned')}
          >
            <RotateCcw size={12} aria-hidden /> Not your time? Clear it
          </button>
        )}
        {discarding === 'unassigned' && pending > 0 && (
          <DiscardConfirm
            what={`Clear ${formatDuration(pending)} that is not on a session`}
            value={laserSessionPrice(Math.ceil(pending / 60))}
            busy={busy}
            onCancel={() => setDiscarding(null)}
            onConfirm={reason => run(async () => { await laserApi.reset(reason); setDiscarding(null); })}
          />
        )}
      </Step>

      <Step n={3} title="Pay when you are done" done={false}>
        {toPay.length === 0 ? (
          <p className="text-sm text-grafiet">Your session shows up here once it has laser time. A job costs {`€${PRICING.LASER_PER_MINUTE.toFixed(2)}`}/min, at least {`€${PRICING.LASER_MINIMUM.toFixed(2)}`}.</p>
        ) : (
          <div className="space-y-2">
            {toPay.map(s => (
              <div key={s.id} className="border border-lijn bg-white">
                <div className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-xs text-grafiet font-mono">{formatDuration(s.total_time)} · {s.minutes} min</div>
                    {s.checkout_at && <div className="text-xs font-semibold text-emerald-700 mt-0.5">In the checkout</div>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {s.checkout_at ? (
                      <button className="brutalist-button h-11 px-3 bg-white text-xs font-semibold flex items-center gap-1.5"
                        onClick={() => run(() => laserApi.setCheckout(s.id, false))}>
                        <X size={14} aria-hidden /> Take out
                      </button>
                    ) : (
                      <button className="brutalist-button h-11 px-3 bg-emerald-400 text-brand-black text-sm font-semibold flex items-center gap-1.5"
                        onClick={() => onCheckout(s.id)}>
                        <ShoppingCart size={16} aria-hidden /> Pay €{laserSessionPrice(s.minutes).toFixed(2)}
                      </button>
                    )}
                    <button className="brutalist-button h-11 px-3 bg-white text-xs text-red-600" aria-label={`Delete the session of ${s.name}`} title="Delete session"
                      onClick={() => setDiscarding(discarding === s.id ? null : s.id)}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </div>
                {discarding === s.id && (
                  <div className="px-3 pb-3">
                    <DiscardConfirm
                      what={`Delete ${s.name} with ${formatDuration(s.total_time)} unpaid`}
                      value={laserSessionPrice(s.minutes)}
                      askKind
                      busy={busy}
                      onCancel={() => setDiscarding(null)}
                      onConfirm={(reason, kind) => run(async () => { await laserApi.deleteSession(s.id, reason, kind); setDiscarding(null); })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Step>

      <WoodReminder onShop={onShop} />
    </section>
  );
}

/** A numbered step of the laser flow; done steps get a check. */
function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="border border-lijn bg-brand-beige p-3 sm:p-4 space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-brand-black">
        <span className={cn('w-7 h-7 shrink-0 flex items-center justify-center text-sm', done ? 'bg-emerald-600 text-white' : 'bg-brand-black text-white')}>
          {done ? <Check size={16} aria-label="done" /> : n}
        </span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Wood for the laser is sold at the checkout: a small reminder with a photo. Visitors only. */
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
          {value !== null ? 'Clear' : 'Delete'}
        </button>
      </div>
      {value !== null && <p className="text-[10px] text-grafiet">Shown in Analytics → Laser{askKind ? '; paid outside checkout counts as paid.' : ' as time not verified.'}</p>}
    </form>
  );
}

function SettingsPanel() {
  const { addToast } = useToast();
  const [materials, setMaterials] = useState<LaserMaterial[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [material, setMaterial] = useState('');
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
        if (d.materials[0]) {
          setMaterial(d.materials[0].name);
          setThickness(d.materials[0].thicknesses[0] ?? null);
        }
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

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
  }, [material, thickness, ops, strength, addToast]);

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
