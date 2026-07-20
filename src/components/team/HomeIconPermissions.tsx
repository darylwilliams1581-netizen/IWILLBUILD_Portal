/**
 * HomeIconPermissions — icon toggle grid shown inside a team member's expanded row.
 * Owner/admin can tick which home screen icons the employee can see.
 * Coming-soon icons are shown greyed and non-interactive.
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Lock, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALL_HOME_ICONS, GROUP_LABELS, DEFAULT_FIELD_KEYS,
  type HomeIconDef, type IconGroup,
} from '@/lib/homeIcons';

interface Props {
  /** userId of the team member being edited */
  memberId: string;
  /** Role of the member — owners/admins show a read-only message */
  memberRole: string;
  /** Whether the current viewer can edit (owner/admin) */
  canEdit: boolean;
}

const GROUP_ORDER: IconGroup[] = ['field', 'safety', 'tools', 'management', 'comingSoon'];

export default function HomeIconPermissions({ memberId, memberRole, canEdit }: Props) {
  const [allowedKeys, setAllowedKeys] = useState<Set<string>>(new Set(DEFAULT_FIELD_KEYS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load current permissions
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

  const toggle = useCallback((key: string, comingSoon?: boolean) => {
    if (!canEdit || comingSoon) return;
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

  // Owners/admins always have full access — not editable
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

  // Group icons
  const grouped = GROUP_ORDER.map(group => ({
    group,
    label: GROUP_LABELS[group],
    icons: ALL_HOME_ICONS.filter(i => i.group === group),
  })).filter(g => g.icons.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Home Screen Icons</p>
        {canEdit && dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>

      {grouped.map(({ group, label, icons }) => (
        <div key={group}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{label}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {icons.map(icon => (
              <IconToggle
                key={icon.key}
                icon={icon}
                enabled={allowedKeys.has(icon.key)}
                canEdit={canEdit && !icon.comingSoon}
                onToggle={() => toggle(icon.key, icon.comingSoon)}
              />
            ))}
          </div>
        </div>
      ))}

      {!canEdit && (
        <p className="text-xs text-muted-foreground mt-2">Only owners and admins can change icon permissions.</p>
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
  const isComingSoon = icon.comingSoon;

  return (
    <button
      onClick={onToggle}
      disabled={!canEdit}
      title={isComingSoon ? 'Coming soon' : icon.label}
      className={[
        'flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all text-center',
        isComingSoon
          ? 'border-dashed border-gray-200 opacity-40 cursor-not-allowed'
          : enabled
            ? 'border-orange-400 bg-orange-50 shadow-sm'
            : 'border-gray-200 bg-white hover:border-gray-300',
        canEdit && !isComingSoon ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      {/* Icon tile */}
      <div
        className={[
          'w-9 h-9 rounded-xl flex items-center justify-center relative',
          isComingSoon ? 'bg-gray-200' : icon.bg,
        ].join(' ')}
      >
        <Icon size={16} strokeWidth={1.9} className={isComingSoon ? 'text-gray-400' : icon.fg} />
        {/* Tick badge when enabled */}
        {enabled && !isComingSoon && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center shadow">
            <Check size={9} className="text-white" strokeWidth={3} />
          </span>
        )}
        {/* Lock badge for coming soon */}
        {isComingSoon && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center shadow">
            <Lock size={8} className="text-white" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <span className={[
        'text-[9px] font-semibold leading-tight max-w-[56px]',
        isComingSoon ? 'text-gray-400' : enabled ? 'text-orange-600' : 'text-gray-500',
      ].join(' ')}>
        {icon.label}
      </span>
    </button>
  );
}
