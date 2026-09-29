import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useVolunteer } from '../VolunteerContext';
import { cn } from '../lib/utils';
import { laserApi, type LibraryDraft, type LibraryRow } from '../lib/laserApi';
import { formatSetting, parseSetting } from '../lib/laserSetting';

/**
 * The material cutting library: the binder next to the laser, kept in InvenTree.
 * Everyone can look things up. For volunteers every cell is a field: leaving a
 * row saves it, Escape undoes the changes to it.
 */

/** A row as the volunteer sees and types it. */
interface RowText {
  group: string;
  material: string;
  materialNl: string;
  thickness: string;
  cut: string;
  line: string;
  fill: string;
  comment: string;
}

const EMPTY_TEXT: RowText = { group: '', material: '', materialNl: '', thickness: '', cut: '', line: '', fill: '', comment: '' };

function toText(r: LibraryRow | LibraryDraft): RowText {
  return {
    group: r.group, material: r.material, materialNl: r.materialNl,
    thickness: r.thickness == null ? '' : String(r.thickness),
    cut: formatSetting(r.cutSpeed, r.cutPower, r.cutPowerMin, r.cutPasses),
    line: formatSetting(r.lineSpeed, r.linePower, r.linePowerMin),
    fill: formatSetting(r.fillSpeed, r.fillPower),
    comment: r.comment,
  };
}

/** Typed text → the row the laser service stores, or the first error. */
function toDraft(t: RowText): LibraryDraft | { error: string } {
  if (!t.material.trim()) return { error: 'Material name is required' };
  let thickness: number | null = null;
  if (t.thickness.trim()) {
    thickness = parseFloat(t.thickness.replace(',', '.'));
    if (!(thickness > 0)) return { error: 'Thickness must be a number above 0' };
  }
  const cut = parseSetting(t.cut, { allowMin: true, allowPasses: true });
  if ('error' in cut) return { error: `Cut: ${cut.error}` };
  const line = parseSetting(t.line, { allowMin: true });
  if ('error' in line) return { error: `Engrave line: ${line.error}` };
  const fill = parseSetting(t.fill);
  if ('error' in fill) return { error: `Engrave fill: ${fill.error}` };
  return {
    group: t.group.trim(), material: t.material.trim(), materialNl: t.materialNl.trim(), thickness,
    cutSpeed: cut.speed, cutPower: cut.power, cutPowerMin: cut.min, cutPasses: cut.passes,
    lineSpeed: line.speed, linePower: line.power, linePowerMin: line.min,
    fillSpeed: fill.speed, fillPower: fill.power,
    comment: t.comment.trim(),
  };
}

const sameText = (a: RowText, b: RowText) => (Object.keys(a) as (keyof RowText)[]).every(k => a[k] === b[k]);

export default function LaserLibrary() {
  const { isVolunteerMode } = useVolunteer();
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Rows added in this session that are not in InvenTree yet.
  const [newRows, setNewRows] = useState<{ key: number; text: RowText }[]>([]);
  const nextKey = useRef(1);

  const load = () => laserApi.library()
    .then(d => { setRows(d.rows); setError(null); })
    .catch(e => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => [...new Set((rows ?? []).map(r => r.group || 'Other'))], [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (!group || (r.group || 'Other') === group) &&
      (!q || `${r.material} ${r.materialNl} ${r.comment}`.toLowerCase().includes(q)));
  }, [rows, group, query]);

  // Rows of one material sit together; for visitors only the first shows the name.
  const firstOfMaterial = (i: number) => i === 0 || shown[i - 1].material !== shown[i].material;

  const addRow = () => {
    setNewRows(prev => [...prev, { key: nextKey.current++, text: { ...EMPTY_TEXT, group: group && group !== 'Other' ? group : '' } }]);
  };

  return (
    <section className="p-4 sm:p-6 space-y-4 border-t border-lijn lg:col-span-2">
      <div className="border-b border-lijn pb-3">
        <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2"><BookOpen size={18} /> Material library</h2>
      </div>

      <p className="text-xs text-grafiet">
        Speed (mm/s) / power (%). A second power is the minimum, e.g. <span className="font-mono">100/50-10</span>:
        the laser drops to 10 % where it slows down in corners. <span className="font-mono">×2</span> = two passes.
        {isVolunteerMode && ' Click a cell to change it; leaving the row saves it, Escape undoes.'}
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
                  <th className="px-3 py-2 sticky left-0 bg-brand-beige-dark z-[1]">Material</th>
                  {isVolunteerMode && <th className="px-3 py-2">Group</th>}
                  <th className="px-3 py-2 text-right">mm</th>
                  <th className="px-3 py-2">Cut</th>
                  <th className="px-3 py-2">Engrave line</th>
                  <th className="px-3 py-2">Engrave fill</th>
                  <th className="px-3 py-2">Comment</th>
                  {isVolunteerMode && <th className="px-2 py-2 w-20" />}
                </tr>
              </thead>
              <tbody>
                {isVolunteerMode ? (
                  <>
                    {shown.map(r => (
                      <EditableRow
                        key={r.partId}
                        partId={r.partId}
                        initial={toText(r)}
                        onSaved={(partId, draft) => setRows(prev => prev && prev.map(x => x.partId === partId ? { ...x, ...draft } : x))}
                        onDeleted={() => setRows(prev => prev && prev.filter(x => x.partId !== r.partId))}
                      />
                    ))}
                    {newRows.map(n => (
                      <EditableRow
                        key={`new-${n.key}`}
                        partId={null}
                        initial={n.text}
                        autoFocus
                        onSaved={() => { setNewRows(prev => prev.filter(x => x.key !== n.key)); load(); }}
                        onDeleted={() => setNewRows(prev => prev.filter(x => x.key !== n.key))}
                      />
                    ))}
                  </>
                ) : (
                  shown.map((r, i) => (
                    <tr key={r.partId} className={cn('border-t', firstOfMaterial(i) ? 'border-lijn' : 'border-transparent')}>
                      <td className="px-3 py-1.5 align-top sticky left-0 bg-white">
                        {firstOfMaterial(i) && (
                          <>
                            <div className="font-semibold">{r.material}</div>
                            {r.materialNl && r.materialNl.toLowerCase() !== r.material.toLowerCase() &&
                              <div className="text-[11px] text-grafiet">{r.materialNl}</div>}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono align-top">{r.thickness ?? ''}</td>
                      <td className="px-3 py-1.5 font-mono align-top">{formatSetting(r.cutSpeed, r.cutPower, r.cutPowerMin, r.cutPasses)}</td>
                      <td className="px-3 py-1.5 font-mono align-top">{formatSetting(r.lineSpeed, r.linePower, r.linePowerMin)}</td>
                      <td className="px-3 py-1.5 font-mono align-top">{formatSetting(r.fillSpeed, r.fillPower)}</td>
                      <td className="px-3 py-1.5 text-xs text-grafiet align-top">{r.comment}</td>
                    </tr>
                  ))
                )}
                {!shown.length && !newRows.length && (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-grafiet">Nothing found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {isVolunteerMode && (
            <>
              <button onClick={addRow} className="brutalist-button px-3 h-10 text-sm font-semibold flex items-center gap-1.5">
                <Plus size={14} /> Add row
              </button>
              <datalist id="laser-groups">{groups.filter(g => g !== 'Other').map(g => <option key={g} value={g} />)}</datalist>
            </>
          )}
        </>
      )}
    </section>
  );
}

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

const cell = 'w-full min-w-0 bg-transparent border border-transparent hover:border-lijn focus:border-brand-black focus:bg-white px-1.5 py-1 outline-none';

/** One library row as fields. Leaving the row (focus goes outside it) saves it when something changed. */
function EditableRow({ partId, initial, autoFocus, onSaved, onDeleted }: {
  partId: number | null;
  initial: RowText;
  autoFocus?: boolean;
  onSaved: (partId: number, draft: LibraryDraft) => void;
  onDeleted: () => void;
}) {
  const { addToast } = useToast();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [id, setId] = useState(partId);
  const trRef = useRef<HTMLTableRowElement>(null);

  const save = async () => {
    if (sameText(text, saved)) return;
    // A new row stays local until it has a name.
    if (id === null && !text.material.trim()) return;
    const draft = toDraft(text);
    if ('error' in draft) { setStatus({ kind: 'error', message: draft.error }); return; }
    setStatus({ kind: 'saving' });
    try {
      const res = await laserApi.saveLibraryRow(id, draft);
      setId(res.partId);
      setSaved(text);
      setStatus({ kind: 'saved' });
      onSaved(res.partId, draft);
      window.setTimeout(() => setStatus(s => (s.kind === 'saved' ? { kind: 'idle' } : s)), 2000);
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const remove = async () => {
    if (id === null) { onDeleted(); return; }
    setStatus({ kind: 'saving' });
    try {
      await laserApi.deleteLibraryRow(id);
      addToast(`${saved.material}${saved.thickness ? ` ${saved.thickness} mm` : ''} removed from the library`, 'success');
      onDeleted();
    } catch (e) {
      setConfirmDelete(false);
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const field = (key: keyof RowText, props: { mono?: boolean; placeholder?: string; list?: string; right?: boolean; bold?: boolean } = {}) => (
    <input
      value={text[key]}
      list={props.list}
      placeholder={props.placeholder}
      autoFocus={autoFocus && key === 'material'}
      aria-label={key}
      onChange={e => { setText({ ...text, [key]: e.target.value }); if (status.kind === 'error') setStatus({ kind: 'idle' }); }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setText(saved); setStatus({ kind: 'idle' }); (e.target as HTMLInputElement).blur(); }
      }}
      className={cn(cell, props.mono && 'font-mono', props.right && 'text-right', props.bold && 'font-semibold')}
    />
  );

  return (
    <>
      <tr
        ref={trRef}
        onBlur={e => { if (!trRef.current?.contains(e.relatedTarget as Node | null)) save(); }}
        className={cn('border-t border-lijn-zacht align-top', status.kind === 'error' && 'bg-red-50')}
      >
        <td className={cn('px-1.5 py-1 sticky left-0 min-w-44', status.kind === 'error' ? 'bg-red-50' : 'bg-white')}>
          {field('material', { bold: true, placeholder: 'Material (English)' })}
          <div className="text-[11px] text-grafiet">{field('materialNl', { placeholder: id === null ? 'Dutch name' : undefined })}</div>
        </td>
        <td className="px-1.5 py-1 min-w-28">{field('group', { list: 'laser-groups', placeholder: id === null ? 'Group' : undefined })}</td>
        <td className="px-1.5 py-1 w-20">{field('thickness', { mono: true, right: true, placeholder: id === null ? 'mm' : undefined })}</td>
        <td className="px-1.5 py-1 min-w-32">{field('cut', { mono: true, placeholder: id === null ? 'speed/power' : undefined })}</td>
        <td className="px-1.5 py-1 min-w-32">{field('line', { mono: true })}</td>
        <td className="px-1.5 py-1 min-w-28">{field('fill', { mono: true })}</td>
        <td className="px-1.5 py-1 min-w-48 text-xs">{field('comment')}</td>
        <td className="px-2 py-1 text-right whitespace-nowrap">
          {status.kind === 'saving' && <Loader2 size={14} className="inline animate-spin text-grafiet" />}
          {status.kind === 'saved' && <Check size={14} className="inline text-emerald-600" aria-label="Saved" />}
          {(status.kind === 'idle' || status.kind === 'error') && (confirmDelete ? (
            <span className="inline-flex gap-1 text-xs">
              <button onClick={remove} className="px-2 py-1 bg-red-500 text-white font-semibold">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 border border-lijn">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 text-grafiet hover:text-red-600" aria-label="Delete row" title="Delete row">
              <Trash2 size={14} />
            </button>
          ))}
        </td>
      </tr>
      {status.kind === 'error' && (
        <tr className="bg-red-50">
          <td colSpan={8} className="px-3 pb-1.5 text-xs font-semibold text-red-700">
            {status.message} — not saved. Fix it, or press Escape in the row to undo.
          </td>
        </tr>
      )}
    </>
  );
}
