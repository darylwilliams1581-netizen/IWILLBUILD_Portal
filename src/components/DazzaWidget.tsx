import { useLocation, useNavigate } from "react-router";
import { Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePermissions } from '@/lib/usePermissions';
export default function DazzaWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isOwner,
    loading
  } = usePermissions();

  // Hide on AI pages and public/auth pages
  const hiddenPaths = ['/dazza-ai', '/annette', '/owner-console', '/login', '/signup', '/forgot-password', '/reset-password', '/check-email', '/verify-email', '/verify-required', '/', '/privacy', '/terms'];
  const isHidden = hiddenPaths.some(p => location.pathname === p) || location.pathname.startsWith('/share/') || location.pathname.startsWith('/external/') || location.pathname.startsWith('/view/');
  if (isHidden) return null;
  if (loading || !isOwner) return null;
  return <AnimatePresence>
      <motion.div key="dazza-widget" initial={{
      opacity: 0,
      scale: 0.8,
      y: 20
    }} animate={{
      opacity: 1,
      scale: 1,
      y: 0
    }} exit={{
      opacity: 0,
      scale: 0.8,
      y: 20
    }} transition={{
      duration: 0.25,
      ease: 'easeOut' as const
    }} className="fixed bottom-6 right-6 z-50">
        <button onClick={() => navigate('/owner-console?tab=system-ai')} title="System AI" className="group relative w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1263d8] to-[#0f8b8d] shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center">
          <Bot size={24} className="text-white" />
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 shadow-lg">
            System AI
            <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-900" />
          </div>
        </button>
      </motion.div>
    </AnimatePresence>;
}
