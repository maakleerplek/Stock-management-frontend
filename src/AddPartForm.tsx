import React, { useState, useEffect, useCallback } from 'react';
import { Save, X, QrCode, Loader2, Image as ImageIcon, Camera, StopCircle } from 'lucide-react';
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
  barcode?: string;
  purchasePrice: string;
  purchasePriceCurrency: string;
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
  onCancel?: () => void;
}

const AddPartForm: React.FC<AddPartFormProps> = ({ onSubmit, categories, locations, onCancel }) => {
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
  });

  const [errors, setErrors] = useState<PartFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

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
    const requiredFields: Array<keyof PartFormData> = ['partName', 'initialQuantity', 'minimumStock', 'purchasePrice', 'category', 'storageLocation'];
    
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
      setErrors({ submit: (error instanceof Error ? error.message : String(error)) || 'FAILED TO ADD PART' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex justify-center pb-8">
      <div className="w-full max-w-4xl bg-white border-2 border-brand-black shadow-[4px_4px_0px_0px_rgba(30,27,24,1)]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b-2 border-brand-black bg-white">
          <h2 className="text-xl font-black uppercase tracking-widest text-brand-black">
            CREATE NEW ITEM
          </h2>
          {onCancel && (
            <button 
              onClick={onCancel}
              className="p-1 border-2 border-brand-black bg-white hover:bg-brand-beige transition-colors"
            >
              <X size={20} className="text-brand-black" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {errors.submit && (
            <div className="mb-6 border-2 border-brand-black bg-red-100 p-4">
              <p className="text-sm font-black uppercase tracking-widest text-red-600">ERROR: {errors.submit}</p>
            </div>
          )}

          <form onSubmit={handleFinalSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Left Column */}
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black mb-2 uppercase tracking-widest">
                    Part Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="partName"
                    value={formData.partName}
                    onChange={handleChange}
                    placeholder="e.g., COLA ZERO"
                    className={cn(
                      "brutalist-input w-full", 
                      errors.partName && "border-red-500 bg-red-50"
                    )}
                  />
                  {errors.partName && <p className="text-[10px] text-red-600 mt-1 font-black uppercase tracking-widest">{errors.partName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-black mb-2 uppercase tracking-widest">Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    className="brutalist-input w-full resize-y"
                    placeholder="Detailed item description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-2 uppercase tracking-widest">
                      Category <span className="text-red-600">*</span>
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className={cn("brutalist-input w-full", errors.category && "border-red-500 bg-red-50")}
                    >
                      <option value="">SELECT...</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={String(cat.id)}>
                          {cat.name.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    {errors.category && <p className="text-[10px] text-red-600 mt-1 font-black uppercase tracking-widest">{errors.category}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-black mb-2 uppercase tracking-widest">
                      Location <span className="text-red-600">*</span>
                    </label>
                    <select
                      name="storageLocation"
                      value={formData.storageLocation}
                      onChange={handleChange}
                      className={cn("brutalist-input w-full", errors.storageLocation && "border-red-500 bg-red-50")}
                    >
                      <option value="">SELECT...</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={String(loc.id)}>
                          {loc.name.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    {errors.storageLocation && <p className="text-[10px] text-red-600 mt-1 font-black uppercase tracking-widest">{errors.storageLocation}</p>}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-2 uppercase tracking-widest">
                      Initial Quantity <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="number"
                      name="initialQuantity"
                      value={formData.initialQuantity}
                      onChange={handleChange}
                      step="1"
                      min="0"
                      className={cn("brutalist-input w-full", errors.initialQuantity && "border-red-500 bg-red-50")}
                      placeholder="0"
                    />
                    {errors.initialQuantity && <p className="text-[10px] text-red-600 mt-1 font-black uppercase tracking-widest">{errors.initialQuantity}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-2 uppercase tracking-widest">Minimum Stock</label>
                    <input
                      type="number"
                      name="minimumStock"
                      value={formData.minimumStock}
                      onChange={handleChange}
                      step="1"
                      min="0"
                      className={cn("brutalist-input w-full", errors.minimumStock && "border-red-500 bg-red-50")}
                      placeholder="0"
                    />
                    {errors.minimumStock && <p className="text-[10px] text-red-600 mt-1 font-black uppercase tracking-widest">{errors.minimumStock}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black mb-2 uppercase tracking-widest">Purchase Price</label>
                    <div className="flex border-2 border-brand-black overflow-hidden">
                      <span className="bg-brand-beige px-3 py-2 font-black border-r-2 border-brand-black text-sm">
                        {formData.purchasePriceCurrency}
                      </span>
                      <input
                        type="number"
                        name="purchasePrice"
                        value={formData.purchasePrice}
                        onChange={handleChange}
                        step="0.01"
                        min="0"
                        className="flex-1 px-3 py-2 border-none outline-none text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black mb-2 uppercase tracking-widest">Currency</label>
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
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black mb-2 uppercase tracking-widest">Part Image</label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "flex flex-col items-center justify-center p-6 border-2 border-dashed transition-all min-h-[200px]",
                      isDragging ? "border-brand-black bg-gray-100" : "border-brand-black/30 bg-gray-50",
                      imagePreview && "p-4"
                    )}
                  >
                    {imagePreview ? (
                      <div className="flex flex-col items-center w-full gap-4">
                        <img src={imagePreview} alt="Preview" className="w-40 h-40 object-contain border-2 border-brand-black bg-white" />
                        <div className="flex gap-4">
                          <label className="brutalist-button py-2 px-4 text-xs cursor-pointer">
                            CHANGE
                            <input type="file" hidden accept="image/*" onChange={handleImageChange} />
                          </label>
                          <button
                            type="button"
                            onClick={() => { setFormData(prev => ({ ...prev, image: undefined })); setImagePreview(null); }}
                            className="text-red-600 font-bold text-xs uppercase tracking-widest hover:underline"
                          >
                            REMOVE
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <ImageIcon size={40} className="text-brand-black/20 mb-3" />
                        <p className="text-xs font-black uppercase tracking-widest text-brand-black/60 mb-3">
                          DRAG & DROP OR PASTE IMAGE
                        </p>
                        <div className="flex gap-2">
                          <label className="brutalist-button py-2 px-4 text-xs cursor-pointer">
                            UPLOAD
                            <input type="file" hidden accept="image/*" onChange={handleImageChange} />
                          </label>
                          <label className="brutalist-button py-2 px-4 text-xs cursor-pointer flex items-center gap-1">
                            <Camera size={14} /> TAKE PHOTO
                            <input type="file" hidden accept="image/*" capture="environment" onChange={handleImageChange} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-2 border-brand-black bg-white p-4 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-brand-black/20">
                    <QrCode size={16} /> BARCODE <span className="text-brand-black/40">(OPTIONAL)</span>
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      name="barcode"
                      value={formData.barcode || ''}
                      onChange={handleChange}
                      placeholder="TYPE OR SCAN"
                      className="brutalist-input flex-1 text-sm"
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
                  {isScanning && (
                    <div className="w-full aspect-square overflow-hidden border-2 border-brand-black bg-black">
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
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-700 uppercase">
                      <span>BARCODE: {formData.barcode}</span>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, barcode: '' }))}
                        className="text-red-500 hover:underline"
                      >
                        CLEAR
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>

            <div className="pt-6 border-t-2 border-brand-black flex gap-4 justify-end">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="brutalist-button py-3 px-6 text-sm"
                  disabled={loading}
                >
                  CANCEL
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className={cn(
                  "brutalist-button py-3 px-8 text-sm bg-brand-accent text-brand-black flex items-center gap-3",
                  loading && "opacity-75 cursor-not-allowed"
                )}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                SAVE PART
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddPartForm;
