import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ModalFrameProps {
  /** Called on a tap on the dimmed background; leave out to ignore those taps. */
  onClose?: () => void;
  /** Width of the panel from sm up, e.g. max-w-md. */
  maxWidth?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Background and panel for a form dialog. On a phone the panel fills the
 * screen and scrolls; from sm up it is a centred box of maxWidth.
 */
export default function ModalFrame({ onClose, maxWidth = 'max-w-md', className, children }: ModalFrameProps) {
  return (
    <div className="fixed inset-0 z-50 bg-brand-black/50 flex sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        className={cn(
          'bg-white w-full h-dvh sm:h-auto sm:max-h-[90dvh] overflow-y-auto overscroll-contain sm:border border-lijn',
          maxWidth,
          className,
        )}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
