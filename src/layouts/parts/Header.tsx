import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

/**
 * IWILLBUILD marketing header
 * Sticky, glass-blur, IWILLBUILD brand mark, primary nav with Features dropdown,
 * Pricing anchor, Sign in + Start free trial CTAs.
 * Mobile: hamburger with full-screen slide-down panel.
 */

const MODULES = [
  { href: '/studio/jobs',      label: 'Jobs',       desc: 'Create, track and close out jobs' },
  { href: '/studio/estimates', label: 'Estimating', desc: 'Cost guides, quotes and approvals' },
  { href: '/studio/fleet',     label: 'Fleet',      desc: 'Prestarts, service logs and flags' },
  { href: '/studio/accounts',  label: 'Accounts',   desc: 'Xero and QuickBooks sync' },
  { href: '/studio',           label: 'Studio',     desc: 'Documents, forms and safety packs' },
];

export default function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setFeaturesOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); setFeaturesOpen(false); }, [location.pathname]);

  const isHome = location.pathname === '/';

  return (
    <header
      suppressHydrationWarning
      className="sticky top-0 z-50"
      style={{
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderBottom: '1px solid #e2e8f0',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        paddingTop: 'max(env(safe-area-inset-top), 12px)',
        paddingBottom: 12,
      }}
    >
      <div
        suppressHydrationWarning
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '0 22px',
          minHeight: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* ── Brand mark ── */}
        <Link
          to="/"
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}
        >
          <img
            src="/airo-assets/images/logo/horizontal/light"
            alt="IWILLBUILD"
            style={{ height: 40, width: 'auto', maxWidth: 200, objectFit: 'contain', display: 'block' }}
          />
        </Link>

        {/* ── Desktop nav ── */}
        <nav className="hidden md:flex items-center justify-center flex-1" style={{ gap: 4 }}>
          {/* Features dropdown */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setFeaturesOpen((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 7, border: 'none',
                background: featuresOpen ? '#f1f5f9' : 'transparent',
                cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#475569',
                transition: 'background 0.15s',
              }}
              className="hover:bg-slate-100"
            >
              Features
              <ChevronDown
                size={14}
                style={{
                  transition: 'transform 0.2s',
                  transform: featuresOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  color: '#94a3b8',
                }}
              />
            </button>

            {featuresOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#fff', borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 8px 32px rgba(0,0,0,.12)',
                  padding: '8px', minWidth: 260, zIndex: 100,
                }}
              >
                {MODULES.map((m) => (
                  <Link
                    key={m.href}
                    to={m.href}
                    style={{ textDecoration: 'none' }}
                    onClick={() => setFeaturesOpen(false)}
                  >
                    <div
                      style={{
                        padding: '10px 12px', borderRadius: 8,
                        transition: 'background 0.12s',
                      }}
                      className="hover:bg-slate-50"
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{m.label}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{m.desc}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {isHome ? (
            <a
              href="#pricing"
              style={{
                padding: '6px 12px', borderRadius: 7, border: 'none',
                background: 'transparent', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, color: '#475569',
                textDecoration: 'none',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              Pricing
            </a>
          ) : (
            <Link
              to="/#pricing"
              style={{
                padding: '6px 12px', borderRadius: 7,
                fontSize: 14, fontWeight: 600, color: '#475569',
                textDecoration: 'none',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              Pricing
            </Link>
          )}

          {isHome ? (
            <a
              href="#how"
              style={{
                padding: '6px 12px', borderRadius: 7,
                fontSize: 14, fontWeight: 600, color: '#475569',
                textDecoration: 'none',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              How it works
            </a>
          ) : (
            <Link
              to="/#how"
              style={{
                padding: '6px 12px', borderRadius: 7,
                fontSize: 14, fontWeight: 600, color: '#475569',
                textDecoration: 'none',
              }}
              className="hover:bg-slate-100 transition-colors"
            >
              How it works
            </Link>
          )}
        </nav>

        {/* ── Desktop CTAs ── */}
        <div className="hidden md:flex items-center flex-shrink-0" style={{ gap: 8 }}>
          <Link
            to="/login"
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1.5px solid #1263d8', color: '#1263d8',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
              transition: 'background 0.15s',
            }}
            className="hover:bg-blue-50"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            style={{
              padding: '8px 18px', borderRadius: 8,
              background: '#7c3aed', color: '#fff',
              fontWeight: 700, fontSize: 14, textDecoration: 'none',
              boxShadow: '0 2px 10px rgba(249,115,22,.35)',
              transition: 'opacity 0.15s',
            }}
            className="hover:opacity-90"
          >
            Start free trial
          </Link>
        </div>

        {/* ── Mobile: Sign in button + hamburger ── */}
        <div className="md:hidden flex items-center" style={{ gap: 8 }}>
          <Link
            to="/login"
            className="border border-primary text-primary hover:bg-primary/10 transition-colors"
            style={{
              padding: '7px 14px', borderRadius: 8,
              fontWeight: 700, fontSize: 13, textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Sign in
          </Link>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: '1.5px solid #e2e8f0', background: '#fff',
              display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}
          >
            {mobileOpen ? <X size={18} color="#0f172a" /> : <Menu size={18} color="#0f172a" />}
          </button>
        </div>
      </div>

      {/* ── Mobile panel ── */}
      {mobileOpen && (
        <div
          className="md:hidden"
          style={{
            borderTop: '1px solid #e2e8f0',
            background: '#fff',
            padding: '16px 22px 24px',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Modules
            </p>
            {MODULES.map((m) => (
              <Link
                key={m.href}
                to={m.href}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0', borderBottom: '1px solid #f1f5f9',
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{m.label}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{m.desc}</span>
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {isHome ? (
              <a href="#pricing" style={{ fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
                Pricing
              </a>
            ) : (
              <Link to="/#pricing" style={{ fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
                Pricing
              </Link>
            )}
            {isHome ? (
              <a href="#how" style={{ fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
                How it works
              </a>
            ) : (
              <Link to="/#how" style={{ fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
                How it works
              </Link>
            )}
            <Link
              to="/login"
              style={{
                display: 'block', textAlign: 'center',
                padding: '12px', borderRadius: 9,
                border: '1.5px solid #1263d8', color: '#1263d8',
                fontWeight: 700, fontSize: 14, textDecoration: 'none',
              }}
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              style={{
                marginTop: 8,
                display: 'block', textAlign: 'center',
                padding: '12px', borderRadius: 9,
                background: '#7c3aed', color: '#fff',
                fontWeight: 700, fontSize: 14, textDecoration: 'none',
              }}
            >
              Start 30-day free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
