import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Save, X, QrCode, Loader2, Image as ImageIcon, Camera, StopCircle, ZoomIn } from 'lucide-react';
import { cn } from './lib/utils';
import { Scanner } from '@yudiel/react-qr-scanner';
import type { IDetectedBarcode } from '@yudiel/react-qr-scanner';

export interface SelectOption {
  id: string | number;
  name: string;
}

export interface PartFormData {
  partName: string;
  description: string;
  category: string;
  initialQuantity: string;
  storageLocation: string;
  minimumStock: string;
  barcode: string;
  purchasePrice: string;
  purchasePriceCurrency: string;
  supplier: string;
  supplierSku: string;
  supplierSetPrice: string;   // total price paid for one pack/set from supplier
  supplierSetQty: string;     // number of individual units in one set/pack
  supplierCurrency: string;
  partId?: string;
  image?: File;
}

export interface PartFormErrors {
  [key: string]: string | undefined;
  partName?: string;
  category?: string;
  initialQuantity?: string;
  storageLocation?: string;
  minimumStock?: string;
  barcode?: string;
  submit?: string;
}

interface AddPartFormProps {
  onSubmit: (formData: PartFormData) => Promise<{ partId: string }>;
  categories: SelectOption[];
  locations: SelectOption[];
  suppliers: SelectOption[];
  onCancel?: () => void;
}

const AddPartForm: React.FC<AddPartFormProps> = ({ onSubmit, categories, locations, suppliers, onCancel }) => {
  const [formData, setFormData] = useState<PartFormData>({
    partName: '',
    description: '',
    category: '',
    initialQuantity: '',
    minimumStock: '',
    storageLocation: '',
    barcode: '',
    purchasePrice: '',
    purchasePriceCurrency: 'EUR',
    supplier: '',
    supplierSku: '',
    supplierSetPrice: '',
    supplierSetQty: '',
    supplierCurrency: 'EUR',
  });

  const [errors, setErrors] = useState<PartFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSkuScanning, setIsSkuScanning] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (formData.image && !imagePreview) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(formData.image);
    }
  }, [formData.image, imagePreview]);

  const validateForm = () => {
    const newErrors: PartFormErrors = {};
    const requiredFields: Array<keyof PartFormData> = ['partName', 'initialQuantity', 'minimumStock', 'category', 'storageLocation', 'barcode'];

    requiredFields.forEach((field) => {
      if (!formData[field]?.toString().trim()) {
        newErrors[field] = `${field} IS REQUIRED`;
      }
    });

    if (formData.initialQuantity && isNaN(parseFloat(formData.initialQuantity))) {
      newErrors.initialQuantity = 'MUST BE A NUMBER';
    }
    if (formData.minimumStock && isNaN(parseFloat(formData.minimumStock))) {
      newErrors.minimumStock = 'MUST BE A NUMBER';
    }
    if (formData.purchasePrice && isNaN(parseFloat(formData.purchasePrice))) {
      newErrors.purchasePrice = 'MUST BE A NUMBER';
    }
    if (formData.supplierSetPrice && isNaN(parseFloat(formData.supplierSetPrice))) {
      newErrors.supplierSetPrice = 'MUST BE A NUMBER';
    }
    if (formData.supplierSetQty && isNaN(parseFloat(formData.supplierSetQty))) {
      newErrors.supplierSetQty = 'MUST BE A NUMBER';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name as keyof PartFormData]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, image: 'PLEASE SELECT A VALID IMAGE' }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, image: 'IMAGE MUST BE LESS THAN 10MB' }));
      return;
    }
    
    setFormData((prev) => ({ ...prev, image: file }));
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setErrors((prev) => ({ ...prev, image: undefined }));
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
  };

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setIsCameraOpen(true);
      // Assign stream after state update renders the video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 50);
    } catch (err) {
      console.error('[AddPartForm] Camera access failed:', err);
      setErrors(prev => ({ ...prev, image: 'CAMERA ACCESS DENIED — USE UPLOAD INSTEAD' }));
    }
  }, []);

  const closeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      handleImageFile(file);
      closeCamera();
    }, 'image/jpeg', 0.92);
  }, [handleImageFile, closeCamera]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageFile(file);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const file = items[i].getAsFile();
            if (file) {
              e.preventDefault();
              handleImageFile(file);
              return;
            }
          }
        }
      }
      const file = e.clipboardData?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        e.preventDefault();
        handleImageFile(file);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleImageFile]);

  const handleFinalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setErrors({});
    
    try {
      await onSubmit(formData);
      // Close modal handles success toast and reset, no need to replicate logic
    } catch (error: unknown) {
      let msg = (error instanceof Error ? error.message : String(error)) || 'FAILED TO ADD PART';
      // Strip raw HTML (e.g. nginx 413 pages)
      if (msg.includes('<') && msg.includes('>')) {
        const stripped = msg.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        msg = stripped.length > 10 ? stripped : 'Upload failed — image may be too large.';
      }
      setErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  };

  // Label helper
  const Label = ({ text, required = false }: { text: string; required?: boolean }) => (
    <label className="block text-[10px] font-black mb-1.5 uppercase tracking-widest text-brand-black/70">
      {text} {required && <span className="text-red-500">*</span>}
    </label>
  );

  const FieldError = ({ msg }: { msg?: string }) => (
    msg ? <p className="text-[10px] text-red-500 mt-1 font-bold uppercase tracking-widest">{msg}</p> : null
  );

  return (
    <>
    <div className="w-full flex justify-center">
      <div className="w-full max-w-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-brand-black">
          <h2 className="text-lg font-black uppercase tracking-widest text-brand-black">
            CREATE NEW ITEM
          </h2>
          {onCancel && (
            <button 
              onClick={onCancel}
              className="p-1 hover:bg-brand-beige-dark transition-colors"
            >
              <X size={18} className="text-brand-black" />
            </button>
          )}
        </div>

        {/* Content */}
        {errors.submit && (
          <div className="mb-4 border border-red-500 bg-red-50 p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-red-600">{errors.submit}</p>
          </div>
        )}

        <form onSubmit={handleFinalSubmit} className="space-y-5">

          {/* Section 1: Barcode (most important — required) */}
          <div className="border border-brand-black p-4 space-y-3">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-brand-black/70">
                <QrCode size={14} /> BARCODE <span className="text-red-500">*</span>
              </h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                Scan or type the barcode on the individual item. Used for checkout scanning.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                name="barcode"
                value={formData.barcode || ''}
                onChange={handleChange}
                placeholder="SCAN OR TYPE BARCODE"
                className={cn(
                  "brutalist-input flex-1 text-sm font-mono",
                  errors.barcode && "border-red-500 bg-red-50"
                )}
              />
              <button
                type="button"
                onClick={() => setIsScanning(s => !s)}
                className={cn(
                  "brutalist-button px-3 flex items-center gap-1 text-xs",
                  isScanning && "bg-red-500 text-white"
                )}
              >
                {isScanning ? <StopCircle size={14} /> : <Camera size={14} />}
                {isScanning ? 'STOP' : 'SCAN'}
              </button>
            </div>
            <FieldError msg={errors.barcode} />
            {isScanning && (
              <div className="w-full aspect-[4/3] overflow-hidden border border-brand-black bg-black">
                <Scanner
                  onScan={(codes: IDetectedBarcode[]) => {
                    if (codes.length > 0) {
                      setFormData(prev => ({ ...prev, barcode: codes[0].rawValue }));
                      setIsScanning(false);
                      if ('vibrate' in navigator) navigator.vibrate(50);
                    }
                  }}
                  onError={(err) => console.error('[AddPartForm] barcode scan error:', err)}
                  allowMultiple={false}
                  scanDelay={500}
                  formats={['qr_code','ean_13','ean_8','code_128','code_39','upc_a','upc_e','data_matrix','itf','codabar']}
                  constraints={{ facingMode: 'environment' }}
                  components={{ torch: true, finder: true }}
                  styles={{
                    container: { width: '100%', height: '100%', overflow: 'hidden' },
                    video: { width: '100%', height: '100%', objectFit: 'cover' },
                  }}
                />
              </div>
            )}
            {formData.barcode && !isScanning && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-emerald-700">{formData.barcode}</span>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, barcode: '' }))}
                  className="text-red-500 font-bold text-[10px] uppercase tracking-widest hover:underline"
                >
                  CLEAR
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Item Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label text="Part Name" required />
              <input
                type="text"
                name="partName"
                value={formData.partName}
                onChange={handleChange}
                placeholder="e.g., COLA ZERO"
                className={cn("brutalist-input w-full", errors.partName && "border-red-500 bg-red-50")}
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                The display name shown in the stock list and at checkout.
              </p>
              <FieldError msg={errors.partName} />
            </div>

            <div>
              <Label text="Category" required />
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className={cn("brutalist-input w-full", errors.category && "border-red-500 bg-red-50")}
              >
                <option value="">SELECT...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>{cat.name.toUpperCase()}</option>
                ))}
              </select>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                Product group this item belongs to (e.g. Drinks, Electronics).
              </p>
              <FieldError msg={errors.category} />
            </div>

            <div>
              <Label text="Location" required />
              <select
                name="storageLocation"
                value={formData.storageLocation}
                onChange={handleChange}
                className={cn("brutalist-input w-full", errors.storageLocation && "border-red-500 bg-red-50")}
              >
                <option value="">SELECT...</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={String(loc.id)}>{loc.name.toUpperCase()}</option>
                ))}
              </select>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                Where this item is physically stored (e.g. Fridge, Shelf A).
              </p>
              <FieldError msg={errors.storageLocation} />
            </div>
          </div>

          {/* Section 3: Numbers row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label text="Initial Qty" required />
              <input
                type="number"
                name="initialQuantity"
                value={formData.initialQuantity}
                onChange={handleChange}
                step="1" min="0"
                className={cn("brutalist-input w-full", errors.initialQuantity && "border-red-500 bg-red-50")}
                placeholder="0"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                Units in stock right now.
              </p>
              <FieldError msg={errors.initialQuantity} />
            </div>
            <div>
              <Label text="Min Stock" />
              <input
                type="number"
                name="minimumStock"
                value={formData.minimumStock}
                onChange={handleChange}
                step="1" min="0"
                className={cn("brutalist-input w-full", errors.minimumStock && "border-red-500 bg-red-50")}
                placeholder="0"
              />
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                Low stock alert threshold.
              </p>
              <FieldError msg={errors.minimumStock} />
            </div>
            <div>
              <Label text="Selling Price" />
              <div className="flex border border-brand-black overflow-hidden">
                <span className="bg-brand-beige-dark px-2 py-2 font-bold border-r border-brand-black text-xs">
                  {formData.purchasePriceCurrency}
                </span>
                <input
                  type="number"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleChange}
                  step="0.01" min="0"
                  className="flex-1 px-2 py-2 border-none outline-none text-sm bg-white"
                  placeholder="0.00"
                />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                Price customers pay per unit.
              </p>
              <FieldError msg={errors.purchasePrice} />
            </div>
            <div>
              <Label text="Currency" />
              <select
                name="purchasePriceCurrency"
                value={formData.purchasePriceCurrency}
                onChange={handleChange}
                className="brutalist-input w-full"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>

          {/* Section 4: Supplier */}
          <div className="border border-brand-black p-4 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-black/70">SUPPLIER INFO</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label text="Supplier" />
                <select
                  name="supplier"
                  value={formData.supplier}
                  onChange={handleChange}
                  className="brutalist-input w-full"
                >
                  <option value="">None</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name.toUpperCase()}</option>
                  ))}
                </select>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                  Who you purchase this item from.
                </p>
              </div>
              <div>
                <Label text="Package / Case Barcode (SKU)" />
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="supplierSku"
                    value={formData.supplierSku}
                    onChange={handleChange}
                    placeholder="Scan or type package barcode"
                    className="brutalist-input flex-1 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setIsSkuScanning(s => !s)}
                    className={cn(
                      "brutalist-button px-3 flex items-center gap-1 text-xs",
                      isSkuScanning && "bg-red-500 text-white"
                    )}
                  >
                    {isSkuScanning ? <StopCircle size={14} /> : <Camera size={14} />}
                    {isSkuScanning ? 'STOP' : 'SCAN'}
                  </button>
                </div>
                {isSkuScanning && (
                  <div className="w-full aspect-[4/3] overflow-hidden border border-brand-black bg-black mt-2">
                    <Scanner
                      onScan={(codes: IDetectedBarcode[]) => {
                        if (codes.length > 0) {
                          setFormData(prev => ({ ...prev, supplierSku: codes[0].rawValue }));
                          setIsSkuScanning(false);
                          if ('vibrate' in navigator) navigator.vibrate(50);
                        }
                      }}
                      onError={(err) => console.error('[AddPartForm] SKU scan error:', err)}
                      allowMultiple={false}
                      scanDelay={500}
                      formats={['qr_code','ean_13','ean_8','code_128','code_39','upc_a','upc_e','data_matrix','itf','codabar']}
                      constraints={{ facingMode: 'environment' }}
                      components={{ torch: true, finder: true }}
                      styles={{
                        container: { width: '100%', height: '100%', overflow: 'hidden' },
                        video: { width: '100%', height: '100%', objectFit: 'cover' },
                      }}
                    />
                  </div>
                )}
                {formData.supplierSku && !isSkuScanning && (
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="font-mono font-bold text-emerald-700">{formData.supplierSku}</span>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, supplierSku: '' }))}
                      className="text-red-500 font-bold text-[10px] uppercase tracking-widest hover:underline"
                    >
                      CLEAR
                    </button>
                  </div>
                )}
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                  Barcode on the box or pack (e.g. case of 24).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <Label text="Pack Qty" />
                <input
                  type="number"
                  name="supplierSetQty"
                  value={formData.supplierSetQty}
                  onChange={handleChange}
                  step="1" min="1"
                  className={cn("brutalist-input w-full", errors.supplierSetQty && "border-red-500 bg-red-50")}
                  placeholder="e.g. 24"
                />
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                  Units per pack/case.
                </p>
                <FieldError msg={errors.supplierSetQty} />
              </div>
              <div className="sm:col-span-2">
                <Label text="Pack Price" />
                <div className="flex border border-brand-black overflow-hidden">
                  <span className="bg-brand-beige-dark px-2 py-2 font-bold border-r border-brand-black text-xs">
                    {formData.supplierCurrency}
                  </span>
                  <input
                    type="number"
                    name="supplierSetPrice"
                    value={formData.supplierSetPrice}
                    onChange={handleChange}
                    step="0.01" min="0"
                    className={cn("flex-1 px-2 py-2 border-none outline-none text-sm bg-white", errors.supplierSetPrice && "bg-red-50")}
                    placeholder="0.00"
                  />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40 mt-1">
                  Total price paid for one pack.
                  {formData.supplierSetPrice && formData.supplierSetQty && parseFloat(formData.supplierSetQty) > 0 && (
                    <span className="text-emerald-700 ml-1">
                      = {(parseFloat(formData.supplierSetPrice) / parseFloat(formData.supplierSetQty)).toFixed(4)} / unit
                    </span>
                  )}
                </p>
                <FieldError msg={errors.supplierSetPrice} />
              </div>
              <div>
                <Label text="Currency" />
                <select
                  name="supplierCurrency"
                  value={formData.supplierCurrency}
                  onChange={handleChange}
                  className="brutalist-input w-full"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 5: Description + Image side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label text="Description" />
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="brutalist-input w-full resize-y"
                placeholder="Optional item description"
              />
            </div>
            <div>
              <Label text="Image" />
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex flex-col items-center justify-center border border-dashed transition-all min-h-[120px] p-3",
                  isDragging ? "border-brand-black bg-brand-beige-dark" : "border-brand-black/30",
                  imagePreview && "p-2"
                )}
              >
                {imagePreview ? (
                  <div className="flex flex-col items-center w-full gap-2">
                    <img src={imagePreview} alt="Preview" className="w-24 h-24 object-contain border border-brand-black bg-white" />
                    <div className="flex gap-3">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60 hover:text-brand-black cursor-pointer transition-colors">
                        CHANGE
                        <input type="file" hidden accept="image/*" onChange={handleImageChange} />
                      </label>
                      <button
                        type="button"
                        onClick={() => { setFormData(prev => ({ ...prev, image: undefined })); setImagePreview(null); }}
                        className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:underline"
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center gap-2">
                    <ImageIcon size={24} className="text-brand-black/20" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-black/40">
                      DROP, PASTE, OR
                    </p>
                    <div className="flex gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60 hover:text-brand-black cursor-pointer border border-brand-black px-2 py-1 transition-colors">
                        UPLOAD
                        <input type="file" hidden accept="image/*" onChange={handleImageChange} />
                      </label>
                      <button type="button" onClick={openCamera} className="text-[10px] font-bold uppercase tracking-widest text-brand-black/60 hover:text-brand-black border border-brand-black px-2 py-1 flex items-center gap-1 transition-colors">
                        <Camera size={10} /> PHOTO
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-brand-black flex gap-3 justify-end">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="text-xs font-black uppercase tracking-widest text-brand-black/60 hover:text-brand-black px-4 py-2 transition-colors"
                disabled={loading}
              >
                CANCEL
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "brutalist-button py-2.5 px-6 text-xs bg-emerald-400 text-brand-black flex items-center gap-2",
                loading && "opacity-75 cursor-not-allowed"
              )}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              SAVE PART
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* Camera modal */}
    {isCameraOpen && (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full max-w-lg max-h-[70vh] object-contain"
        />
        <div className="flex gap-4 mt-4">
          <button
            type="button"
            onClick={capturePhoto}
            className="brutalist-button py-3 px-8 text-sm bg-emerald-400 text-brand-black flex items-center gap-2"
          >
            <ZoomIn size={18} /> CAPTURE
          </button>
          <button
            type="button"
            onClick={closeCamera}
            className="brutalist-button py-3 px-6 text-sm bg-white"
          >
            CANCEL
          </button>
        </div>
      </div>
    )}

    {/* Hidden canvas for photo capture */}
    <canvas ref={canvasRef} className="hidden" />
    </>
  );
};

export default AddPartForm;
