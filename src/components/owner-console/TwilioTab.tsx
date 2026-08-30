/**
 * TwilioTab — owner-console tab for Twilio account management.
 * Provides quick-access links to the Twilio console, verified numbers,
 * and SMS logs so the owner doesn't need to remember the URLs.
 */
import { ExternalLink, Phone, MessageSquare, ShieldCheck, Settings, CreditCard } from 'lucide-react';

interface TwilioLink {
  label: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

const TWILIO_ACCOUNT_SID = 'AC5a833a07a75e828f97a620120ccac04a';

const links: TwilioLink[] = [
  {
    label: 'Twilio Console — Account Home',
    description: 'Main dashboard for your Twilio account.',
    url: `https://console.twilio.com/us1/account/manage-account/general-settings`,
    icon: <Settings className="w-5 h-5" />,
    highlight: true,
  },
  {
    label: 'Verified Caller IDs (Trial)',
    description: 'Add phone numbers that can receive SMS on your trial account. Required before SMS verification will work for any number.',
    url: `https://console.twilio.com/us1/develop/phone-numbers/manage/verified`,
    icon: <ShieldCheck className="w-5 h-5" />,
    highlight: true,
  },
  {
    label: 'SMS Logs',
    description: 'View sent and received SMS messages, delivery status, and errors.',
    url: `https://console.twilio.com/us1/monitor/logs/sms`,
    icon: <MessageSquare className="w-5 h-5" />,
  },
  {
    label: 'Phone Numbers',
    description: 'Manage your Twilio phone numbers (the number SMS is sent from).',
    url: `https://console.twilio.com/us1/develop/phone-numbers/manage/incoming`,
    icon: <Phone className="w-5 h-5" />,
  },
  {
    label: 'Billing & Upgrade',
    description: 'Upgrade from trial to a paid account to remove the verified-number restriction and send SMS to any number.',
    url: `https://console.twilio.com/us1/billing/manage-billing/billing-overview`,
    icon: <CreditCard className="w-5 h-5" />,
  },
];

export default function TwilioTab() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Twilio — SMS Management</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Quick access to your Twilio account. Account SID:{' '}
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{TWILIO_ACCOUNT_SID}</code>
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

      {/* Links */}
      <div className="space-y-3">
        {links.map((link) => (
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
              {link.icon}
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

      <p className="text-xs text-muted-foreground">
        Links open in a new tab. You must be logged in to Twilio to access these pages.
      </p>
    </div>
  );
}
