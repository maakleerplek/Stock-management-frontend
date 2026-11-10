import { useState } from 'react';
import LaserLibrary from '../../components/LaserLibrary';
import { type LaserCutterPageProps } from './shared';
import { type LaserTab, TimePanel } from './TimePanel';
import { SettingsPanel } from './SettingsPanel';

export default function LaserCutterPage({ onCheckout, onShop, live }: LaserCutterPageProps) {
  // Goes up after every library save, so the settings panel loads the new materials and thicknesses.
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [tab, setTab] = useState<LaserTab>('cuts');
  return (
    <div className="flex-1 overflow-auto bg-brand-beige">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-lijn min-h-full">
        <TimePanel onCheckout={onCheckout} onShop={onShop} live={live} tab={tab} setTab={setTab} />
        {/* Narrow: behind the Settings tab. Wide: always there, next to and under the cuts. */}
        <div className={tab === 'settings' ? 'contents' : 'hidden lg:contents'}>
          <SettingsPanel libraryVersion={libraryVersion} />
          <LaserLibrary onSaved={() => setLibraryVersion(v => v + 1)} />
        </div>
      </div>
    </div>
  );
}
