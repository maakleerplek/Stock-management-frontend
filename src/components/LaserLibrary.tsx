import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Loader2, Plus, Save, Search, Trash2, Undo2 } from 'lucide-react';
import { useToast } from '../ToastContext';
import { useVolunteer } from '../VolunteerContext';
import { cn } from '../lib/utils';
import { laserApi, type LibraryDraft, type LibraryRow } from '../lib/laserApi';
import { formatSetting, parseSetting } from '../lib/laserSetting';

/**
 * The material cutting library: the binder next to the laser, kept in InvenTree.
 * Everyone can look things up. For volunteers every cell is a field; changes,
 * new rows and deletions wait until Save changes, Discard changes drops them.
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
const TEXT_KEYS = Object.keys(EMPTY_TEXT) as (keyof RowText)[];

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

/** A new row that is not in InvenTree yet. */
interface NewRow { key: number; text: RowText }

export default function LaserLibrary() {
  const { addToast } = useToast();
  const { isVolunteerMode } = useVolunteer();
  const [rows, setRows] = useState<LibraryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Unsaved work: changed cells per row, new rows, rows marked for deletion,
  // and per-row errors from the last Save.
  const [edits, setEdits] = useState<Record<number, RowText>>({});
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [deleted, setDeleted] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(1);

  const load = () => laserApi.library()
    .then(d => { setRows(d.rows); setError(null); })
    .catch(e => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => { load(); }, []);

  const original = useMemo(() => new Map((rows ?? []).map(r => [r.partId, toText(r)])), [rows]);
  const changedIds = useMemo(() => Object.keys(edits).map(Number).filter(id => {
    const o = original.get(id);
    return o && TEXT_KEYS.some(k => edits[id][k] !== o[k]);
  }), [edits, original]);
  const pendingNew = newRows.filter(n => TEXT_KEYS.some(k => k !== 'group' && n.text[k] !== EMPTY_TEXT[k]));
  const pendingCount = changedIds.filter(id => !deleted.has(id)).length + pendingNew.length + deleted.size;

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!pendingCount) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);

  const groups = useMemo(() => [...new Set((rows ?? []).map(r => r.group || 'Other'))], [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(r =>
      (!group || (r.group || 'Other') === group) &&
      (!q || `${r.material} ${r.materialNl} ${r.comment}`.toLowerCase().includes(q)));
  }, [rows, group, query]);

  // Rows of one material sit together; for visitors only the first shows the name.
  const firstOfMaterial = (i: number) => i === 0 || shown[i - 1].material !== shown[i].material;

  const addRow = () =>
    setNewRows(prev => [...prev, { key: nextKey.current++, text: { ...EMPTY_TEXT, group: group && group !== 'Other' ? group : '' } }]);

  const discard = () => {
    setEdits({}); setNewRows([]); setDeleted(new Set()); setRowErrors({});
  };

  const save = async () => {
    // Check everything first: nothing is written while one row is wrong.
    const errors: Record<string, string> = {};
    const updates: { id: number; draft: LibraryDraft }[] = [];
    const creates: { key: number; draft: LibraryDraft }[] = [];
    for (const id of changedIds) {
      if (deleted.has(id)) continue;
      const d = toDraft(edits[id]);
      if ('error' in d) errors[`r${id}`] = d.error; else updates.push({ id, draft: d });
    }
    for (const n of pendingNew) {
      const d = toDraft(n.text);
      if ('error' in d) errors[`n${n.key}`] = d.error; else creates.push({ key: n.key, draft: d });
    }
    setRowErrors(errors);
    if (Object.keys(errors).length) {
      addToast(`${Object.keys(errors).length} row(s) are not right yet; nothing was saved.`, 'error');
      return;
    }

    setSaving(true);
    const failed: Record<string, string> = {};
    const done = { updates: new Set<number>(), creates: new Set<number>(), deletes: new Set<number>() };
    const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
    for (const u of updates) {
      try { await laserApi.saveLibraryRow(u.id, u.draft); done.updates.add(u.id); } catch (e) { failed[`r${u.id}`] = msg(e); }
    }
    for (const c of creates) {
      try { await laserApi.saveLibraryRow(null, c.draft); done.creates.add(c.key); } catch (e) { failed[`n${c.key}`] = msg(e); }
    }
    for (const id of deleted) {
      try { await laserApi.deleteLibraryRow(id); done.deletes.add(id); } catch (e) { failed[`r${id}`] = msg(e); }
    }
    setSaving(false);

    // Keep only what did not go through, so it can be fixed and saved again.
    setEdits(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !done.updates.has(Number(id)))));
    setNewRows(prev => prev.filter(n => !done.creates.has(n.key)));
    setDeleted(prev => new Set([...prev].filter(id => !done.deletes.has(id))));
    setRowErrors(failed);
    await load();

    const ok = done.updates.size + done.creates.size + done.deletes.size;
    if (Object.keys(failed).length) addToast(`${ok} saved, ${Object.keys(failed).length} failed: see the rows in red.`, 'error');
    else addToast(`${ok} change${ok === 1 ? '' : 's'} saved to the library.`, 'success');
  };

  return (
    <section className="p-4 sm:p-6 space-y-4 border-t border-lijn lg:col-span-2">
      <div className="border-b border-lijn pb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-brand-black flex items-center gap-2"><BookOpen size={18} /> Material library</h2>
        {isVolunteerMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={discard}
              disabled={!pendingCount || saving}
              className="brutalist-button px-3 h-10 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              <Undo2 size={14} /> Discard changes
            </button>
            <button
              onClick={save}
              disabled={!pendingCount || saving}
              className="brutalist-button btn-primary px-3 h-10 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes{pendingCount ? ` (${pendingCount})` : ''}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-grafiet">
        Speed (mm/s) / power (%). A second power is the minimum, e.g. <span className="font-mono">100/50-10</span>:
        the laser drops to 10 % where it slows down in corners. <span className="font-mono">×2</span> = two passes.
        {isVolunteerMode && ' Click a cell to change it; nothing is stored until Save changes.'}
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
                  {isVolunteerMode && <th className="px-2 py-2 w-12" />}
                </tr>
              </thead>
              <tbody>
                {isVolunteerMode ? (
                  <>
                    {shown.map(r => {
                      const orig = original.get(r.partId)!;
                      return (
                        <EditableRow
                          key={r.partId}
                          text={edits[r.partId] ?? orig}
                          original={orig}
                          isDeleted={deleted.has(r.partId)}
                          error={rowErrors[`r${r.partId}`]}
                          onChange={t => setEdits(prev => ({ ...prev, [r.partId]: t }))}
                          onRevert={() => setEdits(prev => { const n = { ...prev }; delete n[r.partId]; return n; })}
                          onToggleDelete={() => setDeleted(prev => {
                            const n = new Set(prev);
                            if (n.has(r.partId)) n.delete(r.partId); else n.add(r.partId);
                            return n;
                          })}
                        />
                      );
                    })}
                    {newRows.map(n => (
                      <EditableRow
                        key={`new-${n.key}`}
                        text={n.text}
                        original={null}
                        autoFocus
                        error={rowErrors[`n${n.key}`]}
                        onChange={t => setNewRows(prev => prev.map(x => x.key === n.key ? { ...x, text: t } : x))}
                        onRevert={() => setNewRows(prev => prev.filter(x => x.key !== n.key))}
                        onToggleDelete={() => setNewRows(prev => prev.filter(x => x.key !== n.key))}
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

const cell = 'w-full min-w-0 bg-transparent border border-transparent hover:border-lijn focus:border-brand-black focus:bg-white px-1.5 py-1 outline-none';

/** One library row as fields. Changed cells get a yellow edge until saved or discarded. */
function EditableRow({ text, original, isDeleted, error, autoFocus, onChange, onRevert, onToggleDelete }: {
  text: RowText;
  /** null for a new row. */
  original: RowText | null;
  isDeleted?: boolean;
  error?: string;
  autoFocus?: boolean;
  onChange: (t: RowText) => void;
  onRevert: () => void;
  onToggleDelete: () => void;
}) {
  const isNew = original === null;

  const field = (key: keyof RowText, props: { mono?: boolean; placeholder?: string; list?: string; right?: boolean; bold?: boolean } = {}) => {
    const changed = !isNew && text[key] !== original[key];
    return (
      <input
        value={text[key]}
        list={props.list}
        placeholder={isNew ? props.placeholder : undefined}
        autoFocus={autoFocus && key === 'material'}
        disabled={isDeleted}
        aria-label={key}
        onChange={e => onChange({ ...text, [key]: e.target.value })}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') onRevert();
        }}
        className={cn(cell, props.mono && 'font-mono', props.right && 'text-right', props.bold && 'font-semibold',
          changed && 'border-amber-500 bg-amber-50', isDeleted && 'line-through text-grafiet')}
      />
    );
  };

  const rowBg = error ? 'bg-red-50' : isDeleted ? 'bg-brand-beige-dark' : isNew ? 'bg-emerald-50' : 'bg-white';

  return (
    <>
      <tr className={cn('border-t border-lijn-zacht align-top', rowBg)}>
        <td className={cn('px-1.5 py-1 sticky left-0 min-w-44', rowBg)}>
          {field('material', { bold: true, placeholder: 'Material (English)' })}
          <div className="text-[11px] text-grafiet">{field('materialNl', { placeholder: 'Dutch name' })}</div>
          {isNew && <span className="text-[10px] font-semibold text-emerald-700 px-1.5">new</span>}
        </td>
        <td className="px-1.5 py-1 min-w-28">{field('group', { list: 'laser-groups', placeholder: 'Group' })}</td>
        <td className="px-1.5 py-1 w-20">{field('thickness', { mono: true, right: true, placeholder: 'mm' })}</td>
        <td className="px-1.5 py-1 min-w-32">{field('cut', { mono: true, placeholder: 'speed/power' })}</td>
        <td className="px-1.5 py-1 min-w-32">{field('line', { mono: true })}</td>
        <td className="px-1.5 py-1 min-w-28">{field('fill', { mono: true })}</td>
        <td className="px-1.5 py-1 min-w-48 text-xs">{field('comment')}</td>
        <td className="px-2 py-1 text-right whitespace-nowrap">
          <button
            onClick={onToggleDelete}
            className={cn('p-1.5 hover:text-red-600', isDeleted ? 'text-red-600' : 'text-grafiet')}
            aria-label={isDeleted ? 'Keep row' : 'Delete row'}
            title={isDeleted ? 'Keep this row' : 'Delete this row (on Save changes)'}
          >
            {isDeleted ? <Undo2 size={14} /> : <Trash2 size={14} />}
          </button>
        </td>
      </tr>
      {(error || isDeleted) && (
        <tr className={rowBg}>
          <td colSpan={8} className={cn('px-3 pb-1.5 text-xs font-semibold', error ? 'text-red-700' : 'text-grafiet')}>
            {error ? `${error} — not saved.` : 'Will be deleted on Save changes.'}
          </td>
        </tr>
      )}
    </>
  );
}
