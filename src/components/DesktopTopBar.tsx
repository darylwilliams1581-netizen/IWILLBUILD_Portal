/**
 * DesktopTopBar — Persistent desktop portal header bar.
 *
 * Fixed at the top on desktop (md+). Hidden on mobile.
 * Height: 56px. z-index: 1100.
 *
 * Layout (inspired by reference screenshot):
 *   Left  — Date line + "Good [time], [Name]" greeting
 *   Right — [Dazza AI] [Dev Console] [Team] [Billing] (owner/admin) | 🔔 | Avatar | Sign out | Help
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Terminal, Bot, HelpCircle, UserCircle, CreditCard } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { usePermissions } from '@/lib/usePermissions';
import { signOut } from '@/lib/auth/auth-client.tsx';

export const DESKTOP_TOPBAR_HEIGHT = 56;

const OWNER_EMAIL = 'darylwilliams1581@gmail.com';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function getGreeting(name: string): { eyebrow: string; headline: string } {
  const now = new Date();
  const hour = now.getHours();
  const day = DAYS[now.getDay()];
  const date = now.getDate();
  const month = MONTHS[now.getMonth()];
  const eyebrow = `${day} ${date} ${month}`.toUpperCase();
  const period = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const headline = name ? `${period}, ${name}` : period;
  return { eyebrow, headline };
}

export default function DesktopTopBar() {
  const { me, isAdmin, isOwner, isPlatformOwner, loading: permsLoading } = usePermissions();
  const navigate = useNavigate();

  const firstName =
    me?.user?.name?.trim().split(' ')[0] ||
    me?.user?.email?.split('@')[0] ||
    '';

  const displayName =
    me?.user?.name?.trim() ||
    me?.user?.email?.split('@')[0] ||
    '';

  const isOwnerEmail = me?.user?.email?.toLowerCase() === OWNER_EMAIL;
  const canSeeAdmin = !permsLoading && (isAdmin || isOwner || isPlatformOwner);

  const { eyebrow, headline } = getGreeting(firstName);

  async function handleSignOut() {
    try { await signOut(); } catch { /* best-effort */ }
    navigate('/login');
  }

  // Icon button style — sits on dark background
  const iconBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 10,
    border: 'none',
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.75)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s, color 0.15s',
    textDecoration: 'none',
  };

  // Pill text link style — for owner tools
  const pillLink: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 10px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    transition: 'background 0.15s, color 0.15s',
    flexShrink: 0,
    cursor: 'pointer',
  };

  const divider = (
    <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', margin: '0 6px', flexShrink: 0 }} />
  );

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
        paddingLeft: 20,
        paddingRight: 14,
        background: 'linear-gradient(90deg, #1e1b4b 0%, #2e1065 50%, #3b0764 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 2px 8px rgba(109,40,217,0.20)',
      }}
    >
      {/* ── Left: date + greeting ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.45)',
          lineHeight: 1,
          fontFamily: 'var(--font-heading, inherit)',
        }}>
          {eyebrow}
        </span>
        <span style={{
          fontSize: 17,
          fontWeight: 800,
          color: '#ffffff',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          fontFamily: 'var(--font-heading, inherit)',
        }}>
          {headline}
        </span>
      </div>

      {/* ── Right ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>

        {/* Owner-only tools */}
        {isOwnerEmail && (
          <>
            <Link
              to="/dazza-ai"
              title="Dazza AI"
              style={pillLink}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.35)'; (e.currentTarget as HTMLElement).style.color = '#c4b5fd'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
            >
              <Bot size={13} /><span>Dazza AI</span>
            </Link>
            <Link
              to="/owner-console"
              title="Dev Console"
              style={pillLink}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(22,163,74,0.25)'; (e.currentTarget as HTMLElement).style.color = '#86efac'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
            >
              <Terminal size={13} /><span>Dev Console</span>
            </Link>
            {divider}
          </>
        )}

        {/* Admin tools */}
        {canSeeAdmin && (
          <>
            <Link
              to="/team"
              title="Team"
              style={pillLink}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLElement).style.color = '#ffffff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
            >
              <UserCircle size={13} /><span>Team</span>
            </Link>
            <Link
              to="/billing"
              title="Billing"
              style={pillLink}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLElement).style.color = '#ffffff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
            >
              <CreditCard size={13} /><span>Billing</span>
            </Link>
            {divider}
          </>
        )}

        {/* Notification bell */}
        <NotificationBell collapsed={false} onTopBar={false} />

        {/* Avatar → settings */}
        <Link
          to="/settings"
          title={displayName || 'Account settings'}
          style={iconBtn}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = '#ffffff'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; }}
        >
          {displayName ? (
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: '#fff', fontSize: 9, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '-0.02em', flexShrink: 0,
            }}>
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          ) : (
            <UserCircle size={16} />
          )}
        </Link>

        {/* Sign out */}
        <button
          onClick={() => void handleSignOut()}
          title="Sign out"
          style={iconBtn}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,0.25)'; (e.currentTarget as HTMLElement).style.color = '#fca5a5'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; }}
        >
          <LogOut size={15} />
        </button>

        {/* Help — accent pill */}
        <Link
          to="/help"
          title="Help & Support"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 13px', borderRadius: 9, textDecoration: 'none',
            fontSize: 12, fontWeight: 800, color: '#ffffff',
            background: '#7c3aed',
            border: '1px solid rgba(167,139,250,0.4)',
            transition: 'background 0.15s', flexShrink: 0,
            letterSpacing: '-0.01em',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#6d28d9'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#7c3aed'; }}
        >
          <HelpCircle size={13} /><span>Help</span>
        </Link>
      </div>
    </div>
  );
}
