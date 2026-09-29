import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Fixed at the bottom of the sheet, e.g. the Save button. */
  footer?: ReactNode;
}

/**
 * A panel that slides up from the bottom of the screen: menus, filters and
 * quick actions on a phone. A tap on the dimmed background or Escape closes it.
 */
export default function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-brand-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="bg-brand-beige border-t border-lijn max-h-[85dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-lijn shrink-0">
          <h2 className="text-base font-semibold text-brand-black">{title}</h2>
          <button onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-lijn p-4 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** One full-width row in a sheet menu. */
export function SheetItem({ icon: Icon, label, onClick, href }: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const className = 'w-full flex items-center gap-3 px-4 h-14 text-left text-base text-brand-black border-b border-lijn-zacht active:bg-brand-beige-dark';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
        <Icon size={20} className="shrink-0" /> {label}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={className}>
      <Icon size={20} className="shrink-0" /> {label}
    </button>
  );
}
