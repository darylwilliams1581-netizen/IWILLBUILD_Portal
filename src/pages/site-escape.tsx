/**
 * /site-escape — Protected wrapper for the Site Escape game.
 *
 * Requires login via ProtectedRoute (registered in routes.tsx).
 * Embeds the game using a RELATIVE path (/site-escape.html) so it always
 * loads inside the same origin — never opens an external browser on iOS.
 * The iframe is sized to fill the remaining viewport below the top bar,
 * and the game HTML itself uses viewport units so it scales to any phone.
 */

import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';

// Relative path — stays inside the app container on iOS/Android WebView.
// Do NOT use an absolute https:// URL here; that causes the OS to open
// the external browser instead of rendering inside the iframe.
const GAME_PATH = '/site-escape.html';

export default function SiteEscapePage() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Site Escape – IWILLBUILD</title>
        <meta name="description" content="Play Site Escape, the construction site mini-game built for the IWILLBUILD platform." />
        <link rel="canonical" href="https://iwillbuild.com/site-escape" />
        <meta name="robots" content="noindex" />
      </Helmet>

      {/*
        Use fixed inset-0 so the game fills the entire screen including
        safe-area on notched iPhones. flex-col lets the iframe take all
        remaining height after the top bar.
      */}
      <div
        className="fixed inset-0 flex flex-col bg-black z-50"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Top bar — amber brand strip */}
        <div className="flex items-center justify-between px-4 py-3 bg-amber-500 shrink-0">
          <h1 className="text-white font-bold text-base tracking-wide">Site Escape</h1>
          <button
            onClick={() => navigate('/home')}
            aria-label="Close and return to Home"
            className="flex items-center gap-1.5 text-white/90 hover:text-white active:text-white/70 transition-colors touch-manipulation"
          >
            <X size={20} strokeWidth={2.5} />
            <span className="text-sm font-medium">Home</span>
          </button>
        </div>

        {/*
          The iframe fills all remaining height. overflow-hidden prevents
          the iframe from introducing its own scrollbar on iOS.
          allow="fullscreen" lets the game go full-screen if it requests it.
          sandbox keeps scripts running but blocks top-level navigation so
          the game can never redirect the parent page.
        */}
        <iframe
          src={GAME_PATH}
          title="Site Escape"
          className="flex-1 w-full border-0 overflow-hidden"
          allow="fullscreen; pointer-lock"
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
          style={{ display: 'block' }}
        />
      </div>
    </>
  );
}
