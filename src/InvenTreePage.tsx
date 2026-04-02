import { ArrowLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { INVENTREE_CONFIG } from './constants';

interface InvenTreePageProps {
  onBack: () => void;
}

function InvenTreePage({ onBack }: InvenTreePageProps) {
  const panelUrl = import.meta.env.VITE_INVENTREE_PANEL_URL;
  const fallbackUrl = import.meta.env.VITE_INVENTREE_URL || INVENTREE_CONFIG.URL;
  const targetUrl = panelUrl || fallbackUrl;

  const handleOpenInNewTab = () => {
    window.open(targetUrl, '_blank');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-brand-beige overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b-2 border-brand-black bg-white">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 border-2 border-brand-black bg-brand-beige hover:bg-brand-beige-dark transition-colors"
            title="Back to Overview"
          >
            <ArrowLeft size={20} className="text-brand-black" />
          </button>
          <h2 className="text-lg font-black uppercase tracking-widest text-brand-black">
            INVENTREE PANEL
          </h2>
        </div>
        
        <button 
          onClick={handleOpenInNewTab}
          className="brutalist-button py-2 px-4 flex items-center gap-2 text-xs"
        >
          <ExternalLink size={14} />
          OPEN IN NEW TAB
        </button>
      </div>

      <div className="flex-1 relative w-full h-[calc(100vh-140px)]">
        {!targetUrl ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-brand-black">
            <AlertTriangle size={48} className="mb-4 text-amber-500" />
            <h3 className="text-xl font-black uppercase tracking-widest">NO URL CONFIGURED</h3>
            <p className="mt-2 font-bold uppercase text-sm">SET VITE_INVENTREE_PANEL_URL IN YOUR .ENV FILE.</p>
          </div>
        ) : (
          <iframe
            src={targetUrl}
            className="w-full h-full border-none bg-white"
            title="InvenTree Inventory System"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        )}
      </div>
    </div>
  );
}

export default InvenTreePage;
