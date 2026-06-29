import { useState, useEffect, useCallback } from 'react';

export interface UserProfile {
  id: number;
  userId: string;
  role: string;
  status: string;
  phone: string | null;
  companyId: number | null;
  permissions: {
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
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    invalidateMeCache();
    setLoading(true);
    const data = await fetchMe();
    setMe(data);
    setLoading(false);
  }, []);

  useEffect(() => {
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
  // Single call to useMe — callers should NOT call useMe() separately when they
  // already call usePermissions(), to avoid duplicate hook instances and
  // out-of-sync state between two independent useMe() state machines.
  const { me, loading } = useMe();

  const role = me?.profile?.role ?? null;

  const isOwner = role === 'owner';
  const isAdmin = isOwner || role === 'admin' || me?.profile?.permissions?.admin === true;

  return {
    loading,
    isOwner,
    isAdmin,
    role,
    // Expose me + user so callers can avoid a second useMe() call
    me,
    user: me?.user ?? null,
    company: me?.company ?? null,
    permissions: me?.profile?.permissions ?? null,
    can: (key: keyof NonNullable<UserProfile['permissions']>) => {
      if (!me?.profile) return false;
      // Owner always has everything
      if (isOwner) return true;
      // Admin (role or perm) always has everything
      if (isAdmin) return true;
      return me.profile.permissions?.[key] ?? false;
    },
  };
}
