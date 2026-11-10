import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Scissors, PenTool, Gauge, Flame, FlameKindling, Repeat } from 'lucide-react';
import { useToast } from '../../ToastContext';
import { cn } from '../../lib/utils';
import { laserApi, type LaserMaterial, type LaserOperation, type LaserOutcome, type LaserSetting } from '../../lib/laserApi';
import { OUTCOMES, minPowerFor, popularRank, CONFIDENCE } from './shared';

export function SettingsPanel({ libraryVersion }: { libraryVersion: number }) {
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
        const first = d.materials.find(m => popularRank(m.name) === 0) ?? d.materials[0];
        setMaterial(first?.name ?? '');
        setThickness(first?.thicknesses[0] ?? null);
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
  const popular = (materials ?? []).filter(m => popularRank(m.name) >= 0).sort((a, b) => popularRank(a.name) - popularRank(b.name));
  const others = (materials ?? []).filter(m => popularRank(m.name) < 0);
  const pick = (m: LaserMaterial) => { setMaterial(m.name); setThickness(m.thicknesses[0] ?? null); };
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
      <div className="border-b border-lijn pb-3 flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-brand-black">Laser settings</h2>
        <span className="inline-flex items-center gap-1.5 border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" aria-hidden />Test on a scrap first
        </span>
      </div>

      {loadError && <p className="text-sm text-rood">Material list unavailable: {loadError}</p>}
      {materials && !materials.length && <p className="text-sm text-grafiet">No materials in InvenTree yet (category Lasermaterialen).</p>}

      {!!materials?.length && (
        <>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-black/60 block">Material</label>
            <div className="flex flex-wrap gap-2">
              {popular.map(m => (
                <button key={m.name} onClick={() => pick(m)}
                  className={cn('px-4 py-2 border text-sm font-semibold transition-colors',
                    m.name === material ? 'bg-brand-black text-white border-brand-black' : 'bg-white border-lijn hover:border-brand-black')}>
                  {m.name}
                </button>
              ))}
              {others.length > 0 && (
                <select aria-label="Other material"
                  value={others.some(m => m.name === material) ? material : ''}
                  onChange={e => { const m = others.find(o => o.name === e.target.value); if (m) pick(m); }}
                  className={cn('px-3 py-2 border text-sm font-semibold cursor-pointer',
                    others.some(m => m.name === material) ? 'bg-brand-black text-white border-brand-black' : 'bg-white border-lijn hover:border-brand-black')}>
                  <option value="" disabled>Other material…</option>
                  {others.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              )}
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

export function Stat({ icon: Icon, label, value, unit }: { icon: React.ElementType; label: string; value: string; unit: string }) {
  return (
    <div className="border border-lijn py-2">
      <div className="text-[10px] font-semibold text-brand-black/60 flex items-center justify-center gap-1"><Icon size={11} />{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}<span className="text-xs text-grafiet ml-0.5">{unit}</span></div>
    </div>
  );
}
