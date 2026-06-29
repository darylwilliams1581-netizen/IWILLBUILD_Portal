/**
 * AccountingTab — Settings → Accounting
 * Manages Xero OAuth connection + shows QuickBooks/MYOB as coming soon.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, CheckCircle2, XCircle, Loader2, AlertCircle,
  ExternalLink, Unplug, RefreshCw, ArrowRight, Info,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

interface XeroStatus {
  connected: boolean;
  platformReady?: boolean;
  tenantName?: string;
  connectedAt?: string;
  expiresAt?: string;
}

interface Props {
  isAdmin: boolean;
}

export default function AccountingTab({ isAdmin }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [xero, setXero] = useState<XeroStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadStatus = useCallback(() => {
    setLoading(true);
    fetch('/api/integrations/xero/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setXero(d))
      .catch(() => setXero({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Handle redirect back from Xero OAuth
  useEffect(() => {
    const xeroParam = searchParams.get('xero');
    if (!xeroParam) return;

    if (xeroParam === 'connected') {
      setSuccessMsg('Xero connected successfully!');
      loadStatus();
    } else if (xeroParam === 'error') {
      const reason = searchParams.get('reason') ?? 'unknown';
      setError(`Xero connection failed: ${reason.replace(/_/g, ' ')}`);
    }

    // Clean up URL params
    const next = new URLSearchParams(searchParams);
    next.delete('xero');
    next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  async function handleConnect() {
    setConnecting(true); setError(''); setSuccessMsg('');
    try {
      const res = await fetch('/api/integrations/xero/auth-url', { credentials: 'include' });
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok || !d.url) {
        // Surface a clean message — the raw API error mentions "Settings → Secrets"
        // which is only relevant to the IWILLBUILD owner, not the customer.
        setError(d.error ?? 'Failed to start Xero connection. Please try again.');
        return;
      }
      window.location.href = d.url;
    } catch {
      setError('Failed to start Xero connection. Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Xero? Existing synced invoices will keep their Xero IDs but no new syncs will be possible.')) return;
    setDisconnecting(true); setError(''); setSuccessMsg('');
    try {
      const res = await fetch('/api/integrations/xero/disconnect', { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Failed to disconnect');
        return;
      }
      setSuccessMsg('Xero disconnected.');
      setXero({ connected: false });
    } catch {
      setError('Failed to disconnect Xero');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading font-bold text-base text-foreground mb-1">Accounting Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect your accounting software to sync invoices, contacts and payments automatically.
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="shrink-0" />{successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><XCircle size={14} /></button>
        </div>
      )}

      {/* ── Xero ── */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-[#13B5EA]/10 border border-[#13B5EA]/20 flex items-center justify-center shrink-0">
            {/* Xero logo approximation */}
            <span className="text-[#13B5EA] font-black text-sm">X</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">Xero</p>
            <p className="text-xs text-muted-foreground">Sync invoices, contacts and payments with Xero.</p>
          </div>
          {loading ? (
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          ) : xero?.connected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Not Connected
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 size={14} className="animate-spin" />Checking connection…
            </div>
          ) : xero?.connected ? (
            <div className="flex flex-col gap-4">
              {/* Connection details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Organisation</p>
                  <p className="text-sm font-semibold text-foreground">{xero.tenantName || '—'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">Connected</p>
                  <p className="text-sm font-semibold text-foreground">
                    {xero.connectedAt ? new Date(xero.connectedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>

              {/* What syncs */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p className="text-xs font-bold text-emerald-700 mb-2">What syncs to Xero:</p>
                <ul className="text-xs text-emerald-700 space-y-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} />Invoices (ACCREC) — line items, GST, status</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} />Customers → Xero Contacts (name, email, phone, ABN)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} />Payment status updates via webhook (Paid, Voided)</li>
                </ul>
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {connecting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Reconnect
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center gap-2 px-3 py-2 border border-red-200 bg-red-50 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />}
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-sm text-muted-foreground">
                <p className="mb-2">Connect your Xero account to:</p>
                <ul className="space-y-1 text-xs">
                  <li className="flex items-center gap-2 text-slate-600"><ArrowRight size={11} className="text-primary shrink-0" />Push invoices to Xero with one click from the invoice builder</li>
                  <li className="flex items-center gap-2 text-slate-600"><ArrowRight size={11} className="text-primary shrink-0" />Sync customers as Xero Contacts automatically</li>
                  <li className="flex items-center gap-2 text-slate-600"><ArrowRight size={11} className="text-primary shrink-0" />Receive payment status updates back via webhook</li>
                  <li className="flex items-center gap-2 text-slate-600"><ArrowRight size={11} className="text-primary shrink-0" />Keep GST, line items and due dates in sync</li>
                </ul>
              </div>

              {/* Platform not yet configured — owner-only notice */}
              {xero?.platformReady === false && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                  <Info size={13} className="shrink-0 mt-0.5 text-amber-600" />
                  <div className="w-full">
                    <p className="font-semibold mb-1 text-sm">Xero app setup required (owner action)</p>

                    {/* Critical warning — wrong app type */}
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                      <p className="font-bold text-red-700 mb-0.5">⚠ Important — choose the correct app type</p>
                      <p className="text-red-600 leading-relaxed">
                        Do <strong>not</strong> create a <em>"Sign In with Xero"</em> app — that is for user authentication only and won't work here.
                        You need a <strong>"Web App"</strong> which gives access to the Accounting API (invoices, contacts, payments).
                      </p>
                    </div>

                    <p className="text-amber-700 font-semibold mb-1">Step-by-step setup:</p>
                    <ol className="space-y-1.5 list-decimal list-inside text-amber-700 leading-relaxed">
                      <li>
                        Go to{' '}
                        <a href="https://developer.xero.com/app/manage" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900 font-semibold">
                          developer.xero.com/app/manage
                        </a>{' '}
                        and click <strong>New App</strong>
                      </li>
                      <li>
                        On the app type screen, select <strong>"Web App"</strong>{' '}
                        <span className="text-amber-600">(NOT "Sign In with Xero" — that is the wrong type)</span>
                      </li>
                      <li>
                        Set the <strong>Redirect URI</strong> to exactly:{' '}
                        <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-900 break-all">
                          {window.location.origin}/api/integrations/xero/callback
                        </code>
                      </li>
                      <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from the app page</li>
                      <li>
                        Add these three secrets in{' '}
                        <strong>Settings → Secrets</strong>:
                        <ul className="mt-1 ml-4 space-y-0.5 list-none">
                          <li><code className="bg-amber-100 px-1 rounded font-mono">XERO_CLIENT_ID</code> — your Client ID</li>
                          <li><code className="bg-amber-100 px-1 rounded font-mono">XERO_CLIENT_SECRET</code> — your Client Secret</li>
                          <li>
                            <code className="bg-amber-100 px-1 rounded font-mono">XERO_REDIRECT_URI</code> —{' '}
                            <code className="bg-amber-100 px-1 rounded font-mono text-amber-900 break-all">
                              {window.location.origin}/api/integrations/xero/callback
                            </code>
                          </li>
                        </ul>
                      </li>
                    </ol>
                    <p className="mt-2.5 text-amber-600 italic">
                      Once configured, customers click Connect Xero and log in to their own Xero organisation — they never enter credentials here.
                    </p>
                  </div>
                </div>
              )}

              {isAdmin ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleConnect}
                    disabled={connecting || xero?.platformReady === false}
                    title={xero?.platformReady === false ? 'Xero app credentials not yet configured' : undefined}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#13B5EA] hover:bg-[#0fa0d4] text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {connecting ? <Loader2 size={14} className="animate-spin" /> : (
                      <span className="font-black text-white text-sm">X</span>
                    )}
                    Connect Xero
                  </button>
                  <a
                    href="https://developer.xero.com/documentation/guides/oauth2/overview/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Xero OAuth docs <ExternalLink size={11} />
                  </a>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Only admins can connect accounting integrations.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Webhook setup instructions ── */}
      {xero?.connected && (
        <div className="bg-white border border-border rounded-xl p-5">
          <h3 className="font-heading font-bold text-sm text-foreground mb-3">Webhook Setup (Optional)</h3>
          <p className="text-xs text-muted-foreground mb-3">
            To receive real-time payment status updates from Xero, add a webhook in your Xero Developer App:
          </p>
          <div className="bg-slate-900 rounded-lg p-3 mb-3">
            <p className="text-xs font-mono text-emerald-400 break-all">
              {window.location.origin}/api/integrations/xero/webhook
            </p>
          </div>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Go to <a href="https://developer.xero.com/app/manage" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">developer.xero.com/app/manage</a></li>
            <li>Select your app → Webhooks</li>
            <li>Add the URL above and subscribe to <strong>Invoice</strong> events</li>
            <li>Copy the Webhook Key and add it as <code className="bg-slate-100 px-1 rounded">XERO_WEBHOOK_KEY</code> in Settings → Secrets</li>
          </ol>
        </div>
      )}

      {/* ── QuickBooks + MYOB coming soon ── */}
      {[
        { name: 'QuickBooks Online', desc: 'Push invoices and customers to QuickBooks Online.', color: 'border-green-100' },
        { name: 'MYOB', desc: 'Sync invoices and contacts with MYOB AccountRight or Essentials.', color: 'border-purple-100' },
      ].map((provider) => (
        <div key={provider.name} className={`bg-white border ${provider.color} rounded-xl px-5 py-4 flex items-center justify-between gap-4 opacity-60`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <Receipt size={15} className="text-slate-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">{provider.name}</p>
              <p className="text-xs text-muted-foreground">{provider.desc}</p>
            </div>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-400 border border-slate-200 rounded-full shrink-0">Coming Soon</span>
        </div>
      ))}
    </div>
  );
}
