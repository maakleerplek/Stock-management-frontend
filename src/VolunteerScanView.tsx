import { useState, useCallback } from 'react';
import { Scan, Plus, Minus, Trash2, RefreshCw, Loader2, Box, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import BarcodeScanner from './BarcodeScanner';
import { handleSend, handleAddItem, handleRemoveItem, handleSetItem, type ItemData } from './sendCodeHandler';
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
    } catch {
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
          success = await handleRemoveItem(adj.id, Math.abs(adj.delta));
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
      addToast(error instanceof Error ? error.message : 'Unexpected error during stock update', 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-brand-beige">
      {/* Main: Scanner Area */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center space-y-8 overflow-auto">
        <div className="w-full max-w-xl space-y-8">
          <div className="text-center space-y-2 border border-lijn bg-brand-beige-dark p-6">
            <h2 className="text-2xl sm:text-4xl font-semibold flex items-center justify-center gap-4 text-brand-black">
              <Scan size={32} className="sm:w-10 sm:h-10" /> Stock scan
            </h2>
            <p className="text-sm font-bold opacity-60">
              Scan items to adjust stock
            </p>
          </div>

          <div className="border border-lijn bg-white p-8 space-y-8">
            <BarcodeScanner onScan={handleItemScanned} compact />

            <div className="flex gap-4">
              <div className="flex-1 p-4 border border-lijn bg-brand-beige font-mono">
                <div className="text-[10px] font-semibold opacity-50 mb-1">Last scanned</div>
                <div className={cn("text-lg font-semibold truncate", lastScanned ? "text-amber-600" : "opacity-20 text-brand-black")}>
                  {lastScanned || "Waiting..."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Right Sidebar: Adjustments */}
      <aside className="w-full lg:w-96 border-l-0 lg:border-l-2 border-t-2 lg:border-t-0 border-lijn bg-white flex flex-col">
        <div className="p-6 border-b-2 border-lijn bg-brand-beige-dark">
          <h2 className="text-lg font-semibold flex items-center gap-3">
            <RefreshCw size={24} /> Adjustments
          </h2>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 py-4 border-b-2 border-lijn bg-brand-beige">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMode('add')}
              className={cn(
                "brutalist-button py-3 text-xs sm:text-sm font-semibold transition-colors",
                mode === 'add' ? "bg-[linear-gradient(110deg,#e11d48_calc(50%-1.5px),#2c1e16_calc(50%-1.5px),#2c1e16_calc(50%+1.5px),#059669_calc(50%+1.5px))] text-white" : "bg-white text-brand-black hover:bg-brand-beige-dark"
              )}
            >
              Add / remove
            </button>
            <button
              onClick={() => setMode('set')}
              className={cn(
                "brutalist-button py-3 text-xs sm:text-sm font-semibold transition-colors",
                mode === 'set' ? "bg-blue-600 text-white" : "bg-white text-brand-black hover:bg-brand-beige-dark"
              )}
            >
              Set absolute
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
                <p className="font-semibold text-sm">No items scanned.</p>
                <p className="text-[10px] font-bold mt-2">Scan or select an item to start adjusting stock.</p>
              </motion.div>
            ) : (
              adjustments.map(item => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  className="border border-lijn bg-white p-3 flex gap-3"
                >
                  <div className="w-12 h-12 border border-lijn bg-gray-100 flex-shrink-0 flex items-center justify-center">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Box size={20} className="opacity-20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-sm">{item.name}</div>
                    <div className="text-[10px] font-bold opacity-60 mt-1">Current: {item.quantity}</div>
                    <div className="flex items-center gap-2 mt-2">
                      {mode === 'add' ? (
                        <>
                          <button
                            onClick={() => updateDelta(item.id, item.delta - 1)}
                            className="p-1 px-2 border border-lijn bg-rose-400 hover:brightness-95 transition-all"
                          >
                            <Minus size={14} className="text-brand-black" />
                          </button>
                          <span className={cn(
                            "font-bold text-sm w-12 text-center border border-lijn bg-white",
                            item.delta > 0 ? "text-emerald-700" : item.delta < 0 ? "text-rose-600" : "text-brand-black"
                          )}>
                            {item.delta > 0 ? `+${item.delta}` : item.delta}
                          </span>
                          <button
                            onClick={() => updateDelta(item.id, item.delta + 1)}
                            className="p-1 px-2 border border-lijn bg-emerald-400 hover:brightness-95 transition-all"
                          >
                            <Plus size={14} className="text-brand-black" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => updateTargetQty(item.id, (item.targetQty ?? item.quantity) - 1)}
                            disabled={(item.targetQty ?? item.quantity) <= 0}
                            className="p-1 px-2 border border-lijn bg-rose-400 hover:brightness-95 disabled:opacity-30 transition-all"
                          >
                            <Minus size={14} className="text-brand-black" />
                          </button>
                          <span className="font-bold text-sm w-12 text-center border border-lijn bg-white text-orange-600">
                            {item.targetQty ?? item.quantity}
                          </span>
                          <button
                            onClick={() => updateTargetQty(item.id, (item.targetQty ?? item.quantity) + 1)}
                            className="p-1 px-2 border border-lijn bg-emerald-400 hover:brightness-95 transition-all"
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
                      className="text-brand-black hover:text-red-600 hover:bg-brand-beige p-1.5 border border-lijn transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 border-t-2 border-lijn bg-white space-y-4">
          <button
            disabled={adjustments.length === 0 || isCommitting}
            onClick={() => setIsConfirmOpen(true)}
            className={cn(
              "brutalist-button w-full py-4 bg-emerald-400 text-brand-black text-base font-semibold disabled:opacity-50 flex items-center justify-center gap-3",
              isCommitting ? "opacity-75 cursor-not-allowed hover:bg-emerald-400" : "hover:brightness-95"
            )}
          >
            {isCommitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle size={20} />
                Save changes
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
