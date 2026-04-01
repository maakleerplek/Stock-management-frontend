/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Scan, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Settings, 
  LogOut, 
  Camera, 
  RefreshCw,
  Info,
  ExternalLink,
  QrCode,
  Box,
  MapPin,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---

interface Item {
  id: string;
  name: string;
  ipn: string;
  category: string;
  location: string;
  stock: number;
  price: number;
  image?: string;
}

interface CartItem extends Item {
  quantity: number;
}

interface ExtraService {
  id: string;
  name: string;
  rate: number;
  unit: string;
  value: number;
}

// --- Mock Data ---

const MOCK_ITEMS: Item[] = [
  { id: '1', name: 'Cola Zero Caféine', ipn: 'DRK-001', category: 'Drinks', location: 'Fridge A', stock: 17, price: 2.00 },
  { id: '2', name: 'Lipton Ice Tea Zero', ipn: 'DRK-002', category: 'Drinks', location: 'Fridge A', stock: 9, price: 2.00 },
  { id: '3', name: 'Sprite', ipn: 'DRK-003', category: 'Drinks', location: 'Fridge A', stock: 11, price: 2.00 },
  { id: '4', name: 'Duvel', ipn: 'ALC-001', category: 'Alcohol', location: 'Fridge B', stock: 2, price: 3.00 },
  { id: '5', name: 'Schweppes', ipn: 'DRK-004', category: 'Drinks', location: 'Fridge A', stock: 0, price: 2.00 },
  { id: '6', name: 'Stella Artois', ipn: 'ALC-002', category: 'Alcohol', location: 'Fridge B', stock: 23, price: 2.00 },
  { id: '7', name: 'PLA Filament Black', ipn: 'MAT-001', category: '3D Printing', location: 'Shelf 4', stock: 5, price: 15.00 },
  { id: '8', name: 'M3x10 Bolt', ipn: 'HDW-001', category: 'Hardware', location: 'Drawer 12', stock: 150, price: 0.05 },
];

const INITIAL_SERVICES: ExtraService[] = [
  { id: 'laser', name: 'Lasertime (min)', rate: 0.50, unit: 'min', value: 0 },
  { id: 'cnc', name: 'CNC Time (min)', rate: 0.50, unit: 'min', value: 0 },
  { id: '3dprint', name: '3D Printing (g)', rate: 1.00, unit: 'g', value: 0 },
];

// --- Components ---

const Header = ({ 
  currentView, 
  onViewChange 
}: { 
  currentView: 'checkout' | 'volunteer', 
  onViewChange: (view: 'checkout' | 'volunteer') => void 
}) => (
  <header className="border-b-[3px] border-brand-black bg-white p-3 sm:p-6 flex justify-between items-center">
    <div className="flex items-center gap-2 sm:gap-4">
      <div className="w-8 h-8 sm:w-12 sm:h-12 brutalist-border bg-brand-black flex items-center justify-center text-white">
        <Box size={20} className="sm:hidden" />
        <Box size={28} className="hidden sm:block" />
      </div>
      <div>
        <h1 className="text-lg sm:text-2xl font-black tracking-tighter uppercase leading-none">Inventree Assistant</h1>
        <p className="text-[10px] sm:text-xs font-mono opacity-60">by Maakleerplek vzw</p>
      </div>
    </div>
    <div className="flex gap-2 sm:gap-3">
      <button 
        onClick={() => onViewChange(currentView === 'checkout' ? 'volunteer' : 'checkout')}
        className={cn(
          "brutalist-button flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-base",
          currentView === 'volunteer' ? "bg-yellow-400" : "bg-white"
        )}
      >
        <Settings size={16} className="sm:w-[18px] sm:h-[18px]" />
        <span>{currentView === 'checkout' ? 'Volunteer Mode' : 'Back to Checkout'}</span>
      </button>
    </div>
  </header>
);

const Sidebar = ({ 
  services, 
  setServices
}: { 
  services: ExtraService[], 
  setServices: React.Dispatch<React.SetStateAction<ExtraService[]>>
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const updateService = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setServices(prev => prev.map(s => s.id === id ? { ...s, value: num } : s));
  };

  return (
    <aside className="w-full lg:w-80 border-r-[3px] border-brand-black flex flex-col bg-brand-beige-dark/30">
      {/* Time & Date Section */}
      <div className="p-3 sm:p-6 border-b-[3px] border-brand-black bg-white flex lg:block items-center justify-between">
        <div className="text-2xl sm:text-5xl font-black tracking-tighter">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-[10px] sm:text-sm font-mono uppercase font-bold opacity-60">
          {time.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      </div>

      {/* Extra Services Section */}
      <div className="p-6 flex-1">
        <h3 className="text-lg font-black uppercase mb-4 flex items-center gap-2">
          <Settings size={20} /> Extra Services
        </h3>
        <div className="space-y-4">
          {services.map(service => (
            <div key={service.id} className="space-y-1">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold uppercase block">{service.name}</label>
                <span className="text-[10px] font-mono opacity-50 font-bold">€{service.rate.toFixed(2)}/{service.unit}</span>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={service.value || ''}
                  onChange={(e) => updateService(service.id, e.target.value)}
                  className="brutalist-input w-full font-mono"
                  placeholder="0"
                />
                <div className="text-sm font-bold whitespace-nowrap">
                  € {(service.value * service.rate).toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="p-4 border-t-[3px] border-brand-black bg-white font-mono text-[10px] uppercase">
        <div className="flex justify-between">
          <span>Ver: 0.8.0</span>
          <span className="text-green-600 font-bold">Status: Active</span>
        </div>
      </div>
    </aside>
  );
};

const VolunteerDashboard = ({ 
  items,
  searchQuery,
  setSearchQuery,
  filteredItems,
  activeSubView,
  setActiveSubView,
  lastScanned,
  setLastScanned,
  updateItemStock
}: { 
  items: Item[],
  searchQuery: string,
  setSearchQuery: (q: string) => void,
  filteredItems: Item[],
  activeSubView: 'dashboard' | 'inventory' | 'list',
  setActiveSubView: (v: 'dashboard' | 'inventory' | 'list') => void,
  lastScanned: string | null,
  setLastScanned: (name: string | null) => void,
  updateItemStock: (id: string, delta: number) => void
}) => {
  const lowStockItems = items.filter(i => i.stock < 5);
  const [adjustmentIds, setAdjustmentIds] = useState<string[]>([]);

  const addToAdjustment = (item: Item) => {
    if (!adjustmentIds.includes(item.id)) {
      setAdjustmentIds(prev => [...prev, item.id]);
    }
    setLastScanned(item.name);
  };

  const removeFromAdjustment = (id: string) => {
    setAdjustmentIds(prev => prev.filter(i => i !== id));
  };

  const adjustmentList = adjustmentIds.map(id => items.find(i => i.id === id)).filter(Boolean) as Item[];

  const LeftSidebar = (
    <aside className="w-full lg:w-80 border-r-[3px] border-brand-black flex flex-col bg-brand-beige-dark/30">
      <div className="p-6 border-b-[3px] border-brand-black bg-white">
        <h3 className="text-lg font-black uppercase mb-4">Quick Stats</h3>
        <div className="space-y-4">
          <div className="brutalist-card p-4 bg-white">
            <div className="text-[10px] font-mono uppercase opacity-60">Total Items</div>
            <div className="text-2xl font-black">{items.length}</div>
          </div>
          <div className="brutalist-card p-4 bg-white">
            <div className="text-[10px] font-mono uppercase opacity-60">Low Stock</div>
            <div className="text-2xl font-black text-red-500">{lowStockItems.length}</div>
          </div>
        </div>
      </div>
      <div className="p-6 flex-1 overflow-auto">
        <h3 className="text-lg font-black uppercase mb-4">Admin Tools</h3>
        <div className="space-y-3">
          <button className="brutalist-button w-full bg-blue-200 flex items-center gap-2 px-3 py-2 text-xs uppercase font-black">
            <Tag size={14} /> Category
          </button>
          <button className="brutalist-button w-full bg-green-200 flex items-center gap-2 px-3 py-2 text-xs uppercase font-black">
            <MapPin size={14} /> Location
          </button>
          <button className="brutalist-button w-full bg-yellow-400 flex items-center gap-2 px-3 py-2 text-xs uppercase font-black">
            <Plus size={14} /> New Item
          </button>
        </div>
      </div>
      <div className="p-4 border-t-[3px] border-brand-black bg-white font-mono text-[10px] uppercase">
        <div className="flex justify-between">
          <span>Volunteer Mode</span>
          <span className="text-blue-600 font-bold">Active</span>
        </div>
      </div>
    </aside>
  );

  const RightSidebar = (
    <aside className="w-full lg:w-96 border-l-[3px] border-brand-black bg-white flex flex-col">
      <div className="p-6 border-b-[3px] border-brand-black bg-brand-beige-dark/20">
        <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
          <RefreshCw size={28} /> Adjustments
        </h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <AnimatePresence mode="popLayout">
          {adjustmentList.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40"
            >
              <Scan size={48} className="mb-4" />
              <p className="font-bold uppercase">No items scanned.</p>
              <p className="text-xs">Scan or select an item to start adjusting stock.</p>
            </motion.div>
          ) : (
            adjustmentList.map(item => (
              <motion.div 
                key={item.id}
                layout
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                className="brutalist-card p-3 flex gap-3"
              >
                <div className="w-12 h-12 brutalist-border bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  <Box size={20} className="opacity-20" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate text-sm">{item.name}</div>
                  <div className="text-xs font-mono opacity-60">Current: {item.stock}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <button 
                      onClick={() => updateItemStock(item.id, -1)}
                      className="brutalist-button p-1 bg-red-100"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="font-mono font-bold w-12 text-center border-2 border-brand-black bg-white">{item.stock}</span>
                    <button 
                      onClick={() => updateItemStock(item.id, 1)}
                      className="brutalist-button p-1 bg-green-100"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="text-right flex flex-col justify-start items-end">
                  <button 
                    onClick={() => removeFromAdjustment(item.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <div className="p-6 border-t-[3px] border-brand-black bg-brand-beige-dark/10 space-y-4">
        <button 
          disabled={adjustmentList.length === 0}
          onClick={() => {
            setAdjustmentIds([]);
            setLastScanned(null);
          }}
          className="brutalist-button w-full py-4 bg-blue-400 text-xl uppercase tracking-widest disabled:opacity-50"
        >
          Save Changes
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-brand-beige">
      {/* Sub-navigation */}
      <div className="border-b-[3px] border-brand-black bg-white px-6 py-2 flex gap-4 overflow-x-auto">
        <button 
          onClick={() => setActiveSubView('dashboard')}
          className={cn(
            "px-4 py-2 font-black uppercase tracking-tight text-sm border-b-[3px] transition-all",
            activeSubView === 'dashboard' ? "border-brand-black translate-y-[-2px]" : "border-transparent opacity-40 hover:opacity-100"
          )}
        >
          Overview
        </button>
        <button 
          onClick={() => setActiveSubView('inventory')}
          className={cn(
            "px-4 py-2 font-black uppercase tracking-tight text-sm border-b-[3px] transition-all",
            activeSubView === 'inventory' ? "border-brand-black translate-y-[-2px]" : "border-transparent opacity-40 hover:opacity-100"
          )}
        >
          Scan
        </button>
        <button 
          onClick={() => setActiveSubView('list')}
          className={cn(
            "px-4 py-2 font-black uppercase tracking-tight text-sm border-b-[3px] transition-all",
            activeSubView === 'list' ? "border-brand-black translate-y-[-2px]" : "border-transparent opacity-40 hover:opacity-100"
          )}
        >
          Stock List
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {activeSubView === 'dashboard' ? (
          <div className="flex-1 p-6 space-y-8 overflow-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
              <div>
                <h2 className="text-4xl font-black uppercase tracking-tighter">System Overview</h2>
                <p className="font-mono text-sm opacity-60">Real-time metrics & recent events</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button className="brutalist-button bg-green-400 flex-1 sm:flex-none px-4 py-2 text-sm uppercase font-black">Export Data</button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              <div className="brutalist-card p-3 sm:p-6 bg-white">
                <div className="text-[10px] sm:text-xs font-mono uppercase opacity-60 mb-1 sm:mb-2">Total Inventory</div>
                <div className="text-2xl sm:text-4xl font-black">{items.length}</div>
                <div className="text-[10px] font-bold text-blue-600 mt-1 sm:mt-2 uppercase">Items tracked</div>
              </div>
              <div className="brutalist-card p-3 sm:p-6 bg-white">
                <div className="text-[10px] sm:text-xs font-mono uppercase opacity-60 mb-1 sm:mb-2">Low Stock</div>
                <div className="text-2xl sm:text-4xl font-black text-red-500">{lowStockItems.length}</div>
                <div className="text-[10px] font-bold text-red-600 mt-1 sm:mt-2 uppercase">Alerts</div>
              </div>
              <div className="brutalist-card p-3 sm:p-6 bg-white">
                <div className="text-[10px] sm:text-xs font-mono uppercase opacity-60 mb-1 sm:mb-2">Sales Today</div>
                <div className="text-2xl sm:text-4xl font-black">€142</div>
                <div className="text-[10px] font-bold text-green-600 mt-1 sm:mt-2 uppercase">+12%</div>
              </div>
              <div className="brutalist-card p-3 sm:p-6 bg-white">
                <div className="text-[10px] sm:text-xs font-mono uppercase opacity-60 mb-1 sm:mb-2">Volunteers</div>
                <div className="text-2xl sm:text-4xl font-black">3</div>
                <div className="text-[10px] font-bold text-blue-600 mt-1 sm:mt-2 uppercase">Active</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Recent Activity */}
              <div className="lg:col-span-1 space-y-4">
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <RefreshCw size={20} /> Activity Log
                </h3>
                <div className="brutalist-card bg-white divide-y-2 divide-brand-black/10">
                  {[
                    { user: 'Ruben', action: 'Restocked PLA Filament', time: '10m ago' },
                    { user: 'Sarah', action: 'Checked out 3x Sprite', time: '25m ago' },
                    { user: 'System', action: 'Auto-backup completed', time: '1h ago' },
                    { user: 'Ruben', action: 'Added new item: M3 Bolt', time: '2h ago' },
                  ].map((activity, i) => (
                    <div key={i} className="p-4 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-sm">{activity.action}</div>
                        <div className="text-[10px] font-mono opacity-50 uppercase">{activity.user}</div>
                      </div>
                      <div className="text-[10px] font-mono font-bold">{activity.time}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Summary Table */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  <Info size={20} /> Stock Summary
                </h3>
                <div className="brutalist-card bg-white p-6">
                  <p className="font-mono text-sm opacity-70">
                    The system is currently tracking {items.length} items across 4 categories. 
                    {lowStockItems.length > 0 ? ` There are ${lowStockItems.length} items below the safety threshold.` : ' All stock levels are healthy.'}
                  </p>
                  <div className="mt-6 flex gap-4">
                    <button onClick={() => setActiveSubView('inventory')} className="brutalist-button bg-blue-400 px-6 py-2">Manage Stock</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeSubView === 'inventory' ? (
          <>
            {LeftSidebar}

            {/* Main Content: Scanner (Volunteer Version) */}
            <main className="flex-1 p-6 flex flex-col items-center justify-center space-y-8 bg-brand-beige overflow-auto">
              <div className="w-full max-w-2xl space-y-8">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter flex items-center justify-center gap-4">
                    <Scan size={32} className="sm:w-10 sm:h-10" /> Stock Scan
                  </h2>
                  <p className="font-mono text-sm sm:text-base opacity-60 uppercase font-bold">
                    Scan items to adjust stock levels
                  </p>
                </div>

                <div className="brutalist-card bg-white p-8 space-y-6">
                  <button className="brutalist-button w-full py-8 bg-yellow-400 text-2xl uppercase tracking-widest flex items-center justify-center gap-4">
                    <Camera size={32} /> Open Scanner
                  </button>
                  
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="SCAN BARCODE..." 
                      className="brutalist-input w-full py-6 px-12 text-2xl font-mono uppercase placeholder:opacity-20"
                      onChange={(e) => {
                        const item = items.find(i => i.ipn === e.target.value || i.name.toLowerCase() === e.target.value.toLowerCase());
                        if (item) {
                          addToAdjustment(item);
                          e.target.value = '';
                        }
                      }}
                    />
                    <QrCode className="absolute left-4 top-6 opacity-40" size={32} />
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1 p-4 brutalist-border bg-brand-beige-dark/10 font-mono">
                      <div className="text-[10px] uppercase font-black opacity-40 mb-1">Last Scanned</div>
                      <div className={cn("text-lg font-black truncate", lastScanned ? "text-yellow-600" : "opacity-20")}>
                        {lastScanned || "WAITING..."}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </main>

            {RightSidebar}
          </>
        ) : (
          <>
            {LeftSidebar}

            {/* Main Content: Stock List (Volunteer Version) */}
            <main className="flex-1 p-6 flex flex-col space-y-6 bg-brand-beige overflow-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                  <Box size={28} /> Stock List
                </h2>
                <div className="relative w-full sm:w-64">
                  <input 
                    type="text" 
                    placeholder="Search stock..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="brutalist-input w-full pl-10 text-xs"
                  />
                  <Search className="absolute left-3 top-2 opacity-40" size={14} />
                </div>
              </div>

              <div className="brutalist-card bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-brand-black bg-brand-beige-dark/20 font-mono text-[10px] uppercase font-bold">
                        <th className="p-3">Item</th>
                        <th className="p-3">Stock</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-brand-black/10">
                      {filteredItems.map(item => (
                        <tr key={item.id} className="text-sm hover:bg-brand-beige-dark/5">
                          <td className="p-3">
                            <div className="font-bold">{item.name}</div>
                            <div className="text-[10px] font-mono opacity-50">{item.ipn}</div>
                          </td>
                          <td className="p-3 font-mono">
                            <span className={cn(
                              "font-bold px-2 py-0.5 brutalist-border",
                              item.stock === 0 ? "bg-red-200" : item.stock < 5 ? "bg-yellow-200" : "bg-green-200"
                            )}>
                              {item.stock}
                            </span>
                          </td>
                          <td className="p-3 text-xs opacity-60 uppercase font-bold">{item.category}</td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  addToAdjustment(item);
                                  updateItemStock(item.id, 1);
                                }}
                                className="brutalist-button p-1 bg-green-100"
                              >
                                <Plus size={14} />
                              </button>
                              <button 
                                onClick={() => {
                                  addToAdjustment(item);
                                  updateItemStock(item.id, -1);
                                }}
                                className="brutalist-button p-1 bg-red-100"
                              >
                                <Minus size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>

            {RightSidebar}
          </>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<'checkout' | 'volunteer'>('checkout');
  const [volunteerSubView, setVolunteerSubView] = useState<'dashboard' | 'inventory' | 'list'>('dashboard');
  const [showWero, setShowWero] = useState(false);
  const [items, setItems] = useState<Item[]>(MOCK_ITEMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [services, setServices] = useState<ExtraService[]>(INITIAL_SERVICES);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const updateItemStock = (id: string, delta: number) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, stock: Math.max(0, item.stock + delta) } : item
    ));
  };

  const handleViewChange = (newView: 'checkout' | 'volunteer') => {
    setView(newView);
    if (newView === 'volunteer') {
      setVolunteerSubView('inventory');
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.ipn.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToCart = (item: Item) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setLastScanned(item.name);
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const servicesTotal = services.reduce((sum, s) => sum + (s.value * s.rate), 0);
  const grandTotal = cartTotal + servicesTotal;

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentView={view} onViewChange={handleViewChange} />
      
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {view === 'checkout' ? (
          <>
            <Sidebar 
              services={services} 
              setServices={setServices} 
            />

            {/* Main Content: Central Barcode Scanner */}
            <main className="flex-1 p-6 flex flex-col items-center justify-center space-y-8 bg-brand-beige">
              <div className="w-full max-w-2xl space-y-8">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter flex items-center justify-center gap-4">
                    <Scan size={32} className="sm:w-10 sm:h-10" /> Ready to Scan
                  </h2>
                  <p className="font-mono text-sm sm:text-base opacity-60 uppercase font-bold">
                    Point your camera at a barcode or type the ID below
                  </p>
                </div>

                <div className="brutalist-card bg-white p-8 space-y-6">
                  <button className="brutalist-button w-full py-8 bg-blue-400 text-2xl uppercase tracking-widest flex items-center justify-center gap-4">
                    <Camera size={32} /> Open Camera
                  </button>
                  
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="SCAN OR TYPE BARCODE..." 
                      className="brutalist-input w-full py-6 px-12 text-2xl font-mono uppercase placeholder:opacity-20"
                      autoFocus
                    />
                    <QrCode className="absolute left-4 top-6 opacity-40" size={32} />
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1 p-4 brutalist-border bg-brand-beige-dark/10 font-mono">
                      <div className="text-[10px] uppercase font-black opacity-40 mb-1">Last Scanned Item</div>
                      <div className={cn("text-lg font-black truncate", lastScanned ? "text-blue-600" : "opacity-20")}>
                        {lastScanned || "WAITING..."}
                      </div>
                    </div>
                    <button className="brutalist-button bg-brand-beige-dark/20 px-6">
                      <RefreshCw size={24} />
                    </button>
                  </div>
                </div>
              </div>
            </main>

            {/* Right Sidebar: Shopping Cart */}
            <aside className="w-full lg:w-96 border-l-[3px] border-brand-black bg-white flex flex-col">
              <div className="p-6 border-b-[3px] border-brand-black bg-brand-beige-dark/20">
                <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                  <ShoppingCart size={28} /> Shopping Cart
                </h2>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-4">
                <AnimatePresence mode="popLayout">
                  {cart.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40"
                    >
                      <ShoppingCart size={48} className="mb-4" />
                      <p className="font-bold uppercase">Your cart is empty.</p>
                      <p className="text-xs">Scan an item or use the + button to add it.</p>
                    </motion.div>
                  ) : (
                    cart.map(item => (
                      <motion.div 
                        key={item.id}
                        layout
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -20, opacity: 0 }}
                        className="brutalist-card p-3 flex gap-3"
                      >
                        <div className="w-12 h-12 brutalist-border bg-gray-100 flex-shrink-0 flex items-center justify-center">
                          <Box size={20} className="opacity-20" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate text-sm">{item.name}</div>
                          <div className="text-xs font-mono opacity-60">€{item.price.toFixed(2)} each</div>
                          <div className="flex items-center gap-2 mt-2">
                            <button 
                              onClick={() => updateQuantity(item.id, -1)}
                              className="brutalist-button p-1"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="font-mono font-bold w-6 text-center">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.id, 1)}
                              className="brutalist-button p-1"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="text-right flex flex-col justify-between items-end">
                          <div className="font-bold font-mono">€{(item.price * item.quantity).toFixed(2)}</div>
                          <button 
                            onClick={() => removeFromCart(item.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Checkout Section */}
              <div className="p-6 border-t-[3px] border-brand-black bg-brand-beige-dark/10 space-y-4">
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>€{cartTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Services:</span>
                    <span>€{servicesTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xl font-black pt-2 border-t-2 border-brand-black">
                    <span>TOTAL:</span>
                    <span>€{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
                <button 
                  disabled={cart.length === 0 && servicesTotal === 0}
                  onClick={() => setShowWero(true)}
                  className="brutalist-button w-full py-4 bg-green-400 text-xl uppercase tracking-widest disabled:opacity-50 disabled:grayscale"
                >
                  Checkout
                </button>
              </div>
            </aside>

            {/* Wero Payment Modal */}
            {showWero && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/60 backdrop-blur-sm">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="brutalist-card bg-white p-8 max-w-sm w-full text-center space-y-6"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-2xl font-black uppercase tracking-tighter">Wero Payment</h3>
                    <button onClick={() => setShowWero(false)} className="p-1 hover:bg-gray-100 rounded">
                      <Trash2 size={24} />
                    </button>
                  </div>
                  <div className="brutalist-border p-4 bg-white flex flex-col items-center gap-4">
                    <div className="w-48 h-48 bg-gray-100 flex items-center justify-center brutalist-border">
                      <QrCode size={120} className="text-brand-black" />
                    </div>
                    <div className="text-2xl font-black font-mono">€{grandTotal.toFixed(2)}</div>
                  </div>
                  <p className="text-sm font-mono opacity-60 uppercase">Scan with your banking app to pay via Wero</p>
                  <button 
                    onClick={() => {
                      setShowWero(false);
                      setCart([]);
                      setServices(INITIAL_SERVICES);
                      setLastScanned(null);
                    }}
                    className="brutalist-button w-full bg-green-400 py-3 uppercase font-black"
                  >
                    Confirm Paid
                  </button>
                </motion.div>
              </div>
            )}
          </>
        ) : (
          <VolunteerDashboard 
            items={items} 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredItems={filteredItems}
            activeSubView={volunteerSubView}
            setActiveSubView={setVolunteerSubView}
            lastScanned={lastScanned}
            setLastScanned={setLastScanned}
            updateItemStock={updateItemStock}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="border-t-[3px] border-brand-black bg-white p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-4">
          <h4 className="font-black uppercase tracking-tight">Stock Management</h4>
          <p className="text-sm opacity-70 leading-relaxed">
            Inventory management system with barcode scanning and checkout functionality. 
            Designed for makerspaces and open workshops.
          </p>
        </div>
        <div className="space-y-4">
          <h4 className="font-black uppercase tracking-tight">Resources</h4>
          <div className="flex flex-wrap gap-4 text-sm font-bold">
            <a href="#" className="flex items-center gap-1 hover:underline"><Info size={16} /> Docs</a>
            <a href="#" className="flex items-center gap-1 hover:underline"><RefreshCw size={16} /> Feedback</a>
            <a href="#" className="flex items-center gap-1 hover:underline"><ExternalLink size={16} /> GitHub</a>
          </div>
        </div>
        <div className="flex flex-col items-start md:items-end justify-between">
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-black uppercase text-xs">Powered by</div>
              <div className="font-mono text-[10px]">Maakleerplek VZW</div>
            </div>
            <div className="w-10 h-10 brutalist-border bg-brand-black text-white flex items-center justify-center">
              <Box size={20} />
            </div>
          </div>
          <div className="text-[10px] font-mono opacity-40 mt-4">
            © 2026 STOCK MANAGEMENT. ALL RIGHTS RESERVED.
          </div>
        </div>
      </footer>
    </div>
  );
}
