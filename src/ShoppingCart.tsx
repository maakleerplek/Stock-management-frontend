import { useState } from 'react';
import { type ItemData, isLabMaterial, isFilament } from './sendCodeHandler';
import ImageDisplay from './ImageDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingCart as ShoppingCartIcon, Heart, CheckCircle, Loader2, MapPin, Tag, Package, X, FileText } from 'lucide-react';
import { cn } from './lib/utils';
import WeroQrCode from './QrCode';
import { useToast } from './ToastContext';
import { downloadInvoice, type Invoice } from './lib/invoice';

export interface CartItem extends ItemData {
    cartQuantity: number;
}

/** What a volunteer's cart does: buy at the normal price, or take items out for free. Restocking is on the Stock list. */
export type VolunteerCartMode = 'buy' | 'drink';

const MODE_HINTS: Record<VolunteerCartMode, string> = {
    buy: 'You pay the normal price. Restocking and counting are on the Stock list.',
    drink: 'Free volunteer drink, or material for the lab / a workshop.',
};
const MODE_LABELS: Record<VolunteerCartMode, { tab: string; title: string; action: string }> = {
    buy: { tab: 'Buy', title: 'Your cart', action: 'Pay' },
    drink: { tab: 'Free (drink / lab / workshop)', title: 'Take out for free', action: 'Take out of stock' },
};
interface ShoppingCartProps {
    cartItems: CartItem[];
    onUpdateQuantity: (itemId: number, newQuantity: number) => void;
    onRemoveItem: (itemId: number) => void;
    onCheckout: () => void;
    checkedOutTotal: number | null;
    checkedOutDescription?: string;
    invoice?: Invoice | null;
    onClearCheckout?: () => void;
    extraCosts: number;
    /** Items (not in free mode) plus extras. */
    toPay: number;
    isVolunteerMode: boolean;
    mode?: VolunteerCartMode;
    onModeChange?: (mode: VolunteerCartMode) => void;
    isCheckingOut?: boolean;
}

function ShoppingCart({
    cartItems = [],
    onUpdateQuantity,
    onRemoveItem,
    onCheckout,
    checkedOutTotal,
    checkedOutDescription,
    invoice,
    onClearCheckout,
    extraCosts,
    toPay,
    isVolunteerMode,
    mode = 'buy',
    onModeChange,
    isCheckingOut = false,
}: ShoppingCartProps) {
    const { addToast } = useToast();
    const [lastActionId, setLastActionId] = useState<number | null>(null);
    // Leaving the payment screen needs a second click: the QR code is gone after it.
    const [confirmClear, setConfirmClear] = useState(false);
    // Invoice: null = closed, string = the customer details typed so far.
    const [invoiceFor, setInvoiceFor] = useState<string | null>(null);

    const free = isVolunteerMode && mode === 'drink';

    const handleUpdateQuantityWithFeedback = (id: number, qty: number) => {
        if ('vibrate' in navigator) navigator.vibrate(10);
        setLastActionId(id);
        onUpdateQuantity(id, qty);
        setTimeout(() => setLastActionId(null), 500);
    };

    const handleRemoveItem = (itemId: number) => {
        if ('vibrate' in navigator) navigator.vibrate([30, 30]);
        const item = cartItems.find(i => i.id === itemId);
        onRemoveItem(itemId);
        addToast(`Removed ${item?.name || 'item'} from cart`, 'success');
    };

    return (
        <div className="w-full flex flex-col bg-brand-beige border-l-0">
            {/* Header */}
            <div className="px-4 sm:px-6 py-3 border-b border-lijn bg-brand-beige shrink-0">
                <h2 className="text-brand-black text-base font-semibold flex items-center gap-2">
                    {free ? (
                        <Heart className="w-4 h-4" />
                    ) : (
                        <ShoppingCartIcon className="w-4 h-4" />
                    )}
                    {isVolunteerMode ? MODE_LABELS[mode].title : "Your cart"}
                </h2>
            </div>

            {/* Volunteer Mode Toggle */}
            {isVolunteerMode && onModeChange && (
                <div className="px-4 py-3 border-b border-lijn bg-brand-beige-dark">
                    <div className="grid grid-cols-2 gap-0">
                        {(Object.keys(MODE_LABELS) as VolunteerCartMode[]).map((m, i) => (
                            <button
                                key={m}
                                onClick={() => {
                                    if ('vibrate' in navigator) navigator.vibrate(20);
                                    onModeChange(m);
                                }}
                                className={cn(
                                    "py-2.5 text-[10px] font-semibold cursor-pointer border border-lijn flex items-center justify-center gap-1.5 transition-colors",
                                    i > 0 && "border-l-0",
                                    mode === m
                                        ? "bg-blue-600 text-white"
                                        : "bg-brand-beige text-brand-black hover:bg-blue-100"
                                )}
                            >
                                {MODE_LABELS[m].tab}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-[10px] text-brand-black/70">{MODE_HINTS[mode]}</p>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 flex flex-col bg-brand-beige overflow-y-auto">
                {checkedOutTotal !== null ? (
                    <div className="text-center py-8 px-4 flex flex-col items-center gap-4 animate-in fade-in duration-500 bg-brand-beige">
                        <div className="text-emerald-500">
                            <CheckCircle className="w-12 h-12" />
                        </div>
                        <h3 className="text-2xl font-semibold">Done!</h3>
                        <p className="text-lg font-bold px-4 py-2 border border-lijn bg-white">
                            Total: €{checkedOutTotal?.toFixed(2)}
                        </p>
                        
                        <div className="w-full flex justify-center mt-2">
                            <WeroQrCode 
                                total={checkedOutTotal} 
                                description={checkedOutDescription || "Inventree Stock Purchase"} 
                            />
                        </div>

                        {invoice && (invoiceFor === null ? (
                            <button onClick={() => setInvoiceFor('')} className="brutalist-button px-4 py-2 text-xs bg-white flex items-center gap-2">
                                <FileText size={14} /> Need a receipt?
                            </button>
                        ) : (
                            <form
                                className="w-full max-w-sm border border-lijn bg-white p-3 space-y-2 text-left"
                                onSubmit={e => {
                                    e.preventDefault();
                                    downloadInvoice(invoice, invoiceFor).catch(() => addToast('Could not make the receipt PDF', 'error'));
                                }}
                            >
                                <label htmlFor="invoice-customer" className="text-xs font-semibold">Receipt for (name or company, optional)</label>
                                <textarea
                                    id="invoice-customer" rows={3} value={invoiceFor} autoFocus
                                    onChange={e => setInvoiceFor(e.target.value)}
                                    className="w-full px-2 py-1.5 border border-lijn text-sm"
                                    placeholder={'Jane Doe\nStreet 1, 9000 Gent\nBE0123.456.789'}
                                />
                                <button type="submit" className="brutalist-button w-full py-2 text-xs font-semibold bg-brand-black text-white flex items-center justify-center gap-2">
                                    <FileText size={14} /> Download receipt PDF ({invoice.reference})
                                </button>
                            </form>
                        ))}

                        {onClearCheckout && (confirmClear ? (
                            <div role="alertdialog" aria-labelledby="clear-checkout-q" className="mt-4 border border-brand-black bg-white p-4 max-w-sm space-y-3">
                                <p id="clear-checkout-q" className="text-sm font-semibold">Are you sure you have paid?</p>
                                <p className="text-xs text-brand-black/70">The QR code will not appear again.</p>
                                <div className="flex gap-2 justify-center">
                                    <button onClick={() => setConfirmClear(false)} className="brutalist-button px-4 py-2 text-xs bg-white">
                                        Back to the QR code
                                    </button>
                                    <button onClick={() => { setConfirmClear(false); setInvoiceFor(null); onClearCheckout(); }} className="brutalist-button px-4 py-2 text-xs bg-brand-black text-white">
                                        Yes, I have paid
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmClear(true)}
                                className="brutalist-button mt-4 px-6 py-3 text-xs bg-white flex items-center gap-2"
                            >
                                <X size={14} /> Start new transaction
                            </button>
                        ))}
                    </div>
                ) : (
                    <>
                        {cartItems.length > 0 ? (
                            <>
                                {/* Items List */}
                                <div className="flex-1 overflow-y-auto">
                                    <AnimatePresence mode="popLayout">
                                {cartItems.map((item) => {
                                            // Calculate what will happen to stock
                                            const currentStock = item.quantity;
                                            // Bought or taken for free: stock goes down either way.
                                            const newStock = currentStock - item.cartQuantity;
                                            const stockChangeText = free ? `-${item.cartQuantity} free` : `-${item.cartQuantity}`;
                                            const stockChangeColor = 'text-red-600';

                                            return (
                                            <motion.div
                                                key={item.id}
                                                layout
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ 
                                                    opacity: 1, 
                                                    x: 0,
                                                    backgroundColor: lastActionId === item.id 
                                                        ? (stockChangeColor === 'text-red-600' ? '#fee2e2' : '#d1fae5') 
                                                        : '#ffffff'
                                                }}
                                                exit={{ opacity: 0, x: -20, transition: { duration: 0.15 } }}
                                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                className="px-3 py-3 border-b border-lijn hover:bg-brand-beige-dark/30"
                                            >
                                                {/* Top row: Image, Name, Remove */}
                                                <div className="flex items-start gap-3">
                                                    {/* Image */}
                                                    <div className="w-14 h-14 flex-shrink-0 border border-lijn bg-white overflow-hidden">
                                                        <ImageDisplay
                                                            imagePath={item.image}
                                                            alt={item.name}
                                                            width={56}
                                                            height={56}
                                                        />
                                                    </div>
                                                    
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-sm leading-tight truncate">
                                                            {item.name}
                                                        </p>
                                                        
                                                        {/* Meta info: Location & Category */}
                                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                                            {item.location && (
                                                                <span className="flex items-center gap-1 text-[10px] text-brand-black/60">
                                                                    <MapPin size={10} />
                                                                    {item.location}
                                                                </span>
                                                            )}
                                                            {item.category && (
                                                                <span className="flex items-center gap-1 text-[10px] text-brand-black/60">
                                                                    <Tag size={10} />
                                                                    {item.category}
                                                                </span>
                                                            )}
                                                            {free && (
                                                                <span className="text-[10px] font-semibold px-1.5 border border-lijn bg-white">
                                                                    {!isLabMaterial(item) ? 'Volunteer drink' : isFilament(item) ? 'Lab rack (3D printers)' : 'Lab / workshop'}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Stock info with change preview */}
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="flex items-center gap-1 text-xs font-bold">
                                                                <Package size={12} />
                                                                <span className="text-brand-black/60">Stock:</span>
                                                                <span>{currentStock}</span>
                                                                <span className="text-brand-black/40">→</span>
                                                                <span className={cn("font-semibold", newStock < 0 ? "text-red-600" : stockChangeColor)}>
                                                                    {newStock}
                                                                </span>
                                                                <span className={cn("text-[10px] font-semibold", stockChangeColor)}>
                                                                    ({stockChangeText})
                                                                </span>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Remove button */}
                                                    <button
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        aria-label={`Remove ${item.name}`}
                                                        title="Remove from the cart"
                                                        className="h-11 px-3 flex items-center justify-center gap-1.5 bg-white text-red-600 text-xs font-semibold border border-lijn hover:bg-red-50 active:scale-95 transition-all flex-shrink-0"
                                                    >
                                                        <Trash2 size={16} aria-hidden /> <span className="hidden sm:inline">Remove</span>
                                                    </button>
                                                </div>

                                                {/* Bottom row: Quantity controls & Price */}
                                                <div className="flex items-center justify-between mt-3 pt-2 border-t border-lijn">
                                                {/* Quantity Controls */}
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity - 1)}
                                                            aria-label={`One less ${item.name}`}
                                                            className="w-11 h-11 flex items-center justify-center border border-lijn bg-red-400 hover:bg-red-500 active:scale-95 transition-all"
                                                        >
                                                            <Minus size={16} />
                                                        </button>
                                                        <span className="w-12 text-center font-semibold text-lg text-brand-black">
                                                            {item.cartQuantity}
                                                        </span>
                                                        <button
                                                            onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity + 1)}
                                                            aria-label={`One more ${item.name}`}
                                                            className="w-11 h-11 flex items-center justify-center border border-lijn bg-emerald-400 hover:bg-emerald-500 active:scale-95 transition-all"
                                                        >
                                                            <Plus size={16} />
                                                        </button>
                                                    </div>
                                                    
                                                    {/* Price */}
                                                    {!free && (
                                                        <div className="text-right">
                                                            <span className="text-[10px] text-brand-black/50 block">€{item.price.toFixed(2)} × {item.cartQuantity}</span>
                                                            <span className="font-semibold text-lg">€{(item.price * item.cartQuantity).toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            </>
                        ) : (
                            <div className="py-10 px-6 flex flex-col items-center justify-center text-center bg-brand-beige">
                                <ShoppingCartIcon size={36} className="mb-3 text-emerald-600" aria-hidden />
                                <p className="font-semibold text-base text-brand-black">Your cart is empty</p>
                                <p className="text-sm mt-1 text-grafiet max-w-xs">Scan the barcode of what you take, or add the time you used a machine below.</p>
                            </div>
                        )}

                        {/* Footer: Total & Checkout */}
                        {(cartItems.length > 0 || extraCosts > 0) && (
                            <div className="mt-auto border-t border-lijn bg-brand-beige p-4">
                                {/* Free items cost nothing; machine time on top is still paid. */}
                                {(!free || toPay > 0) && (
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-sm font-semibold text-brand-black/60">{free ? 'To pay' : 'Total'}</span>
                                        <span className="font-semibold text-2xl">€{toPay.toFixed(2)}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        if ('vibrate' in navigator) navigator.vibrate(50);
                                        onCheckout();
                                    }}
                                    disabled={isCheckingOut}
                                    className={cn(
                                        "w-full py-4 text-base font-semibold flex items-center justify-center gap-2 border border-lijn transition-all",
                                        free
                                            ? "bg-amber-300 text-brand-black hover:brightness-95"
                                            : "bg-emerald-400 text-brand-black hover:brightness-95",
                                        isCheckingOut && "opacity-75 cursor-not-allowed"
                                    )}
                                >
                                    {isCheckingOut ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        free && cartItems.length > 0 && toPay === 0 ? MODE_LABELS[mode].action : `Pay €${toPay.toFixed(2)}`
                                    )}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default ShoppingCart;
