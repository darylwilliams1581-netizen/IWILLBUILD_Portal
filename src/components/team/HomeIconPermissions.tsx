/**
 * HomeIconPermissions — icon toggle grid shown inside a team member's edit modal.
 * Owner/admin can toggle which home screen icons the member can see.
 * Only live icons are shown — coming-soon excluded.
 * Certain icons are locked per role and cannot be turned off.
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Lock, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALL_HOME_ICONS, GROUP_LABELS, DEFAULT_FIELD_KEYS,
  type HomeIconDef, type IconGroup,
} from '@/lib/homeIcons';

interface Props {
  memberId: string;
  memberRole: string;
  canEdit: boolean;
}

// Icons that are always-on and cannot be toggled off, keyed by role
const ROLE_LOCKED_KEYS: Record<string, string[]> = {
  owner:          ['settings', 'billing', 'team', 'profile'],
  admin:          ['settings', 'billing', 'team', 'profile'],
  platform_owner: ['settings', 'billing', 'team', 'dazza_ai', 'profile'],
  developer:      ['settings', 'billing', 'team', 'dazza_ai', 'profile'],
};

// dazza_ai is shown only for platform_owner / developer — hidden for everyone else
const HIDDEN_KEYS_DEFAULT = new Set(['dazza_ai']);

const GROUP_ORDER: IconGroup[] = ['field', 'files', 'fleet', 'finance', 'safety', 'management'];

function getLockedKeys(role: string): Set<string> {
  return new Set(ROLE_LOCKED_KEYS[role] ?? []);
}

function showDazzaAi(role: string): boolean {
  return role === 'platform_owner' || role === 'developer';
}

export default function HomeIconPermissions({ memberId, memberRole, canEdit }: Props) {
  const [allowedKeys, setAllowedKeys] = useState<Set<string>>(new Set(DEFAULT_FIELD_KEYS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const lockedKeys = getLockedKeys(memberRole);
  const isOwnerOrAdmin = ['owner', 'admin', 'platform_owner', 'developer'].includes(memberRole);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/team/members/${memberId}/icon-permissions`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { allowedKeys?: string[] | null } | null) => {
        if (isOwnerOrAdmin) {
          // Owners/admins always have all icons — show all as on
          const allLive = ALL_HOME_ICONS.filter(i => !i.comingSoon).map(i => i.key);
          setAllowedKeys(new Set(allLive));
        } else if (data?.allowedKeys && data.allowedKeys.length > 0) {
          // Always include locked keys even if not in stored permissions
          const keys = new Set(data.allowedKeys);
          lockedKeys.forEach(k => keys.add(k));
          setAllowedKeys(keys);
        } else {
          const defaults = new Set(DEFAULT_FIELD_KEYS);
          lockedKeys.forEach(k => defaults.add(k));
          setAllowedKeys(defaults);
        }
      })
      .catch(() => {
        const defaults = new Set(DEFAULT_FIELD_KEYS);
        lockedKeys.forEach(k => defaults.add(k));
        setAllowedKeys(defaults);
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, memberRole]);

  const toggle = useCallback((key: string) => {
    if (!canEdit || lockedKeys.has(key) || isOwnerOrAdmin) return;
    setAllowedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, memberRole]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/team/members/${memberId}/icon-permissions`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedKeys: Array.from(allowedKeys) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? 'Failed to save');
      }
      setDirty(false);
      toast.success('Home screen permissions saved');
    } catch (e) {
      toast.error(String((e as Error).message ?? 'Failed to save permissions'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        <span>Loading permissions…</span>
      </div>
    );
  }

  const isAdminRole = memberRole === 'owner' || memberRole === 'admin' || memberRole === 'platform_owner';
  const isOwnerRole = memberRole === 'owner' || memberRole === 'platform_owner';

  // Build grouped icon list — live icons only, filter role-gated icons appropriately
  const grouped = GROUP_ORDER.map(group => ({
    group,
    label: GROUP_LABELS[group],
    icons: ALL_HOME_ICONS.filter(i => {
      if (i.group !== group) return false;
      if (i.comingSoon) return false;
      // ownerOnly icons: only show in grid for owner/platform_owner members
      if (i.ownerOnly && !isOwnerRole) return false;
      // adminOnly icons: only show in grid for admin/owner members
      if (i.adminOnly && !isAdminRole) return false;
      // dazza_ai legacy hidden-key check
      if (HIDDEN_KEYS_DEFAULT.has(i.key) && !showDazzaAi(memberRole)) return false;
      return true;
    }),
  })).filter(g => g.icons.length > 0);

  const totalIcons = grouped.reduce((n, g) => n + g.icons.length, 0);
  const enabledCount = grouped.reduce((n, g) => n + g.icons.filter(i => allowedKeys.has(i.key)).length, 0);

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-600">Home Screen Icons</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {enabledCount} of {totalIcons} icons enabled
            {isOwnerOrAdmin && <span className="ml-1 text-amber-500 font-semibold">· Full access (role)</span>}
          </p>
        </div>
        {canEdit && !isOwnerOrAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const allKeys = grouped.flatMap(g => g.icons.map(i => i.key));
                setAllowedKeys(new Set(allKeys));
                setDirty(true);
              }}
              className="text-[11px] text-slate-500 hover:text-violet-700 underline underline-offset-2 transition-colors"
            >
              All on
            </button>
            <span className="text-slate-300 text-xs">|</span>
            <button
              onClick={() => {
                const next = new Set(lockedKeys); // keep locked keys on
                setAllowedKeys(next);
                setDirty(true);
              }}
              className="text-[11px] text-slate-500 hover:text-violet-700 underline underline-offset-2 transition-colors"
            >
              All off
            </button>
            {dirty && (
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-700 text-white text-xs font-semibold transition-colors disabled:opacity-60 ml-1"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Icon groups */}
      {grouped.map(({ group, label, icons }) => (
        <div key={group}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{label}</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2">
            {icons.map(icon => (
              <IconToggle
                key={icon.key}
                icon={icon}
                enabled={allowedKeys.has(icon.key)}
                locked={lockedKeys.has(icon.key) || isOwnerOrAdmin}
                canEdit={canEdit && !isOwnerOrAdmin}
                onToggle={() => toggle(icon.key)}
              />
            ))}
          </div>
        </div>
      ))}

      {isOwnerOrAdmin && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
          <Lock size={11} />
          This role always has full access — icons cannot be restricted.
        </p>
      )}
      {!canEdit && !isOwnerOrAdmin && (
        <p className="text-xs text-muted-foreground">Only owners and admins can change icon permissions.</p>
      )}
    </div>
  );
}

// ── Single icon toggle tile ───────────────────────────────────────────────────

function IconToggle({
  icon, enabled, locked, canEdit, onToggle,
}: {
  icon: HomeIconDef;
  enabled: boolean;
  locked: boolean;
  canEdit: boolean;
  onToggle: () => void;
}) {
  const Icon = icon.icon;
  const interactive = canEdit && !locked;

  return (
    <button
      onClick={onToggle}
      disabled={!interactive}
      title={locked ? `${icon.label} — locked for this role` : icon.label}
      className={[
        'flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all text-center',
        locked
          ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
          : enabled
            ? 'border-violet-400 bg-violet-50 shadow-sm cursor-pointer'
            : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer',
      ].join(' ')}
    >
      <div className={['w-9 h-9 rounded-xl flex items-center justify-center relative', locked ? 'bg-slate-200' : icon.bg].join(' ')}>
        <Icon size={16} strokeWidth={1.9} className={locked ? 'text-slate-400' : icon.fg} />
        {locked ? (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-slate-400 rounded-full flex items-center justify-center shadow">
            <Lock size={8} className="text-white" strokeWidth={2.5} />
          </span>
        ) : enabled ? (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center shadow">
            <Check size={9} className="text-white" strokeWidth={3} />
          </span>
        ) : null}
      </div>
      <span className={[
        'text-[9px] font-semibold leading-tight max-w-[56px]',
        locked ? 'text-slate-400' : enabled ? 'text-violet-700' : 'text-gray-500',
      ].join(' ')}>
        {icon.label}
      </span>
    </button>
  );
}
