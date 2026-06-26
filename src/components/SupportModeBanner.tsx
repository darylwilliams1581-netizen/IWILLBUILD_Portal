/**
 * SupportModeBanner
 * Renders a persistent top banner when the owner is in support mode.
 * Must be visible on every page — rendered inside RootLayout.
 */
import { ShieldAlert, X, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSupportMode } from '@/lib/useSupportMode';
import { usePermissions } from '@/lib/usePermissions';

export default function SupportModeBanner() {
  const { isOwner } = usePermissions();
  const { active, companyName, exit } = useSupportMode();
  const navigate = useNavigate();

  if (!isOwner || !active) return null;

  const handleExit = async () => {
    await exit();
    navigate('/owner-console');
  };

  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2.5 flex items-center gap-3 z-50 shrink-0 shadow-md">
      <ShieldAlert size={16} className="shrink-0" />
      <span className="text-sm font-bold flex-1 truncate">
        Support Mode — You are viewing{' '}
        <span className="underline underline-offset-2">{companyName}</span>
      </span>
      <button
        onClick={() => navigate('/owner-console?tab=support-setup')}
        className="flex items-center gap-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors shrink-0"
      >
        <ClipboardList size={12} />
        Setup Checklist
      </button>
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors shrink-0"
      >
        <X size={12} />
        Exit Support Mode
      </button>
    </div>
  );
}
