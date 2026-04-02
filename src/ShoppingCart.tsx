import { useState } from 'react';
import { type ItemData } from './sendCodeHandler';
import Extras from './Extras';
import ImageDisplay from './ImageDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Minus, ShoppingCart, Heart, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from './lib/utils';


export interface CartItem extends ItemData {
    cartQuantity: number;
}
interface ShoppingCartProps {
    cartItems: CartItem[];
    onUpdateQuantity: (itemId: number, newQuantity: number) => void;
    onRemoveItem: (itemId: number) => void;
    onCheckout: () => void;
    checkedOutTotal: number | null;
    onClearCheckout?: () => void;
    onExtraCostChange: (cost: number) => void;
    extraCosts: number;
    isVolunteerMode: boolean;
    isSetMode?: boolean;
    onSetModeChange?: (isSet: boolean) => void;
    isCheckingOut?: boolean;
}



function ShoppingCart({
    cartItems,
    onUpdateQuantity,
    onRemoveItem,
    onCheckout,
    checkedOutTotal,
    onClearCheckout,
    onExtraCostChange,
    extraCosts,
    isVolunteerMode,
    isSetMode = false,
    onSetModeChange,
    isCheckingOut = false,
}: ShoppingCartProps) {
    const [lastActionId, setLastActionId] = useState<number | null>(null);

    const totalPrice = cartItems.reduce(
        (total, item) => total + item.price * item.cartQuantity,
        0
    );

    const handleUpdateQuantityWithFeedback = (id: number, qty: number) => {
        if ('vibrate' in navigator) navigator.vibrate(10);
        setLastActionId(id);
        onUpdateQuantity(id, qty);
        setTimeout(() => setLastActionId(null), 500);
    };

    // Handle item removal with animation
    const handleRemoveItem = (itemId: number) => {
        if ('vibrate' in navigator) navigator.vibrate([30, 30]);
        onRemoveItem(itemId); // Actual removal triggers animation exit
    };
    // Don't render if cart is empty and no recent checkout
    return (
        <div className={cn(
            "brutalist-card w-full max-w-full sm:max-w-[640px] flex flex-col",
            isVolunteerMode && "border-t-[6px] border-t-black"
        )}>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 sm:p-6 border-b-3 border-black">
                {isVolunteerMode ? (
                    <Heart className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                    <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6" />
                )}
                <h2 className="text-base sm:text-lg font-bold uppercase">
                    {isVolunteerMode ? (isSetMode ? "Set Stock" : "Add to Stock") : "Shopping Cart"}
                </h2>
            </div>

            {/* Volunteer Mode Toggle */}
            {isVolunteerMode && onSetModeChange && (
                <div className="px-4 sm:px-6 py-3 border-b-3 border-black">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => {
                                if ('vibrate' in navigator) navigator.vibrate(20);
                                onSetModeChange(false);
                            }}
                            className={cn(
                                "brutalist-button py-2 text-xs sm:text-sm font-bold uppercase transition-colors",
                                !isSetMode ? "bg-black text-beige" : "bg-beige text-black hover:bg-beige-dark"
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
                                "brutalist-button py-2 text-xs sm:text-sm font-bold uppercase transition-colors",
                                isSetMode ? "bg-black text-beige" : "bg-beige text-black hover:bg-beige-dark"
                            )}
                        >
                            Set Absolute
                        </button>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="flex flex-col">
                {checkedOutTotal !== null ? (
                    // Display checkout successful summary
                    <div className="text-center py-8 sm:py-12 px-4 sm:px-6 flex flex-col items-center gap-4 animate-in fade-in duration-500">
                        <div className="text-green-600">
                            <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16" />
                        </div>
                        <h3 className="text-xl sm:text-2xl font-bold uppercase">Done!</h3>
                        <p className="text-lg font-bold">Total: €{checkedOutTotal?.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">
                            You can pay via the QR code below.
                        </p>
                        {onClearCheckout && (
                            <button
                                onClick={onClearCheckout}
                                className="brutalist-button mt-2 px-6 py-2 text-sm"
                            >
                                New transaction
                            </button>
                        )}
                    </div>
                ) : (
                    // Display current cart state or empty message + extras
                    <>
                        {cartItems.length > 0 ? (
                            <div className="divide-y-3 divide-black">
                                <AnimatePresence mode="popLayout">
                                    {cartItems.map((item) => (
                                        <motion.div
                                            key={item.id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ 
                                                opacity: 1, 
                                                scale: 1,
                                                backgroundColor: lastActionId === item.id ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                                            }}
                                            exit={{ 
                                                opacity: 0, 
                                                x: 100, 
                                                scale: 0.9,
                                                transition: { duration: 0.2 } 
                                            }}
                                            transition={{ 
                                                type: 'spring',
                                                stiffness: 500,
                                                damping: 30,
                                                mass: 1
                                            }}
                                            className="flex flex-row items-center p-3 sm:p-4 gap-3 sm:gap-4 transition-colors"
                                        >
                                            {/* Left Section: Image */}
                                            <div className="flex-shrink-0">
                                                <ImageDisplay
                                                    imagePath={item.image}
                                                    alt={item.name}
                                                    width={isVolunteerMode ? 40 : 50}
                                                    height={isVolunteerMode ? 40 : 50}
                                                    sx={{ border: 'none', bgcolor: 'transparent' }}
                                                />
                                            </div>

                                            {/* Middle Section: Info */}
                                            <div className="min-w-0 flex-1 flex flex-col gap-1">
                                                <p className="font-bold text-sm leading-tight">
                                                    {item.name}
                                                </p>
                                                <div className="flex flex-col text-xs text-gray-600">
                                                    {item.category && (
                                                        <span>
                                                            <span className="font-bold text-black">Category: </span>{item.category}
                                                        </span>
                                                    )}
                                                    {item.location && (
                                                        <span>
                                                            <span className="font-bold text-black">Location: </span>{item.location}
                                                        </span>
                                                    )}
                                                    
                                                    <div className="mt-1">
                                                        <span>
                                                            <span className="font-bold text-black">Stock: </span>{item.quantity}
                                                            <span className={cn(
                                                                "ml-1 font-bold",
                                                                isVolunteerMode 
                                                                    ? (isSetMode ? "text-orange-600" : (item.cartQuantity >= 0 ? "text-green-600" : "text-red-600"))
                                                                    : "text-red-600"
                                                            )}>
                                                                {isVolunteerMode 
                                                                    ? (isSetMode ? `=> ${item.cartQuantity}` : (item.cartQuantity >= 0 ? `(+${item.cartQuantity})` : `(-${Math.abs(item.cartQuantity)})`)) 
                                                                    : `(-${item.cartQuantity})`
                                                                }
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right Section: Controls and Price */}
                                            <div className="flex items-center gap-2 sm:gap-3">
                                                {/* Quantity Controls */}
                                                <div className="flex items-center bg-beige brutalist-border h-7 sm:h-8 px-1">
                                                    <button
                                                        onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity - 1)}
                                                        disabled={isSetMode && item.cartQuantity <= 0}
                                                        className="p-1 text-black hover:bg-beige-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                                                    </button>
                                                    <input
                                                        value={item.cartQuantity}
                                                        type="text"
                                                        inputMode="numeric"
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value.replace(/\D/g, ''), 10);
                                                            handleUpdateQuantityWithFeedback(
                                                                item.id,
                                                                isNaN(val) ? 0 : Math.min(
                                                                    val,
                                                                    isSetMode ? 999999 : (isVolunteerMode ? 999999 : item.quantity)
                                                                )
                                                            );
                                                        }}
                                                        className="w-6 sm:w-7 text-center text-xs sm:text-sm font-bold bg-transparent border-none outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                    <button
                                                        onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity + 1)}
                                                        disabled={!isVolunteerMode && !isSetMode && item.cartQuantity >= item.quantity}
                                                        className="p-1 text-black hover:bg-beige-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                                                    </button>
                                                </div>

                                                {/* Price */}
                                                <p className="font-bold text-sm min-w-[50px] text-right">
                                                    €{(item.price * item.cartQuantity).toFixed(2)}
                                                </p>

                                                {/* Delete Button */}
                                                <button
                                                    onClick={() => handleRemoveItem(item.id)}
                                                    className="p-1 text-red-600 hover:bg-red-50 transition-colors opacity-70 hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        ) : (
                            <p className="text-center py-8 text-gray-600 text-sm">
                                Your cart is empty. Scan an item to add it.
                            </p>
                        )}

                        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                            {!isVolunteerMode && <Extras onExtraCostChange={onExtraCostChange} />}

                            {(cartItems.length > 0 || extraCosts > 0) && (
                                <div className="mt-3">
                                    {!isVolunteerMode && (
                                        <p className="text-right border-t-3 border-black pt-3 font-bold text-sm sm:text-base">
                                            Total: €{(totalPrice + extraCosts).toFixed(2)}
                                        </p>
                                    )}
                                    <button
                                        onClick={() => {
                                            if ('vibrate' in navigator) navigator.vibrate(50);
                                            onCheckout();
                                        }}
                                        disabled={isCheckingOut}
                                        className={cn(
                                            "brutalist-button w-full mt-4 py-3 text-base font-bold uppercase flex items-center justify-center gap-2",
                                            isVolunteerMode ? "bg-black text-beige hover:shadow-[6px_6px_0_rgba(0,0,0,1)]" : "hover:shadow-[6px_6px_0_rgba(0,0,0,1)]",
                                            isCheckingOut && "opacity-75 cursor-not-allowed"
                                        )}
                                    >
                                        {isCheckingOut ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            isVolunteerMode ? (isSetMode ? 'Set Stock' : 'Add to Stock') : 'Checkout'
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