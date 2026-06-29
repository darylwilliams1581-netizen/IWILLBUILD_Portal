/**
 * AccountingTab — Settings → Accounting
 * ─────────────────────────────────────────────────────────────────────────────
 * Three-state Xero card:
 *
 *   State 1 — NOT CONFIGURED (no credentials saved)
 *     Owner sees "Setup Xero" button → opens Setup modal
 *     Non-owners see a "contact your admin" message
 *
 *   State 2 — CONFIGURED, NOT CONNECTED
 *     "Connect Xero" button → OAuth redirect
 *     Owner can also edit credentials via "Edit setup"
 *
 *   State 3 — CONNECTED
 *     Shows organisation name, connected date, last sync status
 *     Reconnect / Disconnect actions
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Receipt, CheckCircle2, XCircle, Loader2, AlertCircle,
  ExternalLink, Unplug, RefreshCw, ArrowRight, Settings2,
  Link2, Building2,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

// ── Types ────────────────────────────────────────────────────────────────────

interface XeroStatus {
  connected: boolean;
  platformReady?: boolean;
  tenantName?: string;
  connectedAt?: string;
  expiresAt?: string;
}

interface XeroCredStatus {
  configured: boolean;
  source: 'company' | 'platform' | 'none';
  maskedClientId: string | null;
  redirectUri: string | null;
}

interface Props {
  isAdmin: boolean;
  isOwner: boolean;
}

// ── Setup Modal ───────────────────────────────────────────────────────────────

interface SetupModalProps {
  isOwner: boolean;
  onClose: () => void;
  onSaved: (creds: XeroCredStatus) => void;
}

function SetupModal({ isOwner, onClose, onSaved }: SetupModalProps) {
  const defaultRedirect = `${window.location.origin}/api/integrations/xero/callback`;
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(defaultRedirect);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim() || !redirectUri.trim()) {
      setError('All three fields are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings/xero-credentials', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), redirectUri: redirectUri.trim() }),
      });
      const data = await res.json() as XeroCredStatus & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to save.'); return; }
      onSaved(data);
    } catch {
      setError('Could not reach the server.');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-[#13B5EA]/10 flex items-center justify-center shrink-0">
            <span className="text-[#13B5EA] font-black text-sm">X</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900">Setup Xero</p>
            <p className="text-xs text-slate-500">Enter your Xero Developer App credentials</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <XCircle size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-4">
          {/* Critical warning */}
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-800">
            <p className="font-bold mb-1">⚠ Important — choose the correct app type</p>
            <p className="leading-relaxed">
              At <a href="https://developer.xero.com/app/manage" target="_blank" rel="noopener noreferrer" className="underline font-semibold">developer.xero.com/app/manage</a>,
              create a <strong>Web App</strong> — <em>not</em> "Sign In with Xero".
              Only a Web App gives access to the Accounting API (invoices, contacts, payments).
            </p>
          </div>

          {/* Step guide */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-700 space-y-1.5">
            <p className="font-semibold text-slate-800 mb-1">Quick setup steps:</p>
            <p>1. Go to <a href="https://developer.xero.com/app/manage" target="_blank" rel="noopener noreferrer" className="text-[#13B5EA] underline">developer.xero.com/app/manage</a> → New App → <strong>Web App</strong></p>
            <p>2. Set the Redirect URI to the value pre-filled below</p>
            <p>3. Copy the Client ID and Client Secret from the app page</p>
            <p>4. Paste them here and click Save</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
              <AlertCircle size={14} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Paste your Xero Client ID"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#13B5EA] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Paste your Xero Client Secret"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#13B5EA] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Redirect URI
                <span className="ml-1 text-slate-400 font-normal">(copy this exactly into your Xero app)</span>
              </label>
              <input
                type="text"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#13B5EA] focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 bg-[#13B5EA] hover:bg-[#0fa0d4] text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountingTab({ isAdmin, isOwner }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [xero, setXero] = useState<XeroStatus | null>(null);
  const [creds, setCreds] = useState<XeroCredStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, credsRes] = await Promise.all([
        fetch('/api/integrations/xero/status', { credentials: 'include' }),
        isOwner ? fetch('/api/settings/xero-credentials', { credentials: 'include' }) : Promise.resolve(null),
      ]);
      if (statusRes.ok) setXero(await statusRes.json() as XeroStatus);
      else setXero({ connected: false });
      if (credsRes?.ok) setCreds(await credsRes.json() as XeroCredStatus);
      else if (isOwner) setCreds({ configured: false, source: 'none', maskedClientId: null, redirectUri: null });
    } catch {
      setXero({ connected: false });
    }
    setLoading(false);
  }, [isOwner]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Handle redirect back from Xero OAuth
  useEffect(() => {
    const xeroParam = searchParams.get('xero');
    if (!xeroParam) return;
    if (xeroParam === 'connected') {
      setSuccessMsg('Xero connected successfully!');
      void loadAll();
    } else if (xeroParam === 'error') {
      const reason = searchParams.get('reason') ?? 'unknown';
      setError(`Xero connection failed: ${reason.replace(/_/g, ' ')}`);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('xero'); next.delete('reason');
    setSearchParams(next, { replace: true });
  }, [searchParams]);

  async function handleConnect() {
    setConnecting(true); setError(''); setSuccessMsg('');
    try {
      const res = await fetch('/api/integrations/xero/auth-url', { credentials: 'include' });
      const d = await res.json() as { url?: string; error?: string };
      if (!res.ok || !d.url) { setError(d.error ?? 'Failed to start Xero connection.'); return; }
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
      if (!res.ok) { const d = await res.json() as { error?: string }; setError(d.error ?? 'Failed to disconnect'); return; }
      setSuccessMsg('Xero disconnected.');
      setXero({ connected: false });
    } catch {
      setError('Failed to disconnect Xero');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleClearCredentials() {
    if (!confirm('Remove Xero app credentials? You will need to set them up again before reconnecting.')) return;
    try {
      await fetch('/api/settings/xero-credentials', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      });
      setCreds({ configured: false, source: 'none', maskedClientId: null, redirectUri: null });
      setSuccessMsg('Xero credentials removed.');
    } catch {
      setError('Failed to remove credentials.');
    }
  }

  // Determine which state we're in
  const isConfigured = creds?.configured || xero?.platformReady;
  const isConnected = xero?.connected;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-heading font-bold text-base text-foreground mb-1">Accounting Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect your accounting software to sync invoices, contacts and payments automatically.
        </p>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="shrink-0" />{successMsg}
          <button onClick={() => setSuccessMsg('')} className="ml-auto text-emerald-400 hover:text-emerald-600"><XCircle size={14} /></button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><XCircle size={14} /></button>
        </div>
      )}

      {/* ── Xero card ── */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-[#13B5EA]/10 border border-[#13B5EA]/20 flex items-center justify-center shrink-0">
            <span className="text-[#13B5EA] font-black text-sm">X</span>
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">Xero</p>
            <p className="text-xs text-muted-foreground">Sync invoices, contacts and payments with Xero.</p>
          </div>
          {loading ? (
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          ) : isConnected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Connected
            </span>
          ) : isConfigured ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Ready to connect
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Not set up
            </span>
          )}
        </div>

        {/* Card body */}
        <div className="px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 size={14} className="animate-spin" />Checking connection…
            </div>

          ) : isConnected ? (
            /* ── STATE 3: Connected ── */
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Building2 size={10} />Organisation
                  </p>
                  <p className="text-sm font-semibold text-foreground">{xero?.tenantName || '—'}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Link2 size={10} />Connected
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {xero?.connectedAt
                      ? new Date(xero.connectedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-xs font-bold text-emerald-700 mb-2">What syncs to Xero:</p>
                <ul className="text-xs text-emerald-700 space-y-1">
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} />Invoices (ACCREC) — line items, GST, status</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} />Customers → Xero Contacts (name, email, phone, ABN)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={11} />Payment status updates via webhook (Paid, Voided)</li>
                </ul>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => void handleConnect()}
                    disabled={connecting}
                    className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {connecting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Reconnect
                  </button>
                  <button
                    onClick={() => void handleDisconnect()}
                    disabled={disconnecting}
                    className="flex items-center gap-2 px-3 py-2 border border-red-200 bg-red-50 rounded-xl text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />}
                    Disconnect Xero
                  </button>
                </div>
              )}
            </div>

          ) : isConfigured ? (
            /* ── STATE 2: Configured, not connected ── */
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Your Xero app is set up. Click below to log in to Xero and authorise access to your organisation.
              </p>

              <ul className="text-xs text-slate-500 space-y-1">
                <li className="flex items-center gap-2"><ArrowRight size={11} className="text-primary shrink-0" />Push invoices to Xero with one click from the invoice builder</li>
                <li className="flex items-center gap-2"><ArrowRight size={11} className="text-primary shrink-0" />Sync customers as Xero Contacts automatically</li>
                <li className="flex items-center gap-2"><ArrowRight size={11} className="text-primary shrink-0" />Receive payment status updates back via webhook</li>
                <li className="flex items-center gap-2"><ArrowRight size={11} className="text-primary shrink-0" />Keep GST, line items and due dates in sync</li>
              </ul>

              {/* Credential summary (owner only) */}
              {isOwner && creds?.source === 'company' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-700 mb-0.5">App credentials saved</p>
                    <p className="font-mono text-slate-500">Client ID: {creds.maskedClientId}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowSetupModal(true)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
                    >
                      <Settings2 size={12} />Edit
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => void handleClearCredentials()}
                      className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {isAdmin ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void handleConnect()}
                    disabled={connecting}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#13B5EA] hover:bg-[#0fa0d4] text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
                  >
                    {connecting ? <Loader2 size={14} className="animate-spin" /> : <span className="font-black text-white text-sm">X</span>}
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

          ) : (
            /* ── STATE 1: Not configured ── */
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                To use Xero, you first need to create a Xero Developer App and enter your credentials here.
              </p>

              <ul className="text-xs text-slate-500 space-y-1">
                <li className="flex items-center gap-2"><ArrowRight size={11} className="text-primary shrink-0" />Push invoices to Xero with one click</li>
                <li className="flex items-center gap-2"><ArrowRight size={11} className="text-primary shrink-0" />Sync customers as Xero Contacts automatically</li>
                <li className="flex items-center gap-2"><ArrowRight size={11} className="text-primary shrink-0" />Keep GST, line items and due dates in sync</li>
              </ul>

              {isOwner ? (
                <button
                  onClick={() => setShowSetupModal(true)}
                  className="self-start flex items-center gap-2 px-4 py-2.5 bg-[#13B5EA] hover:bg-[#0fa0d4] text-white rounded-xl text-sm font-bold transition-colors"
                >
                  <Settings2 size={14} />
                  Setup Xero
                </button>
              ) : (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-600" />
                  <p>Xero hasn't been set up yet. Ask your account owner to configure it in Settings → Accounting.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Webhook setup (shown when connected) ── */}
      {isConnected && (
        <div className="bg-white border border-border rounded-xl p-5">
          <h3 className="font-heading font-bold text-sm text-foreground mb-3">Webhook Setup (Optional)</h3>
          <p className="text-xs text-muted-foreground mb-3">
            To receive real-time payment status updates from Xero, add a webhook in your Xero Developer App:
          </p>
          <div className="bg-slate-900 rounded-xl p-3 mb-3">
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

      {/* Setup modal */}
      {showSetupModal && (
        <SetupModal
          isOwner={isOwner}
          onClose={() => setShowSetupModal(false)}
          onSaved={(saved) => {
            setCreds(saved);
            setShowSetupModal(false);
            setSuccessMsg('Xero credentials saved. Click "Connect Xero" to authorise your account.');
          }}
        />
      )}
    </div>
  );
}
