import { useState, useEffect, useCallback, useRef } from 'react';
import ShoppingCart, { type CartItem, type VolunteerCartMode } from './ShoppingCart';
import Extras, { EXTRAS_STORAGE_KEY } from './Extras';
import { laserApi, laserMinutes, markPaidReliably, pendingPaidIds, type LaserSession } from './lib/laserApi';
import { PRICING } from './constants';
import { type ItemData, type ScanEvent, type ExtraLine, extraTotal, priced, topUp, extraLabel, describeExtra, handleCheckout as bookSale, handleVolunteerDrink, handleInternalUse, isLabMaterial, type CheckoutLine } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';
import type { Invoice } from './lib/invoice';
import ModalFrame from './components/ModalFrame';
import { AlertCircle, Check, X, Timer } from 'lucide-react';

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
        // All laser cuts as one line, rounded up to whole minutes once.
        ...(laserInCheckout.length ? [{
            name: 'Lasertime', person: laserInCheckout.map(s => s.name).join(', ').slice(0, 120),
            quantity: laserMinutes(laserInCheckout), unit: 'min',
            ...priced(PRICING.LASER_PER_MINUTE, PRICING.LASER_MINIMUM), laserSessionIds: laserInCheckout.map(s => s.id),
        }] : []),
        ...typedExtras,
    ];
    // Machine lines at their own price, plus the top-up to the minimum per payment.
    const minimumTopUp = topUp(extras);
    const extraCosts = extraTotal(extras) + minimumTopUp;
    const [mode, setMode] = useState<VolunteerCartMode>('buy');
    const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Seconds before "Complete checkout" can be pressed: time to read what is being booked (as on the kiosk).
    const CONFIRM_LOCK = 3;
    const [lockLeft, setLockLeft] = useState(0);
    useEffect(() => {
        if (!confirmOpen) return;
        setLockLeft(CONFIRM_LOCK);
        const id = window.setInterval(() => setLockLeft(n => {
            if (n <= 1) window.clearInterval(id);
            return Math.max(0, n - 1);
        }), 1000);
        return () => window.clearInterval(id);
    }, [confirmOpen]);
    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();
    // Volunteers buy like anyone else, or take items out for free (drink / lab / workshop).
    // Stock work (restock, set count) is on the Stock list.
    const free = isVolunteerMode && mode === 'drink';
    const itemsTotal = cartItems.reduce((sum, i) => sum + i.price * i.cartQuantity, 0);
    const toPay = (free ? 0 : itemsTotal) + extraCosts;

    // The last sale, for the invoice PDF on the payment screen.
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const setCheckedOut = useCallback((result: { total: number; description: string } | null) => {
        setCheckedOutResult(result);
        if (!result) setInvoice(null);
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
                // The till cannot sell more than is in stock.
                const newQuantity = Math.min(existingItem.cartQuantity + 1, item.quantity);
                return prevItems.map((i) =>
                    i.id === item.id ? { ...i, cartQuantity: newQuantity } : i
                );
            }
            return [...prevItems, { ...item, cartQuantity: 1 }];
        });
    }, []); // stable: reads checkedOutResult via a ref, not state

    useEffect(() => {
        if (scanEvent) {
            handleAddItemToCart(scanEvent.item);
        }
    }, [scanEvent, handleAddItemToCart]);

    const handleUpdateQuantity = (itemId: number, newQuantity: number) => {
        setCartItems((prevItems) =>
            // At least 1: only the trash button removes an item.
            prevItems.map((item) => item.id === itemId ? { ...item, cartQuantity: Math.max(1, newQuantity) } : item)
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
            for (const id of extra.laserSessionIds ?? []) {
                void markPaidReliably(id, reference).then(ok => {
                    if (!ok) addToast('Sold, but a laser cut could not be marked paid yet. It is retried automatically.', 'warning');
                });
            }
        }
        localStorage.removeItem(EXTRAS_STORAGE_KEY);
        setInvoice({
            reference, date: new Date(),
            lines: [
                ...lines.map(l => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
                ...extras.map(e => ({ name: `${extraLabel(e)} (${e.unit})`, quantity: e.quantity, unitPrice: e.unitPrice })),
                ...(minimumTopUp > 0 ? [{ name: 'Minimum per payment (machines)', quantity: 1, unitPrice: minimumTopUp }] : []),
            ],
        });
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
            if (!free) {
                // A sale: one sales order for the whole cart.
                await sell(cartItems.map(item => ({ partId: item.id, name: item.name, quantity: item.cartQuantity, unitPrice: item.price })));
                setCartItems([]);
                return;
            }

            // Free: a drink is the volunteer's own; the rest (filament, wood, workshop material) is for the lab. Item by item.
            for (const item of cartItems) {
                const success = isLabMaterial(item)
                    ? await handleInternalUse(item.id, item.cartQuantity, item.name)
                    : await handleVolunteerDrink(item.id, item.cartQuantity, item.name);
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
                    [drinks && 'Enjoy your drink! Booked as a free volunteer drink.', lab && `${lab} item${lab > 1 ? 's' : ''} booked for the lab / workshop.`].filter(Boolean).join(' '),
                    'success',
                );
            }
            // Machine time is always paid.
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
                    invoice={invoice}
                    onClearCheckout={() => setCheckedOut(null)}
                    extraCosts={extraCosts}
                    toPay={toPay}
                    isVolunteerMode={isVolunteerMode}
                    mode={mode}
                    onModeChange={setMode}
                    isCheckingOut={isCheckingOut}
                />

                {/* Extras (laser time, machine time) below the cart, also for volunteers: those are always paid. */}
                {checkedOutResult === null && (
                    <div className="border-t border-lijn">
                        <div className="px-4 sm:px-6 py-3 border-b border-lijn bg-brand-beige shrink-0">
                            <h2 className="text-brand-black text-base font-semibold flex items-center gap-2">
                                <Timer size={16} className="text-laser" aria-hidden /> Used a machine? Add its time
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
                                        <div className="font-semibold text-sm">{free ? 'No charge' : `€${(item.cartQuantity * item.price).toFixed(2)}`}</div>
                                    </div>
                                ))}

                                {extras.map((extra) => (
                                    <div key={extra.laserSessionIds?.join() ?? extra.name} className="flex justify-between items-center p-3 border border-lijn bg-brand-beige-dark">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{extraLabel(extra)}</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">{extra.quantity} {extra.unit} × €{extra.unitPrice.toFixed(2)}</span>
                                        </div>
                                        <div className="font-semibold text-sm">€{(extra.quantity * extra.unitPrice).toFixed(2)}</div>
                                    </div>
                                ))}

                                {minimumTopUp > 0 && (
                                    <div className="flex justify-between items-center p-3 border border-lijn bg-brand-beige-dark">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">Minimum per payment</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">Machine use is at least €{(extraTotal(extras) + minimumTopUp).toFixed(2)} per payment</span>
                                        </div>
                                        <div className="font-semibold text-sm">€{minimumTopUp.toFixed(2)}</div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t-[3px] border-lijn pt-6 flex flex-col items-end">
                                <span className="text-[10px] font-semibold text-brand-black/50">Total amount</span>
                                <span className="text-5xl font-semibold text-brand-black tracking-tight">
                                    {free && toPay === 0 ? 'Free' : `€${toPay.toFixed(2)}`}
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
                                disabled={isCheckingOut || lockLeft > 0}
                                className="flex-1 brutalist-button py-4 bg-emerald-400 text-brand-black hover:brightness-95 flex items-center justify-center gap-3 text-sm font-semibold transition-all disabled:opacity-50"
                            >
                                {isCheckingOut ? (
                                    <span className="flex items-center gap-2">Processing...</span>
                                ) : (
                                    <>
                                        <Check size={20} /> {free && toPay === 0 ? 'Confirm' : 'Complete checkout'}{lockLeft > 0 && <span className="tabular-nums">({lockLeft})</span>}
                                    </>
                                )}
                            </button>
                        </div>
                </ModalFrame>
            )}
        </div>
    );
}
