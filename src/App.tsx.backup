import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import AddPartForm, { type PartFormData, type SelectOption } from './AddPartForm';
import AddCategoryForm, { type CategoryFormData } from './AddCategoryForm';
import AddLocationForm, { type LocationFormData } from './AddLocationForm';
import type { ScanEvent } from './sendCodeHandler';
import ShoppingWindow from './ShoppingWindow';
import BarcodeScannerContainer from './BarcodeScannerContainer';
import ItemList from './ItemList';
import Footer from './Footer';
import Header from './Header';
import InvenTreePage from './InvenTreePage';
import { CssBaseline, Box, Dialog, DialogContent, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme, darkTheme } from './theme';
import { ToastProvider, useToast } from './ToastContext';
import { VolunteerProvider } from './VolunteerContext';
import VolunteerModal from './VolunteerModal';
import inventreeClient from './api/inventreeClient';
import { STORAGE_KEYS, DEFAULTS } from './constants';
import {
  getInitialTheme,
  getErrorMessage,
  parseNumericFields,
} from './utils/helpers';

function AppContent() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [currentPage, setCurrentPage] = useState<'main' | 'inventree' | 'inventory'>('main');
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
  const muiTheme = useTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));

  // Warn before refresh if a checkout result is active
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (checkoutResult !== null) {
        console.log('[App] Preventing accidental refresh during active payment display');
        e.preventDefault();
        e.returnValue = ''; // Required for modern browsers to show the dialog
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

  // Fetch categories and locations on component mount
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
      fetchCategoriesAndLocations(); // Refresh list
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
      fetchCategoriesAndLocations(); // Refresh list
    } catch (error) {
      handleApiError(error, 'creating location');
      throw error;
    }
  };

  // Helper function to upload image
  const uploadPartImage = async (image: File, partId: string): Promise<void> => {
    try {
      await inventreeClient.uploadPartImage(parseInt(partId), image);
      addToast('Image uploaded successfully!', 'success');
    } catch (error) {
      addToast(`Warning: Image upload failed: ${getErrorMessage(error)}`, 'warning');
    }
  };

  // Helper function to create initial stock
  const createInitialStock = async (formData: PartFormData, partId: string): Promise<void> => {
    const { initialQuantity, locationId } = parseNumericFields(formData);

    if (initialQuantity > 0 && partId && locationId > 0) {
      addToast('Creating initial stock...', 'info');

      await inventreeClient.createStockItem({
        part: parseInt(partId),
        quantity: initialQuantity,
        location: locationId,
        notes: `Initial stock for new part: ${formData.partName}`,
      });

      addToast('Initial stock created successfully!', 'success');
    }
  };

  // Helper function to update existing part
  const updateExistingPart = async (formData: PartFormData): Promise<void> => {
    await inventreeClient.updatePart(parseInt(formData.partId!), {
      category: parseInt(formData.category),
      // Storage location and barcode are handled separately in InvenTree 
      // but we can try to update metadata or basic fields if needed.
    });
    addToast('Part updated successfully!', 'success');
  };

  // Helper function to create new part
  const createNewPart = async (formData: PartFormData): Promise<{ partId: string }> => {
    const { minimumStock } = parseNumericFields(formData);
    
    const result = await inventreeClient.createPart({
      name: formData.partName,
      description: formData.description,
      category: parseInt(formData.category),
      minimum_stock: minimumStock,
      active: true,
    });
    
    addToast('Part created successfully!', 'success');
    return { partId: String(result.pk) };
  };

  // Main form submission handler
  const handleAddPartSubmit = async (formData: PartFormData): Promise<{ partId: string }> => {
    try {
      if (formData.partId) {
        // Step 2: Update existing part
        await updateExistingPart(formData);

        // Upload image if provided
        if (formData.image) {
          await uploadPartImage(formData.image, formData.partId);
        }

        // Create initial stock
        await createInitialStock(formData, formData.partId);

        setAddPartFormModalOpen(false);
        return { partId: formData.partId };
      } else {
        // Step 1: Create new part
        return await createNewPart(formData);
      }
    } catch (error) {
      handleApiError(error, 'part submission');
      throw error;
    }
  };

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';

    const updateTheme = () => {
      setTheme(newTheme);
      localStorage.setItem(STORAGE_KEYS.THEME_PREFERENCE, newTheme);
    };

    // Use the View Transitions API if available
    if (!document.startViewTransition) {
      updateTheme();
      return;
    }

    // Wrap the state update in startViewTransition
    document.startViewTransition(updateTheme);
  }, [theme]);

  return (
    <ThemeProvider theme={theme === 'light' ? lightTheme : darkTheme}>
      <CssBaseline />

      <motion.div
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
      >
        {currentPage === 'inventree' ? (
          <InvenTreePage onBack={() => setCurrentPage('main')} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'background.default' }}>
            <Header
              theme={theme}
              toggleTheme={toggleTheme}
              setVolunteerModalOpen={setVolunteerModalOpen}
              setAddPartFormModalOpen={setAddPartFormModalOpen}
              setAddCategoryModalOpen={setAddCategoryModalOpen}
              setAddLocationModalOpen={setAddLocationModalOpen}
              onOpenInvenTree={() => setCurrentPage('inventree')}
              onOpenInventory={() => setCurrentPage(currentPage === 'inventory' ? 'main' : 'inventory')}
              isInventoryOpen={currentPage === 'inventory'}
            />
            <Box sx={{ flex: 1, py: { xs: 2, sm: 4 } }}>
              <Box sx={{ maxWidth: 'none', mx: 'auto', px: 2 }}>
                {currentPage === 'inventory' ? (
                  <ItemList />
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: DEFAULTS.GRID_COLUMNS.XS, md: DEFAULTS.GRID_COLUMNS.MD }, gap: 2 }}>
                    <BarcodeScannerContainer
                      onItemScanned={(item) => {
                        if (item) setScanEvent({ item, id: ++scanCounterRef.current });
                      }}
                      checkoutResult={checkoutResult}
                    />
                    <Box>
                      <ShoppingWindow
                        scanEvent={scanEvent}
                        onCheckoutResultChange={setCheckoutResult}
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>

            <Footer />
          </Box>
        )}
      </motion.div>
      <VolunteerModal open={volunteerModalOpen} onClose={() => setVolunteerModalOpen(false)} />

      <Dialog
        open={addPartFormModalOpen}
        onClose={() => setAddPartFormModalOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <AddPartForm
            onSubmit={handleAddPartSubmit}
            categories={categories}
            locations={locations}
            onCancel={() => setAddPartFormModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={addCategoryModalOpen}
        onClose={() => setAddCategoryModalOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Typography variant="h6" gutterBottom>Add New Category</Typography>
          <AddCategoryForm
            onSubmit={handleAddCategorySubmit}
            categories={categories}
            locations={locations}
            onCancel={() => setAddCategoryModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={addLocationModalOpen}
        onClose={() => setAddLocationModalOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
          <Typography variant="h6" gutterBottom>Add New Location</Typography>
          <AddLocationForm
            onSubmit={handleAddLocationSubmit}
            locations={locations}
            onCancel={() => setAddLocationModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

    </ThemeProvider>
  );
}

function App() {
  return (
    <VolunteerProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </VolunteerProvider>
  );
}

export default App;
