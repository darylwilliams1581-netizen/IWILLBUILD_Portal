/**
 * /site-escape — Protected wrapper for the Site Escape game.
 *
 * Requires login via ProtectedRoute (registered in routes.tsx).
 * Embeds the public game page in a full-screen iframe.
 * The public game page (/site-escape.html) is untouched and has no app nav.
 */

import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

const GAME_URL = 'https://www.iwillbuild.com/site-escape.html';

export default function SiteEscapePage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 flex flex-col bg-black z-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-amber-500 shrink-0">
        <span className="text-white font-bold text-base tracking-wide">Site Escape</span>
        <button
          onClick={() => navigate('/home')}
          aria-label="Close and return to Home"
          className="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors"
        >
          <X size={20} strokeWidth={2.5} />
          <span className="text-sm font-medium">Home</span>
        </button>
      </div>

      {/* Game iframe — full remaining height */}
      <iframe
        src={GAME_URL}
        title="Site Escape"
        className="flex-1 w-full border-0"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
      />
    </div>
  );
}
