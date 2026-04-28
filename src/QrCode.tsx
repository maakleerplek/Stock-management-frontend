import { motion } from 'framer-motion';
import { CreditCard } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useMemo } from 'react';
import { PAYMENT } from './constants';

interface WeroQrCodeProps {
    total?: number; // Total amount in euros
    description?: string;
}

function WeroQrCode({ total = 0, description = 'Stock Purchase' }: WeroQrCodeProps) {
    // Get the Payconiq Merchant ID from environment variables (optional)
    const MERCHANT_ID = PAYMENT.PAYCONIQ_MERCHANT_ID;

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
        // Only generate Payconiq link if merchant ID is configured
        if (!MERCHANT_ID) return null;
        return `https://payconiq.com/merchant/1/${MERCHANT_ID}`;
    }, [MERCHANT_ID]);

    const displayTotal = total > 0 ? `€${total.toFixed(2)}` : '';

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
        >
            <div className="brutalist-card flex flex-col items-center gap-4 p-6 text-center w-full max-w-[400px] mx-auto">
                <div className="flex items-center gap-2">
                    <CreditCard className="w-7 h-7" />
                    <h2 className="text-2xl font-bold uppercase">Pay Now</h2>
                </div>
                
                {total > 0 ? (
                    <>
                        <p className="text-4xl font-bold">
                            {displayTotal}
                        </p>

                        {payconiqLink ? (
                            <a
                                href={payconiqLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="brutalist-card p-4 bg-white my-2 block transition-transform hover:scale-105"
                            >
                                <QRCodeSVG
                                    value={epcQrString}
                                    size={180}
                                    level="M"
                                    includeMargin={false}
                                />
                            </a>
                        ) : (
                            <div className="brutalist-card p-4 bg-white my-2">
                                <QRCodeSVG
                                    value={epcQrString}
                                    size={180}
                                    level="M"
                                    includeMargin={false}
                                />
                            </div>
                        )}

                        <p className="text-sm text-gray-600 max-w-[28ch] mb-2">
                            Scan with your bank app{payconiqLink ? <> or <strong>tap the QR code</strong> to open Payconiq</> : ''}.
                        </p>
                    </>
                ) : (
                    <p className="text-sm text-gray-600 py-8">
                        Nothing to pay at the moment.
                    </p>
                )}
            </div>
        </motion.div>
    );
}

export default WeroQrCode;