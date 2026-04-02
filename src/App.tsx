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
import VolunteerScanView from './VolunteerScanView';
import InvenTreePage from './InvenTreePage';
import { ToastProvider, useToast } from './ToastContext';
import { VolunteerProvider, useVolunteer } from './VolunteerContext';
import VolunteerModal from './VolunteerModal';
import {
    type InvenTreeTrackingEntry,
    type InvenTreePartListResponse
} from './api/types';
import inventreeClient from './api/inventreeClient';
import {
  getErrorMessage,
  parseNumericFields,
} from './utils/helpers';
import { Info, Tag, MapPin, Plus, AlertCircle, Loader2, Settings } from 'lucide-react';
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
        IPN: formData.barcode || '',
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
        { id: 'volunteer', label: 'OVERVIEW' },
        { id: 'scan', label: 'VOLUNTEER SCAN' },
        { id: 'inventory', label: 'STOCK LIST' },
        { id: 'inventree', label: 'INVENTREE PANEL' }
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setCurrentPage(tab.id as AppView)}
          className={cn(
            "px-4 py-3 font-black uppercase tracking-widest text-[10px] sm:text-xs border-b-4 transition-all block",
            currentPage === tab.id 
              ? "border-brand-black text-brand-black" 
              : "border-transparent text-brand-black/50 hover:text-brand-black hover:border-brand-black/30"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <Header
        currentView={currentPage === 'checkout' ? 'checkout' : (currentPage === 'volunteer' ? 'volunteer' : 'inventory')}
        onViewChange={(v) => handleViewChange(v as AppView)}
        onVolunteerClick={handleVolunteerClick}
      />

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {currentPage === 'checkout' && (
          <>
            {/* Main Content Area (Scanner) */}
            <div className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center bg-white relative">
              <BarcodeScannerContainer onItemScanned={handleItemScanned} checkoutResult={checkoutResult} />
            </div>

            {/* Right Sidebar: Shopping Cart */}
            <aside className="w-full lg:w-[50%] xl:w-[50%] border-l-0 lg:border-l-2 border-t-2 lg:border-t-0 border-brand-black bg-white flex flex-col">
              <ShoppingWindow
                scanEvent={scanEvent}
                onCheckoutResultChange={(result) => setCheckoutResult(result)}
              />
            </aside>
          </>
        )}

        {(currentPage === 'volunteer' || currentPage === 'scan' || currentPage === 'inventory' || currentPage === 'inventree') && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <VolunteerNavigation />

            {currentPage === 'volunteer' && (
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Left Sidebar for volunteer overview */}
                <aside className="w-full lg:w-80 border-r-0 md:border-r-2 border-b-2 md:border-b-0 border-brand-black flex flex-col bg-white">
                  <div className="p-6 border-b-2 border-brand-black">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="bg-brand-beige p-1 border-2 border-brand-black">
                        <Info size={16} />
                      </div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-brand-black">QUICK STATS</h3>
                    </div>
                    <div className="space-y-4">
                      <div className="border-2 border-brand-black p-4 bg-white shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-brand-black/60 mb-1">CATEGORIES</div>
                        <div className="text-2xl font-black">{categories.length}</div>
                      </div>
                      <div className="border-2 border-brand-black p-4 bg-white shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-brand-black/60 mb-1">LOCATIONS</div>
                        <div className="text-2xl font-black">{locations.length}</div>
                      </div>
                      {lowStockItems.length > 0 && (
                        <div className="border-2 border-red-600 p-4 bg-red-50 shadow-[2px_2px_0px_0px_rgba(220,38,38,1)]">
                          <div className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1">LOW STOCK</div>
                          <div className="text-2xl font-black text-red-600">{lowStockItems.length}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-6 flex-1 overflow-auto">
                    <div className="flex items-center gap-2 mb-4">
                       <div className="bg-brand-beige p-1 border-2 border-brand-black">
                         <Settings size={16} />
                       </div>
                       <h3 className="text-sm font-black uppercase tracking-widest">ADMIN TOOLS</h3>
                    </div>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => setAddPartFormModalOpen(true)}
                        className="brutalist-button w-full flex items-center gap-2 px-4 py-3 bg-amber-400 text-brand-black"
                      >
                        <Plus size={16} />
                        <span>NEW ITEM</span>
                      </button>
                      <button
                        onClick={() => setAddCategoryModalOpen(true)}
                        className="brutalist-button w-full flex items-center gap-2 px-4 py-3 bg-blue-200 text-brand-black"
                      >
                        <Tag size={16} />
                        <span>ADD CATEGORY</span>
                      </button>
                      <button
                        onClick={() => setAddLocationModalOpen(true)}
                        className="brutalist-button w-full flex items-center gap-2 px-4 py-3 bg-emerald-200 text-brand-black"
                      >
                        <MapPin size={16} />
                        <span>ADD LOCATION</span>
                      </button>
                    </div>
                  </div>
                  <div className="p-4 border-t-2 border-brand-black bg-white font-black tracking-widest text-[8px] sm:text-[10px] uppercase">
                    <div className="flex justify-between">
                      <span>VOLUNTEER MODE</span>
                      <span className="text-blue-600">ACTIVE</span>
                    </div>
                  </div>
                </aside>

                {/* Dashboard Content */}
                <main className="flex-1 p-6 space-y-8 overflow-auto bg-white">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b-2 border-brand-black pb-4">
                    <div>
                      <h2 className="text-3xl font-black uppercase tracking-widest text-brand-black">SYSTEM OVERVIEW</h2>
                      <p className="font-bold text-xs uppercase tracking-widest text-brand-black/60 mt-1">REAL-TIME METRICS & STATUS</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Left Column: Alerts and Info */}
                    <div className="space-y-8">
                      {/* Low Stock Warning */}
                      {lowStockItems.length > 0 && (
                        <div className="space-y-4">
                          <h3 className="text-lg font-black uppercase tracking-widest flex items-center gap-2 text-red-600">
                            <AlertCircle size={20} /> LOW STOCK ALERT
                          </h3>
                          <div className="border-2 border-red-600 bg-red-50 p-4 shadow-[4px_4px_0px_0px_rgba(220,38,38,1)]">
                            <ul className="space-y-2">
                              {lowStockItems.map((item: any) => (
                                <li key={item.pk} className="flex justify-between items-center bg-white border-2 border-red-600 p-2 text-xs font-black uppercase">
                                  <span>{item.name}</span>
                                  <span className="text-red-600">OUT OF STOCK / LOW</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Stock Summary */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
                          <Info size={20} /> STOCK STATUS
                        </h3>
                        <div className="border-2 border-brand-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(30,27,24,1)]">
                          <p className="font-bold text-sm leading-relaxed">
                            THE SYSTEM IS CURRENTLY TRACKING <span className="bg-brand-beige px-1 border border-brand-black">{categories.length} CATEGORIES</span> ACROSS <span className="bg-brand-beige px-1 border border-brand-black">{locations.length} LOCATIONS</span>.
                            <br/><br/>
                            USE THE "STOCK LIST" TAB TO VIEW AND MANAGE INDIVIDUAL ITEMS OR "VOLUNTEER SCAN" TO BULK ADJUST STOCK VIA BARCODES.
                          </p>
                          <div className="mt-8 flex gap-4">
                            <button
                              onClick={() => setCurrentPage('inventory')}
                              className="brutalist-button py-2 text-xs"
                            >
                              VIEW STOCK LIST
                            </button>
                            <button
                              onClick={() => setCurrentPage('scan')}
                              className="brutalist-button py-2 bg-brand-black text-white hover:bg-zinc-800 text-xs"
                            >
                              OPEN SCANNER
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Recent Activity */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
                        <Loader2 size={20} /> RECENT MOVEMENTS
                      </h3>
                      <div className="border-2 border-brand-black bg-white shadow-[4px_4px_0px_0px_rgba(30,27,24,1)] overflow-hidden">
                        {recentMovements.length > 0 ? (
                          <div className="divide-y-2 divide-brand-black">
                            {recentMovements.map((move) => (
                              <div key={move.pk} className="p-4 flex flex-col gap-1 hover:bg-brand-beige-dark/10 transition-colors">
                                <div className="flex justify-between items-start">
                                  <span className="text-xs font-black uppercase">{move.label}</span>
                                  <span className="text-[10px] font-mono opacity-60">{move.date}</span>
                                </div>
                                <p className="text-[10px] font-bold text-brand-black/70 italic">"{move.notes || 'NO NOTES'}"</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center text-xs font-black uppercase text-brand-black/40">
                            NO RECENT ACTIVITY RECORDED
                          </div>
                        )}
                        <div className="p-3 bg-brand-beige-dark/20 border-t-2 border-brand-black flex justify-center">
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
                </main>
              </div>
            )}

            {currentPage === 'scan' && <VolunteerScanView />}
            {currentPage === 'inventory' && <ItemList />}
            {currentPage === 'inventree' && <InvenTreePage onBack={() => setCurrentPage('volunteer')} />}

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
          className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setAddPartFormModalOpen(false)}
        >
          <div
            className="border-2 border-brand-black bg-white w-full max-w-3xl my-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
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
