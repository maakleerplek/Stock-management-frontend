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
      <footer className="border-t-2 border-brand-black bg-brand-beige py-2 px-4 sm:px-6 mt-auto flex-shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-4">
          
          {/* Left Side: All Links Clustered */}
          <div className="flex items-center gap-3 sm:gap-6 md:gap-10 overflow-x-auto w-full sm:w-auto justify-center sm:justify-start">
            
            {/* Docs */}
            <a 
              href={FOOTER_LINKS.docs}
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
              title="Documentation"
            >
              <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
                <Book size={18} className="text-brand-black" />
              </div>
              <div className="hidden md:flex flex-col justify-center">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                  READ
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-brand-black leading-none">
                  DOCS
                </span>
              </div>
            </a>

            {/* Feedback */}
            {FOOTER_LINKS.feedback && (
              <a 
                href={FOOTER_LINKS.feedback}
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
                title="Give Feedback"
              >
                <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
                  <MessageSquare size={18} className="text-brand-black" />
                </div>
                <div className="hidden md:flex flex-col justify-center">
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                    GIVE
                  </span>
                  <span className="text-xs font-black uppercase tracking-wider text-brand-black leading-none">
                    FEEDBACK
                  </span>
                </div>
              </a>
            )}

            {/* GitHub */}
            <a 
              href={FOOTER_LINKS.github}
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
              title="GitHub Repository"
            >
              <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
                <Github size={18} className="text-brand-black" />
              </div>
              <div className="hidden md:flex flex-col justify-center">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                  CONTRIBUTE
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-brand-black leading-none">
                  GITHUB
                </span>
              </div>
            </a>

            {/* Cache Manager */}
            <button
              onClick={() => setCacheManagerOpen(true)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
              title="Manage Cache"
            >
              <div className="border-2 border-brand-black bg-white p-1 shadow-[2px_2px_0px_0px_rgba(30,27,24,1)]">
                <Database size={18} className="text-brand-black" />
              </div>
              <div className="hidden md:flex flex-col justify-center">
                <span className="text-[10px] font-black uppercase tracking-widest leading-none text-brand-black/70 mb-0.5">
                  MANAGE
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-brand-black leading-none">
                  CACHE
                </span>
              </div>
            </button>

          </div>

          {/* Beta Version Badge */}
          <div className="flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-brand-black border-2 border-brand-black px-2 py-1 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              BETA VERSION
            </span>
          </div>

        </div>
      </footer>

      <CacheManager open={cacheManagerOpen} onClose={() => setCacheManagerOpen(false)} />
    </>
  );
}
