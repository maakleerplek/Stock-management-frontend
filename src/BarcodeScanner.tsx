import { useState, useRef, useEffect, useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { QrCode, StopCircle, Plus, RefreshCw, Camera, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScannerProps {
  onScan: (barcode: string) => void;
  compact?: boolean;
}

const CAMERA_STORAGE_KEY = 'preferredCameraDeviceId';

function BarcodeScanner({ onScan, compact = false }: ScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [barcode, setBarcode] = useState('No result');
  const [isLoading, setIsLoading] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [lastScanTime, setLastScanTime] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingTimeoutRef = useRef<number | null>(null);
  const cameraTimeoutRef = useRef<number | null>(null);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
      if (cameraTimeoutRef.current) window.clearTimeout(cameraTimeoutRef.current);
    };
  }, []);

  // Auto-focus manual input when not scanning
  useEffect(() => {
    if (!isScanning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isScanning]);

  // Enumerate cameras after permission is granted
  const enumerateCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);

      // Restore previously selected camera, or pick a sensible default
      const saved = localStorage.getItem(CAMERA_STORAGE_KEY);
      if (saved && videoDevices.some(d => d.deviceId === saved)) {
        setSelectedCameraId(saved);
      } else if (videoDevices.length > 0) {
        // Prefer the last back camera listed — on Android this is usually the
        // main (non-ultrawide) rear camera
        const backCameras = videoDevices.filter(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        const preferred = backCameras.length > 0
          ? backCameras[backCameras.length - 1]
          : videoDevices[0];
        setSelectedCameraId(preferred.deviceId);
      }
    } catch (e) {
      console.warn('[Scanner] Could not enumerate cameras:', e);
    }
  }, []);

  // Check camera permission proactively
  const checkCameraPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera not supported on this device');
        return false;
      }

      // Request permission — this also populates device labels
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      stream.getTracks().forEach(track => track.stop());

      // Now that we have permission, enumerate all cameras
      await enumerateCameras();

      return true;
    } catch (error) {
      const err = error as Error;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this device');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is in use by another application. Try closing other apps.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
      return false;
    }
  }, [enumerateCameras]);

  const handleScan = (text: string) => {
    const now = Date.now();
    if (text === barcode && now - lastScanTime < 500) {
      console.log(`[Scanner] Ignored duplicate scan (cooldown): ${text}`);
      return;
    }

    console.log(`[Scanner] Successfully scanned: ${text}`);
    setBarcode(text);
    setLastScanTime(now);
    onScan(text);

    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (manualInput.trim()) {
      console.log(`[Scanner] Manual entry submitted: ${manualInput.trim()}`);
      handleScan(manualInput.trim());
      setManualInput('');
    }
  };

  const handleError = (error: unknown) => {
    console.error('[Scanner] Hardware/Software error:', error);
    const err = error as Error;
    if (err.message && !err.message.includes('No MultiFormat Readers')) {
      setCameraError(`Scanner error: ${err.message}`);
    }
  };

  const startScan = async () => {
    console.log('[Scanner] Initializing camera...');
    setCameraError(null);

    if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
    if (cameraTimeoutRef.current) window.clearTimeout(cameraTimeoutRef.current);

    setIsLoading(true);

    const hasPermission = await checkCameraPermission();
    if (!hasPermission) {
      setIsLoading(false);
      return;
    }

    setIsScanning(true);
    setScannerKey(prev => prev + 1);

    cameraTimeoutRef.current = window.setTimeout(() => {
      if (isLoading) {
        console.warn('[Scanner] Camera initialization timeout');
        setCameraError('Camera took too long to start. Try again or use manual input.');
        setIsLoading(false);
      }
    }, 5000);

    loadingTimeoutRef.current = window.setTimeout(() => {
      setIsLoading(false);
      if (cameraTimeoutRef.current) {
        window.clearTimeout(cameraTimeoutRef.current);
        cameraTimeoutRef.current = null;
      }
    }, 800);
  };

  const stopScan = () => {
    console.log('[Scanner] Stopping camera.');
    if (loadingTimeoutRef.current) { window.clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
    if (cameraTimeoutRef.current) { window.clearTimeout(cameraTimeoutRef.current); cameraTimeoutRef.current = null; }
    setIsScanning(false);
    setIsLoading(false);
    setCameraError(null);
  };

  const retryCamera = () => {
    setCameraError(null);
    stopScan();
    setTimeout(() => { startScan(); }, 300);
  };

  // Switch camera while scanning — restarts the scanner with the new device
  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    setSelectedCameraId(deviceId);
    localStorage.setItem(CAMERA_STORAGE_KEY, deviceId);

    if (isScanning) {
      // Force scanner remount with new device
      setScannerKey(prev => prev + 1);
    }
  };

  // Diagnostics for mobile troubleshooting
  const isSecure = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost');
  const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  // Build the constraints for the scanner
  const scannerConstraints: MediaTrackConstraints = selectedCameraId
    ? { deviceId: { exact: selectedCameraId } }
    : { facingMode: 'environment' };

  // Human-readable camera label (fallback to index)
  const cameraLabel = (device: MediaDeviceInfo, index: number) => {
    if (device.label) {
      // Trim long labels: "camera2 0, facing back (FULL)" → "Camera 0 (Back)"
      return device.label.length > 35
        ? device.label.substring(0, 33) + '…'
        : device.label;
    }
    return `Camera ${index + 1}`;
  };


  return (
    <div className="w-full flex flex-col items-center gap-4">
      <div className={cn(
        "flex flex-col gap-3 sm:gap-4 w-full max-w-[420px] sm:max-w-[480px]",
        compact ? "" : "brutalist-card p-6 sm:p-8"
      )}>
        {!compact && (
          <div className="flex items-center gap-2 pb-2 border-b-2 border-brand-black">
            <QrCode size={24} className="text-brand-black" />
            <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">Barcode Scanner</h3>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 sm:gap-4">
          {/* Camera Error Alert */}
          {cameraError && (
            <div className="w-full brutalist-border bg-yellow-100 p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-yellow-800 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-bold text-yellow-900">{cameraError}</p>
              </div>
              <button
                onClick={retryCamera}
                className="flex-shrink-0 p-1 hover:bg-yellow-200 brutalist-border"
                aria-label="Retry camera"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          )}

          <div className="flex justify-center w-full gap-2">
            {!isScanning ? (
              <button
                onClick={startScan}
                disabled={isLoading}
                className="brutalist-button bg-blue-500 text-white flex items-center gap-2"
              >
                <QrCode size={18} />
                <span className="text-sm sm:text-base">{isLoading ? 'Starting...' : 'Use Camera'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={stopScan}
                  className="brutalist-button bg-red-500 text-white flex items-center gap-2"
                >
                  <StopCircle size={18} />
                  <span className="text-sm sm:text-base">Stop</span>
                </button>
                <button
                  onClick={retryCamera}
                  className="brutalist-button flex items-center gap-2"
                >
                  <RefreshCw size={18} />
                  <span className="text-sm sm:text-base">Retry</span>
                </button>
              </>
            )}
          </div>

          {/* Camera selector — shown when multiple cameras are available */}
          {cameras.length > 1 && (
            <div className="w-full">
              <label className="flex items-center gap-1 text-xs font-bold uppercase mb-1">
                <Camera size={14} />
                Camera
              </label>
              <select
                value={selectedCameraId}
                onChange={handleCameraChange}
                className="brutalist-input w-full text-xs sm:text-sm"
              >
                {cameras.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {cameraLabel(device, index)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isScanning && (
            <div className={cn(
              "w-full aspect-square overflow-hidden relative bg-black brutalist-border",
              cameraError ? "border-yellow-600" : "border-brand-black"
            )}>
              {isLoading ? (
                <div className="flex flex-col justify-center items-center h-full gap-2">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-gray-400 font-mono">Initializing camera...</p>
                </div>
              ) : (
                <Scanner
                  key={scannerKey}
                  onScan={(detectedCodes) => {
                    if (detectedCodes.length > 0) {
                      handleScan(detectedCodes[0].rawValue);
                    }
                  }}
                  onError={handleError}
                  allowMultiple={false}
                  scanDelay={500}
                  formats={[
                    'qr_code',
                    'ean_13',
                    'ean_8',
                    'code_128',
                    'code_39',
                    'upc_a',
                    'upc_e',
                    'data_matrix',
                    'itf',
                    'codabar'
                  ]}
                  constraints={scannerConstraints}
                  components={{
                    torch: true,
                    finder: true,
                  }}
                  styles={{
                    container: { width: '100%', height: '100%', overflow: 'hidden' },
                    video: { width: '100%', height: '100%', objectFit: 'cover' }
                  }}
                />
              )}
            </div>
          )}

          {/* Manual input - always visible */}
          <form onSubmit={handleManualSubmit} className="w-full">
            <div className="relative">
              <input
                type="text"
                placeholder="Type or scan with USB scanner..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                ref={inputRef}
                className="brutalist-input w-full pr-10 text-sm"
              />
              <button
                type="submit"
                disabled={!manualInput.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 disabled:opacity-30"
                aria-label="Submit barcode"
              >
                <Plus size={18} className="text-brand-black" />
              </button>
            </div>
          </form>

          <div className="w-full brutalist-border bg-gray-100 p-3 text-center">
            <p className="text-xs sm:text-sm text-gray-600 font-bold">
              Last Scanned:
              <span className="ml-2 text-brand-black font-black">{barcode}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Debug Info for Mobile troubleshooting */}
      {(cameraError || !isScanning) && (
        <div className="w-full max-w-[360px] brutalist-border bg-gray-50 p-3">
          <p className="text-[10px] sm:text-xs font-black uppercase mb-2 text-gray-600">
            Browser Diagnostics:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                isSecure ? "bg-green-500" : "bg-red-500"
              )} />
              <p className={cn(
                "text-[10px] sm:text-xs",
                isSecure ? "text-gray-600" : "text-red-600"
              )}>
                Secure: {isSecure ? 'Yes' : 'No'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                hasMediaDevices ? "bg-green-500" : "bg-red-500"
              )} />
              <p className={cn(
                "text-[10px] sm:text-xs",
                hasMediaDevices ? "text-gray-600" : "text-red-600"
              )}>
                Camera API: {hasMediaDevices ? 'Yes' : 'No'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BarcodeScanner;
