/**
 * StorageProviderCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown in Settings → Data & Backup.
 * Displays the active storage provider, R2 credential status, and a
 * "Test Connection" button.  Switching providers is done via the
 * STORAGE_PROVIDER secret — this card guides the owner through that.
 */
import { useState, useEffect } from 'react';
import {
  HardDrive, Cloud, CheckCircle2, AlertCircle, Loader2,
  ExternalLink, RefreshCw, Info, Zap, Server,
} from 'lucide-react';

interface ProviderStatus {
  activeProvider: string;
  envProvider: string;
  r2Configured: boolean;
  r2PublicUrl: string | null;
  r2Bucket: string | null;
}

export default function StorageProviderCard() {
  const [status, setStatus]     = useState<ProviderStatus | null>(null);
  const [loading, setLoading]   = useState(true);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/storage-provider', { credentials: 'include' });
      if (res.ok) setStatus(await res.json() as ProviderStatus);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadStatus(); }, []);

  async function testConnection() {
    if (!status) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/settings/storage-provider/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: status.activeProvider }),
      });
      setTestResult(await res.json() as { ok: boolean; error?: string });
    } catch { setTestResult({ ok: false, error: 'Network error' }); }
    finally { setTesting(false); }
  }

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-2 text-slate-400 text-sm">
        <Loader2 size={14} className="animate-spin" />Loading storage config…
      </div>
    );
  }

  if (!status) return null;

  const isR2    = status.activeProvider === 'r2';
  const isLocal = status.activeProvider === 'local';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isR2 ? 'bg-orange-50 border border-orange-200' : 'bg-slate-50 border border-slate-200'
          }`}>
            {isR2 ? <Cloud size={15} className="text-primary" /> : <Server size={15} className="text-slate-500" />}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">File Storage Provider</p>
            <p className="text-xs text-slate-400">Where uploaded files, photos, and documents are stored</p>
          </div>
        </div>
        <button
          onClick={loadStatus}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="p-5 flex flex-col gap-4">
        {/* Active provider badge */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${
            isR2
              ? 'bg-orange-50 border-orange-200 text-orange-700'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            {isR2 ? <Zap size={11} /> : <HardDrive size={11} />}
            {isR2 ? 'Cloudflare R2' : 'Airo Local Storage'}
          </div>
          <span className="text-xs text-slate-400">
            {isLocal && 'Files stored on Airo-managed infrastructure'}
            {isR2 && 'Files stored in your Cloudflare R2 bucket'}
          </span>
        </div>

        {/* R2 detail rows */}
        {isR2 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-slate-500 font-medium">Bucket</span>
              <span className="text-xs font-mono text-slate-700">{status.r2Bucket ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-slate-500 font-medium">Public URL</span>
              <span className="text-xs font-mono text-slate-700 truncate max-w-[200px]">
                {status.r2PublicUrl ?? 'Signed URLs (no public domain)'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-slate-500 font-medium">Credentials</span>
              {status.r2Configured
                ? <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold"><CheckCircle2 size={11} />Configured</span>
                : <span className="flex items-center gap-1 text-xs text-red-600 font-semibold"><AlertCircle size={11} />Missing secrets</span>
              }
            </div>
          </div>
        )}

        {/* Local storage info */}
        {isLocal && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
            <Info size={13} className="text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 leading-relaxed">
              <p className="font-semibold mb-0.5">Using Airo-managed storage</p>
              <p>Files are stored on Airo's infrastructure. To use your own Cloudflare R2 bucket, add the R2 secrets below and set <code className="bg-blue-100 px-1 rounded font-mono">STORAGE_PROVIDER=r2</code>.</p>
            </div>
          </div>
        )}

        {/* Test connection */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={testConnection}
            disabled={testing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Test Connection
          </button>

          {testResult && (
            <span className={`flex items-center gap-1 text-xs font-semibold ${
              testResult.ok ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {testResult.ok
                ? <><CheckCircle2 size={12} />Connected</>
                : <><AlertCircle size={12} />{testResult.error ?? 'Failed'}</>
              }
            </span>
          )}
        </div>

        {/* How to switch to R2 */}
        {isLocal && (
          <details className="group">
            <summary className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer select-none flex items-center gap-1 transition-colors">
              <ExternalLink size={11} />
              How to switch to Cloudflare R2
            </summary>
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 leading-relaxed flex flex-col gap-2">
              <p className="font-semibold text-slate-700">Steps to activate R2:</p>
              <ol className="list-decimal list-inside flex flex-col gap-1.5 pl-1">
                <li>Create a Cloudflare R2 bucket in your Cloudflare dashboard.</li>
                <li>Create an R2 API token with <strong>Object Read &amp; Write</strong> permissions.</li>
                <li>
                  Add these secrets in <strong>Settings → Secrets</strong>:
                  <div className="mt-1.5 bg-white border border-slate-200 rounded p-2 font-mono text-[11px] flex flex-col gap-0.5">
                    <span>R2_ACCOUNT_ID</span>
                    <span>R2_ACCESS_KEY_ID</span>
                    <span>R2_SECRET_ACCESS_KEY</span>
                    <span>R2_BUCKET</span>
                    <span className="text-slate-400">R2_PUBLIC_URL  <em>(optional — custom domain)</em></span>
                    <span className="text-primary font-bold">STORAGE_PROVIDER=r2</span>
                  </div>
                </li>
                <li>Redeploy the app — new uploads will go to R2 immediately.</li>
                <li>Existing files remain on Airo storage and are still served correctly.</li>
              </ol>
              <p className="text-slate-400 mt-1">
                R2 free tier: 10 GB storage, 1M Class A ops, 10M Class B ops per month.
              </p>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
