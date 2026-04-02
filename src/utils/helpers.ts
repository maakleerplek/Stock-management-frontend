// Utility functions for the frontend application
import type { PartFormData } from '../AddPartForm';

import { STORAGE_KEYS, API_CONFIG } from '../constants';

// Theme utilities
export const getInitialTheme = (): 'light' | 'dark' => {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME_PREFERENCE);
  return savedTheme ? (savedTheme as 'light' | 'dark') : 'light';
};

// API utilities
export const createApiUrl = (endpoint: string, baseUrl?: string): string => {
  const base = baseUrl || API_CONFIG.BASE_URL;
  return `${base}${endpoint}`;
};

// Error handling utilities
export const getErrorMessage = (error: unknown, context?: string): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Failed to fetch data' + (context ? ` in ${context}` : '');
};

// Form data utilities
export const parseNumericFields = (formData: PartFormData) => {
  return {
    initialQuantity: parseFloat(formData.initialQuantity) || 0,
    purchasePrice: parseFloat(formData.purchasePrice) || 0,
    locationId: parseInt(formData.storageLocation) || 0,
    categoryId: parseInt(formData.category) || 0,
    partId: formData.partId ? parseInt(formData.partId) : undefined,
    minimumStock: parseInt(formData.minimumStock) || 0,
  };
};