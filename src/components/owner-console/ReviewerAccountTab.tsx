/**
 * ReviewerAccountTab
 *
 * Owner Console tab for inspecting and repairing the Apple reviewer account
 * (support@iwillbuild.com). Triggers a standard password-reset email so the
 * reviewer sets their own password through the normal flow.
 *
 * No passwords are displayed, stored, or transmitted here.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Wrench, Mail, Briefcase,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewerStatus {
  exists: boolean;
  email: string;
  name?: string;
  createdAt?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  sms2faEnabled?: boolean;
  hasCredential?: boolean;
  profile?: {
    role: string;
    mustChangePassword: boolean;
    companyId: number;
    companyName: string;
    plan: string;
    subscriptionStatus: string;
    cancelAtPeriodEnd: boolean;
    starterPackLoaded: boolean;
  } | null;
  jobCount?: number;
  issues: string[];
  healthy: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-foreground/70">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground font-mono">{value}</span>
        {ok
          ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReviewerAccountTab() {
  const [status, setStatus] = useState<ReviewerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<{ ok: boolean; repairs: string[]; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed demo job state
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ ok: boolean; log: string[]; message: string } | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRepairResult(null);
    try {
      const res = await fetch('/api/developer/reviewer-account-status');
      const data = await res.json() as ReviewerStatus & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const runRepair = useCallback(async () => {
    setRepairing(true);
    setError(null);
    setRepairResult(null);
    try {
      const res = await fetch('/api/developer/reviewer-account-repair', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; repairs?: string[]; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRepairResult({ ok: true, repairs: data.repairs ?? [], message: data.message ?? '' });
      // Refresh status after repair
      await fetchStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setRepairing(false);
    }
  }, [fetchStatus]);

  const runSeedJob = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    setSeedResult(null);
    try {
      const res = await fetch('/api/developer/seed-review-job', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; log?: string[]; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSeedResult({ ok: true, log: data.log ?? [], message: data.message ?? '' });
      // Refresh status so job count updates
      await fetchStatus();
    } catch (e) {
      setSeedError(String(e));
    } finally {
      setSeeding(false);
    }
  }, [fetchStatus]);

  const p = status?.profile;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">Apple Reviewer Account</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect and repair <span className="font-mono text-foreground/80">support@iwillbuild.com</span>.
          Repair sends a standard password-reset email — no password is stored or displayed here.
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Checking…' : 'Check Status'}
        </Button>

        {status?.exists && (
          <Button
            size="sm"
            onClick={runRepair}
            disabled={repairing || loading}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            {repairing
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Repairing…</>
              : <><Wrench className="w-4 h-4" /> Repair &amp; Send Reset Email</>}
          </Button>
        )}

        {status?.exists && (
          <Button
            size="sm"
            variant="outline"
            onClick={runSeedJob}
            disabled={seeding || loading}
            className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            {seeding
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Seeding…</>
              : <><Briefcase className="w-4 h-4" /> Seed Demo Job</>}
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Repair result */}
      {repairResult && (
        <Alert className="border-green-300 bg-green-50">
          <Mail className="w-4 h-4 text-green-600" />
          <AlertDescription className="space-y-2">
            <p className="text-green-800 font-medium">{repairResult.message}</p>
            <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
              {repairResult.repairs.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Seed demo job result */}
      {seedResult && (
        <Alert className="border-emerald-300 bg-emerald-50">
          <Briefcase className="w-4 h-4 text-emerald-600" />
          <AlertDescription className="space-y-2">
            <p className="text-emerald-800 font-medium">{seedResult.message}</p>
            <ul className="text-sm text-emerald-700 space-y-1 list-disc list-inside">
              {seedResult.log.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {seedError && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{seedError}</AlertDescription>
        </Alert>
      )}

      {/* Status panel */}
      {status && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Overall health badge */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <span className="text-sm font-medium text-foreground">Account health</span>
            {status.healthy
              ? <Badge className="bg-green-100 text-green-700 border-green-300">Healthy</Badge>
              : <Badge className="bg-red-100 text-red-700 border-red-300">{status.issues.length} issue{status.issues.length !== 1 ? 's' : ''}</Badge>}
          </div>

          {!status.exists ? (
            <div className="px-4 py-6 text-center text-muted-foreground text-sm">
              Account does not exist. Use the provision endpoint to create it first.
            </div>
          ) : (
            <div className="px-4 py-2">
              <StatusRow label="Email" ok={true} value={status.email} />
              <StatusRow label="Name" ok={true} value={status.name ?? '—'} />
              <StatusRow label="Email verified" ok={!!status.emailVerified} value={status.emailVerified ? 'Yes' : 'No'} />
              <StatusRow label="2FA enabled" ok={!status.twoFactorEnabled} value={status.twoFactorEnabled ? 'Yes ⚠' : 'No'} />
              <StatusRow label="SMS 2FA enabled" ok={!status.sms2faEnabled} value={status.sms2faEnabled ? 'Yes ⚠' : 'No'} />
              <StatusRow label="Credential row" ok={!!status.hasCredential} value={status.hasCredential ? 'Present' : 'Missing'} />
              {p && <>
                <StatusRow label="Role" ok={p.role === 'admin'} value={p.role} />
                <StatusRow label="Must change password" ok={!p.mustChangePassword} value={p.mustChangePassword ? 'Yes ⚠' : 'No'} />
                <StatusRow label="Company" ok={true} value={p.companyName} />
                <StatusRow label="Plan" ok={p.plan === 'team'} value={p.plan} />
                <StatusRow label="Subscription status" ok={p.subscriptionStatus === 'active'} value={p.subscriptionStatus} />
                <StatusRow label="Cancel at period end" ok={!p.cancelAtPeriodEnd} value={p.cancelAtPeriodEnd ? 'Yes ⚠' : 'No'} />
                <StatusRow label="Starter pack loaded" ok={p.starterPackLoaded} value={p.starterPackLoaded ? 'Yes' : 'No'} />
              </>}
              {!p && (
                <StatusRow label="Profile / company" ok={false} value="Missing" />
              )}
              <StatusRow label="Sample jobs" ok={(status.jobCount ?? 0) > 0} value={String(status.jobCount ?? 0)} />
            </div>
          )}

          {/* Issues list */}
          {status.issues.length > 0 && (
            <div className="px-4 py-3 border-t border-border bg-red-50 space-y-1">
              {status.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground/80">How to restore reviewer access</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Click <strong className="text-foreground/80">Check Status</strong> to inspect the account.</li>
          <li>If issues are shown, click <strong className="text-foreground/80">Repair &amp; Send Reset Email</strong>.</li>
          <li>The reviewer receives a password-reset email at <span className="font-mono">support@iwillbuild.com</span>.</li>
          <li>They follow the link and set their own password.</li>
          <li>They log in at <span className="font-mono">https://iwillbuild.com/login</span>.</li>
        </ol>
      </div>
    </div>
  );
}
