import { Book, Github, MessageSquare, Database } from 'lucide-react';
import { useState } from 'react';
import CacheManager from './CacheManager';

const FOOTER_LINKS = {
  docs: import.meta.env.VITE_DOCS_URL || 'https://docs.inventree.org/en/stable/',
  feedback: import.meta.env.VITE_FEEDBACK_URL || '',
  github: import.meta.env.VITE_GITHUB_URL || 'https://github.com/maakleerplek/stock-management',
};

const linkClass = 'flex items-center gap-1.5 hover:text-brand-black underline-offset-4 hover:underline flex-shrink-0';

export default function Footer() {
  const [cacheManagerOpen, setCacheManagerOpen] = useState(false);

  return (
    <>
      <footer className="border-t border-lijn bg-brand-beige-dark px-4 sm:px-8 py-2.5 mt-auto flex-shrink-0">
        <div className="flex justify-between items-center gap-4 text-xs text-grafiet">
          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
            <a href={FOOTER_LINKS.docs} target="_blank" rel="noopener noreferrer" className={linkClass} title="Documentation">
              <Book size={14} /> <span className="hidden sm:inline">Docs</span>
            </a>
            {FOOTER_LINKS.feedback && (
              <a href={FOOTER_LINKS.feedback} target="_blank" rel="noopener noreferrer" className={linkClass} title="Give feedback">
                <MessageSquare size={14} /> <span className="hidden sm:inline">Feedback</span>
              </a>
            )}
            <a href={FOOTER_LINKS.github} target="_blank" rel="noopener noreferrer" className={linkClass} title="GitHub repository">
              <Github size={14} /> <span className="hidden sm:inline">GitHub</span>
            </a>
            <button onClick={() => setCacheManagerOpen(true)} className={linkClass} title="Manage cache">
              <Database size={14} /> <span className="hidden sm:inline">Cache</span>
            </button>
          </div>
          <span className="flex-shrink-0">Maakleerplek vzw · beta</span>
        </div>
      </footer>

      <CacheManager open={cacheManagerOpen} onClose={() => setCacheManagerOpen(false)} />
    </>
  );
}
