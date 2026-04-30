import { useState, useEffect, useCallback } from 'react';
import ShoppingCart, { type CartItem } from './ShoppingCart';
import Extras from './Extras';
import { type ItemData, type ScanEvent, handleTakeItem, handleAddItem, handleSetItem } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';
import { AlertCircle, Check, X, Settings } from 'lucide-react';
import { cn } from './lib/utils';

interface ShoppingWindowProps {
    scanEvent: ScanEvent | null;
    onCheckoutResultChange?: (result: { total: number; description: string } | null) => void;
}

const CART_STORAGE_KEY = 'stockManagerCartItems';

export default function ShoppingWindow({ scanEvent, onCheckoutResultChange }: ShoppingWindowProps) {
    const [cartItems, setCartItems] = useState<CartItem[]>(() => {
        try {
            const stored = localStorage.getItem(CART_STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Failed to parse cart items from local storage", e);
            return [];
        }
    });
    const [checkedOutResult, setCheckedOutResult] = useState<{ total: number; description: string } | null>(null);
    const [extraCosts, setExtraCosts] = useState<number>(0);
    const [isSetMode, setIsSetMode] = useState<boolean>(false);
    const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'cart' | 'extras'>('cart');
    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();

    const handleSetModeChange = useCallback((newMode: boolean) => {
        setIsSetMode(newMode);
        if (!newMode) {
            setCartItems((prevItems) => prevItems.filter(item => item.cartQuantity !== 0));
        }
    }, []);

    const setCheckedOut = useCallback((result: { total: number; description: string } | null) => {
        setCheckedOutResult(result);
        onCheckoutResultChange?.(result);
    }, [onCheckoutResultChange]);

    useEffect(() => {
        if (!isVolunteerMode) {
            setCartItems((prevItems) => prevItems.filter(item => item.cartQuantity > 0));
        }
    }, [isVolunteerMode]);

    useEffect(() => {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    }, [cartItems]);

    const handleAddItemToCart = useCallback((item: ItemData) => {
        setCheckedOut(null);
        setCartItems((prevItems) => {
            const existingItem = prevItems.find((i) => i.id === item.id);
            if (existingItem) {
                const newQuantity = Math.min(existingItem.cartQuantity + 1, item.quantity);
                return prevItems.map((i) =>
                    i.id === item.id ? { ...i, cartQuantity: newQuantity } : i
                );
            }
            return [...prevItems, { ...item, cartQuantity: 1 }];
        });
    }, [setCheckedOut]);

    useEffect(() => {
        if (scanEvent) {
            handleAddItemToCart(scanEvent.item);
        }
    }, [scanEvent, handleAddItemToCart]);

    const handleUpdateQuantity = (itemId: number, newQuantity: number) => {
        setCartItems((prevItems) =>
            prevItems
                .map((item) =>
                    item.id === itemId ? { ...item, cartQuantity: newQuantity } : item
                )
                .filter((item) => {
                    if (isVolunteerMode) return true;
                    return item.cartQuantity !== 0;
                })
        );
    };

    const handleRemoveItem = (itemId: number) => {
        setCartItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
    };

    const handleCheckout = () => {
        setConfirmOpen(true);
    };

    const handleConfirmedCheckout = async () => {
        setConfirmOpen(false);
        const checkoutTotal = cartItems.reduce((total, item) => total + item.price * item.cartQuantity, 0) + extraCosts;
        const itemsSummary = cartItems.map(item => `${item.name} x${item.cartQuantity}`).join(', ');

        let handler = handleTakeItem;
        if (isVolunteerMode) {
            handler = isSetMode ? handleSetItem : handleAddItem;
        }

        setIsCheckingOut(true);
        try {
            for (const item of cartItems) {
                let success = false;
                if (isVolunteerMode && !isSetMode && item.cartQuantity < 0) {
                    success = await handleTakeItem(item.id, Math.abs(item.cartQuantity));
                } else {
                    success = await handler(item.id, item.cartQuantity);
                }

                if (!success) {
                    addToast(`Failed to process "${item.name}". Operation stopped.`, 'error');
                    setIsCheckingOut(false);
                    return;
                }
            }

            setCartItems([]);

            if (!isVolunteerMode) {
                let desc = itemsSummary;
                if (extraCosts > 0) {
                    desc += `, Extra services (€${extraCosts.toFixed(2)})`;
                }
                if (desc.length > 135) {
                    desc = desc.substring(0, 132) + '...';
                }
                setCheckedOut({ total: checkoutTotal, description: desc });
            } else {
                setCheckedOut(null);
                addToast('Stock updated successfully!', 'success');
            }
        } catch (error) {
            console.error('[Checkout] Unexpected error during checkout:', error);
            addToast('An unexpected error occurred during checkout', 'error');
        } finally {
            setIsCheckingOut(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Tab bar — only shown when extras are available */}
            {!isVolunteerMode && checkedOutResult === null && (
                <div className="flex border-b-2 border-brand-black shrink-0">
                    <button
                        onClick={() => setActiveTab('cart')}
                        className={cn(
                            "flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors",
                            activeTab === 'cart' ? "bg-brand-black text-white" : "bg-white text-brand-black"
                        )}
                    >
                        CART {cartItems.length > 0 && `(${cartItems.length})`}
                    </button>
                    <button
                        onClick={() => setActiveTab('extras')}
                        className={cn(
                            "flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors border-l-2 border-brand-black flex items-center justify-center gap-1",
                            activeTab === 'extras' ? "bg-brand-black text-white" : "bg-white text-brand-black"
                        )}
                    >
                        <Settings size={12} /> EXTRAS {extraCosts > 0 && `(€${extraCosts.toFixed(2)})`}
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-auto">
                <div className={cn((!isVolunteerMode && checkedOutResult === null && activeTab !== 'cart') && "hidden")}>
                    <ShoppingCart
                        cartItems={cartItems}
                        onUpdateQuantity={handleUpdateQuantity}
                        onRemoveItem={handleRemoveItem}
                        onCheckout={handleCheckout}
                        checkedOutTotal={checkedOutResult?.total ?? null}
                        checkedOutDescription={checkedOutResult?.description ?? undefined}
                        onClearCheckout={() => setCheckedOut(null)}
                        extraCosts={extraCosts}
                        isVolunteerMode={isVolunteerMode}
                        isSetMode={isSetMode}
                        onSetModeChange={handleSetModeChange}
                        isCheckingOut={isCheckingOut}
                    />
                </div>

                {!isVolunteerMode && checkedOutResult === null && activeTab === 'extras' && (
                    <div className="p-4 sm:p-6">
                        <Extras onExtraCostChange={setExtraCosts} />
                    </div>
                )}
            </div>

            {/* Brutalist Custom Confirmation Modal */}
            {confirmOpen && (
                <div className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4">
                    <div className="border-2 border-brand-black bg-brand-beige w-full max-w-2xl flex flex-col">
                        <div className="bg-brand-accent text-brand-black p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <AlertCircle size={24} className="text-emerald-400" />
                                <h3 className="font-black uppercase tracking-[0.2em] text-lg">CONFIRM TRANSACTION</h3>
                            </div>
                            <button onClick={() => setConfirmOpen(false)} className="hover:rotate-90 transition-transform">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8 bg-white overflow-y-auto max-h-[60vh] space-y-6">
                            <p className="text-xs font-black uppercase tracking-widest text-brand-black/50 border-b-2 border-brand-black pb-2">
                                ITEMS IN CART
                            </p>

                            <div className="space-y-3">
                                {cartItems.map((item) => (
                                    <div key={item.id} className="flex justify-between items-center p-3 border-2 border-brand-black bg-white">
                                        <div className="flex flex-col">
                                            <span className="font-black text-sm uppercase">{item.name}</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">QTY: {item.cartQuantity} × €{item.price.toFixed(2)}</span>
                                        </div>
                                        <div className="font-black text-sm">€{(item.cartQuantity * item.price).toFixed(2)}</div>
                                    </div>
                                ))}

                                {extraCosts > 0 && (
                                    <div className="flex justify-between items-center p-3 border-2 border-brand-black bg-slate-50">
                                        <span className="font-black text-sm uppercase text-slate-900 leading-none">EXTRA SERVICES</span>
                                        <div className="font-black text-sm text-slate-900">€{extraCosts.toFixed(2)}</div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t-[3px] border-brand-black pt-6 flex flex-col items-end">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-black/50">TOTAL AMOUNT</span>
                                <span className="text-5xl font-black text-brand-black tracking-tight">
                                    €{(cartItems.reduce((acc, i) => acc + i.price * i.cartQuantity, 0) + extraCosts).toFixed(2)}
                                </span>
                            </div>
                        </div>
                        <div className="border-t-2 border-brand-black p-6 flex flex-col sm:flex-row gap-4 bg-brand-beige">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                className="flex-1 brutalist-button py-4 bg-white text-brand-black flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest"
                            >
                                <X size={20} /> CANCEL
                            </button>
                            <button
                                onClick={handleConfirmedCheckout}
                                disabled={isCheckingOut}
                                className="flex-1 brutalist-button py-4 bg-emerald-400 text-brand-black hover:brightness-95 flex items-center justify-center gap-3 text-sm font-black uppercase tracking-widest transition-all"
                            >
                                {isCheckingOut ? (
                                    <span className="flex items-center gap-2">PROCESSING...</span>
                                ) : (
                                    <>
                                        <Check size={20} /> COMPLETE CHECKOUT
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
