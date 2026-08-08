/**
 * AppLockSettings.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings card for the App Lock (PIN + Face ID) feature.
 * Shown inside Settings → Account on native iOS only.
 *
 * States:
 *   • No PIN set  → "Set up PIN" button
 *   • PIN set     → "Change PIN" + "Disable PIN" buttons + status badge
 *
 * This component does NOT render on web — it returns null when not native.
 */

import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { ShieldCheck, ShieldOff, KeyRound, Smartphone, ChevronRight } from 'lucide-react';
import { isNativeApp } from '@/lib/native-routing';
import { getPinRecord } from '@/lib/appLock/appLockStorage';
import PinSetupModal, { type PinSetupMode } from '@/components/appLock/PinSetupModal';

interface AppLockSettingsProps {
  userEmail: string;
}

export default function AppLockSettings({ userEmail }: AppLockSettingsProps) {
  // Web — not applicable; AppLockSettingsNative contains all hooks
  if (!isNativeApp) return null;
  return <AppLockSettingsNative userEmail={userEmail} />;
}

function AppLockSettingsNative({ userEmail }: AppLockSettingsProps) {
  const [hasPinSetup, setHasPinSetup] = useState(!!getPinRecord());
  const [modalMode, setModalMode] = useState<PinSetupMode | null>(null);

  // Re-check after modal closes
  useEffect(() => {
    if (!modalMode) {
      setHasPinSetup(!!getPinRecord());
    }
  }, [modalMode]);

  function handleSuccess() {
    setHasPinSetup(!!getPinRecord());
    setModalMode(null);
  }

  return (
    <>
      {/* ── Card ── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            hasPinSetup ? 'bg-primary/15' : 'bg-muted'
          }`}>
            {hasPinSetup
              ? <ShieldCheck size={16} className="text-primary" />
              : <ShieldOff size={16} className="text-muted-foreground" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">App lock</p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">
              {hasPinSetup ? 'PIN + Face ID active' : 'Protect the app with a PIN'}
            </p>
          </div>
          {hasPinSetup && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>

        {/* Actions */}
        {!hasPinSetup ? (
          <button
            onClick={() => setModalMode('create')}
            className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-foreground active:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <KeyRound size={15} className="text-primary" />
              <span>Set up PIN</span>
            </div>
            <ChevronRight size={15} className="text-muted-foreground" />
          </button>
        ) : (
          <>
            <button
              onClick={() => setModalMode('change')}
              className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-foreground active:bg-muted/50 transition-colors border-b border-border"
            >
              <div className="flex items-center gap-2.5">
                <KeyRound size={15} className="text-primary" />
                <span>Change PIN</span>
              </div>
              <ChevronRight size={15} className="text-muted-foreground" />
            </button>
            <button
              onClick={() => setModalMode('disable')}
              className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-medium text-destructive active:bg-destructive/5 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <ShieldOff size={15} className="text-destructive" />
                <span>Disable PIN</span>
              </div>
              <ChevronRight size={15} className="text-destructive/50" />
            </button>
          </>
        )}
      </div>

      {/* ── Info note ── */}
      <div className="flex items-start gap-2 px-1">
        <Smartphone size={13} className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          App lock applies to this device only. You'll be prompted for your PIN or Face ID
          each time you open the app. Your server session is not affected.
        </p>
      </div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {modalMode && (
          <PinSetupModal
            key={modalMode}
            mode={modalMode}
            userEmail={userEmail}
            onClose={() => setModalMode(null)}
            onSuccess={handleSuccess}
          />
        )}
      </AnimatePresence>
    </>
  );
}
