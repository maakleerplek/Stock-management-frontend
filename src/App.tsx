import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import AddPartForm, { type PartFormData, type SelectOption } from './AddPartForm';
import AddCategoryForm, { type CategoryFormData } from './AddCategoryForm';
import AddLocationForm, { type LocationFormData } from './AddLocationForm';
import type { ScanEvent } from './sendCodeHandler';
import ShoppingWindow from './ShoppingWindow';
import BarcodeScannerContainer from './BarcodeScannerContainer';
import ItemList from './ItemList';
import Footer from './components/Footer';
import Header from './components/Header';
import { ToastProvider, useToast } from './ToastContext';
import { VolunteerProvider, useVolunteer } from './VolunteerContext';
import VolunteerModal from './VolunteerModal';
import inventreeClient from './api/inventreeClient';
import { STORAGE_KEYS } from './constants';
import {
  getErrorMessage,
  parseNumericFields,
} from './utils/helpers';
import './index.css';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<'checkout' | 'volunteer' | 'inventory'>('checkout');
  const [scanEvent, setScanEvent] = useState<ScanEvent | null>(null);
  const scanCounterRef = useRef(0);
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false);
  const [addPartFormModalOpen, setAddPartFormModalOpen] = useState(false);
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false);
  const [addLocationModalOpen, setAddLocationModalOpen] = useState(false);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [checkoutResult, setCheckoutResult] = useState<{ total: number; description: string } | null>(null);
  const { addToast } = useToast();
  const { isVolunteerMode } = useVolunteer();

  // Warn before refresh if a checkout result is active
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (checkoutResult !== null) {
        console.log('[App] Preventing accidental refresh during active payment display');
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [checkoutResult]);

  const handleApiError = useCallback(
    (error: unknown, context: string, showWarning = false) => {
      const message = getErrorMessage(error, context);
      addToast(message, showWarning ? 'warning' : 'error');
    },
    [addToast]
  );

  const fetchCategoriesAndLocations = useCallback(async () => {
    try {
      console.log('[App] Fetching categories and locations...');
      const [categoriesResp, locationsResp] = await Promise.all([
        inventreeClient.getCategories(),
        inventreeClient.getLocations(),
      ]);

      setCategories((Array.isArray(categoriesResp) ? categoriesResp : categoriesResp?.results || []).map(c => ({ id: c.pk, name: c.name })));
      setLocations((Array.isArray(locationsResp) ? locationsResp : locationsResp?.results || []).map(l => ({ id: l.pk, name: l.name })));
      console.log(`[App] Loaded ${categoriesResp.results.length} categories and ${locationsResp.results.length} locations`);

    } catch (error) {
      setCategories([]);
      setLocations([]);
      handleApiError(error, 'fetching categories and locations');
    }
  }, [handleApiError]);

  useEffect(() => {
    fetchCategoriesAndLocations();
  }, [fetchCategoriesAndLocations]);

  const handleAddCategorySubmit = async (formData: CategoryFormData): Promise<void> => {
    try {
      await inventreeClient.createCategory({
        name: formData.name,
        description: formData.description || '',
        parent: formData.parent ? parseInt(formData.parent) : undefined
      });
      addToast('Category created successfully!', 'success');
      setAddCategoryModalOpen(false);
      fetchCategoriesAndLocations();
    } catch (error) {
      handleApiError(error, 'creating category');
      throw error;
    }
  };

  const handleAddLocationSubmit = async (formData: LocationFormData): Promise<void> => {
    try {
      await inventreeClient.createLocation({
        name: formData.name,
        description: formData.description || '',
        parent: formData.parent ? parseInt(formData.parent) : undefined
      });
      addToast('Location created successfully!', 'success');
      setAddLocationModalOpen(false);
      fetchCategoriesAndLocations();
    } catch (error) {
      handleApiError(error, 'creating location');
      throw error;
    }
  };

  const handleAddPartSubmit = async (formData: PartFormData): Promise<void> => {
    try {
      const numericFields = parseNumericFields(formData, ['category', 'defaultLocation']);
      const partData = {
        name: formData.name,
        description: formData.description || '',
        category: numericFields.category,
        IPN: formData.ipn || '',
        default_location: numericFields.defaultLocation,
        active: true,
      };

      const part = await inventreeClient.createPart(partData);

      if (formData.image) {
        await inventreeClient.uploadPartImage(part.pk, formData.image);
      }

      if (formData.initialStock && numericFields.defaultLocation) {
        await inventreeClient.createStockItem({
          part: part.pk,
          quantity: parseFloat(formData.initialStock),
          location: numericFields.defaultLocation,
          notes: 'Initial stock from part creation'
        });
      }

      addToast('Part created successfully!', 'success');
      setAddPartFormModalOpen(false);
    } catch (error) {
      handleApiError(error, 'creating part');
      throw error;
    }
  };

  const handleScan = useCallback(
    (code: string) => {
      scanCounterRef.current += 1;
      const newEvent: ScanEvent = { code, counter: scanCounterRef.current };
      console.log(`[App] Scan event #${newEvent.counter}: ${code}`);
      setScanEvent(newEvent);
    },
    []
  );

  const handleViewChange = (view: 'checkout' | 'volunteer' | 'inventory') => {
    setCurrentPage(view);
  };

  const handleVolunteerClick = () => {
    if (!isVolunteerMode) {
      setVolunteerModalOpen(true);
    }
  };

  // Update currentPage when volunteer mode changes
  useEffect(() => {
    if (!isVolunteerMode && currentPage !== 'checkout') {
      setCurrentPage('checkout');
    }
  }, [isVolunteerMode, currentPage]);

  return (
    <div className="min-h-screen flex flex-col bg-brand-beige">
      <Header 
        currentView={currentPage}
        onViewChange={handleViewChange}
        onVolunteerClick={handleVolunteerClick}
      />

      <main className="flex-1 flex flex-col">
        {currentPage === 'checkout' && (
          <div className="flex-1 flex flex-col lg:flex-row">
            {/* Scanner Section */}
            <div className="flex-1 border-b-[3px] lg:border-b-0 lg:border-r-[3px] border-brand-black p-4 sm:p-6">
              <BarcodeScannerContainer onScan={handleScan} />
            </div>
            
            {/* Shopping Cart Section */}
            <div className="w-full lg:w-[450px] p-4 sm:p-6 bg-white">
              <ShoppingWindow
                scanEvent={scanEvent}
                onCheckoutComplete={(total, description) => setCheckoutResult({ total, description })}
                onCheckoutClose={() => setCheckoutResult(null)}
                checkoutResult={checkoutResult}
              />
            </div>
          </div>
        )}

        {currentPage === 'volunteer' && (
          <div className="flex-1 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
              <div className="brutalist-card p-6">
                <h2 className="text-2xl font-black uppercase mb-4">Volunteer Dashboard</h2>
                <p className="text-sm opacity-60">Placeholder: Dashboard stats and activity log will be added here</p>
                
                {/* Action buttons */}
                <div className="flex gap-3 mt-6 flex-wrap">
                  <button 
                    onClick={() => setAddPartFormModalOpen(true)}
                    className="brutalist-button"
                  >
                    + Add Part
                  </button>
                  <button 
                    onClick={() => setAddCategoryModalOpen(true)}
                    className="brutalist-button"
                  >
                    + Add Category
                  </button>
                  <button 
                    onClick={() => setAddLocationModalOpen(true)}
                    className="brutalist-button"
                  >
                    + Add Location
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'inventory' && (
          <div className="flex-1 p-4 sm:p-6">
            <ItemList />
          </div>
        )}
      </main>

      <Footer />

      {/* Modals */}
      <VolunteerModal 
        open={volunteerModalOpen}
        onClose={() => setVolunteerModalOpen(false)}
      />

      {/* Add Part Modal */}
      {addPartFormModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setAddPartFormModalOpen(false)}
        >
          <div 
            className="brutalist-card bg-white w-full max-w-3xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <AddPartForm
                onSubmit={handleAddPartSubmit}
                onCancel={() => setAddPartFormModalOpen(false)}
                categories={categories}
                locations={locations}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {addCategoryModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setAddCategoryModalOpen(false)}
        >
          <div 
            className="brutalist-card bg-white w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <AddCategoryForm
                onSubmit={handleAddCategorySubmit}
                onCancel={() => setAddCategoryModalOpen(false)}
                categories={categories}
                locations={locations}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {addLocationModalOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setAddLocationModalOpen(false)}
        >
          <div 
            className="brutalist-card bg-white w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <AddLocationForm
                onSubmit={handleAddLocationSubmit}
                onCancel={() => setAddLocationModalOpen(false)}
                locations={locations}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <VolunteerProvider>
        <AppContent />
      </VolunteerProvider>
    </ToastProvider>
  );
}
