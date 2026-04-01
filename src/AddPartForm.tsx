import React, { useState, useEffect, useCallback } from 'react';
import {
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Alert,
  CircularProgress,
  FormHelperText,
  Stepper,
  Step,
  StepLabel,
  Typography,
  InputAdornment, // Add InputAdornment
  Avatar,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ClearIcon from '@mui/icons-material/Clear';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import Scanner from './BarcodeScanner'; // Import the Barcode Scanner

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<string>) => {
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
    <Box sx={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
      <Stepper activeStep={step - 1} alternativeLabel sx={{ pt: 1, pb: { xs: 2, sm: 3 } }}>
        <Step>
          <StepLabel>Basic Details</StepLabel>
        </Step>
        <Step>
          <StepLabel>Category & Location</StepLabel>
        </Step>
      </Stepper>
      <Box>
        {successMessage && <Alert severity="success">{successMessage}</Alert>}
        {errors.submit && <Alert severity="error">{errors.submit}</Alert>}

        <Box component="form" onSubmit={handleFinalSubmit} sx={{ mt: 3 }}>
          {step === 1 && (
            <Grid container spacing={2}>
              {/* Part Name */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Part Name"
                  name="partName"
                  value={formData.partName}
                  onChange={handleChange}
                  error={!!errors.partName}
                  helperText={errors.partName}
                  required
                  placeholder="e.g., Resistor 10k"
                />
              </Grid>

              {/* Description */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  multiline
                  rows={3}
                  placeholder="Detailed description of the part"
                />
              </Grid>

              {/* Image Upload */}
              <Grid item xs={12}>
                <Box
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    p: 2,
                    border: '2px dashed',
                    borderColor: isDragging ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    backgroundColor: isDragging ? 'action.hover' : 'transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  <Typography variant="subtitle2">Part Image (Optional)</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Drag and drop an image here, paste from clipboard, or click to upload
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {imagePreview && (
                      <Avatar
                        src={imagePreview}
                        alt="Preview"
                        sx={{ width: 100, height: 100 }}
                        variant="rounded"
                      />
                    )}
                    <Button
                      variant="outlined"
                      component="label"
                      sx={{ minWidth: 150 }}
                    >
                      {formData.image ? 'Change Image' : 'Upload Image'}
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handleImageChange}
                      />
                    </Button>
                    {formData.image && (
                      <Button
                        variant="text"
                        color="error"
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, image: undefined }));
                          setImagePreview(null);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </Box>
                  {errors.image && (
                    <FormHelperText error>{errors.image}</FormHelperText>
                  )}
                  {formData.image && (
                    <Typography variant="caption" color="text.secondary">
                      Selected: {formData.image.name} ({(formData.image.size / 1024).toFixed(2)} KB)
                    </Typography>
                  )}
                </Box>
              </Grid>

              {/* Initial Quantity */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Initial Quantity"
                  name="initialQuantity"
                  value={formData.initialQuantity}
                  onChange={handleChange}
                  error={!!errors.initialQuantity}
                  helperText={errors.initialQuantity}
                  type="number"
                  inputProps={{ step: '0.01', min: '0' }}
                  placeholder="0"
                  required
                />
              </Grid>

              {/* Minimum Stock */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Minimum Stock"
                  name="minimumStock"
                  value={formData.minimumStock}
                  onChange={handleChange}
                  error={!!errors.minimumStock}
                  helperText={errors.minimumStock}
                  type="number"
                  inputProps={{ step: '1', min: '0' }}
                  placeholder="0"
                />
              </Grid>

              {/* Unit Price */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Purchase Price"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleChange}
                  error={!!errors.purchasePrice}
                  helperText={errors.purchasePrice}
                  type="number"
                  inputProps={{ step: '0.01', min: '0' }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">{formData.purchasePriceCurrency}</InputAdornment>,
                  }}
                  placeholder="0.00"
                />
              </Grid>
              {/* Purchase Price Currency */}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Currency</InputLabel>
                  <Select
                    name="purchasePriceCurrency"
                    value={formData.purchasePriceCurrency}
                    onChange={handleChange}
                    label="Currency"
                  >
                    <MenuItem value="EUR">EUR</MenuItem>
                    <MenuItem value="USD">USD</MenuItem>
                    <MenuItem value="GBP">GBP</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              {/* Action Buttons for Step 1 */}
              <Grid item xs={12} sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
                {onCancel && (
                  <Button
                    variant="outlined"
                    startIcon={<ClearIcon />}
                    onClick={onCancel}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  variant="outlined"
                  startIcon={<ClearIcon />}
                  onClick={handleReset}
                  disabled={loading}
                >
                  Reset
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleNextStep}
                  startIcon={loading ? <CircularProgress size={20} /> : <ArrowForwardIcon />}
                  disabled={loading}
                >
                  {loading ? 'Creating Part...' : 'Next Step'}
                </Button>
              </Grid>
            </Grid>
          )}

          {step === 2 && (
            <Grid container spacing={2}>
              {/* Category */}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.category} required>
                  <InputLabel>Category *</InputLabel>
                  <Select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    label="Category"
                  >
                    <MenuItem value="">
                      <em>Select a category</em>
                    </MenuItem>
                    {categories.map((cat) => (
                      <MenuItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.category && <FormHelperText>{errors.category}</FormHelperText>}
                </FormControl>
              </Grid>

              {/* Storage Location */}
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth error={!!errors.storageLocation} required>
                  <InputLabel>Storage Location *</InputLabel>
                  <Select
                    name="storageLocation"
                    value={formData.storageLocation}
                    onChange={handleChange}
                    label="Storage Location"
                  >
                    <MenuItem value="">
                      <em>Select location</em>
                    </MenuItem>
                    {locations.map((loc) => (
                      <MenuItem key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.storageLocation && <FormHelperText>{errors.storageLocation}</FormHelperText>}
                </FormControl>
              </Grid>

              {/* Barcode Scanner and Display */}
              <Grid item xs={12}>
                <Box sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  mt: 1,
                  p: 2,
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 3,
                  bgcolor: 'action.hover'
                }}>
                  <Scanner onScan={handleBarcodeScanned} compact />

                  <TextField
                    fullWidth
                    label="Barcode (Manual Entry)"
                    name="barcode"
                    value={formData.barcode || ''}
                    onChange={handleChange}
                    placeholder="Scan or type barcode"
                    helperText="Last scanned or manually entered barcode"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <QrCode2Icon color="primary" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ maxWidth: 450 }}
                  />

                  {errors.barcode && (
                    <FormHelperText error sx={{ mt: -1 }}>
                      {errors.barcode}
                    </FormHelperText>
                  )}
                </Box>
              </Grid>
              {/* Action Buttons for Step 2 */}
              <Grid item xs={12} sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
                {onCancel && (
                  <Button
                    variant="outlined"
                    startIcon={<ClearIcon />}
                    onClick={onCancel}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  variant="outlined"
                  startIcon={<ArrowBackIcon />}
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  type="submit"
                  startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                  disabled={loading}
                >
                  {loading ? 'Saving...' : 'Add Part'}
                </Button>
              </Grid>
            </Grid>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default AddPartForm;
