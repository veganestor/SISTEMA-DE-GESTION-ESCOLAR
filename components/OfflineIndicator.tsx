import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      const timer = setTimeout(() => setWasOffline(false), 3200);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !wasOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-[95] px-4 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 border backdrop-blur-md no-print transition-all ${
        isOnline
          ? 'bg-emerald-600/95 text-white border-emerald-300'
          : 'bg-amber-500/95 text-slate-950 border-amber-200'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi size={14} />
          <span>Conexión restablecida</span>
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span>Modo sin conexión — los cambios se guardan localmente en este dispositivo</span>
        </>
      )}
    </div>
  );
};
