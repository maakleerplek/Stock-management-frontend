import { useState } from 'react';
import { ShoppingCart, Folder, FolderX, Pencil, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { laserApi, shortDuration, type LaserSession, type LaserProject } from '../../lib/laserApi';
import { CUT_GRID, payPrice, laserSessionPrice, useLaserRate, cutCount } from './shared';
import { CutRow } from './CutRow';
import { ProjectNameForm } from './ProjectMenu';

/** One project: its cuts (each with an × to give it back), the total and its own Pay. */
export function ProjectBlock({ project, cuts, busy, run, onCheckout, dragProps, dropActive }: {
  project: LaserProject; cuts: LaserSession[]; busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>; onCheckout: (ids: string[]) => void;
  dragProps: (s: LaserSession) => React.ComponentProps<typeof CutRow>['drag']; dropActive: boolean;
}) {
  const rate = useLaserRate();
  const [renaming, setRenaming] = useState(false);
  const [open, setOpen] = useState(false);   // a closed project is one row; tap it for its cuts
  const seconds = cuts.reduce((t, s) => t + s.total_time, 0);
  const price = payPrice(cuts, rate);
  const atMinimum = laserSessionPrice(Math.ceil(seconds / 60), rate) < rate.minimum;
  return (
    <section data-drop={project.id} className={cn('border-2 border-brand-black', dropActive ? 'bg-laser-licht' : 'bg-white')} aria-label={`Project ${project.name}`}>
      <div className={cn('flex items-center gap-2 px-3 py-2 bg-brand-beige-dark', open && 'border-b border-lijn')}>
        {renaming
          ? <div className="flex-1"><ProjectNameForm initial={project.name} label="Save" busy={busy} onCancel={() => setRenaming(false)}
              onSave={name => { void run(() => laserApi.renameProject(project.id, name)); setRenaming(false); }} /></div>
          : (<>
            <button className="flex-1 min-w-0 flex items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpen(o => !o)}>
              <Folder size={18} className="shrink-0" aria-hidden />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm truncate">{project.name}</span>
                <span className="block text-xs text-grafiet">{cutCount(cuts.length)} · {shortDuration(seconds)} · €{price.toFixed(2)}</span>
              </span>
              <ChevronRight size={18} className={cn('shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
            </button>
            {open && (
              <button className="w-8 h-8 shrink-0 flex items-center justify-center" aria-label="Rename project" title="Rename" onClick={() => setRenaming(true)}>
                <Pencil size={15} aria-hidden />
              </button>
            )}
          </>)}
      </div>
      {open && <div className="p-2 space-y-2">
        {cuts.length > 0
          ? (
            <ul className={CUT_GRID}>
              {cuts.map(s => (
                <CutRow key={s.id} cut={s} ticked={false} busy={busy} onToggle={() => {}}
                  onTakeOut={() => run(() => laserApi.setCheckout(s.id, false))}
                  onUngroup={s.checkout_at ? undefined : () => run(() => laserApi.setProject(s.id, null))} drag={dragProps(s)} />
              ))}
            </ul>
          )
          : <p className="border border-dashed border-lijn p-3 text-center text-sm text-grafiet">No cuts yet</p>}
        <div className="flex gap-2">
          <button className="flex-1 brutalist-button h-12 bg-emerald-400 text-brand-black font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            disabled={busy || !cuts.some(s => !s.checkout_at)} onClick={() => onCheckout(cuts.filter(s => !s.checkout_at).map(s => s.id))}>
            <ShoppingCart size={16} aria-hidden /> Pay €{price.toFixed(2)}{atMinimum && cuts.length > 0 && <span className="text-xs font-normal">(minimum)</span>}
          </button>
          {/* Removes only the folder: the cuts go back to New cuts, nothing is deleted. */}
          <button className="brutalist-button h-12 w-12 p-0! shrink-0 bg-white text-red-600 hover:bg-red-50 flex items-center justify-center disabled:opacity-40" disabled={busy}
            aria-label={`Remove the project ${project.name}; its cuts go back to New cuts`} title="Remove the project (its cuts go back to New cuts)"
            onClick={() => run(() => laserApi.deleteProject(project.id))}>
            <FolderX size={22} aria-hidden />
          </button>
        </div>
      </div>}
    </section>
  );
}
