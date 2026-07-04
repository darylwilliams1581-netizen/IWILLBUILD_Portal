/**
 * AccountingSmokeTestTab — Owner Console → Accounting Smoke Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * Gate C validation panel. Tests Xero, MYOB and QBO OAuth status and invoice
 * sync readiness across all connected companies.
 *
 * For each provider:
 *  1. Checks platform credentials configured (client ID / secret set)
 *  2. Lists all companies with an active connection
 *  3. Allows triggering a test invoice sync against a selected company
 *  4. Shows pass/fail result with error detail
 */
import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, CheckCircle2, XCircle, Loader2, AlertCircle,
  ChevronDown, ChevronRight, ExternalLink, Zap, Building2,
  Link2, Unplug,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderStatus {
  connected: boolean;
  platformReady: boolean;
  tenantName?: string;
  companyName?: string;
  companyFileId?: string;
  realmId?: string;
  connectedAt?: string;
  expiresAt?: string;
}

interface CompanyConnection {
  companyId: number;
  companyName: string;
  status: ProviderStatus | null;
  loading: boolean;
  syncResult: { ok: boolean; message: string } | null;
  syncing: boolean;
  expanded: boolean;
}

type Provider = 'xero' | 'myob' | 'qbo';

const PROVIDER_META: Record<Provider, { label: string; color: string; bg: string; docsUrl: string }> = {
  xero: {
    label: 'Xero',
    color: '#1AB4D7',
    bg: '#E8F8FC',
    docsUrl: 'https://developer.xero.com/documentation/getting-started-guide/',
  },
  myob: {
    label: 'MYOB',
    color: '#7B2D8B',
    bg: '#F5EEF8',
    docsUrl: 'https://developer.myob.com/api/myob-business-api/v2/',
  },
  qbo: {
    label: 'QuickBooks Online',
    color: '#2CA01C',
    bg: '#EBF7EA',
    docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs/get-started',
  },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
        background: ok ? '#dcfce7' : '#fee2e2',
        color: ok ? '#166534' : '#991b1b',
      }}
    >
      {ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

function ProviderCard({
  provider,
  companies,
  onRefreshCompany,
  onSyncTest,
  onToggleExpand,
}: {
  provider: Provider;
  companies: CompanyConnection[];
  onRefreshCompany: (provider: Provider, companyId: number) => void;
  onSyncTest: (provider: Provider, companyId: number) => void;
  onToggleExpand: (provider: Provider, companyId: number) => void;
}) {
  const meta = PROVIDER_META[provider];
  const connected = companies.filter((c) => c.status?.connected);
  const platformReady = companies.some((c) => c.status?.platformReady);

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: meta.bg,
          borderBottom: `2px solid ${meta.color}22`,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: meta.color, display: 'grid', placeItems: 'center',
              color: '#fff', fontWeight: 900, fontSize: 11,
            }}
          >
            {meta.label.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>{meta.label}</p>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              {connected.length} of {companies.length} companies connected
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge ok={platformReady} label={platformReady ? 'Credentials set' : 'No credentials'} />
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, textDecoration: 'none' }}
          >
            <ExternalLink size={12} />
            Docs
          </a>
        </div>
      </div>

      {/* Company rows */}
      {companies.length === 0 ? (
        <div style={{ padding: '20px 18px', color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
          No companies found
        </div>
      ) : (
        <div>
          {companies.map((c) => (
            <div key={c.companyId} style={{ borderBottom: '1px solid #f1f5f9' }}>
              {/* Row header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 18px', cursor: 'pointer',
                  background: c.expanded ? '#f8fafc' : '#fff',
                }}
                onClick={() => onToggleExpand(provider, c.companyId)}
              >
                {c.expanded ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                <Building2 size={14} color="#64748b" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1 }}>{c.companyName}</span>
                {c.loading ? (
                  <Loader2 size={13} className="animate-spin" color="#94a3b8" />
                ) : c.status ? (
                  <StatusBadge ok={c.status.connected} label={c.status.connected ? 'Connected' : 'Not connected'} />
                ) : (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
                )}
              </div>

              {/* Expanded detail */}
              {c.expanded && (
                <div style={{ padding: '12px 18px 16px 42px', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                  {c.loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12 }}>
                      <Loader2 size={13} className="animate-spin" />
                      Checking status…
                    </div>
                  ) : c.status ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Status details */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
                        {c.status.tenantName && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Organisation</p>
                            <p style={{ fontSize: 12, color: '#0f172a', margin: 0 }}>{c.status.tenantName}</p>
                          </div>
                        )}
                        {c.status.companyName && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Company File</p>
                            <p style={{ fontSize: 12, color: '#0f172a', margin: 0 }}>{c.status.companyName}</p>
                          </div>
                        )}
                        {c.status.realmId && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Realm ID</p>
                            <p style={{ fontSize: 12, color: '#0f172a', margin: 0 }}>{c.status.realmId}</p>
                          </div>
                        )}
                        {c.status.connectedAt && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Connected</p>
                            <p style={{ fontSize: 12, color: '#0f172a', margin: 0 }}>
                              {new Date(c.status.connectedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                        )}
                        {c.status.expiresAt && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Token Expires</p>
                            <p style={{
                              fontSize: 12, margin: 0,
                              color: new Date(c.status.expiresAt) < new Date() ? '#dc2626' : '#0f172a',
                            }}>
                              {new Date(c.status.expiresAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => onRefreshCompany(provider, c.companyId)}
                          disabled={c.loading}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 7,
                            border: '1px solid #e2e8f0', background: '#fff',
                            fontSize: 12, fontWeight: 600, color: '#475569',
                            cursor: 'pointer',
                          }}
                        >
                          <RefreshCw size={11} />
                          Refresh status
                        </button>
                        {c.status.connected && (
                          <button
                            onClick={() => onSyncTest(provider, c.companyId)}
                            disabled={c.syncing}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 7,
                              border: '1px solid #f97316', background: '#fff7ed',
                              fontSize: 12, fontWeight: 700, color: '#c2410c',
                              cursor: c.syncing ? 'not-allowed' : 'pointer',
                              opacity: c.syncing ? 0.6 : 1,
                            }}
                          >
                            {c.syncing ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                            {c.syncing ? 'Testing…' : 'Run sync test'}
                          </button>
                        )}
                      </div>

                      {/* Sync result */}
                      {c.syncResult && (
                        <div
                          style={{
                            marginTop: 6,
                            padding: '8px 12px',
                            borderRadius: 8,
                            background: c.syncResult.ok ? '#dcfce7' : '#fee2e2',
                            border: `1px solid ${c.syncResult.ok ? '#86efac' : '#fca5a5'}`,
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                          }}
                        >
                          {c.syncResult.ok
                            ? <CheckCircle2 size={14} color="#166534" style={{ flexShrink: 0, marginTop: 1 }} />
                            : <XCircle size={14} color="#991b1b" style={{ flexShrink: 0, marginTop: 1 }} />
                          }
                          <p style={{ fontSize: 12, color: c.syncResult.ok ? '#166534' : '#991b1b', margin: 0, lineHeight: 1.5 }}>
                            {c.syncResult.message}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Status not loaded. Click to expand and check.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountingSmokeTestTab() {
  const [companies, setCompanies] = useState<Array<{ id: number; name: string }>>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [companyError, setCompanyError] = useState('');

  // Per-provider company connection state
  const [xeroCompanies, setXeroCompanies] = useState<CompanyConnection[]>([]);
  const [myobCompanies, setMyobCompanies] = useState<CompanyConnection[]>([]);
  const [qboCompanies, setQboCompanies] = useState<CompanyConnection[]>([]);

  // Gate C summary
  const [gateC, setGateC] = useState<{ xero: boolean; myob: boolean; qbo: boolean }>({ xero: false, myob: false, qbo: false });

  // Load company list
  useEffect(() => {
    void (async () => {
      setLoadingCompanies(true);
      try {
        const res = await fetch('/api/owner-console/companies', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load companies');
        const data = await res.json() as { companies: Array<{ id: number; name: string }> };
        const list = data.companies ?? [];
        setCompanies(list);

        // Initialise connection rows for each provider
        const makeRows = (): CompanyConnection[] =>
          list.map((c) => ({
            companyId: c.id,
            companyName: c.name,
            status: null,
            loading: false,
            syncResult: null,
            syncing: false,
            expanded: false,
          }));
        setXeroCompanies(makeRows());
        setMyobCompanies(makeRows());
        setQboCompanies(makeRows());
      } catch (e) {
        setCompanyError(e instanceof Error ? e.message : 'Failed to load companies');
      } finally {
        setLoadingCompanies(false);
      }
    })();
  }, []);

  // Fetch status for a single company + provider
  const fetchStatus = useCallback(async (provider: Provider, companyId: number) => {
    const setter = provider === 'xero' ? setXeroCompanies : provider === 'myob' ? setMyobCompanies : setQboCompanies;

    setter((prev) => prev.map((c) => c.companyId === companyId ? { ...c, loading: true } : c));

    try {
      // We call the status endpoint as the platform owner — the endpoint reads
      // the company's connection from the DB regardless of who is calling.
      // We pass companyId as a query param so the endpoint can look it up.
      const res = await fetch(`/api/integrations/${provider}/status?companyId=${companyId}`, { credentials: 'include' });
      const data = await res.json() as ProviderStatus;
      setter((prev) => {
        const updated = prev.map((c) => c.companyId === companyId ? { ...c, loading: false, status: data } : c);
        // Update Gate C
        const anyConnected = updated.some((c) => c.status?.connected);
        setGateC((g) => ({ ...g, [provider]: anyConnected }));
        return updated;
      });
    } catch {
      setter((prev) => prev.map((c) => c.companyId === companyId
        ? { ...c, loading: false, status: { connected: false, platformReady: false } }
        : c
      ));
    }
  }, []);

  // Toggle expand — lazy-load status on first expand
  const handleToggleExpand = useCallback((provider: Provider, companyId: number) => {
    const setter = provider === 'xero' ? setXeroCompanies : provider === 'myob' ? setMyobCompanies : setQboCompanies;
    setter((prev) => {
      const row = prev.find((c) => c.companyId === companyId);
      const willExpand = !row?.expanded;
      const updated = prev.map((c) => c.companyId === companyId ? { ...c, expanded: !c.expanded } : c);
      if (willExpand && !row?.status && !row?.loading) {
        void fetchStatus(provider, companyId);
      }
      return updated;
    });
  }, [fetchStatus]);

  // Refresh status
  const handleRefreshCompany = useCallback((provider: Provider, companyId: number) => {
    void fetchStatus(provider, companyId);
  }, [fetchStatus]);

  // Run sync test — calls the sync-invoice endpoint with a dry-run flag
  const handleSyncTest = useCallback(async (provider: Provider, companyId: number) => {
    const setter = provider === 'xero' ? setXeroCompanies : provider === 'myob' ? setMyobCompanies : setQboCompanies;
    setter((prev) => prev.map((c) => c.companyId === companyId ? { ...c, syncing: true, syncResult: null } : c));

    try {
      const res = await fetch(`/api/integrations/${provider}/sync-invoice`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, dryRun: true }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string; synced?: number };
      const ok = res.ok && (data.ok !== false);
      const message = ok
        ? `Smoke test passed. ${data.synced !== undefined ? `${data.synced} invoice(s) would sync.` : 'Connection verified.'}`
        : (data.error ?? data.message ?? 'Sync test failed — check credentials and token.');
      setter((prev) => prev.map((c) => c.companyId === companyId ? { ...c, syncing: false, syncResult: { ok, message } } : c));
      if (ok) setGateC((g) => ({ ...g, [provider]: true }));
    } catch (e) {
      setter((prev) => prev.map((c) => c.companyId === companyId
        ? { ...c, syncing: false, syncResult: { ok: false, message: e instanceof Error ? e.message : 'Network error' } }
        : c
      ));
    }
  }, []);

  // Refresh all companies for a provider
  const handleRefreshAll = useCallback((provider: Provider) => {
    const rows = provider === 'xero' ? xeroCompanies : provider === 'myob' ? myobCompanies : qboCompanies;
    rows.forEach((c) => void fetchStatus(provider, c.companyId));
  }, [xeroCompanies, myobCompanies, qboCompanies, fetchStatus]);

  const gateCPassed = gateC.xero && gateC.myob && gateC.qbo;
  const gateCPartial = gateC.xero || gateC.myob || gateC.qbo;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Gate C banner */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: 10,
          marginBottom: 24,
          background: gateCPassed ? '#dcfce7' : gateCPartial ? '#fef9c3' : '#f1f5f9',
          border: `1px solid ${gateCPassed ? '#86efac' : gateCPartial ? '#fde047' : '#e2e8f0'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        {gateCPassed
          ? <CheckCircle2 size={20} color="#166534" />
          : gateCPartial
            ? <AlertCircle size={20} color="#854d0e" />
            : <Link2 size={20} color="#64748b" />
        }
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Gate C — Accounting OAuth Smoke Tests
            {gateCPassed && ' ✓ PASSED'}
            {!gateCPassed && gateCPartial && ' — Partial'}
            {!gateCPassed && !gateCPartial && ' — Not started'}
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
            {gateCPassed
              ? 'All three providers have at least one connected company. Gate C is cleared.'
              : `${[gateC.xero && 'Xero', gateC.myob && 'MYOB', gateC.qbo && 'QBO'].filter(Boolean).join(', ') || 'No providers'} connected. Expand a company row and run a sync test to validate each provider.`
            }
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {(['xero', 'myob', 'qbo'] as Provider[]).map((p) => (
            <span
              key={p}
              style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: gateC[p] ? '#dcfce7' : '#f1f5f9',
                color: gateC[p] ? '#166534' : '#94a3b8',
                border: `1px solid ${gateC[p] ? '#86efac' : '#e2e8f0'}`,
              }}
            >
              {PROVIDER_META[p].label}
            </span>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>How to run smoke tests</p>
        <ol style={{ fontSize: 12, color: '#475569', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Expand a company row under each provider</li>
          <li>Confirm the connection status shows <strong>Connected</strong></li>
          <li>Click <strong>Run sync test</strong> — this sends a dry-run request to the provider's API to verify token validity and invoice access</li>
          <li>A green pass result clears that provider for Gate C</li>
          <li>If the token is expired, ask the company owner to reconnect via Settings → Accounting</li>
        </ol>
      </div>

      {loadingCompanies ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94a3b8', padding: '24px 0' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Loading companies…</span>
        </div>
      ) : companyError ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontSize: 13 }}>
          <AlertCircle size={16} />
          {companyError}
        </div>
      ) : (
        <>
          {/* Xero */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
              Xero
            </p>
            <button
              onClick={() => handleRefreshAll('xero')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <RefreshCw size={11} />Refresh all
            </button>
          </div>
          <ProviderCard
            provider="xero"
            companies={xeroCompanies}
            onRefreshCompany={handleRefreshCompany}
            onSyncTest={handleSyncTest}
            onToggleExpand={handleToggleExpand}
          />

          {/* MYOB */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
              MYOB
            </p>
            <button
              onClick={() => handleRefreshAll('myob')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <RefreshCw size={11} />Refresh all
            </button>
          </div>
          <ProviderCard
            provider="myob"
            companies={myobCompanies}
            onRefreshCompany={handleRefreshCompany}
            onSyncTest={handleSyncTest}
            onToggleExpand={handleToggleExpand}
          />

          {/* QBO */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>
              QuickBooks Online
            </p>
            <button
              onClick={() => handleRefreshAll('qbo')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <RefreshCw size={11} />Refresh all
            </button>
          </div>
          <ProviderCard
            provider="qbo"
            companies={qboCompanies}
            onRefreshCompany={handleRefreshCompany}
            onSyncTest={handleSyncTest}
            onToggleExpand={handleToggleExpand}
          />

          {companies.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <Unplug size={32} style={{ margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: 13, margin: 0 }}>No companies registered yet. Sign up a test company to run smoke tests.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
