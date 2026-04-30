// Constants file for the frontend application

// Organization Configuration
export const ORGANIZATION = {
  NAME: import.meta.env.VITE_ORGANIZATION_NAME || 'Stock Management',
  URL: import.meta.env.VITE_ORGANIZATION_URL || 'https://maakleerplek.be/',
} as const;

// API Configuration
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_BACKEND_URL || '/api',
  ENDPOINTS: {
    GET_ITEM_FROM_QR: '/get-item-from-qr',
    TAKE_ITEM: '/take-item',
    ADD_ITEM: '/add-item',
    SET_ITEM: '/set-item',
    GET_CATEGORIES: '/get-categories',
    GET_LOCATIONS: '/get-locations',
    GET_ALL_ITEMS: '/get-all-items',
    CREATE_PART: '/create-part',
    UPDATE_PART: '/update-part/{part_pk}',
    CREATE_STOCK_ITEM: '/create-stock-item',
    UPLOAD_PART_IMAGE: '/upload-part-image/{part_id}',
    CREATE_CATEGORY: '/create-category',
    CREATE_LOCATION: '/create-location',
  },
} as const;

// InvenTree Configuration
const getInvenTreeUrl = () => {
  const panelUrl = import.meta.env.VITE_INVENTREE_PANEL_URL;
  if (panelUrl && typeof panelUrl === 'string' && panelUrl.trim().length > 0) {
    return panelUrl.endsWith('/') ? panelUrl : `${panelUrl}/`;
  }
  return '';
};

export const INVENTREE_CONFIG = {
  URL: getInvenTreeUrl(),
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  THEME_PREFERENCE: 'themePreference',
  VOLUNTEER_MODE: 'volunteerModeActive',
} as const;

// Default Values
export const DEFAULTS = {
  CURRENCY: import.meta.env.VITE_CURRENCY || 'EUR',
  TOAST_DURATION: 4000,
  GRID_COLUMNS: {
    XS: '1fr',
    MD: '1fr 1fr',
  },
  MOTION_DURATION: 0.6,
} as const;

// Extra Services Pricing (configurable via .env)
export const PRICING = {
  LASER_PER_MINUTE: parseFloat(import.meta.env.VITE_LASER_PRICE_PER_MIN || '0.50'),
  CNC_PER_MINUTE: parseFloat(import.meta.env.VITE_CNC_PRICE_PER_MIN || '0.50'),
  PRINTING_PER_GRAM: parseFloat(import.meta.env.VITE_PRINT_PRICE_PER_GRAM || '0.10'),
} as const;

// Payment Configuration (configurable via .env)
export const PAYMENT = {
  BENEFICIARY_NAME: import.meta.env.VITE_PAYMENT_NAME || 'Stock Manager',
  IBAN: import.meta.env.VITE_PAYMENT_IBAN || 'BE00000000000000',
  PAYCONIQ_MERCHANT_ID: import.meta.env.VITE_PAYCONIQ_MERCHANT_ID || '',
} as const;

// Authentication
export const AUTH = {
  VOLUNTEER_PASSWORD: import.meta.env.VITE_VOLUNTEER_PASSWORD || 'volunteer',
} as const;
