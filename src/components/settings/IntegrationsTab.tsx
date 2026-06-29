/**
 * Settings → Integrations tab
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages third-party integrations. Currently: OneDrive / SharePoint, Dazza AI key.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  ExternalLink,
  Info,
  FolderOpen,
} from 'lucide-react';
import DazzaAiKeyCard from './DazzaAiKeyCard';

interface OneDriveStatus {
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function IntegrationsTab({ isOwner = false }: { isOwner?: boolean }) {
  const [status, setStatus] = useState<OneDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/onedrive/status', { credentials: 'include' });
      if (res.ok) {
        setStatus(await res.json() as OneDriveStatus);
      } else {
        setError('Could not load integration status.');
      }
    } catch {
      setError('Could not reach the server.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();

    // Handle redirect back from Microsoft OAuth
    const params = new URLSearchParams(window.location.search);
    const onedriveParam = params.get('onedrive');
    if (onedriveParam === 'connected') {
      setSuccessMsg('OneDrive connected successfully.');
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete('onedrive');
      url.searchParams.delete('msg');
      window.history.replaceState({}, '', url.toString());
    } else if (onedriveParam === 'error') {
      const msg = params.get('msg') ?? 'Connection failed.';
      setError(`OneDrive connection failed: ${msg}`);
      const url = new URL(window.location.href);
      url.searchParams.delete('onedrive');
      url.searchParams.delete('msg');
      window.history.replaceState({}, '', url.toString());
    }
  }, [load]);

  async function handleConnect() {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/onedrive/auth-url', { credentials: 'include' });
      const data = await res.json() as { url?: string; error?: string; notConfigured?: boolean };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to start OneDrive connection.');
        setConnecting(false);
        return;
      }
      // Redirect to Microsoft login
      window.location.href = data.url;
    } catch {
      setError('Could not reach the server.');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect OneDrive? Files already transferred will remain in OneDrive.')) return;
    setDisconnecting(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/onedrive/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setSuccessMsg('OneDrive disconnected.');
        await load();
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Failed to disconnect.');
      }
    } catch {
      setError('Could not reach the server.');
    }
    setDisconnecting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="font-heading font-bold text-lg text-slate-900">Integrations</h2>
        <p className="text-sm text-slate-500 mt-0.5">Connect IWILLBUILD to external services.</p>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs">Dismiss</button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <AlertCircle size={15} className="shrink-0 text-red-500" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600 text-xs">Dismiss</button>
        </div>
      )}

      {/* OneDrive / SharePoint card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-[#0078D4]/10 flex items-center justify-center shrink-0">
            <Cloud size={20} className="text-[#0078D4]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-slate-900">OneDrive / SharePoint</p>
            <p className="text-xs text-slate-500">Microsoft 365 cloud file storage</p>
          </div>
          {status?.connected && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
              <CheckCircle2 size={11} />
              Connected
            </span>
          )}
        </div>

        {/* Card body */}
        <div className="px-5 py-4 space-y-4">
          {!status?.configured ? (
            /* Not configured — show setup instructions */
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <Info size={14} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <p className="font-semibold mb-1">Azure App Registration required</p>
                  <p className="text-xs leading-relaxed">
                    To enable OneDrive integration, add these secrets in Settings → Secrets:
                  </p>
                  <ul className="mt-2 space-y-1 text-xs font-mono">
                    <li className="bg-amber-100 rounded px-2 py-0.5">AZURE_CLIENT_ID</li>
                    <li className="bg-amber-100 rounded px-2 py-0.5">AZURE_CLIENT_SECRET</li>
                    <li className="bg-amber-100 rounded px-2 py-0.5">AZURE_TENANT_ID <span className="font-sans font-normal">(or &apos;common&apos;)</span></li>
                    <li className="bg-amber-100 rounded px-2 py-0.5">AZURE_REDIRECT_URI <span className="font-sans font-normal">(e.g. https://iwillbuild.com/api/integrations/onedrive/callback)</span></li>
                  </ul>
                  <a
                    href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-amber-700 hover:text-amber-900 underline"
                  >
                    Open Azure App Registrations <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            </div>
          ) : status?.connected ? (
            /* Connected state */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Account</p>
                  <p className="text-slate-800 font-medium">{status.displayName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">Connected</p>
                  <p className="text-slate-800">{formatDate(status.connectedAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
                <FolderOpen size={13} className="shrink-0 mt-0.5 text-slate-400" />
                <span>
                  Files are transferred to <strong>/IWILLBUILD/</strong> in your OneDrive.
                  Job files go into <strong>/IWILLBUILD/Job [ID]/</strong> and general files into <strong>/IWILLBUILD/Company Files/</strong>.
                </span>
              </div>

              <button
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="flex items-center gap-2 text-sm text-red-600 hover:text-red-800 font-medium transition-colors disabled:opacity-50"
              >
                {disconnecting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <LogOut size={14} />
                }
                Disconnect OneDrive
              </button>
            </div>
          ) : (
            /* Configured but not connected */
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Connect your Microsoft account to transfer portal files directly to OneDrive or SharePoint.
              </p>
              <ul className="text-xs text-slate-500 space-y-1">
                <li className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-500" /> Send any portal file to OneDrive with one click</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-500" /> Files organised automatically by job</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={11} className="text-emerald-500" /> Token auto-refreshes — connect once, works forever</li>
              </ul>
              <button
                onClick={() => void handleConnect()}
                disabled={connecting}
                className="flex items-center gap-2 bg-[#0078D4] hover:bg-[#006CBE] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
              >
                {connecting
                  ? <Loader2 size={15} className="animate-spin" />
                  : <Cloud size={15} />
                }
                Connect OneDrive
              </button>
            </div>
          )}
        </div>
      </div>

      {/* More integrations placeholder */}
      <div className="border border-dashed border-slate-200 rounded-2xl px-5 py-6 text-center">
        <p className="text-sm text-slate-400">More integrations coming soon — Google Drive, Dropbox, and more.</p>
      </div>

      {/* Dazza AI — company OpenAI key (owner only) */}
      <DazzaAiKeyCard isOwner={isOwner} />
    </div>
  );
}
