/**
 * ShareModal — generate a view-only share link for a drawing.
 */
import { useState } from 'react';
import { Share2, Copy, Check, X, Link, Calendar } from 'lucide-react';
import OutlookEmailButton from '@/components/OutlookEmailButton';

interface Props {
  drawingId: number;
  drawingTitle: string;
  revisionId?: number;
  onClose: () => void;
  onGenerate: (drawingId: number, revisionId?: number, expiryDays?: number) => Promise<{ token: string; url: string; expiresAt: string } | null>;
}

export default function ShareModal({ drawingId, drawingTitle, revisionId, onClose, onGenerate }: Props) {
  const [expiryDays, setExpiryDays] = useState(30);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const r = await onGenerate(drawingId, revisionId, expiryDays);
    setLoading(false);
    if (r) setResult(r);
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Share2 size={15} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-100">Share Drawing</p>
              <p className="text-xs text-slate-400 truncate max-w-[220px]">{drawingTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {!result ? (
            <>
              <p className="text-xs text-slate-400">
                Generate a view-only link. Recipients can view the drawing and annotations without logging in.
              </p>

              {/* Expiry */}
              <div>
                <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Calendar size={12} /> Link expires after
                </label>
                <div className="flex gap-2">
                  {[7, 14, 30, 90].map(d => (
                    <button
                      key={d}
                      onClick={() => setExpiryDays(d)}
                      className={[
                        'flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors',
                        expiryDays === d
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                      ].join(' ')}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <Link size={14} />
                {loading ? 'Generating…' : 'Generate Share Link'}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400">
                <Check size={13} /> Link generated — expires {new Date(result.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>

              <div className="flex gap-2">
                <input
                  readOnly
                  value={result.url}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-xs text-slate-300 focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                >
                  {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <OutlookEmailButton
                context={{
                  kind: 'plan',
                  drawingTitle,
                  link: result.url,
                }}
                size="sm"
                variant="outline"
                showCopy={false}
                className="w-full justify-center [&>button]:w-full [&>button]:justify-center"
              />

              <button
                onClick={() => setResult(null)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors text-center"
              >
                Generate another link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
