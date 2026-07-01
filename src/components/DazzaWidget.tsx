/**
 * DazzaWidget — floating bottom-right AI assistant button.
 * Available across the entire portal. Clicking navigates to /dazza-ai.
 * Does not appear on the /dazza-ai or /annette pages themselves.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePermissions } from '@/lib/usePermissions';

export default function DazzaWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can, loading } = usePermissions();

  // Hide on Dazza pages and public/auth pages
  const hiddenPaths = ['/dazza-ai', '/annette', '/login', '/signup', '/forgot-password', '/reset-password', '/check-email', '/verify-email', '/verify-required', '/', '/privacy', '/terms'];
  const isHidden = hiddenPaths.some((p) => location.pathname === p) || location.pathname.startsWith('/share/') || location.pathname.startsWith('/external/') || location.pathname.startsWith('/view/');

  if (isHidden) return null;
  if (!loading && !can('dazzaAi')) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="dazza-widget"
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 20 }}
        transition={{ duration: 0.25, ease: 'easeOut' as const }}
        className="fixed bottom-6 right-6 z-50"
      >
        <button
          onClick={() => navigate('/dazza-ai')}
          title="Ask Dazza AI"
          className="group relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
        >
          <Bot size={24} className="text-white" />
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-2xl ring-2 ring-[#1263d8]/40 animate-ping opacity-30 pointer-events-none" />
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 shadow-lg">
            Ask Dazza AI
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900" />
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
