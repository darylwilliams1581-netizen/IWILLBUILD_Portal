/**
 * OfflineBanner
 *
 * A fixed top banner shown when the browser loses network connectivity.
 * Disappears automatically when the connection is restored.
 * Also shows a "syncing" state while the offline queue is flushing.
 *
 * Mount once in RootLayout — it is always present but only visible when offline.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, RefreshCw } from 'lucide-react';

export default function OfflineBanner() {
  const [isOnline, setIsOnline]   = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing,  setSyncing]    = useState(false);

  useEffect(() => {
    function handleOnline() {
      setSyncing(true);
      setIsOnline(true);
      // Show "syncing" for 2s then clear
      setTimeout(() => setSyncing(false), 2000);
    }
    function handleOffline() {
      setIsOnline(false);
      setSyncing(false);
    }

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const visible = !isOnline || syncing;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="offline-banner"
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{   y: -48, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' as const }}
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold"
          style={{
            background: syncing ? '#16a34a' : '#dc2626',
            color: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
          }}
          role="status"
          aria-live="polite"
        >
          {syncing ? (
            <>
              <RefreshCw size={14} className="animate-spin shrink-0" />
              <span>Back online — syncing pending actions…</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="shrink-0" />
              <span>You're offline — actions will sync when reconnected</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
