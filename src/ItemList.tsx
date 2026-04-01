import { useState, useEffect, useMemo } from 'react';
import { 
    Box, 
    Typography, 
    Paper, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    TablePagination,
    TextField,
    InputAdornment,
    Chip,
    CircularProgress,
    IconButton,
    Tooltip
} from '@mui/material';
import inventreeClient from './api/inventreeClient';
import { 
    Search as SearchIcon, 
    Refresh as RefreshIcon,
    Inventory as InventoryIcon,
    Category as CategoryIcon,
    LocationOn as LocationIcon,
    Euro as EuroIcon
} from '@mui/icons-material';
import ImageDisplay from './ImageDisplay';

interface Item {
    id: number;
    name: string;
    category: string;
    location: string;
    quantity: number;
    price: number;
    image: string | null;
    ipn: string;
    description: string;
}

export default function ItemList() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);

    const fetchItems = async () => {
        setLoading(true);
        setError(null);
        console.log('[ItemList] Fetching all items from direct InvenTree client...');
        try {
            const data = await inventreeClient.getAllStockItems();
            
            // Normalize results - some requests might return a flat array, others a paginated object
            const results = Array.isArray(data) ? data : (data?.results || []);
            
            const mappedItems: Item[] = results.map(item => ({
                id: item.pk,
                name: (item as any).part_detail?.name || 'Unknown Part',
                category: (item as any).part_detail?.category_name || 'Uncategorized',
                location: (item as any).location_detail?.name || (item as any).location_detail?.pathstring || 'No Location',
                quantity: item.quantity,
                price: (item as any).part_detail?.pricing_min || 0,
                image: (item as any).part_detail?.image || null,
                ipn: (item as any).part_detail?.IPN || '',
                description: (item as any).part_detail?.description || '',
            }));

            setItems(mappedItems);
            console.log(`[ItemList] Loaded ${mappedItems.length} items`);
        } catch (err) {
            console.error('[ItemList] Critical error:', err);
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const filteredItems = useMemo(() => {
        return items.filter(item => 
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.ipn.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [items, searchQuery]);

    const handleChangePage = (_event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    if (loading && items.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 0, sm: 2, md: 3 }, width: '100%' }}>
            <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' },
                justifyContent: 'space-between', 
                alignItems: { xs: 'stretch', md: 'center' }, 
                mb: { xs: 2, sm: 3 }, 
                gap: 2,
                px: { xs: 2, sm: 0 }
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <InventoryIcon color="primary" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }} />
                    <Typography variant="h6" fontWeight="bold">Inventory List</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexGrow: 1, maxWidth: { xs: '100%', md: '600px' } }}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Search items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" color="action" />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <Tooltip title="Refresh List">
                        <IconButton onClick={fetchItems} disabled={loading} color="primary" size="small">
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {error && (
                <Paper sx={{ p: 2, mb: 3, mx: { xs: 2, sm: 0 }, bgcolor: 'error.light', color: 'error.contrastText' }}>
                    <Typography variant="body2">{error}</Typography>
                </Paper>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ 
                borderRadius: { xs: 0, sm: 1.5 }, 
                boxShadow: { xs: 'none', sm: '0 4px 20px rgba(0,0,0,0.08)' }, 
                border: { xs: 'none', sm: '1px solid' },
                borderColor: 'divider',
                overflowX: 'auto', 
                width: '100%',
                maxWidth: '100%',
                bgcolor: 'background.paper'
            }}>
                <Table sx={{ minWidth: 650, tableLayout: 'fixed' }} size="small">
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                            <TableCell width={60}>Image</TableCell>
                            <TableCell width={200}>Name / IPN</TableCell>
                            <TableCell width={120}>Category</TableCell>
                            <TableCell width={120}>Location</TableCell>
                            <TableCell width={80} align="right">Stock</TableCell>
                            <TableCell width={80} align="right">Price</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredItems
                            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                            .map((item) => (
                                <TableRow key={item.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                    <TableCell>
                                        <ImageDisplay 
                                            imagePath={item.image} 
                                            alt={item.name} 
                                            width={40} 
                                            height={40} 
                                            sx={{ borderRadius: 1 }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ py: 1.5 }}>
                                        <Typography variant="body2" fontWeight="bold" sx={{ 
                                            lineHeight: 1.2,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>{item.name}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{item.ipn}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip 
                                            icon={<CategoryIcon sx={{ fontSize: '0.8rem !important' }} />} 
                                            label={item.category} 
                                            size="small" 
                                            variant="outlined" 
                                            sx={{ fontSize: '0.65rem', height: 20, maxWidth: '100%' }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <LocationIcon sx={{ fontSize: '0.8rem', color: 'text.secondary' }} />
                                            <Typography variant="caption" sx={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.location}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography 
                                            variant="body2" 
                                            fontWeight="bold" 
                                            color={item.quantity > 0 ? 'success.main' : 'error.main'}
                                            sx={{ fontSize: '0.85rem' }}
                                        >
                                            {item.quantity}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                                            <EuroIcon sx={{ fontSize: '0.7rem' }} />
                                            <Typography variant="body2" fontWeight="bold" sx={{ fontSize: '0.85rem' }}>
                                                {item.price.toFixed(2)}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        {filteredItems.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 10 }}>
                                    <Typography variant="body2" color="text.secondary">No items found matching your search.</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    rowsPerPageOptions={[10, 25, 50]}
                    component="div"
                    count={filteredItems.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    sx={{
                        '& .MuiTablePagination-toolbar': {
                            px: 1,
                            minHeight: 48
                        },
                        '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                            fontSize: '0.75rem'
                        }
                    }}
                />
            </TableContainer>
        </Box>
    );
}
