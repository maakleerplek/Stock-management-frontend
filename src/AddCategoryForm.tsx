import React, { useState } from 'react';
import {
    TextField,
    Button,
    Box,
    Alert,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ClearIcon from '@mui/icons-material/Clear';
import type { SelectOption } from './AddPartForm';

export interface CategoryFormData {
    name: string;
    description: string;
    parent: string;
    defaultLocation: string;
    defaultKeywords: string;
    structural: boolean;
}

interface AddCategoryFormProps {
    onSubmit: (formData: CategoryFormData) => Promise<void>;
    categories: SelectOption[];
    locations: SelectOption[];
    onCancel: () => void;
}

const AddCategoryForm: React.FC<AddCategoryFormProps> = ({ onSubmit, categories, locations, onCancel }) => {
    const [formData, setFormData] = useState<CategoryFormData>({
        name: '',
        description: '',
        parent: '',
        defaultLocation: '',
        defaultKeywords: '',
        structural: false,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
        const { name, value, type, checked } = e.target as HTMLInputElement;
        setFormData((prev) => ({
            ...prev,
            [name as string]: type === 'checkbox' ? checked : value,
        }));
        if (error) setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            setError('Category Name is required.');
            return;
        }

        setLoading(true);
        try {
            await onSubmit(formData);
            setFormData({ name: '', description: '', parent: '', defaultLocation: '', defaultKeywords: '', structural: false });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create category.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Grid container spacing={2}>
                <Grid item xs={12}>
                    <TextField
                        fullWidth
                        label="Category Name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        autoFocus
                    />
                </Grid>
                <Grid item xs={12}>
                    <TextField
                        fullWidth
                        label="Description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        multiline
                        rows={2}
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                        <InputLabel>Parent Category</InputLabel>
                        <Select
                            name="parent"
                            value={formData.parent}
                            onChange={handleChange as any}
                            label="Parent Category"
                        >
                            <MenuItem value="">
                                <em>None</em>
                            </MenuItem>
                            {categories.map((cat) => (
                                <MenuItem key={cat.id} value={String(cat.id)}>
                                    {cat.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                        <InputLabel>Default Location</InputLabel>
                        <Select
                            name="defaultLocation"
                            value={formData.defaultLocation}
                            onChange={handleChange as any}
                            label="Default Location"
                        >
                            <MenuItem value="">
                                <em>None</em>
                            </MenuItem>
                            {locations.map((loc) => (
                                <MenuItem key={loc.id} value={String(loc.id)}>
                                    {loc.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12}>
                    <TextField
                        fullWidth
                        label="Default Keywords"
                        name="defaultKeywords"
                        value={formData.defaultKeywords}
                        onChange={handleChange}
                        placeholder="Comma separated keywords"
                        helperText="Default keywords for parts in this category"
                    />
                </Grid>

                <Grid item xs={12} sm={6} display="flex" alignItems="center">
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            name="structural"
                            checked={formData.structural}
                            onChange={handleChange}
                            style={{ width: '20px', height: '20px', marginRight: '8px' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 'bold' }}>Structural</span>
                            <span style={{ fontSize: '12px', color: 'gray' }}>Parts may not be directly assigned</span>
                        </div>
                    </label>
                </Grid>
                <Grid item xs={12} sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 1 }}>
                    <Button variant="outlined" startIcon={<ClearIcon />} onClick={onCancel} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        type="submit"
                        startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
                        disabled={loading}
                    >
                        {loading ? 'Creating...' : 'Create Category'}
                    </Button>
                </Grid>
            </Grid>
        </Box>
    );
};

export default AddCategoryForm;
