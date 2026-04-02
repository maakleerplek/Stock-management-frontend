import { Book, Github, MessageSquare, Database } from 'lucide-react';
import { useState } from 'react';
import CacheManager from './CacheManager';

const FOOTER_LINKS = {
  docs: import.meta.env.VITE_DOCS_URL || 'https://docs.inventree.org/en/stable/',
  feedback: import.meta.env.VITE_FEEDBACK_URL || '',
  github: import.meta.env.VITE_GITHUB_URL || 'https://github.com/maakleerplek/stock-management',
};

export default function Footer() {
  const [cacheManagerOpen, setCacheManagerOpen] = useState(false);

  return (
    <>
      <footer className="border-t-2 border-brand-black bg-brand-beige py-2 px-4 sm:px-6 mt-auto relative flex justify-between items-center">
          
        {/* Left Side: All Links Clustered */}
        <div className="flex items-center gap-6 sm:gap-10">
          
          {/* Docs */}
          <div className="flex items-center gap-3">
            <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
              <Book size={20} className="text-brand-black" />
            </div>
            <div className="hidden sm:flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                READ
              </span>
              <a 
                href={FOOTER_LINKS.docs}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-black uppercase tracking-wider text-brand-black hover:underline leading-none"
              >
                DOCUMENTATION
              </a>
            </div>
          </div>

          {/* Feedback */}
          <div className="flex items-center gap-3">
            <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
              <MessageSquare size={20} className="text-brand-black" />
            </div>
            <div className="hidden sm:flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                GIVE
              </span>
              <a 
                href={FOOTER_LINKS.feedback}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-black uppercase tracking-wider text-brand-black hover:underline leading-none"
              >
                FEEDBACK
              </a>
            </div>
          </div>

          {/* GitHub */}
          <div className="flex items-center gap-3">
            <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
              <Github size={20} className="text-brand-black" />
            </div>
            <div className="hidden sm:flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                CONTRIBUTE
              </span>
              <a 
                href={FOOTER_LINKS.github}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-black uppercase tracking-wider text-brand-black hover:underline leading-none"
              >
                APP GITHUB
              </a>
            </div>
          </div>

          {/* Cache Manager */}
          <button
            onClick={() => setCacheManagerOpen(true)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            title="Manage Cache"
          >
            <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
              <Database size={20} className="text-brand-black" />
            </div>
            <div className="hidden sm:flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                MANAGE
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-brand-black leading-none">
                CACHE
              </span>
            </div>
          </button>

        </div>

        {/* Middle/Right: Beta Version Badge */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs font-black uppercase tracking-[0.2em] text-brand-black border-2 border-brand-black px-2 py-1 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            BETA VERSION
          </span>
        </div>

      </footer>

      <CacheManager open={cacheManagerOpen} onClose={() => setCacheManagerOpen(false)} />
    </>
  );
}
