import React, { useState } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import { cn } from './lib/utils';

export interface SupplierFormData {
    name: string;
    description: string;
    website: string;
    email: string;
    phone: string;
    address: string;
    contact: string;
}

interface AddSupplierFormProps {
    onSubmit: (formData: SupplierFormData) => Promise<void>;
    onCancel: () => void;
}

const AddSupplierForm: React.FC<AddSupplierFormProps> = ({ onSubmit, onCancel }) => {
    const [formData, setFormData] = useState<SupplierFormData>({
        name: '',
        description: '',
        website: '',
        email: '',
        phone: '',
        address: '',
        contact: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (error) setError(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            setError('Supplier name is required.');
            return;
        }
        setLoading(true);
        try {
            await onSubmit(formData);
            setFormData({ name: '', description: '', website: '', email: '', phone: '', address: '', contact: '' });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create supplier.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <div className="flex items-center justify-between p-4 border-b border-brand-black bg-white">
                <h2 className="text-lg font-black uppercase tracking-widest text-brand-black">
                    ADD SUPPLIER
                </h2>
                <button
                    onClick={onCancel}
                    className="p-1 border border-brand-black bg-white hover:bg-brand-beige transition-colors"
                >
                    <X size={18} className="text-brand-black" />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
                {error && (
                    <div className="brutalist-card bg-yellow-100 border-yellow-500 p-4 mb-4">
                        <p className="text-sm font-bold text-black">{error}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">
                            Supplier Name <span className="text-red-600">*</span>
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

                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Description</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={2}
                            className="brutalist-input w-full px-3 py-2 resize-y"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold mb-2 uppercase">Email</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="orders@supplier.com"
                                className="brutalist-input w-full px-3 py-2"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2 uppercase">Phone</label>
                            <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder="+32 ..."
                                className="brutalist-input w-full px-3 py-2"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Website</label>
                        <input
                            type="url"
                            name="website"
                            value={formData.website}
                            onChange={handleChange}
                            placeholder="https://example.com"
                            className="brutalist-input w-full px-3 py-2"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Address</label>
                        <textarea
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            rows={2}
                            placeholder="Street, City, Country"
                            className="brutalist-input w-full px-3 py-2 resize-y"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold mb-2 uppercase">Contact Person</label>
                        <input
                            type="text"
                            name="contact"
                            value={formData.contact}
                            onChange={handleChange}
                            placeholder="Name of primary contact"
                            className="brutalist-input w-full px-3 py-2"
                        />
                    </div>

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
                            <span>CANCEL</span>
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={cn(
                                "brutalist-button px-4 py-2 bg-purple-300 text-brand-black flex items-center gap-2",
                                loading && "opacity-75 cursor-not-allowed"
                            )}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>CREATING...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    <span>ADD SUPPLIER</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default AddSupplierForm;
