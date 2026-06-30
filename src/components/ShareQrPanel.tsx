/**
 * ShareQrPanel — Display a share link with QR code, copy, download, print, revoke.
 * Used inside ShareLinkModal after creation, and in the share management list.
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Printer, Trash2, CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  shareUrl: string;
  linkId: number;
  title: string;
  expiresAt: string | null;
  useCount?: number;
  maxUses?: number | null;
  onRevoked?: () => void;
}

export default function ShareQrPanel({
  shareUrl, linkId, title, expiresAt, useCount = 0, maxUses, onRevoked,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, shareUrl, {
      width: 200,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).catch(() => setQrError(true));
  }, [shareUrl]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function handleDownloadQr() {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `qr-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }

  function handlePrintQr() {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code — ${title}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          img { width: 200px; height: 200px; display: block; margin: 0 auto 16px; }
          h2 { font-size: 18px; margin: 0 0 8px; }
          p { font-size: 12px; color: #666; word-break: break-all; }
          .url { font-size: 10px; color: #999; margin-top: 8px; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <img src="${dataUrl}" alt="QR Code" />
        <p>Scan to access</p>
        <p class="url">${shareUrl}</p>
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  async function handleRevoke() {
    if (!confirm('Revoke this link? Anyone with the link will no longer be able to access it.')) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/secure-share/${linkId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setRevoked(true);
        onRevoked?.();
      }
    } catch { /* ignore */ }
    setRevoking(false);
  }

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const isMaxed = maxUses !== null && maxUses !== undefined && useCount >= maxUses;

  if (revoked) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
        <AlertTriangle size={14} />
        Link revoked
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {isExpired && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200">
            <AlertTriangle size={10} /> Expired
          </span>
        )}
        {isMaxed && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <AlertTriangle size={10} /> Max uses reached
          </span>
        )}
        {!isExpired && !isMaxed && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
            <CheckCircle2 size={10} /> Active
          </span>
        )}
        {expiresAt && !isExpired && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
            <Clock size={10} />
            Expires {new Date(expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
        {maxUses && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
            {useCount}/{maxUses} uses
          </span>
        )}
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-3">
        {qrError ? (
          <div className="w-[200px] h-[200px] bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 text-xs text-center p-4">
            QR code unavailable
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="rounded-xl border border-slate-200 shadow-sm"
            style={{ width: 200, height: 200 }}
          />
        )}
        <p className="text-xs text-slate-400 text-center">Scan to access</p>
      </div>

      {/* URL copy */}
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
        <p className="flex-1 text-xs text-slate-600 truncate font-mono">{shareUrl}</p>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-primary transition-colors"
        >
          {copied ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs flex-1"
          onClick={handleDownloadQr}
        >
          <Download size={12} />
          Download QR
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs flex-1"
          onClick={handlePrintQr}
        >
          <Printer size={12} />
          Print QR
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
          onClick={handleRevoke}
          disabled={revoking}
        >
          {revoking ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Revoke
        </Button>
      </div>
    </div>
  );
}
