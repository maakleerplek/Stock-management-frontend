import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { laserApi, type FeedbackGroup, type FeedbackReport, type LaserOutcome, type LibraryDraft } from '../lib/laserApi';
import { useToast } from '../ToastContext';
import { cn } from '../lib/utils';
import { Section, Empty } from './ui';

const OUTCOME: Record<LaserOutcome, { label: string; className: string }> = {
  clean: { label: 'Clean', className: 'bg-emerald-200 text-emerald-700' },
  partial: { label: 'Needs cleanup', className: 'bg-amber-100 text-amber-800' },
  failed: { label: 'Did not work', className: 'bg-brand-beige-dark text-grafiet' },
  risky: { label: 'Fire / melting', className: 'bg-red-100 text-red-700' },
};
const ORDER: LaserOutcome[] = ['clean', 'partial', 'failed', 'risky'];

const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
const fmtSetting = (s: { speed: number | null; power: number | null; passes: number | null } | null | undefined) =>
  s && s.speed != null && s.power != null ? `${s.speed} mm/s · ${s.power} %${(s.passes ?? 1) > 1 ? ` · ${s.passes}×` : ''}` : '—';
const opLabel = (op: string) => (op === 'cut' ? 'Cut' : 'Engrave');

// Cutting runs the min power 10 points under max, like the laser page (minPowerFor).
const TUBE_MIN_POWER = 10;

const EMPTY_ROW: LibraryDraft = {
  group: '', material: '', materialNl: '', thickness: null, cutSpeed: null, cutPower: null, cutPowerMin: null,
  cutPasses: null, lineSpeed: null, linePower: null, linePowerMin: null, fillSpeed: null, fillPower: null, comment: '',
};

/** Write what the reports say into the material library (InvenTree). */
async function applyAdvice(g: FeedbackGroup) {
  const a = g.reported;
  if (a.speed == null || a.power == null) return;
  const { rows } = await laserApi.library();
  const current = g.library ? rows.find(r => r.partId === g.library!.partId) : undefined;
  const draft: LibraryDraft = { ...EMPTY_ROW, material: g.material, thickness: g.thickness };
  if (current) {
    for (const key of Object.keys(EMPTY_ROW) as (keyof LibraryDraft)[]) {
      (draft as Record<string, unknown>)[key] = current[key];
    }
  }
  if (g.operation === 'cut') {
    draft.cutSpeed = a.speed;
    draft.cutPower = a.power;
    draft.cutPowerMin = Math.max(TUBE_MIN_POWER, a.power - 10);
    draft.cutPasses = a.passes ?? 1;
  } else {
    draft.fillSpeed = a.speed;
    draft.fillPower = a.power;
  }
  await laserApi.saveLibraryRow(current ? current.partId : null, draft);
}

/**
 * The "Tried it? How did it go?" reports from the laser page: per material,
 * how it went and whether the advice has moved away from the library, and
 * every report so a wrong one can be removed.
 */
export default function LaserFeedback({ days, refreshKey }: { days: number | null; refreshKey: number }) {
  const { addToast } = useToast();
  const [data, setData] = useState<{ reports: FeedbackReport[]; groups: FeedbackGroup[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null);
  const [confirmReport, setConfirmReport] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    laserApi.feedback(days)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [days]);

  useEffect(load, [load, refreshKey]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      addToast(done, 'success');
      setConfirmGroup(null);
      setConfirmReport(null);
      load();
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const key = (g: FeedbackGroup) => `${g.material}|${g.thickness}|${g.operation}`;

  return (
    <>
      <Section title="Material feedback" icon={BookOpen}>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        {!data && !error && <Loader2 size={16} className="animate-spin text-grafiet" />}
        {data && data.groups.length === 0 && <Empty text="No reports in this period" />}
        {data && data.groups.length > 0 && (
          <>
            <p className="text-xs text-grafiet mb-3">
              Per material: how the reports went, what the library says, and what the good reports say.
              From 3 good reports on, when they are more than 10 % off the library, their settings can go into the library.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.groups.map(g => {
                const k = key(g);
                const bad = g.counts.failed + g.counts.risky;
                return (
                  <div key={k} className={cn('border bg-white p-3 space-y-2', bad ? 'border-red-400' : 'border-lijn')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold">{g.material} · {g.thickness} mm · {opLabel(g.operation)}</p>
                      <span className="text-[10px] text-grafiet shrink-0">last {fmtDate(g.last)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ORDER.filter(o => g.counts[o] > 0).map(o => (
                        <span key={o} className={cn('text-[11px] font-semibold px-1.5 py-0.5', OUTCOME[o].className)}>
                          {g.counts[o]}× {OUTCOME[o].label}
                        </span>
                      ))}
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
                      <dt className="text-grafiet">Library</dt>
                      <dd className="tabular-nums">{g.library ? fmtSetting(g.library.setting) : 'no row for this thickness'}</dd>
                      <dt className="text-grafiet">Reports say</dt>
                      <dd className={cn('tabular-nums', g.differs && 'font-semibold')}>{fmtSetting(g.reported)}</dd>
                      <dt className="text-grafiet">Laser page shows</dt>
                      <dd className="tabular-nums">{fmtSetting(g.advice)}</dd>
                    </dl>
                    {g.advice.avoidWarning && (
                      <p className="text-[11px] text-rood flex gap-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{g.advice.avoidWarning}</p>
                    )}
                    {g.differs && (confirmGroup === k ? (
                      <div className="border border-lijn bg-brand-beige-dark p-2 space-y-2">
                        <p className="text-xs">
                          {g.library ? 'Change' : 'Add'} the library row for {g.material} {g.thickness} mm ({opLabel(g.operation).toLowerCase()}):{' '}
                          <span className="tabular-nums">{g.library ? `${fmtSetting(g.library.setting)} → ` : ''}{fmtSetting(g.reported)}</span>
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmGroup(null)} className="brutalist-button px-3 h-9 text-xs">Cancel</button>
                          <button
                            disabled={busy}
                            onClick={() => run(() => applyAdvice(g), 'Library updated')}
                            className="brutalist-button btn-primary px-3 h-9 text-xs flex items-center gap-1.5"
                          >
                            {busy && <Loader2 size={12} className="animate-spin" />} Save to library
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmGroup(k)} className="brutalist-button px-3 h-9 text-xs font-semibold">
                        {g.library ? 'Update library' : 'Add to library'}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Section>

      <Section title="All reports" icon={MessageSquare}>
        {data && data.reports.length === 0 && <Empty text="No reports in this period" />}
        {data && data.reports.length > 0 && (
          <ul className="divide-y divide-lijn-zacht">
            {data.reports.map(r => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-semibold">
                    {r.material} · {r.thickness_mm} mm · {opLabel(r.operation)}
                    <span className={cn('ml-2 text-[11px] px-1.5 py-0.5', OUTCOME[r.outcome].className)}>{OUTCOME[r.outcome].label}</span>
                  </p>
                  <p className="text-grafiet tabular-nums">
                    {fmtDate(r.created_at)} · {fmtSetting(r)}
                    {r.strength != null && ` · strength ${Math.round(r.strength * 100)} %`}
                    {r.submitted_by && ` · ${r.submitted_by}`}
                  </p>
                </div>
                {confirmReport === r.id ? (
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => setConfirmReport(null)} className="brutalist-button px-2 h-9 text-xs">Keep</button>
                    <button
                      disabled={busy}
                      onClick={() => run(() => laserApi.deleteReport(r.id), 'Report deleted')}
                      className="brutalist-button px-2 h-9 text-xs bg-red-500 text-white border-red-500"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmReport(r.id)} className="w-9 h-9 flex items-center justify-center text-grafiet hover:text-red-600 shrink-0" aria-label="Delete report">
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
