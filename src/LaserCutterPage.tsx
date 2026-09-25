import { useEffect, useState } from 'react';
import { Zap, X, Plus, RotateCcw, ArrowRightLeft, Trash2, ShoppingCart, AlertTriangle, Scissors, PenTool, Wifi, WifiOff } from 'lucide-react';
import LaserAnimation from './components/LaserAnimation';
import LaserLibrary from './components/LaserLibrary';
import { useToast } from './ToastContext';
import { cn } from './lib/utils';
import { PRICING } from './constants';
import {
  laserApi, useLaserSocket, formatDuration,
  type LaserMaterial, type LaserOperation, type LaserOutcome, type LaserSetting,
} from './lib/laserApi';

interface LaserCutterPageProps {
  /** Put the session's minutes in the checkout and go there. */
  /** Put the session in the checkout (on the laser service) and go there. */
  onCheckout: (sessionId: string) => void;
  live: ReturnType<typeof useLaserSocket>;
}

const OUTCOMES: { id: LaserOutcome; label: string }[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'partial', label: 'Needs cleanup' },
  { id: 'failed', label: 'Did not work' },
  { id: 'risky', label: 'Fire / melting' },
];

const CONFIDENCE: Record<LaserSetting['confidence'], string> = {
  none: 'No data for this thickness',
  baseline: 'Starting point from the material list',
  low: 'Based on few reports',
  good: 'Based on reports',
};

export default function LaserCutterPage({ onCheckout, live }: LaserCutterPageProps) {
  return (
    <div className="flex-1 overflow-auto bg-brand-beige">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-lijn min-h-full">
        <TimePanel onCheckout={onCheckout} live={live} />
        <SettingsPanel />
        <LaserLibrary />
      </div>
    </div>
  );
}

function TimePanel({ onCheckout, live }: LaserCutterPageProps) {
  const { connected, time, sessions } = live;
  const { addToast } = useToast();
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

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

  const laserOn = time?.laser_state ?? false;
  const pending = time?.global_time ?? 0;

  return (
    <section className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-lijn pb-3">
        <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2"><Zap size={18} /> Laser time</h2>
        <span className={cn('text-xs font-semibold flex items-center gap-1.5', connected && time?.esp_connected ? 'text-emerald-600' : 'text-grafiet')}>
          {connected && (time?.esp_connected || time?.simulate) ? <Wifi size={14} /> : <WifiOff size={14} />}
          {!connected ? 'Laser service offline' : time?.esp_connected ? 'Sensor connected' : time?.simulate ? 'Test mode (no sensor)' : 'Sensor not connected'}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 px-4 py-3 border border-lijn bg-white">
        <div className="w-full max-w-[304px]">
          <LaserAnimation active={laserOn} />
        </div>
        <div className="text-right shrink-0">
          <div className={cn('text-xs font-semibold flex items-center justify-end gap-1.5 mb-1', laserOn ? 'text-brand-black' : 'text-grafiet')}>
            <span className={cn('inline-block w-2 h-2', laserOn ? 'bg-[#E0561F]' : 'bg-lijn')} />
            {laserOn ? 'Laser on' : 'Laser idle'}
          </div>
          <div className="text-3xl font-mono tabular-nums text-brand-black">{formatDuration(pending)}</div>
          <div className="text-[10px] text-grafiet">not assigned yet · €{(pending / 60 * PRICING.LASER_PER_MINUTE).toFixed(2)}</div>
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

      <div className="space-y-2">
        <label className="text-xs font-semibold text-brand-black/60 block">Assign the time to</label>
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="flex-1 h-10 px-3 border border-lijn bg-white text-sm"
            disabled={!sessions.length}
          >
            {!sessions.length && <option value="">Make a session first</option>}
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({formatDuration(s.total_time)})</option>)}
          </select>
          <button
            className="brutalist-button px-4 bg-brand-black text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40"
            disabled={busy || !selected || pending <= 0}
            onClick={() => run(() => laserApi.flush(selected))}
          >
            <ArrowRightLeft size={14} /> Assign
          </button>
          <button
            className="brutalist-button px-3 bg-white text-sm flex items-center gap-1 disabled:opacity-40"
            disabled={busy || pending <= 0}
            title="Throw away the time that is not assigned"
            onClick={() => { if (window.confirm('Throw away the unassigned time?')) run(() => laserApi.reset()); }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); createSession(); }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Your name or project"
          className="flex-1 h-10 px-3 border border-lijn bg-white text-sm"
          maxLength={80}
        />
        <button type="submit" disabled={busy || newName.trim().length < 2}
          className="brutalist-button px-4 bg-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
          <Plus size={14} /> New session
        </button>
      </form>

      <div className="space-y-2">
        {sessions.map(s => (
          <div key={s.id} className="border border-lijn p-3 flex items-center justify-between gap-3 bg-white">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{s.name}</div>
              <div className="text-xs text-grafiet font-mono">
                {formatDuration(s.total_time)} · {s.minutes} min · €{(s.minutes * PRICING.LASER_PER_MINUTE).toFixed(2)}
              </div>
              {s.checkout_at && <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">In checkout</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              {s.checkout_at ? (
                <button
                  className="brutalist-button px-3 py-2 bg-white text-xs font-semibold flex items-center gap-1.5"
                  onClick={() => run(() => laserApi.setCheckout(s.id, false))}
                >
                  <X size={14} /> Take out of checkout
                </button>
              ) : (
                <button
                  className="brutalist-button px-3 py-2 bg-emerald-400 text-brand-black text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  disabled={s.minutes <= 0}
                  onClick={() => onCheckout(s.id)}
                >
                  <ShoppingCart size={14} /> Pay
                </button>
              )}
              <button
                className="brutalist-button px-2 py-2 bg-white text-xs"
                title="Delete session"
                onClick={() => { if (window.confirm(`Delete the session of ${s.name}?`)) run(() => laserApi.deleteSession(s.id)); }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
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
    const id = window.setTimeout(() => {
      laserApi.recommend(material, thickness, ops, strength)
        .then(d => { setResults(d.results); setReported({}); })
        .catch(e => addToast(e instanceof Error ? e.message : String(e), 'error'));
    }, 150);
    return () => window.clearTimeout(id);
  }, [material, thickness, ops, strength, addToast]);

  const current = materials?.find(m => m.name === material);
  const toggleOp = (op: LaserOperation) =>
    setOps(prev => prev.includes(op) ? prev.filter(o => o !== op) : [...prev, op].sort() as LaserOperation[]);

  const report = async (r: LaserSetting, outcome: LaserOutcome) => {
    if (r.speed === null || r.power === null || thickness === null) return;
    try {
      await laserApi.logAttempt({
        material, thickness, operation: r.operation, speed: r.speed, power: r.power,
        passes: r.passes ?? 1, outcome, ...(r.operation === 'engrave' ? { strength } : {}),
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
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Stat label="Speed" value={`${r.speed}`} unit="mm/s" />
                      <Stat label="Power" value={`${r.power}`} unit="%" />
                      <Stat label="Passes" value={`${r.passes}`} unit="×" />
                    </div>
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
                          <p className="text-[11px] font-semibold text-brand-black/60 mb-2">Tried it? How did it go?</p>
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

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="border border-lijn py-2">
      <div className="text-[10px] font-semibold text-brand-black/60">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}<span className="text-xs text-grafiet ml-0.5">{unit}</span></div>
    </div>
  );
}
