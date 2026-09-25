import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useVolunteer } from '../VolunteerContext';
import { cn } from '../lib/utils';
import { laserApi, type LibraryDraft, type LibraryRow } from '../lib/laserApi';

/**
 * The material cutting library: the binder next to the laser, kept in InvenTree.
 * Everyone can look things up; volunteers can correct a row or add one.
 */

const EMPTY: LibraryDraft = {
  group: '', material: '', materialNl: '', thickness: null,
  cutSpeed: null, cutPower: null, cutPowerMin: null, cutPasses: null,
  lineSpeed: null, linePower: null, linePowerMin: null,
  fillSpeed: null, fillPower: null, comment: '',
};

/** "25/80" or "100/50-10": speed / max power - min power, as in the binder. */
function setting(speed: number | null, power: number | null, min?: number | null, passes?: number | null) {
  if (speed === null && power === null) return '';
  let s = `${speed ?? '?'}/${power ?? '?'}`;
  if (min != null) s += `-${min}`;
  if (passes != null && passes > 1) s += ` ×${passes}`;
  return s;
}

export default function LaserLibrary() {
  const { addToast } = useToast();
  const { isVolunteerMode } = useVolunteer();
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [limits, setLimits] = useState({ minPower: 10, maxPower: 90 });
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ partId: number | null; draft: LibraryDraft } | null>(null);

  const load = () => laserApi.library()
    .then(d => { setRows(d.rows); setLimits({ minPower: d.minPower, maxPower: d.maxPower }); setError(null); })
    .catch(e => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => [...new Set((rows ?? []).map(r => r.group || 'Other'))], [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (!group || (r.group || 'Other') === group) &&
      (!q || `${r.material} ${r.materialNl} ${r.comment}`.toLowerCase().includes(q)));
  }, [rows, group, query]);

  // Rows of one material sit together; only the first shows the name.
  const firstOfMaterial = (i: number) => i === 0 || shown[i - 1].material !== shown[i].material;

  return (
    <section className="p-4 sm:p-6 space-y-4 border-t border-lijn lg:col-span-2">
      <div className="border-b border-lijn pb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2"><BookOpen size={18} /> Material library</h2>
        {isVolunteerMode && (
          <button onClick={() => setEditing({ partId: null, draft: { ...EMPTY, group: group ?? '' } })}
            className="px-3 py-1.5 bg-brand-black text-white text-sm font-semibold flex items-center gap-1.5">
            <Plus size={14} /> Add material
          </button>
        )}
      </div>

      <p className="text-xs text-grafiet">
        Speed (mm/s) / power (%). A second power is the minimum, e.g. <span className="font-mono">100/50-10</span>:
        the laser drops to 10 % where it slows down in corners.
      </p>

      {error && <p className="text-sm text-rood">Library unavailable: {error}</p>}

      {rows && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {[null, ...groups].map(g => (
              <button key={g ?? 'all'} onClick={() => setGroup(g)}
                className={cn('px-3 py-1.5 border text-sm font-semibold transition-colors',
                  g === group ? 'bg-brand-black text-white border-brand-black' : 'bg-white border-lijn hover:border-brand-black')}>
                {g ?? 'All'}
              </button>
            ))}
            <label className="relative ml-auto">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-grafiet" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search material"
                className="h-9 pl-7 pr-2 border border-lijn bg-white text-sm w-48" />
            </label>
          </div>

          <div className="overflow-x-auto border border-lijn bg-white">
            <table className="w-full text-sm">
              <thead className="bg-brand-beige-dark text-left text-xs">
                <tr>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2 text-right">mm</th>
                  <th className="px-3 py-2">Cut</th>
                  <th className="px-3 py-2">Engrave line</th>
                  <th className="px-3 py-2">Engrave fill</th>
                  <th className="px-3 py-2">Comment</th>
                  {isVolunteerMode && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.partId} className={cn('border-t', firstOfMaterial(i) ? 'border-lijn' : 'border-transparent')}>
                    <td className="px-3 py-1.5 align-top">
                      {firstOfMaterial(i) && (
                        <>
                          <div className="font-semibold">{r.material}</div>
                          {r.materialNl && r.materialNl.toLowerCase() !== r.material.toLowerCase() &&
                            <div className="text-[11px] text-grafiet">{r.materialNl}</div>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono align-top">{r.thickness ?? ''}</td>
                    <td className="px-3 py-1.5 font-mono align-top">{setting(r.cutSpeed, r.cutPower, r.cutPowerMin, r.cutPasses)}</td>
                    <td className="px-3 py-1.5 font-mono align-top">{setting(r.lineSpeed, r.linePower, r.linePowerMin)}</td>
                    <td className="px-3 py-1.5 font-mono align-top">{setting(r.fillSpeed, r.fillPower)}</td>
                    <td className="px-3 py-1.5 text-xs text-grafiet align-top">{r.comment}</td>
                    {isVolunteerMode && (
                      <td className="px-2 py-1 align-top text-right">
                        <button onClick={() => setEditing({ partId: r.partId, draft: { ...r } })}
                          className="p-1.5 border border-lijn hover:border-brand-black" title="Edit">
                          <Pencil size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!shown.length && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-grafiet">Nothing found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <EditForm
          partId={editing.partId}
          initial={editing.draft}
          groups={groups}
          limits={limits}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); addToast('Library saved.', 'success'); }}
        />
      )}
    </section>
  );
}

type NumberField = 'thickness' | 'cutSpeed' | 'cutPower' | 'cutPowerMin' | 'cutPasses'
  | 'lineSpeed' | 'linePower' | 'linePowerMin' | 'fillSpeed' | 'fillPower';

const SECTIONS: { title: string; fields: { key: NumberField; label: string; power?: boolean }[] }[] = [
  { title: 'Cut', fields: [
    { key: 'cutSpeed', label: 'Speed mm/s' }, { key: 'cutPower', label: 'Max power %', power: true },
    { key: 'cutPowerMin', label: 'Min power %', power: true }, { key: 'cutPasses', label: 'Passes' }] },
  { title: 'Engrave line', fields: [
    { key: 'lineSpeed', label: 'Speed mm/s' }, { key: 'linePower', label: 'Max power %', power: true },
    { key: 'linePowerMin', label: 'Min power %', power: true }] },
  { title: 'Engrave fill', fields: [
    { key: 'fillSpeed', label: 'Speed mm/s' }, { key: 'fillPower', label: 'Power %', power: true }] },
];

function EditForm({ partId, initial, groups, limits, onClose, onSaved }: {
  partId: number | null;
  initial: LibraryDraft;
  groups: string[];
  limits: { minPower: number; maxPower: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToast();
  const [d, setD] = useState<LibraryDraft>(initial);
  const [busy, setBusy] = useState(false);

  const text = (key: 'group' | 'material' | 'materialNl' | 'comment') => ({
    value: d[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [key]: e.target.value }),
  });
  const num = (key: NumberField) => ({
    value: d[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setD({ ...d, [key]: e.target.value === '' ? null : parseFloat(e.target.value) }),
  });

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); onSaved(); } catch (e) { addToast(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(false); }
  };

  const input = 'h-9 px-2 border border-lijn bg-white text-sm w-full';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); run(() => laserApi.saveLibraryRow(partId, d)); }}
        className="bg-brand-beige w-full max-w-2xl max-h-full overflow-auto border border-brand-black p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-black">{partId === null ? 'Add material' : `Edit ${initial.material}`}</h3>
          <button type="button" onClick={onClose} className="p-1" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="col-span-2 text-xs font-semibold text-brand-black/60">Material (English) *
            <input required {...text('material')} className={input} />
          </label>
          <label className="col-span-2 text-xs font-semibold text-brand-black/60">Material (Dutch)
            <input {...text('materialNl')} className={input} />
          </label>
          <label className="col-span-2 sm:col-span-3 text-xs font-semibold text-brand-black/60">Group
            <input list="laser-groups" {...text('group')} className={input} />
            <datalist id="laser-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
          </label>
          <label className="text-xs font-semibold text-brand-black/60">Thickness mm
            <input type="number" step="0.1" min="0" {...num('thickness')} className={input} placeholder="engrave only" />
          </label>
        </div>

        {SECTIONS.map(sec => (
          <fieldset key={sec.title} className="border border-lijn p-3">
            <legend className="px-1 text-xs font-semibold">{sec.title}</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {sec.fields.map(f => (
                <label key={f.key} className="text-xs font-semibold text-brand-black/60">{f.label}
                  <input type="number" step={f.key === 'cutPasses' ? 1 : 'any'}
                    min={f.power ? limits.minPower : 0} max={f.power ? limits.maxPower : undefined}
                    {...num(f.key)} className={input} />
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <label className="block text-xs font-semibold text-brand-black/60">Comment
          <input {...text('comment')} className={input} />
        </label>
        <p className="text-[11px] text-grafiet">Power {limits.minPower}-{limits.maxPower} %. Leave a field empty when nobody has tried it.</p>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy} className="px-4 py-2 bg-brand-black text-white text-sm font-semibold disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-lijn text-sm">Cancel</button>
          {partId !== null && (
            <button type="button" disabled={busy}
              onClick={() => { if (window.confirm(`Remove ${initial.material}${initial.thickness ? ` ${initial.thickness} mm` : ''} from the library?`)) run(() => laserApi.deleteLibraryRow(partId)); }}
              className="ml-auto px-3 py-2 border border-rood text-rood text-sm flex items-center gap-1.5">
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
