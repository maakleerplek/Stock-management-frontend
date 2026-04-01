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

export interface LocationFormData {
    name: string;
    description: string;
    parent: string;
    structural: boolean;
    external: boolean;
    locationType: string;
}

interface AddLocationFormProps {
    onSubmit: (formData: LocationFormData) => Promise<void>;
    locations: SelectOption[];
    onCancel: () => void;
}

const AddLocationForm: React.FC<AddLocationFormProps> = ({ onSubmit, locations, onCancel }) => {
    const [formData, setFormData] = useState<LocationFormData>({
        name: '',
        description: '',
        parent: '',
        structural: false,
        external: false,
        locationType: '',
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
            setError('Location Name is required.');
            return;
        }

        setLoading(true);
        try {
            await onSubmit(formData);
            setFormData({ name: '', description: '', parent: '', structural: false, external: false, locationType: '' });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create location.');
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
                        label="Location Name"
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
                <Grid item xs={12}>
                    <FormControl fullWidth>
                        <InputLabel>Parent Location</InputLabel>
                        <Select
                            name="parent"
                            value={formData.parent}
                            onChange={handleChange as any}
                            label="Parent Location"
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
                <Grid item xs={12} sm={6} display="flex" flexDirection="column" gap={2}>
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
                            <span style={{ fontSize: '12px', color: 'gray' }}>Stock items may not be directly located</span>
                        </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            name="external"
                            checked={formData.external}
                            onChange={handleChange}
                            style={{ width: '20px', height: '20px', marginRight: '8px' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 'bold' }}>External</span>
                            <span style={{ fontSize: '12px', color: 'gray' }}>This is an external stock location</span>
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
                        {loading ? 'Creating...' : 'Create Location'}
                    </Button>
                </Grid>
            </Grid>
        </Box>
    );
};

export default AddLocationForm;
