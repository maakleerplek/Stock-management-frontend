import { useState } from 'react';
import { type ItemData } from './sendCodeHandler';
import ImageDisplay from './ImageDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingCart as ShoppingCartIcon, Heart, CheckCircle, Loader2, MapPin, Tag, Package } from 'lucide-react';
import { cn } from './lib/utils';
import WeroQrCode from './QrCode';
import { useToast } from './ToastContext';

export interface CartItem extends ItemData {
    cartQuantity: number;
}
interface ShoppingCartProps {
    cartItems: CartItem[];
    onUpdateQuantity: (itemId: number, newQuantity: number) => void;
    onRemoveItem: (itemId: number) => void;
    onCheckout: () => void;
    checkedOutTotal: number | null;
    checkedOutDescription?: string;
    onClearCheckout?: () => void;
    extraCosts: number;
    isVolunteerMode: boolean;
    isSetMode?: boolean;
    onSetModeChange?: (isSet: boolean) => void;
    isCheckingOut?: boolean;
}

function ShoppingCart({
    cartItems = [],
    onUpdateQuantity,
    onRemoveItem,
    onCheckout,
    checkedOutTotal,
    checkedOutDescription,
    onClearCheckout,
    extraCosts,
    isVolunteerMode,
    isSetMode = false,
    onSetModeChange,
    isCheckingOut = false,
}: ShoppingCartProps) {
    const { addToast } = useToast();
    const [lastActionId, setLastActionId] = useState<number | null>(null);

    const totalPrice = (cartItems || []).reduce(
        (total, item) => total + item.price * item.cartQuantity,
        0
    );

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
        <div className="w-full flex flex-col bg-white border-l-0">
            {/* Header */}
            <div className="flex items-center justify-center gap-3 px-4 py-3 bg-gray-100 border-b-3 border-brand-black text-brand-black">
                {isVolunteerMode ? (
                    <Heart className="w-5 h-5 text-brand-black" />
                ) : (
                    <ShoppingCartIcon className="w-5 h-5 text-brand-black" />
                )}
                <h2 className="text-sm font-black uppercase tracking-widest text-brand-black">
                    {isVolunteerMode ? (isSetMode ? "SET STOCK" : "ADD TO STOCK") : "SHOPPING CART"}
                </h2>
            </div>

            {/* Volunteer Mode Toggle */}
            {isVolunteerMode && onSetModeChange && (
                <div className="px-4 py-3 border-b-3 border-brand-black bg-gray-50">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => {
                                if ('vibrate' in navigator) navigator.vibrate(20);
                                onSetModeChange(false);
                            }}
                            className={cn(
                                "py-2 text-[10px] font-black transition-colors uppercase cursor-pointer border-3 border-brand-black",
                                !isSetMode ? "bg-brand-black text-white" : "bg-white text-brand-black hover:bg-gray-100"
                            )}
                        >
                            Add / Remove
                        </button>
                        <button
                            onClick={() => {
                                if ('vibrate' in navigator) navigator.vibrate(20);
                                onSetModeChange(true);
                            }}
                            className={cn(
                                "py-2 text-[10px] font-black transition-colors uppercase cursor-pointer border-3 border-brand-black",
                                isSetMode ? "bg-brand-black text-white" : "bg-white text-brand-black hover:bg-gray-100"
                            )}
                        >
                            Set Absolute
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex-1 flex flex-col bg-white overflow-y-auto">
                {checkedOutTotal !== null ? (
                    <div className="text-center py-8 px-4 flex flex-col items-center gap-4 animate-in fade-in duration-500 bg-white">
                        <div className="text-emerald-500">
                            <CheckCircle className="w-12 h-12" />
                        </div>
                        <h3 className="text-2xl font-black uppercase">DONE!</h3>
                        <p className="text-lg font-bold uppercase px-4 py-2 border-3 border-brand-black bg-white">
                            TOTAL: €{checkedOutTotal?.toFixed(2)}
                        </p>
                        
                        <div className="w-full flex justify-center mt-2">
                            <WeroQrCode 
                                total={checkedOutTotal} 
                                description={checkedOutDescription || "Inventree Stock Purchase"} 
                            />
                        </div>

                        {onClearCheckout && (
                            <button
                                onClick={onClearCheckout}
                                className="brutalist-button mt-4 px-6 py-3 text-xs bg-white"
                            >
                                START NEW TRANSACTION
                            </button>
                        )}
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
                                            let newStock: number;
                                            let stockChangeText: string;
                                            let stockChangeColor: string;
                                            
                                            if (isVolunteerMode) {
                                                if (isSetMode) {
                                                    // Set mode: stock will be set to cartQuantity
                                                    newStock = item.cartQuantity;
                                                    stockChangeText = `SET TO ${newStock}`;
                                                    stockChangeColor = 'text-blue-600';
                                                } else {
                                                    // Add/Remove mode: positive = add (green), negative = remove (red)
                                                    newStock = currentStock + item.cartQuantity;
                                                    if (item.cartQuantity >= 0) {
                                                        stockChangeText = `+${item.cartQuantity}`;
                                                        stockChangeColor = 'text-emerald-600';
                                                    } else {
                                                        stockChangeText = `${item.cartQuantity}`;
                                                        stockChangeColor = 'text-red-600';
                                                    }
                                                }
                                            } else {
                                                // Checkout mode: stock will decrease
                                                newStock = currentStock - item.cartQuantity;
                                                stockChangeText = `-${item.cartQuantity}`;
                                                stockChangeColor = 'text-red-600';
                                            }

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
                                                className="px-3 py-3 border-b-3 border-brand-black/10 hover:bg-gray-50"
                                            >
                                                {/* Top row: Image, Name, Remove */}
                                                <div className="flex items-start gap-3">
                                                    {/* Image */}
                                                    <div className="w-14 h-14 flex-shrink-0 border-2 border-brand-black bg-white overflow-hidden">
                                                        <ImageDisplay
                                                            imagePath={item.image}
                                                            alt={item.name}
                                                            width={56}
                                                            height={56}
                                                            sx={{ border: 'none', bgcolor: 'transparent', borderRadius: 0 }}
                                                        />
                                                    </div>
                                                    
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-black text-sm uppercase leading-tight truncate">
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
                                                        </div>

                                                        {/* Stock info with change preview */}
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="flex items-center gap-1 text-xs font-bold">
                                                                <Package size={12} />
                                                                <span className="text-brand-black/60">Stock:</span>
                                                                <span>{currentStock}</span>
                                                                <span className="text-brand-black/40">→</span>
                                                                <span className={cn("font-black", newStock < 0 ? "text-red-600" : stockChangeColor)}>
                                                                    {newStock}
                                                                </span>
                                                                <span className={cn("text-[10px] font-black", stockChangeColor)}>
                                                                    ({stockChangeText})
                                                                </span>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Remove button */}
                                                    <button
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        className="w-8 h-8 flex items-center justify-center bg-red-500 text-white border-2 border-brand-black hover:bg-red-600 active:scale-95 transition-all flex-shrink-0"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                {/* Bottom row: Quantity controls & Price */}
                                                <div className="flex items-center justify-between mt-3 pt-2 border-t border-brand-black/10">
                                                {/* Quantity Controls */}
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity - 1)}
                                                            className="w-8 h-8 flex items-center justify-center border-2 border-brand-black bg-red-400 hover:bg-red-500 active:scale-95 transition-all"
                                                        >
                                                            <Minus size={14} />
                                                        </button>
                                                        <span className={cn(
                                                            "w-12 text-center font-black text-lg",
                                                            item.cartQuantity < 0 ? "text-red-600" : "text-brand-black"
                                                        )}>
                                                            {item.cartQuantity > 0 && !isVolunteerMode ? '' : ''}{item.cartQuantity}
                                                        </span>
                                                        <button
                                                            onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity + 1)}
                                                            className="w-8 h-8 flex items-center justify-center border-2 border-brand-black bg-emerald-400 hover:bg-emerald-500 active:scale-95 transition-all"
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                    
                                                    {/* Price */}
                                                    {!isVolunteerMode && (
                                                        <div className="text-right">
                                                            <span className="text-[10px] text-brand-black/50 block">€{item.price.toFixed(2)} × {item.cartQuantity}</span>
                                                            <span className="font-black text-lg">€{(item.price * item.cartQuantity).toFixed(2)}</span>
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
                            <div className="py-12 flex flex-col items-center justify-center bg-white text-brand-black/40">
                                <ShoppingCartIcon size={36} className="mb-3 opacity-30" />
                                <p className="font-black text-xs uppercase tracking-widest">CART IS EMPTY</p>
                                <p className="text-[10px] mt-1 opacity-60">SCAN ITEMS TO ADD</p>
                            </div>
                        )}

                        {/* Footer: Total & Checkout */}
                        {(cartItems.length > 0 || extraCosts > 0) && (
                            <div className="mt-auto border-t-3 border-brand-black bg-white p-4">
                                {!isVolunteerMode && (
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-sm font-black uppercase text-brand-black/60">TOTAL</span>
                                        <span className="font-black text-2xl">€{(totalPrice + extraCosts).toFixed(2)}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        if ('vibrate' in navigator) navigator.vibrate(50);
                                        onCheckout();
                                    }}
                                    disabled={isCheckingOut}
                                    className={cn(
                                        "w-full py-3 text-sm font-black flex items-center justify-center gap-2 tracking-widest border-3 border-brand-black transition-all",
                                        isVolunteerMode 
                                            ? "bg-brand-black text-white hover:bg-zinc-800" 
                                            : "bg-emerald-400 text-brand-black hover:brightness-95",
                                        isCheckingOut && "opacity-75 cursor-not-allowed"
                                    )}
                                >
                                    {isCheckingOut ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            PROCESSING...
                                        </>
                                    ) : (
                                        isVolunteerMode ? (isSetMode ? 'SET STOCK' : 'ADD TO STOCK') : 'CHECKOUT'
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
