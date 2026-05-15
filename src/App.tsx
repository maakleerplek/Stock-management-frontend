import { useState, useCallback, useEffect, useRef } from 'react';
import AddPartForm, { type PartFormData, type SelectOption } from './AddPartForm';
import AddCategoryForm, { type CategoryFormData } from './AddCategoryForm';
import AddLocationForm, { type LocationFormData } from './AddLocationForm';
import AddSupplierForm, { type SupplierFormData } from './AddSupplierForm';
import type { ScanEvent, ItemData } from './sendCodeHandler';
import ShoppingWindow from './ShoppingWindow';
import BarcodeScannerContainer from './BarcodeScannerContainer';
import ItemList from './ItemList';
import Footer from './components/Footer';
import { StockProvider } from './StockContext';
import Header from './components/Header';
import { ToastProvider, useToast } from './ToastContext';
import { VolunteerProvider, useVolunteer } from './VolunteerContext';
import VolunteerModal from './VolunteerModal';
import AdminToolsBar from './components/AdminToolsBar';
import PurchaseOrderPage from './PurchaseOrderPage';
import StockAnalytics from './StockAnalytics';
import {
  type InvenTreeTrackingEntry,
  type InvenTreePartListResponse
} from './api/types';
import inventreeClient from './api/inventreeClient';
import { reportCreateEvent } from './sendCodeHandler';
import {
  getErrorMessage,
  parseNumericFields,
} from './utils/helpers';
import { Info, AlertCircle, Loader2, LayoutDashboard, ScanBarcode, Package, ExternalLink, ShoppingBag, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import './index.css';

export type AppView = 'checkout' | 'volunteer' | 'inventory' | 'scan' | 'orders' | 'analytics';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<AppView>('checkout');
  const [scanEvent, setScanEvent] = useState<ScanEvent | null>(null);
  const scanCounterRef = useRef(0);
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false);
  const [addPartFormModalOpen, setAddPartFormModalOpen] = useState(false);
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false);
  const [addLocationModalOpen, setAddLocationModalOpen] = useState(false);
  const [addSupplierModalOpen, setAddSupplierModalOpen] = useState(false);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [locations, setLocations] = useState<SelectOption[]>([]);
  const [suppliers, setSuppliers] = useState<SelectOption[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InvenTreePartListResponse['results']>([]);
  const [recentMovements, setRecentMovements] = useState<InvenTreeTrackingEntry[]>([]);
  const [checkoutResult, setCheckoutResult] = useState<{ total: number; description: string } | null>(null);
  const [mobileCheckoutTab, setMobileCheckoutTab] = useState<'scan' | 'cart'>('scan');
  const { addToast } = useToast();
  const { isVolunteerMode } = useVolunteer();

  // Warn before refresh if checkout result or any create modal is active
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (checkoutResult !== null || addPartFormModalOpen || addCategoryModalOpen || addLocationModalOpen) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [checkoutResult, addPartFormModalOpen, addCategoryModalOpen, addLocationModalOpen]);

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
      const [categoriesResp, locationsResp, suppliersResp] = await Promise.all([
        inventreeClient.getCategories(),
        inventreeClient.getLocations(),
        inventreeClient.getSuppliers(),
      ]);

      setCategories((Array.isArray(categoriesResp) ? categoriesResp : categoriesResp?.results || []).map(c => ({ id: c.pk, name: c.name })));
      setLocations((Array.isArray(locationsResp) ? locationsResp : locationsResp?.results || []).map(l => ({ id: l.pk, name: l.name })));
      setSuppliers((suppliersResp || []).map(s => ({ id: s.pk, name: s.name })));

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
      reportCreateEvent(`Category: ${formData.name}`);
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
      reportCreateEvent(`Location: ${formData.name}`);
      addToast('Location created successfully!', 'success');
      setAddLocationModalOpen(false);
      fetchCategoriesAndLocations();
    } catch (error) {
      handleApiError(error, 'creating location');
      throw error;
    }
  };

  const handleAddSupplierSubmit = async (formData: SupplierFormData): Promise<void> => {
    try {
      await inventreeClient.createSupplier({
        name: formData.name,
        description: formData.description || undefined,
        website: formData.website || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        address: formData.address || undefined,
      });
      reportCreateEvent(`Supplier: ${formData.name}`);
      addToast('Supplier created successfully!', 'success');
      setAddSupplierModalOpen(false);
      fetchCategoriesAndLocations();
    } catch (error) {
      handleApiError(error, 'creating supplier');
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

      // Create supplier part first so we can link the stock item to it
      let supplierPartPk: number | undefined;
      if (formData.supplier) {
        const sku = formData.supplierSku.trim() || formData.barcode || formData.partName;
        const supplierPart = await inventreeClient.createSupplierPart({
          part: part.pk,
          supplier: parseInt(formData.supplier),
          SKU: sku,
        });
        supplierPartPk = supplierPart.pk;
      }

      if (formData.initialQuantity && numericFields.locationId) {
        const stockItem = await inventreeClient.createStockItem({
          part: part.pk,
          quantity: numericFields.initialQuantity,
          location: numericFields.locationId,
          notes: 'Initial stock from part creation',
          ...(numericFields.purchasePrice > 0 ? {
            purchase_price: numericFields.purchasePrice,
            purchase_price_currency: formData.purchasePriceCurrency,
          } : {}),
          ...(supplierPartPk ? { supplier_part: supplierPartPk } : {}),
        });

        if (formData.barcode) {
          await inventreeClient.assignBarcode(formData.barcode, stockItem.pk);
        }
      }

      reportCreateEvent(`Item: ${formData.partName}`, numericFields.initialQuantity || 1);
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
      setMobileCheckoutTab('cart');
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

  const inventreePanelUrl = import.meta.env.VITE_INVENTREE_PANEL_URL || '';

  const VolunteerNavigation = () => (
    <div className="border-b border-brand-black bg-brand-beige px-2 sm:px-6 py-0 flex gap-1 sm:gap-4 overflow-x-auto">
      {[
        { id: 'volunteer', label: 'OVERVIEW', icon: LayoutDashboard },
        { id: 'scan', label: 'VOLUNTEER SCAN', icon: ScanBarcode },
        { id: 'inventory', label: 'STOCK LIST', icon: Package },
        { id: 'orders', label: 'PURCHASE ORDERS', icon: ShoppingBag },
        { id: 'analytics', label: 'ANALYTICS', icon: BarChart2 },
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
      {inventreePanelUrl && (
        <a
          href={inventreePanelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 sm:px-4 py-3 font-black uppercase tracking-widest text-[10px] sm:text-xs border-b-4 border-transparent text-brand-black/50 hover:text-brand-black hover:border-brand-black/30 transition-all flex items-center gap-1.5"
        >
          <ExternalLink size={14} className="flex-shrink-0" />
          <span className="hidden sm:inline">INVENTREE</span>
          <span className="sm:hidden">PANEL</span>
        </a>
      )}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-brand-beige">
      <Header
        currentView={currentPage === 'checkout' ? 'checkout' : (currentPage === 'volunteer' ? 'volunteer' : 'inventory')}
        onViewChange={(v) => handleViewChange(v as AppView)}
        onVolunteerClick={handleVolunteerClick}
      />

      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {currentPage === 'checkout' && (
          <>
            {/* ── Mobile: tab bar ── */}
            <div className="lg:hidden flex border-b border-brand-black bg-brand-beige shrink-0">
              <button
                onClick={() => setMobileCheckoutTab('scan')}
                className={cn(
                  "flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors",
                  mobileCheckoutTab === 'scan'
                    ? "bg-brand-black text-white"
                    : "bg-brand-beige text-brand-black"
                )}
              >
                SCAN
              </button>
              <button
                onClick={() => setMobileCheckoutTab('cart')}
                className={cn(
                  "flex-1 py-3 text-xs font-black uppercase tracking-widest transition-colors border-l border-brand-black",
                  mobileCheckoutTab === 'cart'
                    ? "bg-brand-black text-white"
                    : "bg-brand-beige text-brand-black"
                )}
              >
                CART
              </button>
            </div>

            {/* ── Mobile: scanner tab ── */}
            <div className={cn(
              "lg:hidden flex-1 flex flex-col items-center justify-center p-4 bg-brand-beige overflow-hidden",
              mobileCheckoutTab !== 'scan' && "hidden"
            )}>
              <BarcodeScannerContainer onItemScanned={handleItemScanned} checkoutResult={checkoutResult} />
            </div>

            {/* ── Mobile: cart tab ── */}
            <div className={cn(
              "lg:hidden flex-1 flex flex-col bg-brand-beige overflow-hidden",
              mobileCheckoutTab !== 'cart' && "hidden"
            )}>
              <ShoppingWindow
                scanEvent={scanEvent}
                onCheckoutResultChange={(result) => setCheckoutResult(result)}
              />
            </div>

            {/* ── Desktop: side-by-side ── */}
            <div className="hidden lg:flex flex-1 min-h-0">
              <div className="flex-1 p-6 flex flex-col items-center justify-center bg-brand-beige">
                <BarcodeScannerContainer onItemScanned={handleItemScanned} checkoutResult={checkoutResult} />
              </div>
              <aside className="w-[40%] border-l border-brand-black bg-brand-beige flex flex-col">
                <ShoppingWindow
                  scanEvent={scanEvent}
                  onCheckoutResultChange={(result) => setCheckoutResult(result)}
                />
              </aside>
            </div>
          </>
        )}

        {(currentPage === 'volunteer' || currentPage === 'scan' || currentPage === 'inventory' || currentPage === 'orders' || currentPage === 'analytics') && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <VolunteerNavigation />

            {/* Admin Tools Bar */}
            <AdminToolsBar
              onNewItem={() => setAddPartFormModalOpen(true)}
              onAddCategory={() => setAddCategoryModalOpen(true)}
              onAddLocation={() => setAddLocationModalOpen(true)}
              onAddSupplier={() => setAddSupplierModalOpen(true)}
            />

            <AnimatePresence mode="wait">
              {currentPage === 'volunteer' && (
                <motion.div
                  key="volunteer"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 overflow-auto bg-brand-beige"
                >
                  {/* Dashboard Content */}
                  <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
                    <div className="border-b border-brand-black pb-4">
                      <h2 className="text-2xl font-black uppercase tracking-widest text-brand-black">DASHBOARD</h2>
                      <p className="font-bold text-xs uppercase tracking-widest text-brand-black/60 mt-1">SYSTEM STATUS</p>
                    </div>

                    {/* Low Stock Alert — top priority */}
                    {lowStockItems.length > 0 && (
                      <div className="border border-red-600 bg-red-50">
                        <div className="px-4 py-2 bg-red-600 text-white">
                          <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <AlertCircle size={14} /> LOW STOCK — {lowStockItems.length} ITEM{lowStockItems.length !== 1 ? 'S' : ''}
                          </h3>
                        </div>
                        <ul className="divide-y divide-red-200">
                          {lowStockItems.map((item: any) => (
                            <li key={item.pk} className="px-4 py-2 text-xs font-bold uppercase text-brand-black flex justify-between">
                              <span>{item.name}</span>
                              {item.total_in_stock !== undefined && (
                                <span className="font-mono text-red-600">{item.total_in_stock} left</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Main Grid: Categories + Locations */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Categories List */}
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center justify-between">
                          <span>CATEGORIES ({categories.length})</span>
                          <button
                            onClick={() => setAddCategoryModalOpen(true)}
                            className="text-[10px] font-black uppercase tracking-widest text-brand-black/50 hover:text-brand-black transition-colors"
                          >
                            + ADD
                          </button>
                        </h3>
                        <div className="border border-brand-black">
                          {categories.length > 0 ? (
                            <ul className="divide-y divide-brand-black/10">
                              {categories.map((cat) => (
                                <li key={cat.id} className="px-4 py-2.5 text-xs font-bold uppercase text-brand-black flex items-center justify-between hover:bg-brand-beige-dark transition-colors">
                                  <span>{cat.name}</span>
                                  <span className="text-[10px] font-mono text-brand-black/40">#{cat.id}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-6 text-center text-xs font-bold uppercase text-brand-black/40">
                              NO CATEGORIES
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Locations List */}
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center justify-between">
                          <span>LOCATIONS ({locations.length})</span>
                          <button
                            onClick={() => setAddLocationModalOpen(true)}
                            className="text-[10px] font-black uppercase tracking-widest text-brand-black/50 hover:text-brand-black transition-colors"
                          >
                            + ADD
                          </button>
                        </h3>
                        <div className="border border-brand-black">
                          {locations.length > 0 ? (
                            <ul className="divide-y divide-brand-black/10">
                              {locations.map((loc) => (
                                <li key={loc.id} className="px-4 py-2.5 text-xs font-bold uppercase text-brand-black flex items-center justify-between hover:bg-brand-beige-dark transition-colors">
                                  <span>{loc.name}</span>
                                  <span className="text-[10px] font-mono text-brand-black/40">#{loc.id}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="p-6 text-center text-xs font-bold uppercase text-brand-black/40">
                              NO LOCATIONS
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Quick Actions + Recent Activity */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Quick Actions */}
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                          <Info size={14} /> QUICK ACTIONS
                        </h3>
                        <div className="border border-brand-black p-4 space-y-3">
                          <p className="font-bold text-xs leading-relaxed text-brand-black/70">
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
                              className="brutalist-button py-2 px-4 bg-blue-200 text-brand-black text-xs"
                            >
                              SCANNER
                            </button>
                            <button
                              onClick={() => setAddPartFormModalOpen(true)}
                              className="brutalist-button py-2 px-4 text-xs"
                            >
                              + NEW ITEM
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Recent Activity */}
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                          <Loader2 size={14} /> RECENT ACTIVITY
                        </h3>
                        <div className="border border-brand-black overflow-hidden">
                          {recentMovements.length > 0 ? (
                            <div className="divide-y divide-brand-black/10">
                              {recentMovements.map((move) => {
                                const isAdd = (move.deltas?.added ?? 0) > 0 || move.tracking_type === 10 || move.tracking_type === 100;
                                const isRemove = (move.deltas?.removed ?? 0) > 0 || move.tracking_type === 11;
                                return (
                                <div key={move.pk} className={cn(
                                  "p-3 flex justify-between items-center",
                                  isAdd && "bg-emerald-50",
                                  isRemove && "bg-rose-50"
                                )}>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn(
                                      "text-base leading-none flex-shrink-0",
                                      isAdd ? "text-emerald-600" : isRemove ? "text-rose-600" : "text-brand-black/40"
                                    )}>
                                      {isAdd ? "↑" : isRemove ? "↓" : "·"}
                                    </span>
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold uppercase">{move.label}</span>
                                      {move.notes && <p className="text-[10px] text-brand-black/60 mt-0.5 truncate">{move.notes}</p>}
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-mono text-brand-black/50 flex-shrink-0 ml-2">{move.date}</span>
                                </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-6 text-center text-xs font-bold uppercase text-brand-black/40">
                              NO RECENT ACTIVITY
                            </div>
                          )}
                          {inventreePanelUrl && (
                            <div className="p-2 bg-brand-beige-dark border-t border-brand-black/10 flex justify-center">
                              <a
                                href={inventreePanelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-black uppercase tracking-widest hover:underline flex items-center gap-1"
                              >
                                VIEW ALL IN INVENTREE
                                <ExternalLink size={10} />
                              </a>
                            </div>
                          )}
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
                  <div className="flex-1 p-4 sm:p-6 flex flex-col items-center justify-center bg-brand-beige min-h-[50vh] lg:min-h-0">
                    <BarcodeScannerContainer onItemScanned={handleItemScanned} checkoutResult={null} />
                  </div>

                  {/* Right Sidebar: Shopping Cart in volunteer mode */}
                  <aside className="w-full lg:w-[40%] border-l-0 lg:border-l border-t lg:border-t-0 border-brand-black bg-brand-beige flex flex-col min-h-[50vh] lg:min-h-0">
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
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  <ItemList />
                </motion.div>
              )}
              {currentPage === 'orders' && (
                <motion.div
                  key="orders"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  <PurchaseOrderPage suppliers={suppliers} />
                </motion.div>
              )}
              {currentPage === 'analytics' && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  <StockAnalytics />
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
            className="border border-brand-black bg-white w-full max-w-3xl my-0 sm:my-8 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)] max-h-screen overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <AddPartForm
                onSubmit={handleAddPartSubmit}
                onCancel={() => setAddPartFormModalOpen(false)}
                categories={categories}
                locations={locations}
                suppliers={suppliers}
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
            className="border border-brand-black bg-white w-full max-w-md shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)]"
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
            className="border border-brand-black bg-white w-full max-w-md shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)]"
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
      {/* Add Supplier Modal */}
      {addSupplierModalOpen && (
        <div
          className="fixed inset-0 bg-brand-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setAddSupplierModalOpen(false)}
        >
          <div
            className="border border-brand-black bg-white w-full max-w-md shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <AddSupplierForm
                onSubmit={handleAddSupplierSubmit}
                onCancel={() => setAddSupplierModalOpen(false)}
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
