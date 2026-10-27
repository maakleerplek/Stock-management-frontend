import { useEffect, useRef, useState } from 'react';
import { X, Trash2, ShoppingCart, AlertTriangle, Scissors, PenTool, Wifi, WifiOff, Gauge, Flame, FlameKindling, Repeat, Check, Tag } from 'lucide-react';
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
  laserApi, useLaserSocket, shortDuration, cutPreviewUrl, type LaserSession,
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

// Cut cards: two side by side in the laser PC's bar, three on a wide column.
const CUT_GRID = 'grid grid-cols-3 gap-2';

function TimePanel({ onCheckout, onShop, live }: LaserCutterPageProps) {
  const { connected, time, sessions } = live;
  const { addToast } = useToast();
  // The cuts this visitor ticked. Unticking removes nothing: a cut stays until it is paid or deleted.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e) { addToast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(false); }
  };

  const laserOn = time?.laser_state ?? false;
  const openCut = time?.global_time ?? 0;   // laser time not booked as a cut yet
  const sensorOk = connected && (time?.esp_connected || time?.simulate);
  const cuts = sessions.filter(s => s.total_time > 0);
  const dayAgo = Date.now() - 86_400_000;
  const recent = cuts.filter(s => new Date(s.created).getTime() >= dayAgo);
  const older = cuts.filter(s => new Date(s.created).getTime() < dayAgo);
  const picked = cuts.filter(s => ticked.has(s.id) && !s.checkout_at);
  const pickedSeconds = picked.reduce((sum, s) => sum + s.total_time, 0);
  const pickedPrice = Math.max(laserSessionPrice(Math.ceil(pickedSeconds / 60)), PRICING.LASER_MINIMUM);

  // Forget ticks of cuts that are paid, deleted or in the checkout.
  useEffect(() => {
    setTicked(prev => {
      const open = new Set(sessions.filter(s => s.total_time > 0 && !s.checkout_at).map(s => s.id));
      const next = new Set([...prev].filter(id => open.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sessions]);
  useEffect(() => { if (!picked.length) setDeleting(false); }, [picked.length]);

  const toggle = (id: string) => setTicked(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const row = (s: LaserSession) => (
    <CutRow key={s.id} cut={s} ticked={ticked.has(s.id)} busy={busy} onToggle={() => toggle(s.id)}
      onTakeOut={() => run(() => laserApi.setCheckout(s.id, false))} />
  );

  return (
    <section className="flex flex-col min-h-full">
      <div className={cn('px-4 sm:px-6 pt-3 pb-2 border-b bg-brand-beige-dark', laserOn ? 'border-b-[3px] border-laser' : 'border-lijn')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold text-brand-black">
              <span className={cn('inline-block w-2.5 h-2.5 border', laserOn ? 'bg-laser border-laser' : 'bg-lijn border-grafiet')} />
              {laserOn ? 'Cutting' : 'Laser idle'}
            </div>
            <span className={cn('mt-1 text-xs font-semibold inline-flex items-center gap-1.5', sensorOk ? 'text-emerald-700' : 'text-amber-800')}>
              {sensorOk ? <Wifi size={13} aria-hidden /> : <WifiOff size={13} aria-hidden />}
              {!connected ? 'Laser service offline' : time?.esp_connected ? 'Timer connected' : time?.simulate ? 'Test mode (no sensor)' : 'Timer not connected'}
            </span>
          </div>
          {openCut > 0 && <div className="text-3xl font-semibold tabular-nums text-brand-black leading-none">{shortDuration(openCut)}</div>}
        </div>
        <div className="mx-auto w-full max-w-[304px] mt-1"><LaserAnimation active={laserOn} /></div>
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
        <div>
          <h2 className="text-base font-semibold text-brand-black">Open cuts</h2>
          {cuts.length > 0 && <p className="text-sm text-grafiet">Tick the cuts that are yours.</p>}
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
        {cuts.length === 0 && openCut <= 0 && (
          <p className="border border-dashed border-lijn p-4 text-center text-sm text-grafiet">
            No open cuts. When the laser stops, your cut shows up here.
          </p>
        )}
        {recent.length > 0 && <ul className={CUT_GRID}>{recent.map(row)}</ul>}
        {older.length > 0 && (
          <details className="border border-lijn bg-brand-beige-dark">
            <summary className="px-3 py-3 font-semibold text-sm cursor-pointer">Older than a day ({older.length})</summary>
            <ul className={cn(CUT_GRID, 'p-2 border-t border-lijn')}>{older.map(row)}</ul>
          </details>
        )}
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
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{picked.length === 1 ? '1 cut' : `${picked.length} cuts`}, {shortDuration(pickedSeconds)} laser time</span>
            <span className="font-semibold">€{pickedPrice.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 brutalist-button h-12 bg-emerald-400 text-brand-black font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              disabled={busy} onClick={() => onCheckout(picked.map(s => s.id))}>
              <ShoppingCart size={16} aria-hidden /> Pay €{pickedPrice.toFixed(2)}
            </button>
            <button className={cn('brutalist-button h-12 w-12 shrink-0 flex items-center justify-center text-red-600', deleting ? 'bg-rose-50' : 'bg-white')}
              aria-label={`Delete the ${picked.length === 1 ? 'ticked cut' : `${picked.length} ticked cuts`} without paying`} title="Delete without paying"
              disabled={busy} onClick={() => setDeleting(d => !d)}>
              <Trash2 size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}
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
function CutRow({ cut, ticked, busy, onToggle, onTakeOut }: {
  cut: LaserSession; ticked: boolean; busy: boolean; onToggle: () => void; onTakeOut: () => void;
}) {
  const picture = (
    <span className="block aspect-[4/3] w-full bg-brand-beige-dark border-b border-lijn overflow-hidden" aria-hidden>
      {cut.has_preview
        ? <img src={cutPreviewUrl(cut.id)} alt="" className="w-full h-full object-contain p-2" loading="lazy" />
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
  return (
    <li>
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
