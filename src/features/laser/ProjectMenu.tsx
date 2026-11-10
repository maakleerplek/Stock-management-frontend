import { useState } from 'react';
import { X, Check, Folder, FolderPlus } from 'lucide-react';
import { type LaserProject } from '../../lib/laserApi';

/** Above the projects: a button to start a new one, then its name. */
export function NewProject({ busy, onCreate }: { busy: boolean; onCreate: (name: string) => void }) {
  const [naming, setNaming] = useState(false);
  if (naming) return <ProjectNameForm label="Start" busy={busy} onCancel={() => setNaming(false)} onSave={name => { onCreate(name); setNaming(false); }} />;
  return (
    <div className="flex">
      <button className="brutalist-button h-10 px-3 bg-white text-sm font-semibold flex items-center gap-2" onClick={() => setNaming(true)}>
        <FolderPlus size={16} className="shrink-0" aria-hidden /> New project
      </button>
    </div>
  );
}

/** Name field for a new project, as a small inline form. */
export function ProjectNameForm({ initial = '', label, busy, onSave, onCancel }: {
  initial?: string; label: string; busy: boolean; onSave: (name: string) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length >= 2;
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (ok) onSave(name.trim()); }}>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80}
        placeholder="Your name + what you make, e.g. Jan – lamp" aria-label="Project name"
        className="flex-1 min-w-0 h-10 px-2 border-2 border-brand-black bg-white text-sm" />
      {/* Green tick = save, red × = cancel: colour and icon say it without words. */}
      <button type="submit" disabled={!ok || busy} aria-label={label} title={label} className="brutalist-button h-10 w-10 p-0! shrink-0 bg-emerald-400 flex items-center justify-center disabled:opacity-40"><Check size={22} strokeWidth={3} aria-hidden /></button>
      <button type="button" onClick={onCancel} aria-label="Cancel" title="Cancel" className="brutalist-button h-10 w-10 p-0! shrink-0 bg-white text-red-600 hover:bg-red-50 flex items-center justify-center"><X size={22} strokeWidth={3} aria-hidden /></button>
    </form>
  );
}

/** The bottom bar's "Add to project" choices: the open projects, or a new one. */
export function ProjectMenu({ projects, busy, startNaming = false, onPick, onCreate, onCancel }: {
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
