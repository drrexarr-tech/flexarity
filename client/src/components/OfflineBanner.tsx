import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * The app is precached, so it now opens with a working shell while offline
 * instead of failing to load. Without a visible signal the user is left staring
 * at empty lists that look like "у вас ничего нет" rather than "нет сети".
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-black"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      Нет подключения к интернету — данные не обновляются
    </div>
  );
}