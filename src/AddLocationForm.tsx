import React, { useState } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import type { SelectOption } from './AddPartForm';
import { cn } from './lib/utils';

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
        <form onSubmit={handleSubmit} className="mt-4">
            {error && (
                <div className="brutalist-card bg-yellow-100 border-yellow-500 p-4 mb-4">
                    <p className="text-sm font-bold text-black">{error}</p>
                </div>
            )}
            
            <div className="grid grid-cols-1 gap-4">
                {/* Location Name */}
                <div>
                    <label className="block text-sm font-bold mb-2 uppercase">
                        Location Name <span className="text-red-600">*</span>
                    </label>
                    <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        autoFocus
                        className="brutalist-input w-full px-3 py-2"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-bold mb-2 uppercase">Description</label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange as any}
                        rows={2}
                        className="brutalist-input w-full px-3 py-2 resize-y"
                    />
                </div>

                {/* Parent Location */}
                <div>
                    <label className="block text-sm font-bold mb-2 uppercase">Parent Location</label>
                    <select
                        name="parent"
                        value={formData.parent}
                        onChange={handleChange as any}
                        className="brutalist-input w-full px-3 py-2"
                    >
                        <option value="">None</option>
                        {locations.map((loc) => (
                            <option key={loc.id} value={String(loc.id)}>
                                {loc.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Checkboxes */}
                <div className="flex flex-col gap-3">
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            name="structural"
                            checked={formData.structural}
                            onChange={handleChange}
                            className="brutalist-border w-5 h-5 mr-3"
                        />
                        <div className="flex flex-col">
                            <span className="font-bold text-sm">Structural</span>
                            <span className="text-xs text-gray-600">Stock items may not be directly located</span>
                        </div>
                    </label>
                    <label className="flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            name="external"
                            checked={formData.external}
                            onChange={handleChange}
                            className="brutalist-border w-5 h-5 mr-3"
                        />
                        <div className="flex flex-col">
                            <span className="font-bold text-sm">External</span>
                            <span className="text-xs text-gray-600">This is an external stock location</span>
                        </div>
                    </label>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 justify-end mt-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className={cn(
                            "brutalist-button px-4 py-2 flex items-center gap-2",
                            loading && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <X className="w-4 h-4" />
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className={cn(
                            "brutalist-button px-4 py-2 bg-black text-beige flex items-center gap-2",
                            loading && "opacity-75 cursor-not-allowed"
                        )}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Create Location
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default AddLocationForm;
