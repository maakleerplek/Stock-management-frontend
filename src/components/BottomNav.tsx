import { useState } from 'react';
import { Book, Database, ExternalLink, Github, MessageSquare, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import Sheet, { SheetItem } from './Sheet';
import CacheManager from './CacheManager';
import { FOOTER_LINKS } from '../constants';

export interface NavTab {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface BottomNavProps {
  tabs: NavTab[];
  /** Tabs that do not fit; they go in the More sheet with the footer links. */
  moreTabs?: NavTab[];
  current: string;
  onSelect: (id: string) => void;
  inventreeUrl?: string;
}

/** The tab bar at the bottom of the screen on a phone. From md up the top tabs take over. */
export default function BottomNav({ tabs, moreTabs, current, onSelect, inventreeUrl }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [cacheOpen, setCacheOpen] = useState(false);
  const hasMore = moreTabs !== undefined;
  const moreActive = !!moreTabs?.some(t => t.id === current);

  const button = (id: string, label: string, Icon: React.ElementType, active: boolean, onClick: () => void) => (
    <button
      key={id}
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] font-medium border-t-2',
        active ? 'border-brand-black text-brand-black' : 'border-transparent text-grafiet',
      )}
    >
      <Icon size={20} />
      {label}
    </button>
  );

  return (
    <>
      <nav className="md:hidden shrink-0 flex bg-brand-beige border-t border-lijn pb-[env(safe-area-inset-bottom)]">
        {tabs.map(t => button(t.id, t.label, t.icon, current === t.id, () => onSelect(t.id)))}
        {hasMore && button('more', 'More', MoreHorizontal, moreActive, () => setMoreOpen(true))}
      </nav>

      {hasMore && (
        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
          {moreTabs.map(t => (
            <SheetItem key={t.id} icon={t.icon} label={t.label} onClick={() => { onSelect(t.id); setMoreOpen(false); }} />
          ))}
          {inventreeUrl && <SheetItem icon={ExternalLink} label="InvenTree" href={inventreeUrl} />}
          <SheetItem icon={Book} label="Docs" href={FOOTER_LINKS.docs} />
          {FOOTER_LINKS.feedback && <SheetItem icon={MessageSquare} label="Feedback" href={FOOTER_LINKS.feedback} />}
          <SheetItem icon={Github} label="GitHub" href={FOOTER_LINKS.github} />
          <SheetItem icon={Database} label="Cache" onClick={() => { setMoreOpen(false); setCacheOpen(true); }} />
        </Sheet>
      )}
      <CacheManager open={cacheOpen} onClose={() => setCacheOpen(false)} />
    </>
  );
}
