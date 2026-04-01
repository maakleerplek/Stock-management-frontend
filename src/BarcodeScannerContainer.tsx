import { useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import Scanner from './BarcodeScanner';
import QrCode from './QrCode';
import { handleSend, type ItemData } from './sendCodeHandler';
import { useToast } from './ToastContext';

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', position: 'relative' }}>
      <Scanner onScan={onScan} />

      {isProcessing && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(255, 255, 255, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10, borderRadius: 2 }}>
          <CircularProgress />
        </Box>
      )}

      {checkoutResult !== null && <QrCode total={checkoutResult.total} description={checkoutResult.description} />}
    </Box>
  );
}

export default BarcodeScannerContainer;
