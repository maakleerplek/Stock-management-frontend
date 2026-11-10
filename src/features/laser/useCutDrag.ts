import { useEffect, useRef, useState } from 'react';
import { type LaserSession } from '../../lib/laserApi';

/** Where a dragged cut can go: a project, back to the new cuts, or a project still to be named. */
export type DropTarget = string | 'new' | 'newproject';
export interface CutDrag { cut: LaserSession; x: number; y: number; over: DropTarget | null }

/** Long-press (touch) or drag (mouse) a cut card to move it into a project.
 *  Drop zones carry data-drop; the card's click after a drag is swallowed so it does not tick. */
export function useCutDrag(onDrop: (cut: LaserSession, target: DropTarget) => void) {
  const [drag, setDrag] = useState<CutDrag | null>(null);
  const dragRef = useRef<CutDrag | null>(null);
  dragRef.current = drag;
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  // While dragging, a finger must not scroll the page (needs a non-passive listener).
  useEffect(() => {
    const stop = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    document.addEventListener('touchmove', stop, { passive: false });
    return () => document.removeEventListener('touchmove', stop);
  }, []);

  const start = (cut: LaserSession, e: React.PointerEvent, group: string[] = [cut.id]) => {
    const count = group.length;
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    const touch = e.pointerType !== 'mouse';
    const card = e.currentTarget as HTMLElement;
    let active = false;
    // The card itself follows the finger: a copy at full size, held where it was grabbed.
    let ghost: HTMLElement | null = null;
    // The other ticked cards: copies that fly in behind the one in hand, like a fanned stack.
    const stack: HTMLElement[] = [];
    let grabX = 0, grabY = 0;
    const place = (x: number, y: number) => {
      if (ghost) ghost.style.translate = `${x - grabX}px ${y - grabY}px`;
      stack.forEach((el, i) => { el.style.translate = `${x - grabX + (i + 1) * 6}px ${y - grabY + (i + 1) * 4}px`; });
    };
    const begin = (x: number, y: number) => {
      active = true;
      navigator.vibrate?.(15);
      const r = card.getBoundingClientRect();
      grabX = x0 - r.left;
      grabY = y0 - r.top;
      ghost = card.cloneNode(true) as HTMLElement;
      Object.assign(ghost.style, {
        position: 'fixed', left: '0', top: '0', width: `${r.width}px`, height: `${r.height}px`, margin: '0',
        zIndex: '60', pointerEvents: 'none', listStyle: 'none',
        // Only scale and shadow animate; translate follows the finger without lag.
        transformOrigin: `${grabX}px ${grabY}px`, scale: '1', boxShadow: '0 0 0 rgba(0,0,0,0)',
        transition: 'scale 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms ease-out',
      });
      if (count > 1) {
        // Several ticked cuts go along: a count on the card in hand.
        const badge = document.createElement('span');
        badge.textContent = String(count);
        Object.assign(badge.style, {
          position: 'absolute', top: '-10px', right: '-10px', minWidth: '28px', height: '28px', padding: '0 6px',
          background: '#171717', color: '#fff', font: '600 14px/28px system-ui, sans-serif', textAlign: 'center', zIndex: '1',
        });
        ghost.appendChild(badge);
      }
      // At most 3 behind it: enough to read as a stack.
      group.filter(id => id !== cut.id).slice(0, 3).forEach((id, i) => {
        const el = document.querySelector<HTMLElement>(`[data-cut="${id}"]`);
        if (!el) return;
        const er = el.getBoundingClientRect();
        const copy = el.cloneNode(true) as HTMLElement;
        Object.assign(copy.style, {
          position: 'fixed', left: '0', top: '0', width: `${r.width}px`, height: `${r.height}px`, margin: '0',
          zIndex: String(59 - i), pointerEvents: 'none', listStyle: 'none', opacity: '1',
          transformOrigin: `${grabX}px ${grabY}px`, translate: `${er.left}px ${er.top}px`, scale: '1', rotate: '0deg',
          boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
          // Slow on the way in, then a short lag that makes it trail the hand.
          transition: 'translate 260ms cubic-bezier(0.2, 0, 0, 1), scale 260ms cubic-bezier(0.2, 0, 0, 1), rotate 260ms cubic-bezier(0.2, 0, 0, 1)',
        });
        document.body.appendChild(copy);
        stack.push(copy);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          Object.assign(copy.style, { scale: '0.8', rotate: `${(i % 2 ? -1 : 1) * (3 + i * 2)}deg` });
          window.setTimeout(() => { copy.style.transition = 'translate 90ms ease-out'; }, 270);
        }));
      });
      document.body.appendChild(ghost);
      place(x, y);
      const g = ghost;
      requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(g.style, { scale: '0.8', boxShadow: '0 12px 28px rgba(0,0,0,0.3)' })));
      setDrag({ cut, x, y, over: null });
    };
    // Touch: hold still 350 ms. Mouse: just move 8 px with the button down.
    const timer = touch ? window.setTimeout(() => begin(x0, y0), 350) : undefined;
    const move = (ev: PointerEvent) => {
      const far = Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8;
      if (!active) {
        if (!far) return;
        if (touch) return cleanup();          // moved before the hold: it's a scroll
        begin(ev.clientX, ev.clientY);
      }
      place(ev.clientX, ev.clientY);
      // Near the tray it wins over the page; the cut's own place is no target.
      const zone = nearestTrayBox(ev.clientX, ev.clientY) ?? document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-drop]');
      const over = (zone?.dataset.drop as DropTarget | undefined) ?? null;
      const own = over === (cut.project_id ?? 'new');
      setDrag(d => d && { ...d, x: ev.clientX, y: ev.clientY, over: own ? null : over });
    };
    const up = () => {
      const d = dragRef.current;
      cleanup();
      if (!active) return;
      // The click that follows the release would tick or untick the card.
      window.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
      window.setTimeout(() => setDrag(null), 0);
      if (d?.over) dropRef.current(d.cut, d.over);
    };
    const cleanup = () => {
      ghost?.remove();
      stack.forEach(el => el.remove());
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const cancel = () => { cleanup(); setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  return { drag, start };
}

/** Near or on the drop tray, the closest box counts: less precise moving needed. */
export function nearestTrayBox(x: number, y: number): HTMLElement | null {
  const tray = document.querySelector('[data-tray]');
  if (!tray || x < tray.getBoundingClientRect().left - 80) return null;
  let best: HTMLElement | null = null, bestDist = Infinity;
  for (const el of tray.querySelectorAll<HTMLElement>('[data-drop]')) {
    const r = el.getBoundingClientRect();
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (d < bestDist) { best = el; bestDist = d; }
  }
  return best;
}
