/**
 * HomeIconPermissions — icon toggle grid shown inside a team member's edit modal.
 * Owner/admin can toggle which home screen icons the member can see.
 * Only live icons are shown — coming-soon and dazza_ai are excluded.
 * Owners/admins being edited show a read-only note (they always have full access).
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Lock, Check } from 'lucide-react';
// Lock is used for the owner/admin read-only message
import { toast } from 'sonner';
import {
  ALL_HOME_ICONS, GROUP_LABELS, DEFAULT_FIELD_KEYS,
  type HomeIconDef, type IconGroup,
} from '@/lib/homeIcons';

interface Props {
  /** userId of the team member being edited */
  memberId: string;
  /** Role of the member being edited */
  memberRole: string;
  /** Whether the current viewer can edit (owner/admin) */
  canEdit: boolean;
}

// Keys excluded from the permissions grid — always-on system icons
const EXCLUDED_KEYS = new Set(['dazza_ai']);

// Only show these groups in the permissions grid
const GROUP_ORDER: IconGroup[] = ['field', 'safety', 'tools', 'management'];

export default function HomeIconPermissions({ memberId, memberRole, canEdit }: Props) {
  const [allowedKeys, setAllowedKeys] = useState<Set<string>>(new Set(DEFAULT_FIELD_KEYS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load current permissions for this member
  useEffect(() => {
    setLoading(true);
    fetch(`/api/team/members/${memberId}/icon-permissions`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { allowedKeys?: string[] | null } | null) => {
        if (data?.allowedKeys && data.allowedKeys.length > 0) {
          setAllowedKeys(new Set(data.allowedKeys));
        } else {
          setAllowedKeys(new Set(DEFAULT_FIELD_KEYS));
        }
      })
      .catch(() => setAllowedKeys(new Set(DEFAULT_FIELD_KEYS)))
      .finally(() => setLoading(false));
  }, [memberId]);

  const toggle = useCallback((key: string) => {
    if (!canEdit) return;
    setAllowedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  }, [canEdit]);

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

  // Member being edited is an owner/admin — they always have full access
  if (['owner', 'admin', 'platform_owner'].includes(memberRole)) {
    return (
      <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-3 text-sm text-orange-700 flex items-center gap-2">
        <Lock size={14} className="shrink-0" />
        <span>Owners and admins always have full access to all home screen icons.</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        <span>Loading permissions…</span>
      </div>
    );
  }

  // Build grouped icon list — live icons only, no coming-soon, no excluded keys
  const grouped = GROUP_ORDER.map(group => ({
    group,
    label: GROUP_LABELS[group],
    icons: ALL_HOME_ICONS.filter(i =>
      i.group === group &&
      !i.comingSoon &&
      !EXCLUDED_KEYS.has(i.key)
    ),
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
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => {
                  const allKeys = grouped.flatMap(g => g.icons.map(i => i.key));
                  setAllowedKeys(new Set(allKeys));
                  setDirty(true);
                }}
                className="text-[11px] text-slate-500 hover:text-orange-600 underline underline-offset-2 transition-colors"
              >
                All on
              </button>
              <span className="text-slate-300 text-xs">|</span>
              <button
                onClick={() => {
                  setAllowedKeys(new Set());
                  setDirty(true);
                }}
                className="text-[11px] text-slate-500 hover:text-orange-600 underline underline-offset-2 transition-colors"
              >
                All off
              </button>
            </>
          )}
          {canEdit && dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors disabled:opacity-60 ml-1"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
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
                canEdit={canEdit}
                onToggle={() => toggle(icon.key)}
              />
            ))}
          </div>
        </div>
      ))}

      {!canEdit && (
        <p className="text-xs text-muted-foreground">Only owners and admins can change icon permissions.</p>
      )}
    </div>
  );
}

// ── Single icon toggle tile ───────────────────────────────────────────────────

function IconToggle({
  icon, enabled, canEdit, onToggle,
}: {
  icon: HomeIconDef;
  enabled: boolean;
  canEdit: boolean;
  onToggle: () => void;
}) {
  const Icon = icon.icon;

  return (
    <button
      onClick={onToggle}
      disabled={!canEdit}
      title={icon.label}
      className={[
        'flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all text-center',
        enabled
          ? 'border-orange-400 bg-orange-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300',
        canEdit ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      <div className={['w-9 h-9 rounded-xl flex items-center justify-center relative', icon.bg].join(' ')}>
        <Icon size={16} strokeWidth={1.9} className={icon.fg} />
        {enabled && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center shadow">
            <Check size={9} className="text-white" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className={[
        'text-[9px] font-semibold leading-tight max-w-[56px]',
        enabled ? 'text-orange-600' : 'text-gray-500',
      ].join(' ')}>
        {icon.label}
      </span>
    </button>
  );
}
