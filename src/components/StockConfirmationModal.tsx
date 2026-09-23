import { X, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

export interface StockAdjustment {
  id: number;
  name: string;
  delta: number;
  currentQty?: number;
  targetQty?: number;
}

interface StockConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  adjustments: StockAdjustment[];
  title?: string;
  isCommitting?: boolean;
}

export default function StockConfirmationModal({
  open,
  onClose,
  onConfirm,
  adjustments,
  title = "Confirm changes",
  isCommitting = false
}: StockConfirmationModalProps) {
  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 bg-brand-black/50 z-[100] flex items-center justify-center p-4 transition-all"
      onClick={onClose}
    >
      <div 
        className="border border-lijn bg-brand-beige w-full max-w-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-brand-beige-dark text-brand-black p-5 flex items-center justify-between border-b border-lijn">
          <div className="flex items-center gap-3">
            <AlertCircle size={24} className="text-emerald-400" />
            <h3 className="font-semibold text-lg">{title}</h3>
          </div>
          <button onClick={onClose} className="hover:rotate-90 transition-transform">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-8 bg-white overflow-y-auto max-h-[60vh] space-y-6">
          <p className="text-xs font-semibold text-brand-black/50 border-b border-lijn pb-2">
            Review pending adjustments
          </p>
          
          <div className="space-y-3">
            {adjustments.map((adj) => (
              <div 
                key={adj.id} 
                className="flex items-center gap-4 p-4 border border-lijn bg-brand-beige/20"
              >
                {/* Visual Indicator of Change */}
                <div className={cn(
                  "w-16 h-16 flex flex-col items-center justify-center border border-lijn font-semibold",
                  adj.delta > 0 ? "bg-emerald-400" : adj.delta < 0 ? "bg-rose-400" : "bg-brand-beige"
                )}>
                  <span className="text-xs leading-none mb-1">
                    {adj.delta > 0 ? "Add" : adj.delta < 0 ? "Remove" : "Set"}
                  </span>
                  <span className="text-xl">
                    {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-lg truncate leading-tight mb-1">{adj.name}</h4>
                  <div className="flex items-center gap-3 text-sm font-bold text-brand-black/60">
                    <span className="bg-brand-beige-dark border border-lijn text-brand-black px-2 py-0.5">{adj.currentQty ?? '?'}</span>
                    <ArrowRight size={16} />
                    <span className="bg-brand-beige-dark border border-lijn text-brand-black px-2 py-0.5">
                      {adj.targetQty !== undefined ? adj.targetQty : (adj.currentQty !== undefined ? adj.currentQty + adj.delta : '?')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-lijn p-6 flex flex-col sm:flex-row gap-4 bg-brand-beige">
          <button
            onClick={onClose}
            className="flex-1 brutalist-button py-4 bg-white text-brand-black flex items-center justify-center gap-3 text-sm font-semibold"
          >
            <X size={20} /> Discard
          </button>
          <button
            onClick={onConfirm}
            disabled={isCommitting}
            className={cn(
              "flex-1 brutalist-button py-4 bg-emerald-400 text-brand-black flex items-center justify-center gap-3 text-sm font-semibold transition-all",
              isCommitting ? "opacity-50 cursor-not-allowed" : "hover:brightness-95"
            )}
          >
            {isCommitting ? (
              <span className="flex items-center gap-2">Process...</span>
            ) : (
              <>
                <Check size={20} /> Commit changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
