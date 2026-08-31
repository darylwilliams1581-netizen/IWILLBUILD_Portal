/**
 * TwilioTab — owner-console tab for Twilio account management.
 * Provides quick-access links to the Twilio console, verified numbers,
 * and SMS logs so the owner doesn't need to remember the URLs.
 *
 * The Twilio Account SID is fetched from the server (never hardcoded here).
 */
import { useEffect, useState } from 'react';
import { ExternalLink, Phone, MessageSquare, ShieldCheck, Settings, CreditCard, Loader2, AlertCircle } from 'lucide-react';

interface TwilioLink {
  label: string;
  description: string;
  url: string;
  highlight: boolean;
}

interface TwilioInfo {
  accountSid: string;
  links: TwilioLink[];
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'Twilio Console — Account Home': <Settings className="w-5 h-5" />,
  'Verified Caller IDs (Trial)': <ShieldCheck className="w-5 h-5" />,
  'SMS Logs': <MessageSquare className="w-5 h-5" />,
  'Phone Numbers': <Phone className="w-5 h-5" />,
  'Billing & Upgrade': <CreditCard className="w-5 h-5" />,
};

export default function TwilioTab() {
  const [info, setInfo] = useState<TwilioInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/owner-console/twilio-info', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<TwilioInfo>;
      })
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Twilio info');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Twilio — SMS Management</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Quick access to your Twilio account.{' '}
          {loading && <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading account info…</span>}
          {!loading && info && (
            <>
              Account SID:{' '}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{info.accountSid}</code>
            </>
          )}
          {!loading && error && (
            <span className="text-destructive text-xs">{error}</span>
          )}
        </p>
      </div>

      {/* Trial account warning */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Trial account — SMS restricted</p>
            <p className="text-sm text-muted-foreground">
              Your Twilio trial account can only send SMS to <strong>verified phone numbers</strong>.
              To test SMS verification, add the destination number to your Verified Caller IDs list,
              or upgrade to a paid account to remove this restriction entirely.
            </p>
          </div>
        </div>
      </div>

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Links */}
      {!loading && info && (
        <div className="space-y-3">
          {info.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-start gap-4 p-4 rounded-lg border transition-colors group ${
                link.highlight
                  ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                  : 'border-border bg-card hover:bg-muted/50'
              }`}
            >
              <span className={`mt-0.5 shrink-0 ${link.highlight ? 'text-primary' : 'text-muted-foreground'}`}>
                {ICON_MAP[link.label] ?? <ExternalLink className="w-5 h-5" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{link.label}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-lg border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Links open in a new tab. You must be logged in to Twilio to access these pages.
      </p>
    </div>
  );
}
