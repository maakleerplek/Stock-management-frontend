import { useState, useEffect, useCallback, useRef } from 'react';
import ShoppingCart, { type CartItem, type VolunteerCartMode } from './ShoppingCart';
import Extras, { EXTRAS_STORAGE_KEY } from './Extras';
import { laserApi, markPaidReliably, pendingPaidIds, type LaserSession } from './lib/laserApi';
import { PRICING } from './constants';
import { type ItemData, type ScanEvent, type ExtraLine, extraTotal, extraLabel, describeExtra, handleCheckout as bookSale, handleRemoveItem as removeStock, handleAddItem, handleSetItem, handleVolunteerDrink, handleInternalUse, isLabMaterial, type CheckoutLine } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';
import ModalFrame from './components/ModalFrame';
import { AlertCircle, Check, X, Settings } from 'lucide-react';

interface ShoppingWindowProps {
    scanEvent: ScanEvent | null;
    onCheckoutResultChange?: (result: { total: number; description: string } | null) => void;
    /** Open laser sessions; the ones with checkout_at set are in this checkout. */
    laserSessions: LaserSession[];
}

// v2: cart entries are keyed by part ID. Carts from before hold stock item IDs.
const CART_STORAGE_KEY = 'stockManagerCartItems.v2';

export default function ShoppingWindow({ scanEvent, onCheckoutResultChange, laserSessions }: ShoppingWindowProps) {
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
    const [typedExtras, setTypedExtras] = useState<ExtraLine[]>([]);
    // Sold but not marked paid yet (laser service was away): never bill those again.
    const pendingPaid = pendingPaidIds();
    const laserInCheckout = laserSessions.filter(s => s.checkout_at && s.total_time > 0 && !pendingPaid.has(s.id));
    const extras: ExtraLine[] = [
        ...laserInCheckout.map(s => ({
            name: 'Lasertime', person: s.name, quantity: s.minutes, unit: 'min',
            unitPrice: PRICING.LASER_PER_MINUTE, laserSessionId: s.id,
        })),
        ...typedExtras,
    ];
    const extraCosts = extraTotal(extras);
    const [mode, setMode] = useState<VolunteerCartMode>('adjust');
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();
    const isVolunteerModeRef = useRef(isVolunteerMode);
    isVolunteerModeRef.current = isVolunteerMode;

    const handleModeChange = useCallback((newMode: VolunteerCartMode) => {
        setMode(newMode);
        if (newMode === 'adjust') {
            setCartItems((prevItems) => prevItems.filter(item => item.cartQuantity !== 0));
        } else if (newMode === 'drink') {
            // A drink is taken, never negative or zero.
            setCartItems((prevItems) => prevItems.filter(item => item.cartQuantity > 0));
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
                const newQuantity = isVolunteerModeRef.current && modeRef.current !== 'drink'
                    ? existingItem.cartQuantity + 1
                    : Math.min(existingItem.cartQuantity + 1, item.quantity);
                return prevItems.map((i) =>
                    i.id === item.id ? { ...i, cartQuantity: newQuantity } : i
                );
            }
            return [...prevItems, { ...item, cartQuantity: 1 }];
        });
    }, []); // stable: reads checkedOutResult, volunteer mode and cart mode via refs, not state

    useEffect(() => {
        if (scanEvent) {
            handleAddItemToCart(scanEvent.item);
        }
    }, [scanEvent, handleAddItemToCart]);

    const handleUpdateQuantity = (itemId: number, newQuantity: number) => {
        setCartItems((prevItems) =>
            prevItems.map((item) => {
                if (item.id !== itemId) return item;
                if (isVolunteerMode && mode !== 'drink') {
                    // Volunteer mode: allow any value (negative = remove stock)
                    return { ...item, cartQuantity: newQuantity };
                }
                // Checkout and free drink: clamp minimum at 1 so only the trash button removes items
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

    /**
     * One sales order for the paid lines and the extra services, then the QR
     * code. Laser sessions on it are marked paid; if the laser service is away,
     * that is retried later (markPaidReliably), the sale stands.
     */
    const sell = async (lines: CheckoutLine[]) => {
        const reference = await bookSale(lines, extras);
        for (const extra of extras) {
            if (!extra.laserSessionId) continue;
            void markPaidReliably(extra.laserSessionId, reference).then(ok => {
                if (!ok) addToast(`Sold, but laser session "${extra.person}" could not be marked paid yet. It is retried automatically.`, 'warning');
            });
        }
        localStorage.removeItem(EXTRAS_STORAGE_KEY);
        const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) + extraCosts;
        let desc = lines.map(l => `${l.name} x${l.quantity}`).join(', ');
        if (extras.length) desc += (desc ? ', ' : '') + extras.map(describeExtra).join(', ');
        if (desc.length > 135) desc = desc.substring(0, 132) + '...';
        setCheckedOut({ total, description: desc });
    };

    const handleConfirmedCheckout = async () => {
        setConfirmOpen(false);
        setIsCheckingOut(true);
        try {
            if (!isVolunteerMode) {
                // A sale: one sales order for the whole cart.
                await sell(cartItems.map(item => ({ partId: item.id, name: item.name, quantity: item.cartQuantity, unitPrice: item.price })));
                setCartItems([]);
                return;
            }

            // Volunteers: the items are stock work, item by item; the extra services are still paid.
            for (const item of cartItems) {
                const totalPrice = item.price > 0 ? parseFloat((item.price * Math.abs(item.cartQuantity)).toFixed(2)) : undefined;
                // Free tab: a drink is the volunteer's own; the rest (filament, wood, workshop material) is for the lab.
                const success = mode === 'drink'
                    ? isLabMaterial(item)
                        ? await handleInternalUse(item.id, item.cartQuantity, item.name)
                        : await handleVolunteerDrink(item.id, item.cartQuantity, item.name)
                    : mode === 'set'
                        ? await handleSetItem(item.id, item.cartQuantity, item.name, totalPrice)
                        : item.cartQuantity < 0
                            ? await removeStock(item.id, Math.abs(item.cartQuantity), item.name, totalPrice)
                            : await handleAddItem(item.id, item.cartQuantity, item.name, totalPrice);
                if (!success) {
                    addToast(`Failed to process "${item.name}". Operation stopped.`, 'error');
                    return;
                }
                // Done: out of the cart, so a retry cannot apply it twice.
                setCartItems(prev => prev.filter(i => i.id !== item.id));
            }
            if (cartItems.length) {
                const lab = cartItems.filter(isLabMaterial).length;
                const drinks = cartItems.length - lab;
                addToast(
                    mode !== 'drink' ? 'Stock updated successfully!'
                        : [drinks && 'Enjoy your drink! Booked as a free volunteer drink.', lab && `${lab} item${lab > 1 ? 's' : ''} booked for the lab / workshop.`].filter(Boolean).join(' '),
                    'success',
                );
            }
            if (extras.length) await sell([]);
            else setCheckedOut(null);
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
                    mode={mode}
                    onModeChange={handleModeChange}
                    isCheckingOut={isCheckingOut}
                />

                {/* Extras (laser time, machine time) below the cart, also for volunteers: those are always paid. */}
                {checkedOutResult === null && (
                    <div className="border-t border-lijn">
                        <div className="px-4 sm:px-6 py-3 border-b border-lijn bg-brand-beige shrink-0">
                            <h2 className="text-brand-black text-base font-semibold flex items-center gap-2">
                                <Settings size={14} /> Extra services
                            </h2>
                        </div>
                        <div className="p-4">
                            <Extras
                                onExtrasChange={setTypedExtras}
                                laserSessions={laserInCheckout}
                                openLaserSessions={laserSessions.filter(s => !s.checkout_at && s.total_time > 0)}
                                onAddLaserSession={(id) => laserApi.setCheckout(id, true).catch(e => addToast(e instanceof Error ? e.message : String(e), 'error'))}
                                onRemoveLaserSession={(id) => laserApi.setCheckout(id, false).catch(e => addToast(e instanceof Error ? e.message : String(e), 'error'))}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Brutalist Custom Confirmation Modal */}
            {confirmOpen && (
                <ModalFrame maxWidth="max-w-2xl" className="bg-brand-beige flex flex-col">
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
                                In this transaction
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

                                {extras.map((extra) => (
                                    <div key={extra.laserSessionId ?? extra.name} className="flex justify-between items-center p-3 border border-lijn bg-brand-beige-dark">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{extraLabel(extra)}</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">{extra.quantity} {extra.unit} × €{extra.unitPrice.toFixed(2)}</span>
                                        </div>
                                        <div className="font-semibold text-sm">€{(extra.quantity * extra.unitPrice).toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t-[3px] border-lijn pt-6 flex flex-col items-end">
                                <span className="text-[10px] font-semibold text-brand-black/50">Total amount</span>
                                <span className="text-5xl font-semibold text-brand-black tracking-tight">
                                    {isVolunteerMode
                                        ? (extraCosts > 0 || mode !== 'drink' ? `€${extraCosts.toFixed(2)}` : 'Free')
                                        : `€${(cartItems.reduce((acc, i) => acc + i.price * i.cartQuantity, 0) + extraCosts).toFixed(2)}`}
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
                </ModalFrame>
            )}
        </div>
    );
}
