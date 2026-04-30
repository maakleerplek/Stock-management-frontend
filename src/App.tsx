import { useState, useCallback, useEffect, useRef } from 'react';
import AddPartForm, { type PartFormData, type SelectOption } from './AddPartForm';
import AddCategoryForm, { type CategoryFormData } from './AddCategoryForm';
import AddLocationForm, { type LocationFormData } from './AddLocationForm';
import type { ScanEvent, ItemData } from './sendCodeHandler';
import ShoppingWindow from './ShoppingWindow';
import BarcodeScannerContainer from './BarcodeScannerContainer';
import ItemList from './ItemList';
import Footer from './components/Footer';
import { StockProvider } from './StockContext';
import Header from './components/Header';
import InvenTreePage from './InvenTreePage';
import { ToastProvider, useToast } from './ToastContext';
import { VolunteerProvider, useVolunteer } from './VolunteerContext';
import VolunteerModal from './VolunteerModal';
import AdminToolsBar from './components/AdminToolsBar';
import {
  type InvenTreeTrackingEntry,
  type InvenTreePartListResponse
} from './api/types';
import inventreeClient from './api/inventreeClient';
import {
  getErrorMessage,
  parseNumericFields,
} from './utils/helpers';
import { Info, AlertCircle, Loader2, LayoutDashboard, ScanBarcode, Package, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import './index.css';

export type AppView = 'checkout' | 'volunteer' | 'inventory' | 'scan' | 'inventree';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<AppView>('checkout');
  const [scanEvent, setScanEvent] = useState<ScanEvent | null>(null);
  const scanCounterRef = useRef(0);
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false);
  const [addPartFormModalOpen, setAddPartFormModalOpen] = useState(false);
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false);
  const [addLocationModalOpen, setAddLocationModalOpen] = useState(false);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InvenTreePartListResponse['results']>([]);
  const [recentMovements, setRecentMovements] = useState<InvenTreeTrackingEntry[]>([]);
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
      console.log('[App] Fetching initial data...');
      const [categoriesResp, locationsResp] = await Promise.all([
        inventreeClient.getCategories(),
        inventreeClient.getLocations(),
      ]);

      setCategories((Array.isArray(categoriesResp) ? categoriesResp : categoriesResp?.results || []).map(c => ({ id: c.pk, name: c.name })));
      setLocations((Array.isArray(locationsResp) ? locationsResp : locationsResp?.results || []).map(l => ({ id: l.pk, name: l.name })));

      if (isVolunteerMode) {
        console.log('[App] Fetching dashboard metrics...');
        const [lowStockResp, trackingResp] = await Promise.all([
          inventreeClient.getLowStockParts(),
          inventreeClient.getStockTracking(5),
        ]);
        setLowStockItems(lowStockResp.results || []);
        setRecentMovements(trackingResp.results || []);
      }

    } catch (error) {
      console.error('[App] fetchCategoriesAndLocations failed:', error);
      setCategories([]);
      setLocations([]);
      handleApiError(error, 'fetching initial data');
    }
  }, [isVolunteerMode, handleApiError]);

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
    console.log('[App] handleAddLocationSubmit called with:', formData);
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

  const handleAddPartSubmit = async (formData: PartFormData): Promise<{ partId: string }> => {
    try {
      const numericFields = parseNumericFields(formData);
      const partData = {
        name: formData.partName,
        description: formData.description || '',
        category: numericFields.categoryId,
        ...(formData.barcode ? { IPN: formData.barcode } : {}),
        default_location: numericFields.locationId,
        active: true,
      };

      const part = await inventreeClient.createPart(partData);

      if (formData.image) {
        await inventreeClient.uploadPartImage(part.pk, formData.image);
      }

      if (formData.initialQuantity && numericFields.locationId) {
        await inventreeClient.createStockItem({
          part: part.pk,
          quantity: numericFields.initialQuantity,
          location: numericFields.locationId,
          notes: 'Initial stock from part creation'
        });
      }

      addToast('Part created successfully!', 'success');
      setAddPartFormModalOpen(false);
      return { partId: String(part.pk) };
    } catch (error) {
      handleApiError(error, 'creating part');
      throw error;
    }
  };

  const handleItemScanned = useCallback(
    (item: ItemData | null) => {
      if (!item) return;
      scanCounterRef.current += 1;
      const newEvent: ScanEvent = { item, id: scanCounterRef.current };
      console.log(`[App] Scan event #${newEvent.id}: ${item.name}`);
      setScanEvent(newEvent);
    },
    []
  );

  const handleViewChange = (view: AppView) => {
    setCurrentPage(view);
  };

  const handleVolunteerClick = () => {
    if (!isVolunteerMode) {
      setVolunteerModalOpen(true);
    }
  };

  // Update currentPage when volunteer mode changes
  useEffect(() => {
    if (isVolunteerMode && currentPage === 'checkout') {
      setCurrentPage('volunteer');
    }
    if (!isVolunteerMode && currentPage !== 'checkout') {
      setCurrentPage('checkout');
    }
  }, [isVolunteerMode, currentPage]);

  const VolunteerNavigation = () => (
    <div className="border-b-2 border-brand-black bg-white px-2 sm:px-6 py-0 flex gap-1 sm:gap-4 overflow-x-auto">
      {[
        { id: 'volunteer', label: 'OVERVIEW', icon: LayoutDashboard },
        { id: 'scan', label: 'VOLUNTEER SCAN', icon: ScanBarcode },
        { id: 'inventory', label: 'STOCK LIST', icon: Package },
        { id: 'inventree', label: 'INVENTREE PANEL', icon: ExternalLink }
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setCurrentPage(tab.id as AppView)}
          className={cn(
            "px-3 sm:px-4 py-3 font-black uppercase tracking-widest text-[10px] sm:text-xs border-b-4 transition-all flex items-center gap-1.5",
            currentPage === tab.id
              ? "border-brand-black text-brand-black"
              : "border-transparent text-brand-black/50 hover:text-brand-black hover:border-brand-black/30"
          )}
        >
          <tab.icon size={14} className="flex-shrink-0" />
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white">
      <Header
        currentView={currentPage === 'checkout' ? 'checkout' : (currentPage === 'volunteer' ? 'volunteer' : 'inventory')}
        onViewChange={(v) => handleViewChange(v as AppView)}
        onVolunteerClick={handleVolunteerClick}
      />

      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-auto">
        {currentPage === 'checkout' && (
          <>
            {/* Main Content Area (Scanner) */}
            <div className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center bg-white min-h-[50vh] lg:min-h-0">
              <BarcodeScannerContainer onItemScanned={handleItemScanned} checkoutResult={checkoutResult} />
            </div>

            {/* Right Sidebar: Shopping Cart */}
            <aside className="w-full lg:w-[40%] border-l-0 lg:border-l-3 border-t-3 lg:border-t-0 border-brand-black bg-white flex flex-col min-h-[50vh] lg:min-h-0">
              <ShoppingWindow
                scanEvent={scanEvent}
                onCheckoutResultChange={(result) => setCheckoutResult(result)}
              />
            </aside>
          </>
        )}

        {(currentPage === 'volunteer' || currentPage === 'scan' || currentPage === 'inventory' || currentPage === 'inventree') && (
          <div className="flex-1 flex flex-col overflow-auto">
            <VolunteerNavigation />

            {/* Admin Tools Bar - visible on all volunteer views except inventree */}
            {currentPage !== 'inventree' && (
              <AdminToolsBar
                onNewItem={() => setAddPartFormModalOpen(true)}
                onAddCategory={() => setAddCategoryModalOpen(true)}
                onAddLocation={() => setAddLocationModalOpen(true)}
              />
            )}

            <AnimatePresence mode="wait">
              {currentPage === 'volunteer' && (
                <motion.div
                  key="volunteer"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 overflow-auto bg-white"
                >
                  {/* Dashboard Content */}
                  <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
                    <div className="border-b-2 border-brand-black pb-4">
                      <h2 className="text-2xl font-black uppercase tracking-widest text-brand-black">DASHBOARD</h2>
                      <p className="font-bold text-xs uppercase tracking-widest text-brand-black/60 mt-1">SYSTEM STATUS</p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="border-2 border-brand-black p-3 bg-white">
                        <div className="text-[10px] font-black uppercase tracking-widest text-brand-black/60 mb-1">CATEGORIES</div>
                        <div className="text-2xl font-black">{categories.length}</div>
                      </div>
                      <div className="border-2 border-brand-black p-3 bg-white">
                        <div className="text-[10px] font-black uppercase tracking-widest text-brand-black/60 mb-1">LOCATIONS</div>
                        <div className="text-2xl font-black">{locations.length}</div>
                      </div>
                      {lowStockItems.length > 0 && (
                        <div className="border-2 border-red-600 p-3 bg-red-50 col-span-2">
                          <div className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1">LOW STOCK ITEMS</div>
                          <div className="text-2xl font-black text-red-600">{lowStockItems.length}</div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Low Stock Alert */}
                      {lowStockItems.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-red-600">
                            <AlertCircle size={16} /> LOW STOCK ITEMS
                          </h3>
                          <div className="border-2 border-red-600 bg-white">
                            <ul className="divide-y divide-red-200">
                              {lowStockItems.map((item: any) => (
                                <li key={item.pk} className="px-4 py-2 text-xs font-bold uppercase text-brand-black">
                                  {item.name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Quick Actions */}
                      <div className="space-y-3">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                          <Info size={16} /> QUICK ACTIONS
                        </h3>
                        <div className="border-2 border-brand-black bg-white p-4">
                          <p className="font-bold text-xs leading-relaxed text-brand-black/70 mb-4">
                            USE THE TABS ABOVE TO MANAGE STOCK OR SCAN ITEMS.
                          </p>
                          <div className="flex gap-3 flex-wrap">
                            <button
                              onClick={() => setCurrentPage('inventory')}
                              className="brutalist-button py-2 px-4 text-xs"
                            >
                              STOCK LIST
                            </button>
                            <button
                              onClick={() => setCurrentPage('scan')}
                              className="brutalist-button py-2 px-4 bg-brand-accent text-brand-black text-xs"
                            >
                              SCANNER
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Recent Activity */}
                      <div className="space-y-3 lg:col-span-2">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                          <Loader2 size={16} /> RECENT ACTIVITY
                        </h3>
                        <div className="border-2 border-brand-black bg-white overflow-hidden">
                          {recentMovements.length > 0 ? (
                            <div className="divide-y divide-brand-black/10">
                              {recentMovements.map((move) => (
                                <div key={move.pk} className="p-3 flex justify-between items-center">
                                  <div>
                                    <span className="text-xs font-bold uppercase">{move.label}</span>
                                    {move.notes && <p className="text-[10px] text-brand-black/60 mt-0.5">{move.notes}</p>}
                                  </div>
                                  <span className="text-[10px] font-mono text-brand-black/50">{move.date}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 text-center text-xs font-bold uppercase text-brand-black/40">
                              NO RECENT ACTIVITY
                            </div>
                          )}
                          <div className="p-2 bg-gray-50 border-t border-brand-black/10 flex justify-center">
                            <button
                              onClick={() => setCurrentPage('inventree')}
                              className="text-[10px] font-black uppercase tracking-widest hover:underline"
                            >
                              VIEW ALL IN INVENTREE
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {currentPage === 'scan' && (
                <motion.div
                  key="scan"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col lg:flex-row overflow-auto"
                >
                  {/* Main Content Area (Scanner) - same as checkout */}
                  <div className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center bg-white min-h-[50vh] lg:min-h-0">
                    <BarcodeScannerContainer onItemScanned={handleItemScanned} checkoutResult={null} />
                  </div>

                  {/* Right Sidebar: Shopping Cart in volunteer mode */}
                  <aside className="w-full lg:w-[40%] border-l-0 lg:border-l-3 border-t-3 lg:border-t-0 border-brand-black bg-white flex flex-col min-h-[50vh] lg:min-h-0">
                    <ShoppingWindow
                      scanEvent={scanEvent}
                      onCheckoutResultChange={() => { }}
                    />
                  </aside>
                </motion.div>
              )}
              {currentPage === 'inventory' && (
                <motion.div
                  key="inventory"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 overflow-auto"
                >
                  <ItemList />
                </motion.div>
              )}
              {currentPage === 'inventree' && (
                <motion.div
                  key="inventree"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 overflow-auto"
                >
                  <InvenTreePage onBack={() => setCurrentPage('volunteer')} />
                </motion.div>
              )}
            </AnimatePresence>

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
          className="fixed inset-0 bg-brand-black/80 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={() => setAddPartFormModalOpen(false)}
        >
          <div
            className="border-2 border-brand-black bg-white w-full max-w-3xl my-0 sm:my-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-h-screen overflow-y-auto"
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
          className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setAddCategoryModalOpen(false)}
        >
          <div
            className="border-2 border-brand-black bg-white w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
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
          className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setAddLocationModalOpen(false)}
        >
          <div
            className="border-2 border-brand-black bg-white w-full max-w-md shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
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
        <StockProvider>
          <AppContent />
        </StockProvider>
      </VolunteerProvider>
    </ToastProvider>
  );
}
