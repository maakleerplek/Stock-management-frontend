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
import { StockProvider, useStock } from './StockContext';
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
import { TRACKING } from './lib/stockHistory';
import './index.css';

export type AppView = 'checkout' | 'browse' | 'volunteer' | 'inventory' | 'scan' | 'orders' | 'analytics';

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
  const [lowStockOrderPartIds, setLowStockOrderPartIds] = useState<number[]>([]);
  const [recentMovements, setRecentMovements] = useState<InvenTreeTrackingEntry[]>([]);
  const [checkoutResult, setCheckoutResult] = useState<{ total: number; description: string } | null>(null);
  const [mobileCheckoutTab, setMobileCheckoutTab] = useState<'scan' | 'cart'>('scan');
  const { addToast } = useToast();
  const { isVolunteerMode } = useVolunteer();
  const { items: stockItems, loading: stockLoading, lastFetched: stockLastFetched } = useStock();

  const totalParts = stockItems.length;
  const inStockCount = stockItems.filter(i => i.quantity > 0).length;
  const outOfStockCount = stockItems.filter(i => i.quantity === 0).length;
  const categoryStats = Object.entries(
    stockItems.reduce((acc: Record<string, number>, item) => {
      const cat = item.category || 'Uncategorized';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = categoryStats[0]?.[1] || 1;

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

      // What customers pay is a sale price on the part, not the stock item's
      // purchase_price. Putting it on the stock item made InvenTree report the
      // selling price as the cost of goods, so every margin came out as zero.
      if (numericFields.sellingPrice > 0) {
        try {
          await inventreeClient.setSalePrice(part.pk, numericFields.sellingPrice, formData.sellingPriceCurrency);
        } catch (priceErr) {
          console.warn('[App] Could not set the selling price:', priceErr);
          addToast('Part created, but the selling price could not be saved. Set it in InvenTree.', 'warning');
        }
      }

      // Create supplier part first so we can link the stock item to it
      let supplierPartPk: number | undefined;
      if (formData.supplier) {
        const sku = formData.supplierSku.trim() || formData.barcode || formData.partName;
        const supplierPart = await inventreeClient.createSupplierPart({
          part: part.pk,
          supplier: parseInt(formData.supplier),
          SKU: sku,
          ...(numericFields.packQty > 0 ? { pack_quantity: numericFields.packQty } : {}),
        });
        supplierPartPk = supplierPart.pk;
      }

      if (formData.initialQuantity && numericFields.locationId) {
        await inventreeClient.createStockItem({
          part: part.pk,
          quantity: numericFields.initialQuantity,
          location: numericFields.locationId,
          notes: 'Initial stock from part creation',
          ...(supplierPartPk ? { supplier_part: supplierPartPk } : {}),
        });
      }

      // The barcode belongs to the part: stock items come and go as they are sold.
      if (formData.barcode) {
        try {
          await inventreeClient.linkBarcodeToPart(formData.barcode, part.pk);
        } catch (barcodeErr) {
          console.warn('[App] Barcode link failed (IPN still set on part):', barcodeErr);
          addToast('Part created, but the barcode could not be linked. Scanning via IPN still works.', 'warning');
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
    if (!isVolunteerMode && currentPage !== 'checkout' && currentPage !== 'browse') {
      setCurrentPage('checkout');
    }
  }, [isVolunteerMode, currentPage]);

  // Clear prefill state when leaving the orders page
  useEffect(() => {
    if (currentPage !== 'orders') {
      setLowStockOrderPartIds([]);
    }
  }, [currentPage]);

  const inventreePanelUrl = import.meta.env.VITE_INVENTREE_PANEL_URL || '';

  const VolunteerNavigation = () => (
    <div className="border-b border-lijn bg-brand-beige px-4 sm:px-8 py-0 flex gap-5 sm:gap-8 overflow-x-auto">
      {[
        { id: 'volunteer', label: 'Overview', icon: LayoutDashboard },
        { id: 'scan', label: 'Scan', icon: ScanBarcode },
        { id: 'inventory', label: 'Stock list', icon: Package },
        { id: 'orders', label: 'Purchase orders', icon: ShoppingBag },
        { id: 'analytics', label: 'Analytics', icon: BarChart2 },
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setCurrentPage(tab.id as AppView)}
          className={cn(
            "px-1 py-3.5 font-medium text-xs sm:text-sm border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap",
            currentPage === tab.id
              ? "border-brand-black text-brand-black"
              : "border-transparent text-grafiet hover:text-brand-black"
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
          className="px-1 py-3.5 font-medium text-xs sm:text-sm border-b-2 -mb-px border-transparent text-grafiet hover:text-brand-black transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          <ExternalLink size={14} className="flex-shrink-0" />
          <span className="hidden sm:inline">InvenTree</span>
          <span className="sm:hidden">Panel</span>
        </a>
      )}
    </div>
  );

  const PublicNavigation = () => (
    <div className="border-b border-lijn bg-brand-beige px-4 sm:px-8 py-0 flex gap-5 sm:gap-8 overflow-x-auto shrink-0">
      {[
        { id: 'checkout', label: 'Checkout', icon: ScanBarcode },
        { id: 'browse', label: 'Stock list', icon: Package },
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setCurrentPage(tab.id as AppView)}
          className={cn(
            "px-1 py-3.5 font-medium text-xs sm:text-sm border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap",
            currentPage === tab.id
              ? "border-brand-black text-brand-black"
              : "border-transparent text-grafiet hover:text-brand-black"
          )}
        >
          <tab.icon size={14} className="flex-shrink-0" />
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-brand-beige">
      <Header
        currentView={currentPage === 'checkout' ? 'checkout' : (currentPage === 'volunteer' ? 'volunteer' : 'inventory')}
        onViewChange={(v) => handleViewChange(v as AppView)}
        onVolunteerClick={handleVolunteerClick}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!isVolunteerMode && <PublicNavigation />}

        {currentPage === 'browse' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ItemList />
          </div>
        )}

        {currentPage === 'checkout' && (
          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
            {/* ── Mobile: tab bar ── */}
            <div className="lg:hidden flex border-b border-lijn bg-brand-beige shrink-0">
              <button
                onClick={() => setMobileCheckoutTab('scan')}
                className={cn(
                  "flex-1 py-3 text-xs font-semibold transition-colors",
                  mobileCheckoutTab === 'scan'
                    ? "bg-brand-black text-white"
                    : "bg-brand-beige text-brand-black"
                )}
              >
                Scan
              </button>
              <button
                onClick={() => setMobileCheckoutTab('cart')}
                className={cn(
                  "flex-1 py-3 text-xs font-semibold transition-colors border-l border-lijn",
                  mobileCheckoutTab === 'cart'
                    ? "bg-brand-black text-white"
                    : "bg-brand-beige text-brand-black"
                )}
              >
                Cart
              </button>
            </div>

            {/* ── Mobile: scanner tab ── */}
            <div className={cn(
              "lg:hidden flex-1 flex flex-col items-center justify-center p-4 bg-brand-beige overflow-hidden",
              mobileCheckoutTab !== 'scan' && "hidden"
            )}>
              <BarcodeScannerContainer onItemScanned={handleItemScanned} />
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
                <BarcodeScannerContainer onItemScanned={handleItemScanned} />
              </div>
              <aside className="w-[40%] border-l border-lijn bg-brand-beige flex flex-col">
                <ShoppingWindow
                  scanEvent={scanEvent}
                  onCheckoutResultChange={(result) => setCheckoutResult(result)}
                />
              </aside>
            </div>
          </div>
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
                    {/* Header */}
                    <div className="border-b border-lijn pb-4 flex items-end justify-between">
                      <div>
                        <h2 className="text-2xl font-semibold text-brand-black">Dashboard</h2>
                        <p className="font-bold text-xs text-brand-black/60 mt-1">
                          {stockLastFetched
                            ? `Updated ${Math.max(0, Math.round((Date.now() - stockLastFetched) / 60000))} min ago`
                            : stockLoading ? 'Loading...' : 'System status'}
                        </p>
                      </div>
                    </div>

                    {/* Stat cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="border border-lijn bg-white p-4">
                        <div className="text-[10px] font-semibold text-brand-black/50 mb-1">Parts tracked</div>
                        <div className="text-3xl font-semibold text-brand-black">{stockLoading ? '—' : totalParts}</div>
                      </div>
                      <div className="border border-lijn bg-emerald-50 p-4">
                        <div className="text-[10px] font-semibold text-emerald-700/70 mb-1">In stock</div>
                        <div className="text-3xl font-semibold text-emerald-700">{stockLoading ? '—' : inStockCount}</div>
                      </div>
                      <div className={cn("border border-lijn p-4", outOfStockCount > 0 ? "bg-amber-50" : "bg-white")}>
                        <div className="text-[10px] font-semibold text-brand-black/50 mb-1">Out of stock</div>
                        <div className={cn("text-3xl font-semibold", outOfStockCount > 0 ? "text-amber-700" : "text-brand-black")}>{stockLoading ? '—' : outOfStockCount}</div>
                      </div>
                      <button
                        onClick={() => { setLowStockOrderPartIds(lowStockItems.map(i => i.pk)); setCurrentPage('orders'); }}
                        disabled={lowStockItems.length === 0}
                        className={cn(
                          "border border-lijn p-4 text-left transition-colors",
                          lowStockItems.length > 0 ? "bg-red-50 hover:bg-red-100 cursor-pointer" : "bg-white cursor-default"
                        )}
                      >
                        <div className="text-[10px] font-semibold text-red-600/70 mb-1">Low stock</div>
                        <div className={cn("text-3xl font-semibold", lowStockItems.length > 0 ? "text-red-600" : "text-brand-black")}>{lowStockItems.length}</div>
                        {lowStockItems.length > 0 && <div className="text-[10px] font-semibold text-red-500 mt-1">Tap to order →</div>}
                      </button>
                    </div>

                    {/* Low stock alert */}
                    {lowStockItems.length > 0 && (
                      <div className="border border-red-600 bg-red-50">
                        <div className="px-4 py-2 bg-red-600 text-white flex items-center justify-between">
                          <h3 className="text-xs font-semibold flex items-center gap-2">
                            <AlertCircle size={14} /> Low stock — {lowStockItems.length} item{lowStockItems.length !== 1 ? 's' : ''}
                          </h3>
                          <button
                            onClick={() => { setLowStockOrderPartIds(lowStockItems.map(i => i.pk)); setCurrentPage('orders'); }}
                            className="text-[10px] font-semibold bg-white text-red-600 px-3 py-1 hover:bg-red-50 transition-colors border border-white"
                          >
                            Order all →
                          </button>
                        </div>
                        <ul className="divide-y divide-red-200">
                          {lowStockItems.map(item => (
                            <li key={item.pk} className="px-4 py-2 text-xs font-bold text-brand-black flex items-center justify-between gap-4">
                              <span className="flex-1 truncate">{item.name}</span>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {typeof item.total_in_stock === 'number' && (
                                  <span className="font-mono text-red-600">{item.total_in_stock} left</span>
                                )}
                                <button
                                  onClick={() => { setLowStockOrderPartIds([item.pk]); setCurrentPage('orders'); }}
                                  className="text-[10px] font-semibold bg-red-600 text-white px-3 py-1 hover:bg-red-700 transition-colors"
                                >
                                  Order
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Category breakdown + Recent activity */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-xs font-semibold mb-3 text-brand-black">
                          Stock by category
                        </h3>
                        <div className="border border-lijn bg-white overflow-hidden">
                          {stockLoading ? (
                            <div className="p-6 flex items-center gap-2 text-xs font-bold text-brand-black/40">
                              <Loader2 size={14} className="animate-spin" /> Loading...
                            </div>
                          ) : categoryStats.length === 0 ? (
                            <div className="p-6 text-center text-xs font-bold text-brand-black/40">No data</div>
                          ) : (
                            <ul className="divide-y divide-lijn">
                              {categoryStats.slice(0, 10).map(([cat, count]) => (
                                <li key={cat} className="px-4 py-2.5 hover:bg-brand-beige transition-colors">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-brand-black truncate mr-2">{cat}</span>
                                    <span className="text-xs font-mono text-brand-black/60 flex-shrink-0">{count}</span>
                                  </div>
                                  <div className="h-1 bg-brand-beige-dark overflow-hidden">
                                    <div
                                      className="h-full bg-brand-black transition-all"
                                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold mb-3 text-brand-black">
                          Recent activity
                        </h3>
                        <div className="border border-lijn overflow-hidden">
                          {recentMovements.length > 0 ? (
                            <div className="divide-y divide-lijn">
                              {recentMovements.map((move) => {
                                const isAdd = (move.deltas?.added ?? 0) > 0 || move.tracking_type === TRACKING.STOCK_ADD;
                                const isRemove = (move.deltas?.removed ?? 0) > 0
                                  || move.tracking_type === TRACKING.SHIPPED_AGAINST_SALES_ORDER
                                  || move.tracking_type === TRACKING.SENT_TO_CUSTOMER;
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
                                        <span className="text-xs font-bold">{move.label}</span>
                                        {move.notes && <p className="text-[10px] text-brand-black/60 mt-0.5 truncate">{move.notes}</p>}
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-brand-black/50 flex-shrink-0 ml-2">{move.date}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-6 text-center text-xs font-bold text-brand-black/40">
                              No recent activity
                            </div>
                          )}
                          {inventreePanelUrl && (
                            <div className="p-2 bg-brand-beige-dark border-t border-lijn flex justify-center">
                              <a
                                href={inventreePanelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-semibold hover:underline flex items-center gap-1"
                              >
                                View all in InvenTree <ExternalLink size={10} />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div>
                      <h3 className="text-xs font-semibold mb-3 flex items-center gap-2">
                        <Info size={14} /> Quick actions
                      </h3>
                      <div className="border border-lijn p-4">
                        <div className="flex gap-3 flex-wrap">
                          <button onClick={() => setCurrentPage('inventory')} className="brutalist-button py-2 px-4 text-xs">Stock list</button>
                          <button onClick={() => setCurrentPage('scan')} className="brutalist-button py-2 px-4 bg-blue-200 text-brand-black text-xs">Scanner</button>
                          <button onClick={() => setAddPartFormModalOpen(true)} className="brutalist-button py-2 px-4 text-xs">+ New item</button>
                          <button onClick={() => setCurrentPage('orders')} className="brutalist-button py-2 px-4 bg-amber-300 text-brand-black text-xs">Purchase orders</button>
                          <button onClick={() => setCurrentPage('analytics')} className="brutalist-button py-2 px-4 text-xs">Analytics</button>
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
                    <BarcodeScannerContainer onItemScanned={handleItemScanned} />
                  </div>

                  {/* Right Sidebar: Shopping Cart in volunteer mode */}
                  <aside className="w-full lg:w-[40%] border-l-0 lg:border-l border-t lg:border-t-0 border-lijn bg-brand-beige flex flex-col min-h-[50vh] lg:min-h-0">
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
                  <PurchaseOrderPage suppliers={suppliers} prefillPartIds={lowStockOrderPartIds} />
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
          className="fixed inset-0 bg-brand-black/50 z-50 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={() => setAddPartFormModalOpen(false)}
        >
          <div
            className="border border-lijn bg-white w-full max-w-3xl my-0 sm:my-8 max-h-screen overflow-y-auto"
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
          className="fixed inset-0 bg-brand-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setAddCategoryModalOpen(false)}
        >
          <div
            className="border border-lijn bg-white w-full max-w-md"
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
          className="fixed inset-0 bg-brand-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setAddLocationModalOpen(false)}
        >
          <div
            className="border border-lijn bg-white w-full max-w-md"
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
          className="fixed inset-0 bg-brand-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setAddSupplierModalOpen(false)}
        >
          <div
            className="border border-lijn bg-white w-full max-w-md"
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
