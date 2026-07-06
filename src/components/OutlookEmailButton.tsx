/**
 * OutlookEmailButton — reusable "Send via Outlook" button + optional "Copy body" action.
 *
 * Usage:
 *   <OutlookEmailButton context={{ kind: 'invoice', invoiceNumber: 'INV-001', ... }} />
 *   <OutlookEmailButton context={ctx} size="sm" showCopy />
 *   <OutlookEmailButton context={ctx} variant="ghost" />
 */
import { useState } from 'react';
import { Mail, Copy, Check } from 'lucide-react';
import {
  composeOutlookEmail,
  buildOptionsFromContext,
  type EmailContext,
} from '@/lib/messaging/outlook';

export interface OutlookEmailButtonProps {
  /** Module context — determines subject + body automatically */
  context: EmailContext;
  /** Button size variant */
  size?: 'xs' | 'sm' | 'md';
  /** Visual variant */
  variant?: 'outline' | 'ghost' | 'solid';
  /** Show a secondary "Copy body" icon button alongside */
  showCopy?: boolean;
  /** Override the button label (default: "Send via Outlook") */
  label?: string;
  /** Extra className on the wrapper div */
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'px-2 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-3 py-2 text-sm gap-1.5',
};

const ICON_SIZE = { xs: 11, sm: 13, md: 14 };

const VARIANT_CLASSES = {
  outline: 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted',
  ghost:   'text-muted-foreground hover:text-foreground hover:bg-muted',
  solid:   'bg-blue-600 hover:bg-blue-700 text-white border border-blue-700',
};

export default function OutlookEmailButton({
  context,
  size = 'sm',
  variant = 'outline',
  showCopy = false,
  label = 'Send via Outlook',
  className = '',
}: OutlookEmailButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleSend() {
    composeOutlookEmail(context);
  }

  function handleCopy() {
    const opts = buildOptionsFromContext(context);
    const text = [
      `Subject: ${opts.subject}`,
      '',
      ...opts.bodyLines,
    ].join('\n');
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const iconSz = ICON_SIZE[size];

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleSend}
        title="Open compose window in your default mail client"
        className={`flex items-center font-semibold rounded-lg transition-colors ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]}`}
      >
        <Mail size={iconSz} />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">Email</span>
      </button>

      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          title="Copy email body to clipboard"
          className={`flex items-center justify-center rounded-lg transition-colors border border-border text-muted-foreground hover:text-foreground hover:bg-muted ${size === 'xs' ? 'w-6 h-6' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'}`}
        >
          {copied ? <Check size={iconSz} className="text-emerald-500" /> : <Copy size={iconSz} />}
        </button>
      )}
    </div>
  );
}
