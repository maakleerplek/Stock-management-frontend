import { useState, useEffect, useCallback, useRef } from 'react';
import ShoppingCart, { type CartItem, type VolunteerCartMode } from './ShoppingCart';
import Extras, { EXTRAS_STORAGE_KEY } from './Extras';
import { laserApi, pendingPaidIds, type LaserSession } from './lib/laserApi';
import { type ItemData, type ScanEvent, handleVolunteerDrink, handleInternalUse, isLabMaterial } from './sendCodeHandler';
import { checkoutApi, typedToCart, useBill, extraLabel, type CheckoutCart, type TypedJob, type Bill } from './lib/checkoutApi';
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

/** Seconds a button stays locked after `open` turns true: time to read first (as on the kiosk). */
function useLock(open: boolean, seconds = 3): number {
    const [left, setLeft] = useState(0);
    useEffect(() => {
        if (!open) return;
        setLeft(seconds);
        const id = window.setInterval(() => setLeft(n => {
            if (n <= 1) window.clearInterval(id);
            return Math.max(0, n - 1);
        }), 1000);
        return () => window.clearInterval(id);
    }, [open, seconds]);
    return left;
}

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
    const [checkedOutResult, setCheckedOutResult] = useState<{ total: number; description: string; free?: boolean } | null>(null);
    // Ref mirror so handleAddItemToCart can read the latest value without being
    // in the useEffect dependency array (which would re-fire on every QR dismiss).
    const checkedOutResultRef = useRef(checkedOutResult);
    checkedOutResultRef.current = checkedOutResult;
    const [typedJobs, setTypedJobs] = useState<TypedJob[]>([]);
    // Sold before the till marked cuts paid itself, and not marked yet: never bill those again.
    const pendingPaid = pendingPaidIds();
    const laserInCheckout = laserSessions.filter(s => s.checkout_at && s.total_time > 0 && !pendingPaid.has(s.id));
    const [mode, setMode] = useState<VolunteerCartMode>('buy');
    const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Seconds before "Complete checkout" can be pressed: time to read what is being booked (as on the kiosk).
    const lockLeft = useLock(confirmOpen);
    // Visitor cart: VOLUNTEER / WORKSHOP makes the whole cart free, after "for volunteers only".
    const [freeUse, setFreeUse] = useState(false);
    const [askFree, setAskFree] = useState(false);
    const askLeft = useLock(askFree);
    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();
    // Volunteers buy like anyone else, or take items out for free (drink / lab / workshop).
    // Stock work (restock, set count) is on the Stock list.
    const free = isVolunteerMode && mode === 'drink';
    const visitorFree = !isVolunteerMode && freeUse;
    // What the checkout server prices and books. Free items are not a sale: they go out one by one below.
    const machineCart: CheckoutCart = { items: [], ...typedToCart(typedJobs), cuts: laserInCheckout.map(s => s.id) };
    const cart: CheckoutCart = free ? machineCart : { ...machineCart, items: cartItems.map(i => ({ part: i.id, quantity: i.cartQuantity })) };
    // Priced as a normal sale, so the cart can show what it would have cost; booked with volunteer on.
    const { bill, error: billError } = useBill(cart);
    const volunteerCart: CheckoutCart = { ...cart, items: cartItems.map(i => ({ part: i.id, quantity: i.cartQuantity, lab: isLabMaterial(i) })), volunteer: true };
    const extras = bill?.extras ?? [];
    const minimumTopUp = bill?.top_up ?? 0;
    const extraCosts = extras.reduce((sum, e) => sum + e.quantity * e.unit_price, 0) + minimumTopUp;
    const toPay = bill?.total ?? 0;
    const normalTotal = toPay;
    // One key per sale: a retry after a network error books nothing twice. A new cart gets a new key.
    const saleKey = useRef<{ cart: string; key: string } | null>(null);

    // The last sale, for the invoice PDF on the payment screen.
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const setCheckedOut = useCallback((result: { total: number; description: string; free?: boolean } | null) => {
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
        if (!bill) {
            addToast(billError ? `Cannot price the cart: ${billError}` : 'Still pricing the cart, one moment', 'error');
            return;
        }
        setConfirmOpen(true);
    };

    /**
     * The checkout server books the sale as one sales order and marks its laser cuts
     * paid; then the QR code. Prices are the server's, from its answer.
     */
    const sell = async (sellCart: CheckoutCart) => {
        const freeSale = !!sellCart.volunteer;
        const cartKey = JSON.stringify(sellCart);
        if (saleKey.current?.cart !== cartKey) saleKey.current = { cart: cartKey, key: crypto.randomUUID() };
        const sale = await checkoutApi.checkout(sellCart, saleKey.current.key);
        saleKey.current = null;
        if (sale.warning) addToast(sale.warning, 'warning');
        const b: Bill = sale.bill;
        localStorage.removeItem(EXTRAS_STORAGE_KEY);
        setTypedJobs([]);
        setInvoice({
            reference: sale.reference, date: new Date(),
            lines: [
                ...b.items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price })),
                ...b.extras.map(e => ({ name: `${extraLabel(e)} (${e.unit})`, quantity: e.quantity, unitPrice: e.unit_price })),
                ...(b.top_up > 0 ? [{ name: 'Minimum per payment (machines)', quantity: 1, unitPrice: b.top_up }] : []),
            ],
        });
        let desc = [...b.items.map(i => `${i.name} x${i.quantity}`), ...b.extras.map(e => `${extraLabel(e)} ${e.quantity} ${e.unit}`)].join(', ');
        if (desc.length > 135) desc = desc.substring(0, 132) + '...';
        setCheckedOut({ total: b.total, description: desc, free: freeSale });
    };

    const handleConfirmedCheckout = async () => {
        setConfirmOpen(false);
        setIsCheckingOut(true);
        try {
            if (visitorFree) {
                // Volunteer / workshop use: one €0 booking on the server, items out of stock as volunteer use.
                await sell(volunteerCart);
                setCartItems([]);
                setFreeUse(false);
                return;
            }
            if (!free) {
                // A sale: one sales order for the whole cart.
                await sell(cart);
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
            if (extras.length) await sell(machineCart);
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
                    freeUse={visitorFree}
                    onToggleFreeUse={isVolunteerMode ? undefined : () => (freeUse ? setFreeUse(false) : setAskFree(true))}
                    checkedOutFree={!!checkedOutResult?.free}
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
                                onExtrasChange={setTypedJobs}
                                bill={bill}
                                laserSessions={laserInCheckout}
                                openLaserSessions={laserSessions.filter(s => !s.checkout_at && s.total_time > 0)}
                                onAddLaserSession={(id) => laserApi.setCheckout(id, true).catch(e => addToast(e instanceof Error ? e.message : String(e), 'error'))}
                                onRemoveLaserSession={(id) => laserApi.setCheckout(id, false).catch(e => addToast(e instanceof Error ? e.message : String(e), 'error'))}
                            />
                        </div>
                    </div>
                )}
            </div>

            {askFree && (
                <ModalFrame onClose={() => setAskFree(false)} className="h-auto self-center border-2 border-emerald-600 p-5 space-y-3">
                    <p className="text-[11px] font-bold tracking-wide text-emerald-600">FOR VOLUNTEERS ONLY</p>
                    <h3 className="text-xl font-semibold">Are you an HTL volunteer, or is this for a workshop?</h3>
                    <p className="text-sm text-brand-black/80">
                        This makes the cart free: a drink you earned, or material and machine time for yourself, the lab or a workshop.
                        It is booked as volunteer / workshop use, never as paid.
                    </p>
                    <p className="text-sm text-brand-black/80">Visitors pay as usual: tap Back.</p>
                    <div className="flex gap-2 pt-2">
                        <button onClick={() => setAskFree(false)} className="brutalist-button px-5 py-3 bg-white text-sm font-semibold">Back</button>
                        <button
                            onClick={() => { setAskFree(false); setFreeUse(true); }}
                            disabled={askLeft > 0}
                            className="flex-1 brutalist-button py-3 bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                        >
                            Yes, I am{askLeft > 0 && <span className="tabular-nums"> ({askLeft})</span>}
                        </button>
                    </div>
                </ModalFrame>
            )}

            {/* Brutalist Custom Confirmation Modal */}
            {confirmOpen && (
                <ModalFrame maxWidth="max-w-2xl" className="bg-brand-beige flex flex-col">
                        <div className="bg-brand-beige-dark text-brand-black p-5 flex items-center justify-between border-b border-lijn">
                            <div className="flex items-center gap-3">
                                <AlertCircle size={24} className="text-emerald-500" />
                                {visitorFree ? (
                                    <div>
                                        <p className="text-[11px] font-bold tracking-wide text-emerald-600">VOLUNTEER / WORKSHOP</p>
                                        <h3 className="font-semibold text-lg">The oath</h3>
                                    </div>
                                ) : <h3 className="font-semibold text-lg">Confirm transaction</h3>}
                            </div>
                            <button onClick={() => setConfirmOpen(false)} className="hover:rotate-90 transition-transform">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-4 sm:p-8 bg-white overflow-y-auto max-h-[60vh] space-y-6">
                            {visitorFree && (
                                <p className="font-serif italic text-base leading-relaxed">
                                    By my honour and the power vested in me, I solemnly swear by the spirit of HTL that I am a volunteer
                                    and that this is fair: a drink I earned, or material and machine time for me, for the lab or for a workshop.
                                </p>
                            )}
                            <p className="text-xs font-semibold text-brand-black/50 border-b border-lijn pb-2">
                                In this transaction
                            </p>

                            <div className="space-y-3">
                                {cartItems.map((item) => ({ item, price: bill?.items.find(i => i.part === item.id)?.unit_price ?? item.price })).map(({ item, price }) => (
                                    <div key={item.id} className="flex justify-between items-center p-3 border border-lijn bg-white">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{item.name}</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">Qty: {item.cartQuantity} × €{price.toFixed(2)}</span>
                                        </div>
                                        <div className="font-semibold text-sm">{free || visitorFree ? 'No charge' : `€${(item.cartQuantity * price).toFixed(2)}`}</div>
                                    </div>
                                ))}

                                {extras.map((extra, i) => (
                                    <div key={i} className="flex justify-between items-center p-3 border border-lijn bg-brand-beige-dark">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">{extraLabel(extra)}</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">{extra.quantity} {extra.unit} × €{extra.unit_price.toFixed(2)}</span>
                                        </div>
                                        <div className="font-semibold text-sm">{visitorFree ? 'No charge' : `€${(extra.quantity * extra.unit_price).toFixed(2)}`}</div>
                                    </div>
                                ))}

                                {minimumTopUp > 0 && !visitorFree && (
                                    <div className="flex justify-between items-center p-3 border border-lijn bg-brand-beige-dark">
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-sm">Minimum per payment</span>
                                            <span className="text-[10px] font-bold text-brand-black/60">Machine use is at least €{extraCosts.toFixed(2)} per payment</span>
                                        </div>
                                        <div className="font-semibold text-sm">€{minimumTopUp.toFixed(2)}</div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t-[3px] border-lijn pt-6 flex flex-col items-end">
                                <span className="text-[10px] font-semibold text-brand-black/50">{visitorFree ? `Normally €${normalTotal.toFixed(2)}` : 'Total amount'}</span>
                                <span className={`text-5xl font-semibold tracking-tight ${visitorFree ? 'text-emerald-600' : 'text-brand-black'}`}>
                                    {visitorFree || (free && toPay === 0) ? 'Free' : `€${toPay.toFixed(2)}`}
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
                                className={`flex-1 brutalist-button py-4 ${visitorFree ? 'bg-emerald-600 text-white' : 'bg-emerald-400 text-brand-black'} hover:brightness-95 flex items-center justify-center gap-3 text-sm font-semibold transition-all disabled:opacity-50`}
                            >
                                {isCheckingOut ? (
                                    <span className="flex items-center gap-2">Processing...</span>
                                ) : (
                                    <>
                                        <Check size={20} /> {visitorFree ? 'I swear it' : free && toPay === 0 ? 'Confirm' : 'Complete checkout'}{lockLeft > 0 && <span className="tabular-nums">({lockLeft})</span>}
                                    </>
                                )}
                            </button>
                        </div>
                </ModalFrame>
            )}
        </div>
    );
}
