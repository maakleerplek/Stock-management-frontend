import React, { useState } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import type { SelectOption } from './AddPartForm';
import { cn } from './lib/utils';

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
        <form onSubmit={handleSubmit} className="mt-4">
            {error && (
                <div className="brutalist-card bg-yellow-100 border-yellow-500 p-4 mb-4">
                    <p className="text-sm font-bold text-black">{error}</p>
                </div>
            )}
            
            <div className="grid grid-cols-1 gap-4">
                {/* Category Name */}
                <div>
                    <label className="block text-sm font-bold mb-2 uppercase">
                        Category Name <span className="text-red-600">*</span>
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

                {/* Parent Category & Default Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Parent Category</label>
                        <select
                            name="parent"
                            value={formData.parent}
                            onChange={handleChange as any}
                            className="brutalist-input w-full px-3 py-2"
                        >
                            <option value="">None</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={String(cat.id)}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Default Location</label>
                        <select
                            name="defaultLocation"
                            value={formData.defaultLocation}
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
                </div>

                {/* Default Keywords */}
                <div>
                    <label className="block text-sm font-bold mb-2 uppercase">Default Keywords</label>
                    <input
                        type="text"
                        name="defaultKeywords"
                        value={formData.defaultKeywords}
                        onChange={handleChange}
                        placeholder="Comma separated keywords"
                        className="brutalist-input w-full px-3 py-2"
                    />
                    <p className="text-xs text-gray-600 mt-1">Default keywords for parts in this category</p>
                </div>

                {/* Structural Checkbox */}
                <div className="flex items-center">
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
                            <span className="text-xs text-gray-600">Parts may not be directly assigned</span>
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
                                Create Category
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default AddCategoryForm;
