import { FolderPlus, FolderInput, Undo2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { type LaserProject } from '../../lib/laserApi';
import { type DropTarget, type CutDrag } from './useCutDrag';

/** Slides in on the right while a cut is dragged: one box per place it can go, so you drag to the right. */
export function DropTray({ drag, projects }: { drag: CutDrag; projects: LaserProject[] }) {
  const from = drag.cut.project_id && projects.some(p => p.id === drag.cut.project_id) ? drag.cut.project_id : null;
  const box = (id: DropTarget, label: string, icon: React.ReactNode) => (
    <li key={id} data-drop={id} title={label}
      className={cn('w-24 aspect-square px-1.5 border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-xs leading-tight font-semibold text-center transition-[colors,scale]',
        drag.over === id ? 'border-solid border-laser bg-laser-licht scale-110' : 'border-grafiet bg-white')}>
      {icon}<span className="w-full line-clamp-2 break-words">{label}</span>
    </li>
  );
  return (
    // A dock on the right edge, only as tall as its boxes: drag the cut to the right onto a folder. Above the dragged card (z 60).
    <div data-tray className="fixed right-0 top-1/2 -translate-y-1/2 z-[70] max-h-[85dvh] overflow-y-auto rounded-l-2xl bg-brand-black p-2.5 shadow-[-4px_0_16px_rgba(0,0,0,0.3)]">
      <ul className="flex flex-col gap-2.5">
        {projects.filter(p => p.id !== from).map(p => box(p.id, p.name, <FolderInput size={26} className="shrink-0" aria-hidden />))}
        {from && box('new', 'New cuts', <Undo2 size={26} className="shrink-0" aria-hidden />)}
        {box('newproject', 'New project', <FolderPlus size={26} className="shrink-0" aria-hidden />)}
      </ul>
    </div>
  );
}
