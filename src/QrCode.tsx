import { motion } from 'framer-motion';
import { Card, Typography, Box } from '@mui/material';
import { Payment } from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo } from 'react';
import { PAYMENT } from './constants';

interface WeroQrCodeProps {
    total?: number; // Total amount in euros
    description?: string;
}

function WeroQrCode({ total = 0, description = 'Stock Purchase' }: WeroQrCodeProps) {
    // The specific Payconiq Merchant ID for Maakleerplek found in git history
    const MERCHANT_ID = "616941d236664900073738ce";

    const epcQrString = useMemo(() => {
        if (total <= 0) return '';
        const beneficiaryName = PAYMENT.BENEFICIARY_NAME;
        const iban = PAYMENT.IBAN;
        const cleanIban = iban.replace(/\s+/g, '');
        const formattedAmount = `EUR${total.toFixed(2)}`;
        const cleanDescription = description.substring(0, 140);

        const parts = [
            'BCD', '002', '1', 'SCT', '', 
            beneficiaryName, cleanIban, formattedAmount, 
            '', '', cleanDescription, ''
        ];
        return parts.join('\n');
    }, [total, description]);

    const payconiqLink = useMemo(() => {
        // We revert to the Payconiq merchant link for clicking, but don't pass extra info if it was failing
        // Just bringing them to the merchant context as requested
        return `https://payconiq.com/merchant/1/${MERCHANT_ID}`;
    }, []);

    const displayTotal = total > 0 ? `€${total.toFixed(2)}` : '';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
        >
            <Card sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, p: 3, textAlign: 'center', width: '100%', maxWidth: 400 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Payment sx={{ fontSize: '1.8rem', color: 'secondary.main' }} />
                    <Typography variant="h5" component="h2" fontWeight="bold">Pay Now</Typography>
                </Box>
                
                {total > 0 ? (
                    <>
                        <Typography variant="h4" color="primary.main" fontWeight="bold">
                            {displayTotal}
                        </Typography>

                        <Box
                            component="a"
                            href={payconiqLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                                p: 2,
                                bgcolor: 'white',
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                my: 1,
                                display: 'block',
                                transition: 'transform 0.2s',
                                '&:hover': { transform: 'scale(1.02)' }
                            }}
                        >
                            <QRCodeSVG
                                value={epcQrString}
                                size={180}
                                level="M"
                                includeMargin={false}
                            />
                        </Box>

                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '28ch', mb: 1 }}>
                            Scan with your bank app or <strong>tap the QR code</strong> to open Payconiq.
                        </Typography>
                    </>
                ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                        Nothing to pay at the moment.
                    </Typography>
                )}
            </Card>
        </motion.div>
    );
}

export default WeroQrCode;