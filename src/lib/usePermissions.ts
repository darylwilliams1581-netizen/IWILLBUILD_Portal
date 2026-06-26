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
  };
}

export interface MeData {
  user: { id: string; name: string; email: string };
  profile: UserProfile | null;
  company: { id: number; name: string } | null;
}

let cachedMe: MeData | null = null;
let fetchPromise: Promise<MeData | null> | null = null;

async function fetchMe(): Promise<MeData | null> {
  if (cachedMe) return cachedMe;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/me', { credentials: 'include' })
    .then((r) => {
      if (!r.ok) return null;
      return r.json() as Promise<MeData>;
    })
    .then((data) => {
      cachedMe = data;
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
    fetchMe().then((data) => {
      setMe(data);
      setLoading(false);
    });
  }, []);

  return { me, loading, reload };
}

export function usePermissions() {
  const { me, loading } = useMe();

  const isAdmin =
    me?.profile?.role === 'admin' ||
    me?.profile?.role === 'owner' ||
    me?.profile?.permissions?.admin === true;

  return {
    loading,
    isAdmin,
    role: me?.profile?.role ?? null,
    permissions: me?.profile?.permissions ?? null,
    can: (key: keyof NonNullable<UserProfile['permissions']>) => {
      if (!me?.profile) return false;
      if (isAdmin) return true;
      return me.profile.permissions?.[key] ?? false;
    },
  };
}
