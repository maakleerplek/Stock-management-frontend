import { ExternalLink, Info } from 'lucide-react';
import { ORGANIZATION, FOOTER_LINKS } from './constants';

export default function Footer() {
  return (
    <footer className="border-t-[3px] border-brand-black bg-white p-4 sm:p-6 mt-auto">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {/* Organization Info */}
          <div>
            <p className="text-sm font-bold mb-1">
              Powered by{' '}
              <a 
                href={ORGANIZATION.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline hover:no-underline font-black"
              >
                {ORGANIZATION.name}
              </a>
            </p>
            <p className="text-xs opacity-60 font-mono">
              Open-source inventory management
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm">
            <a 
              href={FOOTER_LINKS.docs}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-bold hover:underline"
            >
              <Info size={14} />
              <span>Docs</span>
            </a>
            <a 
              href={FOOTER_LINKS.feedback}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-bold hover:underline"
            >
              <ExternalLink size={14} />
              <span>Feedback</span>
            </a>
            <a 
              href={FOOTER_LINKS.github}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-bold hover:underline"
            >
              <ExternalLink size={14} />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
