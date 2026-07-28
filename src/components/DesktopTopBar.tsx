/**
 * DesktopTopBar — Persistent desktop portal header bar.
 *
 * Fixed at the top on desktop (md+). Hidden on mobile.
 * Height: 56px. z-index: 1100.
 *
 * Layout:
 *   Left  — Logo + IWILLBUILD wordmark
 *   Centre — "Working" status pill (if present)
 *   Right — Teams | User name (→ /settings) | Logout | Notification bell
 */

import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Users, Terminal, Bot, CreditCard, HelpCircle } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { usePermissions } from '@/lib/usePermissions';
import { signOut } from '@/lib/auth/auth-client.tsx';

export const DESKTOP_TOPBAR_HEIGHT = 56;

const OWNER_EMAIL = 'darylwilliams1581@gmail.com';

export default function DesktopTopBar() {
  const { me } = usePermissions();
  const navigate = useNavigate();

  const displayName =
    me?.user?.name?.trim() ||
    me?.user?.email?.split('@')[0] ||
    '';

  // Dazza AI + Dev Console visible ONLY to this specific email
  const isOwnerEmail = me?.user?.email?.toLowerCase() === OWNER_EMAIL;

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // best-effort
    }
    navigate('/login');
  }

  return (
    <div
      className="hidden md:flex"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: DESKTOP_TOPBAR_HEIGHT,
        zIndex: 1100,
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 12,
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
      }}
    >
      {/* ── Left: logo + wordmark ── */}
      <Link
        to="/home"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        <img
          src="/assets/logo.png"
          alt="IWILLBUILD"
          style={{
            height: 32,
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
          }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            fontFamily: 'var(--font-heading, inherit)',
          }}
        >
          IWILLBUILD
        </span>
      </Link>

      {/* ── Right: nav links + user + logout + bell ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>

        {/* Dazza AI — specific owner email only */}
        {isOwnerEmail && (
          <Link
            to="/dazza-ai"
            title="Dazza AI"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
              color: '#64748b',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = '#f5f3ff';
              (e.currentTarget as HTMLElement).style.color = '#7c3aed';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#64748b';
            }}
          >
            <Bot size={15} />
            <span>Dazza AI</span>
          </Link>
        )}

        {/* Developer Console — specific owner email only */}
        {isOwnerEmail && (
          <Link
            to="/owner-console"
            title="Developer Console"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
              color: '#64748b',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = '#f0fdf4';
              (e.currentTarget as HTMLElement).style.color = '#16a34a';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#64748b';
            }}
          >
            <Terminal size={15} />
            <span>Dev Console</span>
          </Link>
        )}

        {/* Divider — only shown when owner links are visible */}
        {isOwnerEmail && (
          <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
        )}

        {/* Billing — icon only, compact */}
        <Link
          to="/billing"
          title="Billing"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 30,
            height: 30,
            borderRadius: 8,
            textDecoration: 'none',
            color: '#64748b',
            transition: 'background 0.15s, color 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
            (e.currentTarget as HTMLElement).style.color = '#0f172a';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = '#64748b';
          }}
        >
          <CreditCard size={15} />
        </Link>

        {/* Teams — beside Billing */}
        <Link
          to="/team"
          title="Team"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
            color: '#64748b',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
            (e.currentTarget as HTMLElement).style.color = '#0f172a';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = '#64748b';
          }}
        >
          <Users size={15} />
          <span>Teams</span>
        </Link>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

        {/* User name → settings */}
        {displayName && (
          <Link
            to="/settings"
            title="Account settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 10px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
              color: '#0f172a',
              transition: 'background 0.15s',
              maxWidth: 160,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            {/* Avatar circle */}
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                letterSpacing: '-0.02em',
              }}
            >
              {displayName.slice(0, 2).toUpperCase()}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </span>
          </Link>
        )}

        {/* Log out */}
        <button
          onClick={() => void handleSignOut()}
          title="Sign out"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: '#64748b',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = '#fef2f2';
            (e.currentTarget as HTMLElement).style.color = '#dc2626';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = '#64748b';
          }}
        >
          <LogOut size={14} />
          <span>Sign out</span>
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

        {/* Notification bell */}
        <NotificationBell collapsed={false} />

        {/* Help — far right, dark pill, bold to stand out */}
        <Link
          to="/help"
          title="Help & Support"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 11px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 800,
            color: '#ffffff',
            background: '#0f172a',
            marginLeft: 6,
            transition: 'background 0.15s',
            flexShrink: 0,
            letterSpacing: '-0.01em',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = '#1e293b';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = '#0f172a';
          }}
        >
          <HelpCircle size={14} />
          <span>Help</span>
        </Link>
      </div>
    </div>
  );
}
