import { useState, useEffect, useCallback } from 'react';

export interface UserProfile {
  id: number;
  userId: string;
  role: string;
  status: string;
  phone: string | null;
  companyId: number | null;
  // Raw perm fields as returned by /api/me (flat on the profile object)
  permJobs:          boolean | null;
  permFleet:         boolean | null;
  permForms:         boolean | null;
  permFiles:         boolean | null;
  permEstimating:    boolean | null;
  permDazzaAi:       boolean | null;
  permAdmin:         boolean | null;
  permSeeDollars:    boolean | null;
  permInviteUsers:   boolean | null;
  permDeleteRecords: boolean | null;
  permInvoices:      boolean | null;
  // Legacy nested shape — kept for backward compat but may be absent
  permissions?: {
    jobs: boolean;
    fleet: boolean;
    forms: boolean;
    files: boolean;
    estimating: boolean;
    dazzaAi: boolean;
    admin: boolean;
    seeDollars: boolean;
    inviteUsers: boolean;
    deleteRecords: boolean;
    invoices: boolean;
  };
}

/** Normalise the flat perm_* fields into a consistent permissions map. */
function resolvePermissions(profile: UserProfile) {
  // If the legacy nested shape is present, use it directly
  if (profile.permissions) return profile.permissions;
  // Otherwise map the flat perm* fields
  return {
    jobs:          profile.permJobs          ?? true,
    fleet:         profile.permFleet         ?? true,
    forms:         profile.permForms         ?? true,
    files:         profile.permFiles         ?? true,
    estimating:    profile.permEstimating    ?? true,
    dazzaAi:       profile.permDazzaAi       ?? true,
    admin:         profile.permAdmin         ?? false,
    seeDollars:    profile.permSeeDollars    ?? true,
    inviteUsers:   profile.permInviteUsers   ?? false,
    deleteRecords: profile.permDeleteRecords ?? false,
    invoices:      profile.permInvoices      ?? true,
  };
}

export interface MeData {
  user: { id: string; name: string; email: string };
  profile: UserProfile | null;
  company: { id: number; name: string } | null;
}

let cachedMe: MeData | null = null;
let fetchPromise: Promise<MeData | null> | null = null;
// Track the session user id so we can bust the cache on user switch
let cachedUserId: string | null = null;

async function fetchMe(forceUserId?: string): Promise<MeData | null> {
  // Bust cache if the session user has changed (e.g. logged in as different account)
  if (forceUserId && cachedUserId && forceUserId !== cachedUserId) {
    cachedMe = null;
    fetchPromise = null;
    cachedUserId = null;
  }
  if (cachedMe) return cachedMe;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/me', { credentials: 'include' })
    .then((r) => {
      if (!r.ok) return null;
      return r.json() as Promise<MeData>;
    })
    .then((data) => {
      cachedMe = data;
      cachedUserId = data?.user?.id ?? null;
      fetchPromise = null;
      return data;
    })
    .catch(() => {
      fetchPromise = null;
      return null;
    });

  return fetchPromise;
}

export function invalidateMeCache() {
  cachedMe = null;
  fetchPromise = null;
  cachedUserId = null;
}

export function useMe() {
  // Seed from module-level cache immediately — if /api/me was already fetched
  // (e.g. by a sibling component), start with the cached value so loading is
  // false from the very first render and there is no flicker.
  const [me, setMe] = useState<MeData | null>(() => cachedMe);
  const [loading, setLoading] = useState(() => cachedMe === null);

  const reload = useCallback(async () => {
    invalidateMeCache();
    setLoading(true);
    const data = await fetchMe();
    setMe(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // If we already have cached data, no need to fetch again
    if (cachedMe) {
      setMe(cachedMe);
      setLoading(false);
      return;
    }
    // Initial load
    fetchMe().then((data) => {
      setMe(data);
      setLoading(false);
    });

    // Re-fetch on window focus — catches login in another tab or session switch
    const onFocus = () => {
      invalidateMeCache();
      fetchMe().then((data) => setMe(data));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return { me, loading, reload };
}

export function usePermissions() {
  const { me, loading } = useMe();

  const role = me?.profile?.role ?? null;

  const isOwner = role === 'owner';
  const isAdmin = isOwner || role === 'admin' || (me?.profile ? resolvePermissions(me.profile).admin : false);

  const perms = me?.profile ? resolvePermissions(me.profile) : null;

  return {
    loading,
    isOwner,
    isAdmin,
    role,
    me,
    user: me?.user ?? null,
    company: me?.company ?? null,
    permissions: perms,
    can: (key: keyof NonNullable<UserProfile['permissions']>) => {
      if (!me?.profile) return false;
      // Owner always has everything
      if (isOwner) return true;
      // Admin (role or perm) always has everything
      if (isAdmin) return true;
      return perms?.[key] ?? false;
    },
  };
}
