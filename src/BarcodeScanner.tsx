import { useState, useRef, useEffect, useCallback } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  Card, CardHeader, CardContent, Button, Typography, Box,
  CircularProgress, TextField, InputAdornment, IconButton, Alert,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { QrCode2, Stop, AddCircle, Refresh, CameraAlt } from '@mui/icons-material';

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
  const handleCameraChange = (e: SelectChangeEvent<string>) => {
    const deviceId = e.target.value;
    setSelectedCameraId(deviceId);
    localStorage.setItem(CAMERA_STORAGE_KEY, deviceId);

    if (isScanning) {
      // Force scanner remount with new device
      setScannerKey(prev => prev + 1);
    }
  };

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

  const isSecure = typeof window !== 'undefined' && window.isSecureContext;
  const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Card sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 1, sm: 2 },
        width: '100%',
        maxWidth: { xs: 320, sm: 360 },
        bgcolor: compact ? 'transparent' : 'background.paper',
        boxShadow: compact ? 'none' : '0 4px 20px rgba(0,0,0,0.08)',
        border: compact ? 'none' : undefined,
        overflow: 'hidden'
      }}>
        {!compact && (
          <CardHeader
            title="Barcode Scanner"
            avatar={<QrCode2 />}
            titleTypographyProps={{ variant: 'subtitle2', fontWeight: 'bold' }}
            sx={{ p: { xs: 1.5, sm: 2 } }}
          />
        )}

        <CardContent sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: { xs: 1, sm: 2 },
          p: { xs: 1.5, sm: 2 },
          pt: 0
        }}>
          {/* Camera Error Alert */}
          {cameraError && (
            <Alert
              severity="warning"
              sx={{ width: '100%', mb: 1 }}
              action={
                <IconButton size="small" onClick={retryCamera} color="inherit">
                  <Refresh fontSize="small" />
                </IconButton>
              }
            >
              {cameraError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', gap: 1 }}>
            {!isScanning ? (
              <Button
                variant="contained"
                size="small"
                startIcon={<QrCode2 />}
                onClick={startScan}
                disabled={isLoading}
                sx={{ borderRadius: 3, px: 2, py: 0.8, textTransform: 'none', fontSize: '0.9rem' }}
              >
                {isLoading ? 'Starting...' : 'Use Camera'}
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<Stop />}
                  onClick={stopScan}
                  sx={{ borderRadius: 3, px: 2, py: 0.8, textTransform: 'none', fontSize: '0.9rem' }}
                >
                  Stop
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Refresh />}
                  onClick={retryCamera}
                  sx={{ borderRadius: 3, px: 1.5, py: 0.8, textTransform: 'none', fontSize: '0.9rem' }}
                >
                  Retry
                </Button>
              </>
            )}
          </Box>

          {/* Camera selector — shown when multiple cameras are available */}
          {cameras.length > 1 && (
            <FormControl fullWidth size="small">
              <InputLabel id="camera-select-label" sx={{ fontSize: '0.8rem' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CameraAlt sx={{ fontSize: '0.9rem' }} />
                  Camera
                </Box>
              </InputLabel>
              <Select
                labelId="camera-select-label"
                id="camera-select"
                value={selectedCameraId}
                label="Camera"
                onChange={handleCameraChange}
                sx={{ fontSize: '0.8rem' }}
              >
                {cameras.map((device, index) => (
                  <MenuItem key={device.deviceId} value={device.deviceId} sx={{ fontSize: '0.8rem' }}>
                    {cameraLabel(device, index)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {isScanning && (
            <Box sx={{
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: 3,
              overflow: 'hidden',
              position: 'relative',
              mt: 1,
              bgcolor: 'black',
              border: '2px solid',
              borderColor: cameraError ? 'warning.main' : 'primary.main',
              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.2)'
            }}>
              {isLoading ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: 1 }}>
                  <CircularProgress color="primary" />
                  <Typography variant="caption" color="grey.500">Initializing camera...</Typography>
                </Box>
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
                    container: { width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden' },
                    video: { width: '100%', height: '100%', objectFit: 'cover' }
                  }}
                />
              )}
            </Box>
          )}

          {/* Manual input - always visible */}
          <Box component="form" onSubmit={handleManualSubmit} sx={{ width: '100%', mt: 1 }}>
            <TextField
              fullWidth
              size="small"
              variant="outlined"
              placeholder="Type or scan with USB scanner..."
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              inputRef={inputRef}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton type="submit" edge="end" color="primary" disabled={!manualInput.trim()}>
                      <AddCircle fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Box sx={{
            mt: 1,
            p: 1,
            width: '100%',
            bgcolor: 'action.hover',
            borderRadius: 2,
            textAlign: 'center'
          }}>
            <Typography variant="body2" color="text.secondary">
              Last Scanned:
              <Typography component="span" variant="body2" sx={{ ml: 1, fontWeight: 'bold', color: 'primary.main' }}>
                {barcode}
              </Typography>
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Debug Info for Mobile troubleshooting */}
      {(cameraError || !isScanning) && (
        <Box sx={{ mt: 1, p: 1.5, bgcolor: 'action.hover', borderRadius: 2, border: '1px solid', borderColor: 'divider', width: '100%', maxWidth: 360 }}>
          <Typography variant="caption" fontWeight="bold" color="text.secondary" display="block" gutterBottom>
            Browser Diagnostics:
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: isSecure ? 'success.main' : 'error.main' }} />
              <Typography variant="caption" color={isSecure ? 'text.secondary' : 'error.main'}>
                Secure Context: {isSecure ? 'Yes' : 'No'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: hasMediaDevices ? 'success.main' : 'error.main' }} />
              <Typography variant="caption" color={hasMediaDevices ? 'text.secondary' : 'error.main'}>
                Camera API: {hasMediaDevices ? 'Yes' : 'No'}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default BarcodeScanner;
