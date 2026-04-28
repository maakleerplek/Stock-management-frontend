import { useState } from 'react';
import Scanner from './BarcodeScanner';
import QrCode from './QrCode';
import { handleSend, type ItemData } from './sendCodeHandler';
import { useToast } from './ToastContext';
import { Loader2 } from 'lucide-react';

interface BarcodeScannerContainerProps {
  onItemScanned: (item: ItemData | null) => void;
  checkoutResult?: { total: number, description: string } | null;
}

function BarcodeScannerContainer({ onItemScanned, checkoutResult = null }: BarcodeScannerContainerProps) {
  const { addToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const onScan = async (barcode: string) => {
    if (isProcessing) {
      console.log('[ScannerContainer] Already processing, ignoring scan');
      return;
    }
    
    setIsProcessing(true);
    try {
      const fetchedItem = await handleSend(barcode);
      if (fetchedItem) {
        console.log(`[ScannerContainer] Item found: ${fetchedItem.name}`);
        onItemScanned(fetchedItem);
      } else {
        console.warn(`[ScannerContainer] No item found for barcode: ${barcode}`);
        addToast(`No item found for: ${barcode}`, 'warning');
      }
    } catch (error) {
      console.error('[ScannerContainer] Error processing scan:', error);
      
      // Provide more helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
          addToast('Cannot connect to server. Please check your connection.', 'error');
        } else {
          addToast(`Scan failed: ${error.message}`, 'error');
        }
      } else {
        addToast('An unexpected error occurred during scan.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 items-center relative">
      <Scanner onScan={onScan} />

      {isProcessing && (
        <div className="absolute inset-0 bg-white/70 flex justify-center items-center z-10">
          <Loader2 className="w-8 h-8 animate-spin text-brand-black" />
        </div>
      )}

      {checkoutResult !== null && <QrCode total={checkoutResult.total} description={checkoutResult.description} />}
    </div>
  );
}

export default BarcodeScannerContainer;
