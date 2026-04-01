import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
} from '@mui/material';
import ShoppingCart, { type CartItem } from './ShoppingCart';
import { type ItemData, type ScanEvent, handleTakeItem, handleAddItem, handleSetItem } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { useVolunteer } from './VolunteerContext';

interface ShoppingWindowProps {
    scanEvent: ScanEvent | null;
    onCheckoutResultChange?: (result: { total: number; description: string } | null) => void;
}

const CART_STORAGE_KEY = 'stockManagerCartItems';

export default function ShoppingWindow({ scanEvent, onCheckoutResultChange }: ShoppingWindowProps) {
    const [cartItems, setCartItems] = useState<CartItem[]>(() => {
        try {
            const stored = localStorage.getItem(CART_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
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
    const [confirmMessage, setConfirmMessage] = useState('');
    const { addToast } = useToast();
    const { isVolunteerMode } = useVolunteer();

    const handleSetModeChange = useCallback((newMode: boolean) => {
        setIsSetMode(newMode);
        if (!newMode) {
            // Un-setting Set Mode should delete items that sit at 0
            setCartItems((prevItems) => prevItems.filter(item => item.cartQuantity !== 0));
        }
    }, []);

    const setCheckedOut = useCallback((result: { total: number; description: string } | null) => {
        setCheckedOutResult(result);
        onCheckoutResultChange?.(result);
    }, [onCheckoutResultChange]);

    // Cleanup cart if volunteer mode is exited
    useEffect(() => {
        if (!isVolunteerMode) {
            setCartItems((prevItems) => prevItems.filter(item => item.cartQuantity > 0));
        }
    }, [isVolunteerMode]);

    // Persist cart items
    useEffect(() => {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    }, [cartItems]);

    const handleAddItemToCart = useCallback((item: ItemData) => {
        console.log('[Cart] Adding item to cart:', { id: item.id, name: item.name, price: item.price });
        setCheckedOut(null);
        setCartItems((prevItems) => {
            const existingItem = prevItems.find((i) => i.id === item.id);
            if (existingItem) {
                const newQuantity = Math.min(existingItem.cartQuantity + 1, item.quantity);
                console.log(`[Cart] Incrementing quantity for ${item.name}: ${existingItem.cartQuantity} -> ${newQuantity}`);
                return prevItems.map((i) =>
                    i.id === item.id ? { ...i, cartQuantity: newQuantity } : i
                );
            }
            console.log('[Cart] New item added to cart list');
            return [...prevItems, { ...item, cartQuantity: 1 }];
        });
    }, [setCheckedOut]);

    // React to every new scan event (same item twice works correctly via unique id)
    useEffect(() => {
        if (scanEvent) {
            console.log('[Scanner] Received scanned item:', scanEvent.item.name);
            handleAddItemToCart(scanEvent.item);
        }
    }, [scanEvent, handleAddItemToCart]);

    const handleUpdateQuantity = (itemId: number, newQuantity: number) => {
        console.log(`[Cart] Updating quantity for item ${itemId} to ${newQuantity}`);
        setCartItems((prevItems) =>
            prevItems
                .map((item) =>
                    item.id === itemId ? { ...item, cartQuantity: newQuantity } : item
                )
                .filter((item) => {
                    if (isVolunteerMode) return true;
                    const keep = item.cartQuantity !== 0;
                    if (!keep) console.log(`[Cart] Removing item ${item.name} because quantity reached 0`);
                    return keep;
                })
        );
    };

    const handleRemoveItem = (itemId: number) => {
        console.log(`[Cart] Manually removing item ${itemId}`);
        setCartItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
    };

    // Show the MUI confirm dialog before committing the checkout
    const handleCheckout = () => {
        const checkoutTotal = cartItems.reduce((total, item) => total + item.price * item.cartQuantity, 0) + extraCosts;
        console.log('[Checkout] Starting checkout process', {
            itemCount: cartItems.length,
            total: checkoutTotal,
            extraCosts,
            isVolunteerMode,
            isSetMode,
        });

        const itemsSummary = cartItems.map(item => `${item.name} x${item.cartQuantity}`).join('\n');
        let actionText = 'checkout';
        if (isVolunteerMode) {
            actionText = isSetMode ? 'set stock to' : 'add to stock';
        }
        const message = `${actionText.charAt(0).toUpperCase() + actionText.slice(1)}:\n\n${itemsSummary}${
            !isVolunteerMode ? `\n\nExtra Services: €${extraCosts.toFixed(2)}\nTotal: €${checkoutTotal.toFixed(2)}` : ''
        }`;
        setConfirmMessage(message);
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
        console.log(`[Checkout] Using handler: ${handler.name}`);

        setIsCheckingOut(true);
        try {
            for (const item of cartItems) {
                let success = false;
                console.log(`[Checkout] Processing item: ${item.name} (qty: ${item.cartQuantity})`);

                if (isVolunteerMode && !isSetMode && item.cartQuantity < 0) {
                    console.log(`[Checkout] Item quantity is negative, using handleTakeItem for ${item.name}`);
                    success = await handleTakeItem(item.id, Math.abs(item.cartQuantity));
                } else {
                    success = await handler(item.id, item.cartQuantity);
                }

                if (!success) {
                    console.error(`[Checkout] FAILED to process item: ${item.name}`);
                    addToast(
                        `Failed to process "${item.name}". Operation stopped — earlier items in this batch may already have been processed.`,
                        'error'
                    );
                    setIsCheckingOut(false);
                    return;
                }
                console.log(`[Checkout] Successfully processed: ${item.name}`);
            }

            console.log('[Checkout] All items processed successfully. Clearing cart.');
            setCartItems([]);

            // Only show payment QR in non-volunteer mode
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
        <Box>
            <ShoppingCart
                cartItems={cartItems}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onCheckout={handleCheckout}
                checkedOutTotal={checkedOutResult?.total ?? null}
                onClearCheckout={() => setCheckedOut(null)}
                onExtraCostChange={setExtraCosts}
                extraCosts={extraCosts}
                isVolunteerMode={isVolunteerMode}
                isSetMode={isSetMode}
                onSetModeChange={handleSetModeChange}
                isCheckingOut={isCheckingOut}
            />

            {/* MUI Confirmation Dialog — replaces window.confirm */}
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Confirm</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ whiteSpace: 'pre-line' }}>{confirmMessage}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
                    <Button onClick={handleConfirmedCheckout} variant="contained" autoFocus>
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
