/**
 * ShareQrPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a QR code + copy link + download QR PNG + print QR label.
 * Used after link creation and in the share link management list.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Copy, Check, Download, Printer, ShieldOff, Clock, Infinity as InfinityIcon,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';

interface Props {
  publicUrl: string;
  title: string;
  permissions: string[];
  expiresAt: string | null;
  shareLinkId: number;
  onRevoke?: () => void;
  revoked?: boolean;
}

export default function ShareQrPanel({
  publicUrl, title, permissions, expiresAt, shareLinkId, onRevoke, revoked,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [qrReady, setQrReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function drawQr() {
      try {
        // Dynamically import qrcode to avoid SSR issues
        const QRCode = (await import('qrcode')).default;
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        await QRCode.toCanvas(canvas, publicUrl, {
          width: 220,
          margin: 2,
          color: { dark: '#1a1a1a', light: '#ffffff' },
        });
        if (!cancelled) setQrReady(true);
      } catch (e) {
        console.error('QR generation failed', e);
      }
    }
    drawQr();
    return () => { cancelled = true; };
  }, [publicUrl]);

  async function handleCopy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `qr-${shareLinkId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function handlePrintQr() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Label — ${title}</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          img { width: 220px; height: 220px; display: block; margin: 0 auto 16px; }
          h2 { font-size: 18px; margin: 0 0 8px; }
          p { font-size: 12px; color: #555; word-break: break-all; }
          .badge { display: inline-block; background: #f97316; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 11px; margin: 4px 2px; }
          @media print { @page { margin: 20mm; } }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="QR Code" />
        <h2>${title}</h2>
        <p>${publicUrl}</p>
        ${permissions.map((p) => `<span class="badge">${p}</span>`).join('')}
        ${expiresAt ? `<p>Expires: ${new Date(expiresAt).toLocaleDateString('en-AU')}</p>` : ''}
        <script>window.onload = () => { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  }

  async function handleRevoke() {
    if (!onRevoke) return;
    if (!confirm('Revoke this link? Anyone with the link will no longer be able to access it.')) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/share-links/${shareLinkId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) onRevoke();
    } catch { /* ignore */ }
    setRevoking(false);
  }

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <div className="space-y-4">
      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {revoked && (
          <Badge variant="destructive" className="gap-1">
            <ShieldOff className="w-3 h-3" /> Revoked
          </Badge>
        )}
        {isExpired && !revoked && (
          <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800">
            <AlertTriangle className="w-3 h-3" /> Expired
          </Badge>
        )}
        {!revoked && !isExpired && (
          <Badge className="gap-1 bg-green-100 text-green-800 border-green-200">
            <CheckCircle2 className="w-3 h-3" /> Active
          </Badge>
        )}
        {expiresAt ? (
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            Expires {new Date(expiresAt).toLocaleDateString('en-AU')}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <InfinityIcon className="w-3 h-3" /> No expiry
          </Badge>
        )}
        {permissions.map((p) => (
          <Badge key={p} variant="secondary" className="capitalize">{p}</Badge>
        ))}
      </div>

      {/* QR code */}
      <div className="flex justify-center">
        <div className="border border-border rounded-xl p-3 bg-white inline-block">
          <canvas ref={canvasRef} className={qrReady ? '' : 'opacity-0'} />
          {!qrReady && (
            <div className="w-[220px] h-[220px] flex items-center justify-center text-muted-foreground text-sm">
              Generating QR…
            </div>
          )}
        </div>
      </div>

      {/* Link */}
      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
        <span className="text-xs text-muted-foreground flex-1 truncate font-mono">{publicUrl}</span>
        <Button size="sm" variant="ghost" onClick={handleCopy} className="shrink-0 h-7 px-2">
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleDownloadQr} disabled={!qrReady}>
          <Download className="w-4 h-4 mr-1" /> Download QR
        </Button>
        <Button size="sm" variant="outline" onClick={handlePrintQr} disabled={!qrReady}>
          <Printer className="w-4 h-4 mr-1" /> Print Label
        </Button>
        {onRevoke && !revoked && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRevoke}
            disabled={revoking}
            className="text-destructive border-destructive/30 hover:bg-destructive/10 ml-auto"
          >
            <ShieldOff className="w-4 h-4 mr-1" />
            {revoking ? 'Revoking…' : 'Revoke'}
          </Button>
        )}
      </div>
    </div>
  );
}
