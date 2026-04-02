import { useState, useCallback } from 'react';
import { Scan, Plus, Minus, Trash2, RefreshCw, Loader2, Box, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import BarcodeScanner from './BarcodeScanner';
import { handleSend, handleAddItem, handleTakeItem, handleSetItem, type ItemData } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useStock } from './StockContext';
import StockConfirmationModal from './components/StockConfirmationModal';

interface AdjustmentItem extends ItemData {
  delta: number;
  targetQty?: number;
}

type AdjustMode = 'add' | 'set';

export default function VolunteerScanView() {
  const [adjustments, setAdjustments] = useState<AdjustmentItem[]>([]);
  const [mode, setMode] = useState<AdjustMode>('add');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  const { addToast } = useToast();
  const { refreshInventory } = useStock();

  const handleItemScanned = useCallback(async (barcode: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const item = await handleSend(barcode);
      if (!item) {
        addToast(`No item found for: ${barcode}`, 'warning');
        setIsProcessing(false);
        return;
      }

      setLastScanned(item.name);

      setAdjustments(prev => {
        const existing = prev.find(a => a.id === item.id);
        if (existing) {
          if (mode === 'add') {
            return prev.map(a =>
              a.id === item.id ? { ...a, delta: a.delta + 1 } : a
            );
          }
          return prev;
        }
        return [...prev, {
          ...item,
          delta: mode === 'add' ? 1 : 0,
          targetQty: mode === 'set' ? item.quantity : undefined,
        }];
      });
    } catch (error) {
      addToast('Error looking up barcode', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [mode, isProcessing, addToast]);

  const updateDelta = (id: number, newDelta: number) => {
    setAdjustments(prev =>
      prev.map(a => a.id === id ? { ...a, delta: newDelta } : a)
    );
  };

  const updateTargetQty = (id: number, qty: number) => {
    setAdjustments(prev =>
      prev.map(a => a.id === id ? { ...a, targetQty: Math.max(0, qty) } : a)
    );
  };

  const removeAdjustment = (id: number) => {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  };

  const handleCommit = async () => {
    if (adjustments.length === 0) return;
    setIsCommitting(true);

    try {
      for (const adj of adjustments) {
        let success = false;
        if (mode === 'set' && adj.targetQty !== undefined) {
          success = await handleSetItem(adj.id, adj.targetQty);
        } else if (adj.delta > 0) {
          success = await handleAddItem(adj.id, adj.delta);
        } else if (adj.delta < 0) {
          success = await handleTakeItem(adj.id, Math.abs(adj.delta));
        } else {
          success = true;
        }

        if (!success) {
          addToast(`Failed to update "${adj.name}". Remaining items not processed.`, 'error');
          setIsCommitting(false);
          setIsConfirmOpen(false);
          return;
        }
      }

      addToast('All stock adjustments saved successfully!', 'success');
      setAdjustments([]);
      setLastScanned(null);
      setIsConfirmOpen(false);
      
      // Refresh global cache
      await refreshInventory();
      
    } catch (error) {
      addToast('Unexpected error during stock update', 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-brand-beige">
      {/* Main: Scanner Area */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center space-y-8 overflow-auto">
        <div className="w-full max-w-xl space-y-8">
          <div className="text-center space-y-2 border-2 border-brand-black bg-brand-beige-dark p-6">
            <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-widest flex items-center justify-center gap-4 text-brand-black">
              <Scan size={32} className="sm:w-10 sm:h-10" /> STOCK SCAN
            </h2>
            <p className="text-sm font-bold opacity-60 uppercase tracking-widest">
              SCAN ITEMS TO ADJUST STOCK
            </p>
          </div>

          <div className="border-2 border-brand-black bg-white p-8 space-y-8 shadow-[8px_8px_0px_0px_rgba(30,27,24,1)]">
            <BarcodeScanner onScan={handleItemScanned} compact />

            <div className="flex gap-4">
              <div className="flex-1 p-4 border-2 border-brand-black bg-brand-beige font-mono">
                <div className="text-[10px] uppercase font-black opacity-50 mb-1 tracking-widest">LAST SCANNED</div>
                <div className={cn("text-lg font-black truncate uppercase", lastScanned ? "text-amber-600" : "opacity-20 text-brand-black")}>
                  {lastScanned || "WAITING..."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Right Sidebar: Adjustments */}
      <aside className="w-full lg:w-96 border-l-0 lg:border-l-2 border-t-2 lg:border-t-0 border-brand-black bg-white flex flex-col">
        <div className="p-6 border-b-2 border-brand-black bg-brand-beige-dark">
          <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-3">
            <RefreshCw size={24} /> ADJUSTMENTS
          </h2>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 py-4 border-b-2 border-brand-black bg-brand-beige">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMode('add')}
              className={cn(
                "brutalist-button py-3 text-xs sm:text-sm font-black uppercase transition-colors tracking-widest",
                mode === 'add' ? "bg-brand-black text-white" : "bg-white text-brand-black hover:bg-brand-beige-dark"
              )}
            >
              ADD / REMOVE
            </button>
            <button
              onClick={() => setMode('set')}
              className={cn(
                "brutalist-button py-3 text-xs sm:text-sm font-black uppercase transition-colors tracking-widest",
                mode === 'set' ? "bg-brand-black text-white" : "bg-white text-brand-black hover:bg-brand-beige-dark"
              )}
            >
              SET ABSOLUTE
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-brand-beige p-5 space-y-4">
          <AnimatePresence mode="popLayout">
            {adjustments.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30 text-brand-black"
              >
                <Scan size={48} className="mb-4" />
                <p className="font-black uppercase tracking-widest text-sm">NO ITEMS SCANNED.</p>
                <p className="text-[10px] uppercase font-bold mt-2">SCAN OR SELECT AN ITEM TO START ADJUSTING STOCK.</p>
              </motion.div>
            ) : (
              adjustments.map(item => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  className="border-2 border-brand-black bg-white p-3 flex gap-3 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]"
                >
                  <div className="w-12 h-12 border-2 border-brand-black bg-gray-100 flex-shrink-0 flex items-center justify-center">
                    {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                        <Box size={20} className="opacity-20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black truncate text-sm uppercase">{item.name}</div>
                    <div className="text-[10px] font-bold uppercase opacity-60 tracking-widest mt-1">CURRENT: {item.quantity}</div>
                    <div className="flex items-center gap-2 mt-2">
                      {mode === 'add' ? (
                        <>
                          <button
                            onClick={() => updateDelta(item.id, item.delta - 1)}
                            className="p-1 px-2 border-2 border-brand-black bg-rose-400 hover:brightness-95 transition-all shadow-[2px_2px_0px_0px_rgba(30,27,24,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                          >
                            <Minus size={14} className="text-brand-black" />
                          </button>
                          <span className={cn(
                            "font-bold text-sm w-12 text-center border-2 border-brand-black bg-white",
                            item.delta > 0 ? "text-emerald-700" : item.delta < 0 ? "text-rose-600" : "text-brand-black"
                          )}>
                            {item.delta > 0 ? `+${item.delta}` : item.delta}
                          </span>
                          <button
                            onClick={() => updateDelta(item.id, item.delta + 1)}
                            className="p-1 px-2 border-2 border-brand-black bg-emerald-400 hover:brightness-95 transition-all shadow-[2px_2px_0px_0px_rgba(30,27,24,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                          >
                            <Plus size={14} className="text-brand-black" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => updateTargetQty(item.id, (item.targetQty ?? item.quantity) - 1)}
                            disabled={(item.targetQty ?? item.quantity) <= 0}
                            className="p-1 px-2 border-2 border-brand-black bg-rose-400 hover:brightness-95 disabled:opacity-30 transition-all shadow-[2px_2px_0px_0px_rgba(30,27,24,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                          >
                            <Minus size={14} className="text-brand-black" />
                          </button>
                          <span className="font-bold text-sm w-12 text-center border-2 border-brand-black bg-white text-orange-600">
                            {item.targetQty ?? item.quantity}
                          </span>
                          <button
                            onClick={() => updateTargetQty(item.id, (item.targetQty ?? item.quantity) + 1)}
                            className="p-1 px-2 border-2 border-brand-black bg-emerald-400 hover:brightness-95 transition-all shadow-[2px_2px_0px_0px_rgba(30,27,24,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                          >
                            <Plus size={14} className="text-brand-black" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col justify-start items-end">
                    <button
                      onClick={() => removeAdjustment(item.id)}
                      className="text-brand-black hover:text-red-600 hover:bg-brand-beige p-1.5 border-2 border-brand-black transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 border-t-2 border-brand-black bg-white space-y-4">
          <button
            disabled={adjustments.length === 0 || isCommitting}
            onClick={() => setIsConfirmOpen(true)}
            className={cn(
              "brutalist-button w-full py-4 bg-emerald-400 text-brand-black text-base font-black disabled:opacity-50 flex items-center justify-center gap-3 tracking-widest",
              isCommitting ? "opacity-75 cursor-not-allowed hover:bg-emerald-400" : "hover:brightness-95"
            )}
          >
            {isCommitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                SAVING...
              </>
            ) : (
              <>
                <CheckCircle size={20} />
                SAVE CHANGES
              </>
            )}
          </button>
        </div>
      </aside>

      <StockConfirmationModal
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleCommit}
        isCommitting={isCommitting}
        adjustments={adjustments.map(a => ({
          id: a.id,
          name: a.name,
          delta: a.delta,
          currentQty: a.quantity,
          targetQty: a.targetQty
        }))}
      />
    </div>
  );
}
