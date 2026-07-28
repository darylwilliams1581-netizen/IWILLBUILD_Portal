/**
 * SessionExpiredBanner
 *
 * A fixed toast-style banner shown when the session has expired.
 * Appears at the top of the viewport, above all portal chrome.
 * Auto-redirects to /login after a short countdown so the user
 * can see the message before being moved.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

interface Props {
  /** Seconds before auto-redirect to /login. Default: 4. */
  countdownSecs?: number;
}

export default function SessionExpiredBanner({ countdownSecs = 4 }: Props) {
  const [remaining, setRemaining] = useState(countdownSecs);
  const navigate = useNavigate();

  useEffect(() => {
    if (remaining <= 0) {
      navigate('/login?reason=expired', { replace: true });
      return;
    }
    const t = setTimeout(() => setRemaining((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, navigate]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#1e293b',
        borderBottom: '2px solid #7c3aed',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      <ShieldAlert size={20} color="#7c3aed" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
          Session expired — please sign in again
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Your session reached its daily security limit. Redirecting in {remaining}s…
        </p>
      </div>
      <button
        onClick={() => navigate('/login?reason=expired', { replace: true })}
        style={{
          flexShrink: 0,
          padding: '6px 14px',
          borderRadius: 6,
          background: '#7c3aed',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Sign in now
      </button>
    </div>
  );
}
