import { useState } from 'react';
import { type ItemData } from './sendCodeHandler';
import Extras from './Extras';
import ImageDisplay from './ImageDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Card,
    CardHeader,
    CardContent,
    List,
    ListItem,
    IconButton,
    Button,
    Typography,
    Box,
    InputBase, // For quantity input
    ToggleButton,
    ToggleButtonGroup,
    CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import CheckCircle from '@mui/icons-material/CheckCircle';


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
        <Card sx={{
            maxWidth: { xs: '100%', sm: 640 },
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: { xs: 1, sm: 2 },
            borderTop: isVolunteerMode ? 4 : 0,
            borderTopColor: isVolunteerMode ? 'info.main' : 'transparent',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            overflow: 'hidden'
        }}>
            <CardHeader
                title={isVolunteerMode ? (isSetMode ? "Set Stock" : "Add to Stock") : "Shopping Cart"}
                avatar={isVolunteerMode ? <VolunteerActivismIcon sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' } }} /> : <ShoppingCartIcon sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' } }} />}
                titleTypographyProps={{ variant: 'subtitle2', fontWeight: 'bold' }}
                sx={{ p: { xs: 1.5, sm: 2 } }}
            />            {isVolunteerMode && onSetModeChange && (
                <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: { xs: 1, sm: 2 } }}>
                    <ToggleButtonGroup
                        color="info"
                        value={isSetMode ? 'set' : 'add'}
                        exclusive
                        onChange={(_e, newValue) => {
                            if (newValue !== null) {
                                if ('vibrate' in navigator) navigator.vibrate(20);
                                onSetModeChange(newValue === 'set');
                            }
                        }}
                        aria-label="Stock modification mode"
                        size="small"
                        sx={{ width: '100%' }}
                    >
                        <ToggleButton value="add" sx={{ flex: 1, textTransform: 'none', fontWeight: 'bold', fontSize: '0.75rem', py: 0.5 }}>Add / Remove</ToggleButton>
                        <ToggleButton value="set" sx={{ flex: 1, textTransform: 'none', fontWeight: 'bold', fontSize: '0.75rem', py: 0.5 }}>Set Absolute</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            )}            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 0, p: 0, '&:last-child': { pb: 0 } }}>
                {checkedOutTotal !== null ? (
                    // Display checkout successful summary
                    <Box sx={{ textAlign: 'center', py: { xs: 4, sm: 6 }, px: { xs: 2, sm: 3 }, animation: 'fadeIn 0.5s ease-in', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ color: 'success.main', mb: 1 }}>
                            <CheckCircle sx={{ fontSize: { xs: '3rem', sm: '4rem' } }} />
                        </Box>
                        <Typography variant="h6" fontWeight="bold">Done!</Typography>
                        <Typography variant="subtitle2">Total: €{checkedOutTotal?.toFixed(2)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            You can pay via the QR code below.
                        </Typography>
                        {onClearCheckout && (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={onClearCheckout}
                                sx={{ mt: 1, textTransform: 'none' }}
                            >
                                New transaction
                            </Button>
                        )}
                    </Box>
                ) : (
                    // Display current cart state or empty message + extras
                    <>
                        {cartItems.length > 0 ? (
                            <List sx={{ p: 0 }}>
                                <AnimatePresence mode="popLayout">
                                    {cartItems.map((item, index) => (
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
                                        >
                                            <ListItem
                                                divider={index !== cartItems.length - 1}
                                                sx={{
                                                    display: 'flex',
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    py: { xs: 1, sm: 1.5 },
                                                    px: { xs: 1.5, sm: 2 },
                                                    gap: { xs: 1.5, sm: 2 },
                                                    transition: 'background-color 0.3s ease'
                                                }}
                                            >
                                                {/* Left Section: Image */}
                                                <Box sx={{ flexShrink: 0 }}>
                                                    <ImageDisplay
                                                        imagePath={item.image}
                                                        alt={item.name}
                                                        width={isVolunteerMode ? 40 : 50}
                                                        height={isVolunteerMode ? 40 : 50}
                                                        sx={{ border: 'none', bgcolor: 'transparent' }}
                                                    />
                                                </Box>

                                                {/* Middle Section: Info */}
                                                <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                                    <Typography variant="body2" sx={{ fontWeight: 'bold', lineHeight: 1.2 }}>
                                                        {item.name}
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                                        {item.category && (
                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                                                                <Box component="span" sx={{ fontWeight: 'bold', color: 'text.primary' }}>Category: </Box>{item.category}
                                                            </Typography>
                                                        )}
                                                        {item.location && (
                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                                                                <Box component="span" sx={{ fontWeight: 'bold', color: 'text.primary' }}>Location: </Box>{item.location}
                                                            </Typography>
                                                        )}
                                                        
                                                        <Box sx={{ mt: 0.5 }}>
                                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                                                <Box component="span" sx={{ fontWeight: 'bold', color: 'text.primary' }}>Stock: </Box>{item.quantity}
                                                                <Box component="span" sx={{ 
                                                                    ml: 0.5, 
                                                                    fontWeight: 'bold', 
                                                                    color: isVolunteerMode 
                                                                        ? (isSetMode ? 'warning.main' : (item.cartQuantity >= 0 ? 'success.main' : 'error.main'))
                                                                        : 'error.main'
                                                                }}>
                                                                    {isVolunteerMode 
                                                                        ? (isSetMode ? `=> ${item.cartQuantity}` : (item.cartQuantity >= 0 ? `(+${item.cartQuantity})` : `(-${Math.abs(item.cartQuantity)})`)) 
                                                                        : `(-${item.cartQuantity})`
                                                                    }
                                                                </Box>
                                                            </Typography>
                                                        </Box>                                                    </Box>
                                                </Box>

                                                {/* Right Section: Controls and Price */}
                                                <Box sx={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    gap: { xs: 1, sm: 1.5 }
                                                }}>
                                                    <Box sx={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        bgcolor: 'action.hover', 
                                                        borderRadius: 10, // Pill shape
                                                        overflow: 'hidden', 
                                                        height: { xs: 28, sm: 32 },
                                                        px: 0.5
                                                    }}>
                                                        <IconButton
                                                            onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity - 1)}
                                                            disabled={isSetMode && item.cartQuantity <= 0}
                                                            size="small"
                                                            sx={{ color: 'text.secondary', p: 0.5 }}
                                                        >
                                                            <RemoveIcon sx={{ fontSize: '1rem' }} />
                                                        </IconButton>
                                                        <InputBase
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
                                                            inputProps={{
                                                                style: { 
                                                                    textAlign: 'center', 
                                                                    padding: 0, 
                                                                    fontSize: '0.85rem', 
                                                                    fontWeight: 'bold', 
                                                                    width: 25
                                                                }
                                                            }}
                                                            sx={{
                                                                '& input': {
                                                                    appearance: 'none',
                                                                    MozAppearance: 'textfield',
                                                                    '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
                                                                        appearance: 'none',
                                                                        margin: 0,
                                                                    },
                                                                }
                                                            }}
                                                        />
                                                        <IconButton
                                                            onClick={() => handleUpdateQuantityWithFeedback(item.id, item.cartQuantity + 1)}
                                                            disabled={!isVolunteerMode && !isSetMode && item.cartQuantity >= item.quantity}
                                                            size="small"
                                                            sx={{ color: 'text.secondary', p: 0.5 }}
                                                        >
                                                            <AddIcon sx={{ fontSize: '1rem' }} />
                                                        </IconButton>
                                                    </Box>

                                                    <Typography variant="body2" sx={{ fontWeight: 'bold', minWidth: 50, textAlign: 'right', fontSize: '0.85rem' }}>
                                                        €{(item.price * item.cartQuantity).toFixed(2)}
                                                    </Typography>

                                                    <IconButton
                                                        onClick={() => handleRemoveItem(item.id)}
                                                        size="small"
                                                        color="error"
                                                        sx={{ opacity: 0.7, '&:hover': { opacity: 1 }, p: 0.5 }}
                                                    >
                                                        <DeleteIcon sx={{ fontSize: '1.1rem' }} />
                                                    </IconButton>
                                                </Box>
                                            </ListItem>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </List>
                        ) : (
                            <Typography variant="body2" sx={{ textAlign: 'center', py: 4, color: 'text.secondary', fontSize: '0.85rem' }}>
                                Your cart is empty. Scan an item to add it.
                            </Typography>
                        )}

                        <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: { xs: 1.5, sm: 2 } }}>
                            {!isVolunteerMode && <Extras onExtraCostChange={onExtraCostChange} />}

                            {(cartItems.length > 0 || extraCosts > 0) && (
                                <Box sx={{ mt: 1 }}>
                                    {!isVolunteerMode && (
                                        <Typography variant="subtitle2" sx={{ textAlign: 'right', borderTop: '1px solid', borderColor: 'divider', pt: 1, fontWeight: 'bold' }}>
                                            Total: €{(totalPrice + extraCosts).toFixed(2)}
                                        </Typography>
                                    )}
                                    <Button
                                        variant="contained"
                                        color={isVolunteerMode ? "info" : "primary"}
                                        fullWidth
                                        size="medium"
                                        onClick={() => {
                                            if ('vibrate' in navigator) navigator.vibrate(50);
                                            onCheckout();
                                        }}
                                        disabled={isCheckingOut}
                                        startIcon={isCheckingOut ? <CircularProgress size={18} color="inherit" /> : null}
                                        sx={{ 
                                            mt: 1.5, 
                                            borderRadius: 2, 
                                            textTransform: 'none', 
                                            fontWeight: 'bold', 
                                            py: 1,
                                            fontSize: '1rem',
                                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
                                        }}
                                    >
                                        {isCheckingOut ? 'Processing...' : (isVolunteerMode ? (isSetMode ? 'Set Stock' : 'Add to Stock') : 'Checkout')}
                                    </Button>
                                </Box>
                            )}
                        </Box>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
export default ShoppingCart;