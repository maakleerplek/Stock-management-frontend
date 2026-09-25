import { useState, useEffect, useCallback, useRef } from 'react';
import ShoppingCart, { type CartItem } from './ShoppingCart';
import Extras from './Extras';
import { type ItemData, type ScanEvent, handleCheckout as bookSale, handleRemoveItem as removeStock, handleAddItem, handleSetItem } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';
import { AlertCircle, Check, X, Settings } from 'lucide-react';

interface ShoppingWindowProps {
    scanEvent: ScanEvent | null;
    onCheckoutResultChange?: (result: { total: number; description: string } | null) => void;
    lasertimeMinutes: number;
    onLasertimeChange: (minutes: number) => void;
}

// v2: cart entries are keyed by part ID. Carts from before hold stock item IDs.
const CART_STORAGE_KEY = 'stockManagerCartItems.v2';

export default function ShoppingWindow({ scanEvent, onCheckoutResultChange, lasertimeMinutes, onLasertimeChange }: ShoppingWindowProps) {
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
    // Ref mirror so handleAddItemToCart can read the latest value without being
    // in the useEffect dependency array (which would re-fire on every QR dismiss).
    const checkedOutResultRef = useRef(checkedOutResult);
    checkedOutResultRef.current = checkedOutResult;
    const [extraCosts, setExtraCosts] = useState<number>(0);
    const [isSetMode, setIsSetMode] = useState<boolean>(false);
    const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();
    const isVolunteerModeRef = useRef(isVolunteerMode);
    isVolunteerModeRef.current = isVolunteerMode;

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
        // While the QR payment screen is visible, ignore incoming scans completely.
        // The user must explicitly press "START NEW TRANSACTION" to begin a new purchase.
        if (checkedOutResultRef.current !== null) return;
        setCartItems((prevItems) => {
            const existingItem = prevItems.find((i) => i.id === item.id);
            if (existingItem) {
                // The till cannot sell more than is in stock; volunteers restocking can add any amount.
                const newQuantity = isVolunteerModeRef.current
                    ? existingItem.cartQuantity + 1
                    : Math.min(existingItem.cartQuantity + 1, item.quantity);
                return prevItems.map((i) =>
                    i.id === item.id ? { ...i, cartQuantity: newQuantity } : i
                );
            }
            return [...prevItems, { ...item, cartQuantity: 1 }];
        });
    }, []); // stable: reads checkedOutResult and volunteer mode via refs, not state

    useEffect(() => {
        if (scanEvent) {
            handleAddItemToCart(scanEvent.item);
        }
    }, [scanEvent, handleAddItemToCart]);

    const handleUpdateQuantity = (itemId: number, newQuantity: number) => {
        setCartItems((prevItems) =>
            prevItems.map((item) => {
                if (item.id !== itemId) return item;
                if (isVolunteerMode) {
                    // Volunteer mode: allow any value (negative = remove stock)
                    return { ...item, cartQuantity: newQuantity };
                }
                // Checkout mode: clamp minimum at 1 so only the trash button removes items
                return { ...item, cartQuantity: Math.max(1, newQuantity) };
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
        setIsCheckingOut(true);
        try {
            if (isVolunteerMode) {
                // Volunteer corrections, item by item.
                for (const item of cartItems) {
                    const totalPrice = item.price > 0 ? parseFloat((item.price * Math.abs(item.cartQuantity)).toFixed(2)) : undefined;
                    const success = isSetMode
                        ? await handleSetItem(item.id, item.cartQuantity, item.name, totalPrice)
                        : item.cartQuantity < 0
                            ? await removeStock(item.id, Math.abs(item.cartQuantity), item.name, totalPrice)
                            : await handleAddItem(item.id, item.cartQuantity, item.name, totalPrice);
                    if (!success) {
                        addToast(`Failed to process "${item.name}". Operation stopped.`, 'error');
                        return;
                    }
                }
                setCartItems([]);
                setCheckedOut(null);
                addToast('Stock updated successfully!', 'success');
                return;
            }

            // A sale: one sales order for the whole cart.
            const checkoutTotal = cartItems.reduce((total, item) => total + item.price * item.cartQuantity, 0) + extraCosts;
            await bookSale(
                cartItems.map(item => ({ partId: item.id, name: item.name, quantity: item.cartQuantity, unitPrice: item.price })),
                extraCosts,
            );
            setCartItems([]);
            let desc = cartItems.map(item => `${item.name} x${item.cartQuantity}`).join(', ');
            if (extraCosts > 0) desc += `, Extra services (€${extraCosts.toFixed(2)})`;
            if (desc.length > 135) desc = desc.substring(0, 132) + '...';
            setCheckedOut({ total: checkoutTotal, description: desc });
        } catch (error) {
            console.error('[Checkout] Failed:', error);
            addToast(error instanceof Error ? `Checkout failed: ${error.message}` : 'Checkout failed', 'error');
        } finally {
            setIsCheckingOut(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-brand-beige">
            <div className="flex-1 overflow-auto">
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

                {/* Extras — shown inline below cart when not in volunteer mode and not checked out */}
                {!isVolunteerMode && checkedOutResult === null && (
                    <div className="border-t border-lijn">
                        <div className="px-4 sm:px-6 py-3 border-b border-lijn bg-brand-beige shrink-0">
                            <h2 className="text-brand-black text-base font-semibold flex items-center gap-2">
                                <Settings size={14} /> Extra services
                            </h2>
                        </div>
                        <div className="p-4">
                            <Extras onExtraCostChange={setExtraCosts} lasertimeMinutes={lasertimeMinutes} onLasertimeChange={onLasertimeChange} />
                        </div>
                    </div>
                )}
            </div>

            {/* Brutalist Custom Confirmation Modal */}
            {confirmOpen && (
                <div className="fixed inset-0 bg-brand-black/50 z-50 flex items-center justify-center p-4">
                    <div className="border border-lijn bg-brand-beige w-full max-w-2xl flex flex-col">
                        <div className="bg-brand-beige-dark text-brand-black p-5 flex items-center justify-between border-b border-lijn">
                            <div className="flex items-center gap-3">
                                <AlertCircle size={24} className="text-emerald-500" />
                                <h3 className="font-semibold text-lg">Confirm transaction</h3>
                            </div>
                            <button onClick={() => setConfirmOpen(false)} className="hover:rotate-90 transition-transform">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-4 sm:p-8 bg-white overflow-y-auto max-h-[60vh] space-y-6">
                            <p className="text-xs font-semibold text-brand-black/50 border-b border-lijn pb-2">
                                Items in cart
                            </p>

                            <div className="space-y-3">
                                {cartItems.map((item) => (
                                    <div key={item.id} className="flex justify-between items-center p-3 border border-lijn bg-white">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{item.name}</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">Qty: {item.cartQuantity} × €{item.price.toFixed(2)}</span>
                                        </div>
                                        <div className="font-semibold text-sm">€{(item.cartQuantity * item.price).toFixed(2)}</div>
                                    </div>
                                ))}

                                {extraCosts > 0 && (
                                    <div className="flex justify-between items-center p-3 border border-lijn bg-slate-50">
                                        <span className="font-semibold text-sm text-slate-900 leading-none">Extra services</span>
                                        <div className="font-semibold text-sm text-slate-900">€{extraCosts.toFixed(2)}</div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t-[3px] border-lijn pt-6 flex flex-col items-end">
                                <span className="text-[10px] font-semibold text-brand-black/50">Total amount</span>
                                <span className="text-5xl font-semibold text-brand-black tracking-tight">
                                    €{(cartItems.reduce((acc, i) => acc + i.price * i.cartQuantity, 0) + extraCosts).toFixed(2)}
                                </span>
                            </div>
                        </div>
                        <div className="border-t border-lijn p-6 flex flex-col sm:flex-row gap-4 bg-brand-beige">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                className="flex-1 brutalist-button py-4 bg-white text-brand-black flex items-center justify-center gap-3 text-sm font-semibold"
                            >
                                <X size={20} /> Cancel
                            </button>
                            <button
                                onClick={handleConfirmedCheckout}
                                disabled={isCheckingOut}
                                className="flex-1 brutalist-button py-4 bg-emerald-400 text-brand-black hover:brightness-95 flex items-center justify-center gap-3 text-sm font-semibold transition-all"
                            >
                                {isCheckingOut ? (
                                    <span className="flex items-center gap-2">Processing...</span>
                                ) : (
                                    <>
                                        <Check size={20} /> Complete checkout
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
