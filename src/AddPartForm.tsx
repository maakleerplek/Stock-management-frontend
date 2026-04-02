import React, { useState, useEffect, useCallback } from 'react';
import { Save, X, ArrowRight, ArrowLeft, QrCode, Upload, Loader2 } from 'lucide-react';
import Scanner from './BarcodeScanner'; // Import the Barcode Scanner
import { cn } from './lib/utils';

// Define interfaces for common data structures
export interface SelectOption {
  id: string | number;
  name: string;
}

export interface PartFormData {
  partId?: string; // Add partId for updating existing part
  partName: string;

  description: string;
  category: string;
  initialQuantity: string; // Keep as string for TextField input

  storageLocation: string;
  minimumStock: string; // Add minimumStock field


  barcode?: string; // Add barcode field
  purchasePrice: string; // Add purchasePrice field
  purchasePriceCurrency: string; // Add purchasePriceCurrency field
  image?: File; // Add image file field
}

export interface PartFormErrors {
  [key: string]: string | undefined; // Allow dynamic keys for errors
  partName?: string;

  category?: string;
  initialQuantity?: string;
  minimumStock?: string; // Add minimumStock error field
  barcode?: string;
  submit?: string; // For general form submission errors
}

interface AddPartFormProps {
  onSubmit: (formData: PartFormData) => Promise<{ partId: string }>; // onSubmit now returns partId
  categories: SelectOption[];
  locations: SelectOption[];
  onCancel?: () => void;
  // units: SelectOption[]; // Removed
}

const AddPartForm: React.FC<AddPartFormProps> = ({ onSubmit, categories, locations, onCancel }) => {
  const requiredFieldsStep1: Array<keyof PartFormData> = ['partName', 'initialQuantity'];
  const requiredFieldsStep2: Array<keyof PartFormData> = ['category', 'storageLocation']; // barcode will be validated separately

  const [step, setStep] = useState(1); // Add step state
  const [formData, setFormData] = useState<PartFormData>({
    partId: undefined, // Initialize partId
    partName: '',

    description: '',
    category: '',
    initialQuantity: '',
    minimumStock: '', // Initialize minimumStock

    storageLocation: '',
    barcode: '', // Initialize barcode
    purchasePrice: '', // Initialize purchasePrice
    purchasePriceCurrency: 'EUR', // Initialize purchasePriceCurrency
  });

  const [errors, setErrors] = useState<PartFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Restore image preview if file exists but preview is missing
  useEffect(() => {
    if (formData.image && !imagePreview) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(formData.image);
    }
  }, [formData.image, imagePreview]);

  const validateForm = (currentStep: number) => {
    const newErrors: PartFormErrors = {};
    if (currentStep === 1) {
      requiredFieldsStep1.forEach((field) => {
        if (!formData[field as keyof PartFormData]?.toString().trim()) {
          newErrors[field] = `${field} is required`;
        }
      });
      if (formData.initialQuantity && isNaN(parseFloat(formData.initialQuantity))) {
        newErrors.initialQuantity = 'Quantity must be a number';
      }
      if (formData.minimumStock && isNaN(parseFloat(formData.minimumStock))) {
        newErrors.minimumStock = 'Minimum Stock must be a number';
      }
      if (formData.purchasePrice && isNaN(parseFloat(formData.purchasePrice))) {
        newErrors.purchasePrice = 'Purchase Price must be a number';
      }
    } else if (currentStep === 2) {
      requiredFieldsStep2.forEach((field) => {
        if (!formData[field as keyof PartFormData]?.toString().trim()) {
          newErrors[field] = `${field} is required`;
        }
      });
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
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: undefined, // Clear specific error
      }));
    }
  };


  const handleImageFile = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({
        ...prev,
        image: 'Please select a valid image file',
      }));
      return;
    }
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        image: 'Image size must be less than 10MB',
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      image: file,
    }));
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Clear error
    setErrors((prev) => ({
      ...prev,
      image: undefined,
    }));
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFile(file);
    }
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
    if (file) {
      handleImageFile(file);
    }
  };

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (step !== 1) return;

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
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [step, handleImageFile]);

  const handleNextStep = async () => {
    if (!validateForm(1)) {
      return;
    }

    setLoading(true);
    try {
      // Submit part data for creation
      const { partId } = await onSubmit(formData); // Expecting partId back
      setFormData((prev) => ({ ...prev, partId })); // Store partId
      setStep(2); // Move to next step
      setErrors({}); // Clear errors for the next step
    } catch (error: unknown) {
      setErrors({ submit: (error instanceof Error ? error.message : String(error)) || 'Failed to add part (Step 1)' });
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm(2)) {
      return;
    }

    setLoading(true);
    try {
      // Submit remaining data for update, including partId
      await onSubmit(formData); // This call should now handle the update with partId
      setSuccessMessage('Part added successfully!');
      handleReset();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: unknown) {
      setErrors({ submit: (error instanceof Error ? error.message : String(error)) || 'Failed to add part (Step 2)' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1); // Reset step to 1
    setFormData({
      partId: undefined,
      partName: '',

      description: '',
      category: '',
      initialQuantity: '',
      minimumStock: '', // Clear minimumStock on reset

      storageLocation: '',


      barcode: '',
      purchasePrice: '', // Initialize purchasePrice here
      purchasePriceCurrency: 'EUR', // Initialize purchasePriceCurrency here
      image: undefined,
    });
    setErrors({});
    setSuccessMessage(''); // Clear success message on reset
    setImagePreview(null); // Clear image preview
  };

  const handleBarcodeScanned = (barcode: string) => {
    setFormData((prev) => ({ ...prev, barcode }));
    // Clear barcode error if present
    if (errors.barcode) {
      setErrors((prev) => ({
        ...prev,
        barcode: undefined,
      }));
    }
  };

  return (
    <div className="max-w-[800px] mx-auto w-full">
      {/* Stepper */}
      <div className="flex items-center justify-center gap-4 pt-2 pb-4 sm:pb-6">
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 brutalist-border flex items-center justify-center font-bold",
            step >= 1 ? "bg-black text-beige" : "bg-white"
          )}>
            1
          </div>
          <span className="text-xs sm:text-sm font-bold uppercase">Basic Details</span>
        </div>
        <div className={cn(
          "w-12 sm:w-16 h-1 brutalist-border",
          step >= 2 ? "bg-black" : "bg-white"
        )} />
        <div className="flex flex-col items-center gap-2">
          <div className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 brutalist-border flex items-center justify-center font-bold",
            step >= 2 ? "bg-black text-beige" : "bg-white"
          )}>
            2
          </div>
          <span className="text-xs sm:text-sm font-bold uppercase">Category & Location</span>
        </div>
      </div>
      
      <div>
        {successMessage && (
          <div className="brutalist-card bg-green-100 border-green-500 p-4 mb-4">
            <p className="text-sm font-bold text-black">{successMessage}</p>
          </div>
        )}
        {errors.submit && (
          <div className="brutalist-card bg-yellow-100 border-yellow-500 p-4 mb-4">
            <p className="text-sm font-bold text-black">{errors.submit}</p>
          </div>
        )}

        <form onSubmit={handleFinalSubmit} className="mt-6">
          {step === 1 && (
            <div className="grid grid-cols-1 gap-4">
              {/* Part Name */}
              <div className="sm:col-span-6">
                <label className="block text-sm font-bold mb-2 uppercase">
                  Part Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="partName"
                  value={formData.partName}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Resistor 10k"
                  className={cn("brutalist-input w-full px-3 py-2", errors.partName && "border-red-500")}
                />
                {errors.partName && <p className="text-xs text-red-600 mt-1 font-bold">{errors.partName}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-bold mb-2 uppercase">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Detailed description of the part"
                  className="brutalist-input w-full px-3 py-2 resize-y"
                />
              </div>

              {/* Image Upload */}
              <div>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "flex flex-col gap-4 p-4 border-3 border-dashed transition-all",
                    isDragging ? "border-black bg-beige" : "border-gray-300 bg-transparent"
                  )}
                >
                  <p className="text-sm font-bold uppercase">Part Image (Optional)</p>
                  <p className="text-xs text-gray-600">
                    Drag and drop an image here, paste from clipboard, or click to upload
                  </p>
                  <div className="flex gap-4 items-center flex-wrap">
                    {imagePreview && (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-24 h-24 object-cover brutalist-border"
                      />
                    )}
                    <label className="brutalist-button px-4 py-2 cursor-pointer inline-flex items-center gap-2">
                      <Upload className="w-4 h-4" />
                      {formData.image ? 'Change Image' : 'Upload Image'}
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handleImageChange}
                      />
                    </label>
                    {formData.image && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, image: undefined }));
                          setImagePreview(null);
                        }}
                        className="text-red-600 font-bold text-sm hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {errors.image && <p className="text-xs text-red-600 font-bold">{errors.image}</p>}
                  {formData.image && (
                    <p className="text-xs text-gray-600">
                      Selected: {formData.image.name} ({(formData.image.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                </div>
              </div>

              {/* Initial Quantity & Minimum Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2 uppercase">
                    Initial Quantity <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    name="initialQuantity"
                    value={formData.initialQuantity}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    placeholder="0"
                    required
                    className={cn("brutalist-input w-full px-3 py-2", errors.initialQuantity && "border-red-500")}
                  />
                  {errors.initialQuantity && <p className="text-xs text-red-600 mt-1 font-bold">{errors.initialQuantity}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2 uppercase">Minimum Stock</label>
                  <input
                    type="number"
                    name="minimumStock"
                    value={formData.minimumStock}
                    onChange={handleChange}
                    step="1"
                    min="0"
                    placeholder="0"
                    className={cn("brutalist-input w-full px-3 py-2", errors.minimumStock && "border-red-500")}
                  />
                  {errors.minimumStock && <p className="text-xs text-red-600 mt-1 font-bold">{errors.minimumStock}</p>}
                </div>
              </div>

              {/* Purchase Price & Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2 uppercase">Purchase Price</label>
                  <div className="flex items-center brutalist-input px-0 py-0 overflow-hidden">
                    <span className="px-3 py-2 bg-beige border-r-3 border-black font-bold text-sm">
                      {formData.purchasePriceCurrency}
                    </span>
                    <input
                      type="number"
                      name="purchasePrice"
                      value={formData.purchasePrice}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className={cn("flex-1 px-3 py-2 border-none outline-none", errors.purchasePrice && "border-red-500")}
                    />
                  </div>
                  {errors.purchasePrice && <p className="text-xs text-red-600 mt-1 font-bold">{errors.purchasePrice}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2 uppercase">Currency</label>
                  <select
                    name="purchasePriceCurrency"
                    value={formData.purchasePriceCurrency}
                    onChange={handleChange}
                    className="brutalist-input w-full px-3 py-2"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons for Step 1 */}
              <div className="flex gap-3 justify-end mt-6">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className={cn("brutalist-button px-4 py-2 flex items-center gap-2", loading && "opacity-50")}
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  className={cn("brutalist-button px-4 py-2 flex items-center gap-2", loading && "opacity-50")}
                >
                  <X className="w-4 h-4" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={loading}
                  className={cn(
                    "brutalist-button px-4 py-2 bg-black text-beige flex items-center gap-2",
                    loading && "opacity-75"
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating Part...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      Next Step
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-4">
              {/* Category & Storage Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2 uppercase">
                    Category <span className="text-red-600">*</span>
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    className={cn("brutalist-input w-full px-3 py-2", errors.category && "border-red-500")}
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {errors.category && <p className="text-xs text-red-600 mt-1 font-bold">{errors.category}</p>}
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2 uppercase">
                    Storage Location <span className="text-red-600">*</span>
                  </label>
                  <select
                    name="storageLocation"
                    value={formData.storageLocation}
                    onChange={handleChange}
                    required
                    className={cn("brutalist-input w-full px-3 py-2", errors.storageLocation && "border-red-500")}
                  >
                    <option value="">Select location</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  {errors.storageLocation && <p className="text-xs text-red-600 mt-1 font-bold">{errors.storageLocation}</p>}
                </div>
              </div>

              {/* Barcode Scanner */}
              <div className="flex flex-col items-center gap-4 mt-2 p-4 border-3 border-dashed border-gray-300 bg-beige/30">
                <Scanner onScan={handleBarcodeScanned} compact />

                <div className="w-full max-w-[450px]">
                  <label className="block text-sm font-bold mb-2 uppercase">Barcode (Manual Entry)</label>
                  <div className="flex items-center brutalist-input px-0 py-0 overflow-hidden">
                    <span className="px-3 py-2 bg-beige border-r-3 border-black">
                      <QrCode className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      name="barcode"
                      value={formData.barcode || ''}
                      onChange={handleChange}
                      placeholder="Scan or type barcode"
                      className="flex-1 px-3 py-2 border-none outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Last scanned or manually entered barcode</p>
                  {errors.barcode && <p className="text-xs text-red-600 mt-1 font-bold">{errors.barcode}</p>}
                </div>
              </div>

              {/* Action Buttons for Step 2 */}
              <div className="flex gap-3 justify-end mt-6">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={loading}
                    className={cn("brutalist-button px-4 py-2 flex items-center gap-2", loading && "opacity-50")}
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className={cn("brutalist-button px-4 py-2 flex items-center gap-2", loading && "opacity-50")}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={cn(
                    "brutalist-button px-4 py-2 bg-black text-beige flex items-center gap-2",
                    loading && "opacity-75"
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Add Part
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default AddPartForm;
