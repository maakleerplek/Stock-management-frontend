import { useState } from 'react';
import { type ItemData } from './sendCodeHandler';
import ImageDisplay from './ImageDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingCart as ShoppingCartIcon, Heart, CheckCircle, Loader2 } from 'lucide-react';
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
        <div className={cn(
            "brutalist-card w-full flex flex-col bg-white",
            isVolunteerMode && "border-t-2 border-t-amber-400"
        )}>
            {/* Header */}
            <div className="flex items-center justify-center gap-3 p-4 bg-brand-beige-dark border-b-2 border-brand-black text-brand-black">
                {isVolunteerMode ? (
                    <Heart className="w-6 h-6 text-brand-black" />
                ) : (
                    <ShoppingCartIcon className="w-6 h-6 text-brand-black" />
                )}
                <h2 className="text-base font-black uppercase tracking-widest text-brand-black">
                    {isVolunteerMode ? (isSetMode ? "SET STOCK" : "ADD TO STOCK") : "SHOPPING CART"}
                </h2>
            </div>

            {/* Volunteer Mode Toggle */}
            {isVolunteerMode && onSetModeChange && (
                <div className="px-5 py-4 border-b-2 border-brand-black bg-brand-beige">
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => {
                                if ('vibrate' in navigator) navigator.vibrate(20);
                                onSetModeChange(false);
                            }}
                            className={cn(
                                "brutalist-button py-3 text-xs sm:text-sm font-black transition-colors uppercase cursor-pointer",
                                !isSetMode ? "bg-brand-black text-white" : "bg-white text-brand-black hover:bg-brand-beige-dark"
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
                                "brutalist-button py-3 text-xs sm:text-sm font-black transition-colors uppercase cursor-pointer",
                                isSetMode ? "bg-brand-black text-white" : "bg-white text-brand-black hover:bg-brand-beige-dark"
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
                    <div className="text-center py-12 px-6 flex flex-col items-center gap-6 animate-in fade-in duration-500 bg-white">
                        <div className="text-emerald-500">
                            <CheckCircle className="w-16 h-16" />
                        </div>
                        <h3 className="text-3xl font-black uppercase">DONE!</h3>
                        <p className="text-xl font-bold uppercase p-4 border-2 border-brand-black bg-white">
                            TOTAL: €{checkedOutTotal?.toFixed(2)}
                        </p>
                        
                        <div className="w-full flex justify-center mt-4 min-h-[200px]">
                            <WeroQrCode 
                                total={checkedOutTotal} 
                                description={checkedOutDescription || "Inventree Stock Purchase"} 
                            />
                        </div>

                        {onClearCheckout && (
                            <button
                                onClick={onClearCheckout}
                                className="brutalist-button mt-6 px-8 py-4 text-sm bg-white"
                            >
                                START NEW TRANSACTION
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {cartItems.length > 0 ? (
                            <div className="divide-y-2 divide-brand-black">
                                {/* Table Header Row */}
                                <div className="flex flex-row items-center p-3 sm:px-4 sm:py-2 border-b-2 border-brand-black bg-brand-beige/30">
                                    <div className="w-[50px] flex-shrink-0"></div>
                                    <div className="min-w-0 flex-1 px-4">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">ITEM</span>
                                    </div>
                                    <div className="flex items-center gap-4 sm:gap-6 w-[140px] sm:w-[180px] justify-between pr-8">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">STOCK</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">PRICE</span>
                                    </div>
                                </div>
                                <AnimatePresence mode="popLayout">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 min-[1600px]:grid-cols-3 gap-6 p-4 sm:p-6">
                                        {cartItems.map((item) => (
                                            <motion.div
                                                key={item.id}
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ 
                                                    opacity: 1, 
                                                    scale: lastActionId === item.id ? [1, 1.05, 1] : 1,
                                                    borderColor: lastActionId === item.id ? '#34d399' : '#1e1b18',
                                                    backgroundColor: 'white'
                                                }}
                                                exit={{ 
                                                    opacity: 0, 
                                                    scale: 0.9,
                                                    transition: { duration: 0.2 } 
                                                }}
                                                transition={{ 
                                                    type: 'spring', 
                                                    stiffness: 500, 
                                                    damping: 30, 
                                                    mass: 1,
                                                    scale: { duration: 0.2 }
                                                }}
                                                className="flex flex-col border-2 border-brand-black bg-white overflow-hidden transition-colors"
                                            >
                                                {/* Card Header: Image & Name */}
                                                <div className="p-4 flex gap-4 border-b-2 border-brand-black bg-brand-beige/10">
                                                    <div className="flex-shrink-0 border-2 border-brand-black bg-white w-16 h-16 flex items-center justify-center">
                                                        <ImageDisplay
                                                            imagePath={item.image}
                                                            alt={item.name}
                                                            width={60}
                                                            height={60}
                                                            sx={{ border: 'none', bgcolor: 'transparent', borderRadius: 0 }}
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                        <p className="font-black text-xs uppercase tracking-tight leading-tight line-clamp-2">
                                                            {item.name}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-brand-black/50 mt-1 uppercase">
                                                            €{item.price.toFixed(2)} / EA
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Card Body: Controls */}
                                                <div className="p-4 space-y-4">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity - 1)}
                                                                className="p-1.5 border-2 border-brand-black bg-rose-400 hover:brightness-95 active:translate-x-[1px] active:translate-y-[1px] transition-all"
                                                            >
                                                                <Minus size={14} className="text-brand-black" />
                                                            </button>
                                                            <span className="font-black text-sm text-center w-8">
                                                                {item.cartQuantity}
                                                            </span>
                                                            <button
                                                                onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity + 1)}
                                                                className="p-1.5 border-2 border-brand-black bg-emerald-400 hover:brightness-95 active:translate-x-[1px] active:translate-y-[1px] transition-all"
                                                            >
                                                                <Plus size={14} className="text-brand-black" />
                                                            </button>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[10px] font-black text-brand-black/40 uppercase">SUBTOTAL</div>
                                                            <div className="font-black text-sm">€{(item.price * item.cartQuantity).toFixed(2)}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card Footer: Actions */}
                                                <div className="mt-auto border-t-2 border-brand-black p-2 bg-brand-beige/5 flex justify-end">
                                                    <button
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        className="p-2 border-2 border-brand-black bg-white hover:bg-rose-500 hover:text-white transition-all text-[10px] font-black uppercase flex items-center gap-2"
                                                    >
                                                        <Trash2 size={12} /> REMOVE
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </AnimatePresence>
                            </div>
                        ) : (
                            <div className="py-16 flex flex-col items-center justify-center bg-white border-b-2 border-brand-black text-brand-black/50">
                                <ShoppingCartIcon size={48} className="mb-4 opacity-20" />
                                <p className="font-black text-sm uppercase tracking-widest">CART IS EMPTY</p>
                            </div>
                        )}

                        <div className="px-5 pb-5 pt-5 bg-white">
                            {(cartItems.length > 0 || extraCosts > 0) && (
                                <div className="">
                                    {!isVolunteerMode && (
                                        <p className="text-right border-t-2 border-brand-black pt-4 pb-2 font-black text-lg sm:text-xl uppercase tracking-wider">
                                            TOTAL: €{(totalPrice + extraCosts).toFixed(2)}
                                        </p>
                                    )}
                                    <button
                                        onClick={() => {
                                            if ('vibrate' in navigator) navigator.vibrate(50);
                                            onCheckout();
                                        }}
                                        disabled={isCheckingOut}
                                        className={cn(
                                            "brutalist-button w-full mt-4 py-4 text-base font-black flex items-center justify-center gap-2 tracking-widest",
                                            isVolunteerMode 
                                                ? "bg-brand-black text-white hover:bg-zinc-800" 
                                                : "bg-emerald-400 text-brand-black hover:bg-emerald-500",
                                            isCheckingOut && "opacity-75 cursor-not-allowed"
                                        )}
                                    >
                                        {isCheckingOut ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                PROCESSING...
                                            </>
                                        ) : (
                                            isVolunteerMode ? (isSetMode ? 'SET STOCK' : 'ADD TO STOCK') : 'CHECKOUT'
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default ShoppingCart;