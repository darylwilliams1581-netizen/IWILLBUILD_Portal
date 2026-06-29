/**
 * useTerminology()
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns the company's configured work-module labels.
 * Falls back to "Job / Jobs" while loading or on error.
 *
 * Usage:
 *   const { workSingular, workPlural, addWorkLabel } = useTerminology();
 *   // workSingular → "Job" | "Project" | "Site" | "Store" | "Station" | "Work Order" | custom
 *   // workPlural   → "Jobs" | "Projects" | "Sites" | "Stores" | "Stations" | "Work Orders" | custom
 *   // addWorkLabel → "Add Job" | "Add Project" | etc.
 */
import { useState, useEffect } from 'react';

interface TerminologyResult {
  workSingular: string;
  workPlural:   string;
  addWorkLabel: string;
  loading:      boolean;
}

let _cache: { singular: string; plural: string } | null = null;
let _promise: Promise<{ singular: string; plural: string }> | null = null;

async function fetchTerminology(): Promise<{ singular: string; plural: string }> {
  if (_cache) return _cache;
  if (_promise) return _promise;
  _promise = fetch('/api/settings/terminology', { credentials: 'include' })
    .then((r) => r.ok ? r.json() as Promise<{ singular: string; plural: string }> : { singular: 'Job', plural: 'Jobs' })
    .then((d) => {
      _cache = d;
      return d;
    })
    .catch(() => ({ singular: 'Job', plural: 'Jobs' }));
  return _promise;
}

/** Call this after saving new terminology to force a re-fetch on next use. */
export function invalidateTerminologyCache() {
  _cache = null;
  _promise = null;
}

export function useTerminology(): TerminologyResult {
  const [singular, setSingular] = useState(_cache?.singular ?? 'Job');
  const [plural,   setPlural]   = useState(_cache?.plural   ?? 'Jobs');
  const [loading,  setLoading]  = useState(!_cache);

  useEffect(() => {
    if (_cache) {
      setSingular(_cache.singular);
      setPlural(_cache.plural);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchTerminology().then((d) => {
      if (!cancelled) {
        setSingular(d.singular);
        setPlural(d.plural);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return {
    workSingular: singular,
    workPlural:   plural,
    addWorkLabel: `Add ${singular}`,
    loading,
  };
}
