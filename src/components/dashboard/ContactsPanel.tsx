/**
 * ContactsPanel — Quick-access contacts widget for the dashboard.
 *
 * Shows active contacts with one-tap Call, SMS, and Email actions.
 * On mobile: native tel:/sms:/mailto: links.
 * On desktop: tel: and mailto: open the OS handler; SMS opens the Twilio
 * compose modal (same as the full Contacts page).
 *
 * Designed to sit inside the dashboard's scrollable <main> area.
 */

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Users, Phone, Mail, MessageSquare, Search, Loader2, AlertCircle, ChevronRight, Send, Check, X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { fetchCustomers, type Customer } from '@/lib/customers-api';

// ── SMS compose modal ─────────────────────────────────────────────────────────

function SmsModal({ to, name, onClose }: { to: string; name: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/stakeholders/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to, message }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-50 rounded-md">
              <MessageSquare size={15} className="text-violet-600" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800">Send SMS</h2>
              <p className="text-xs text-slate-400">{name} · {to}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSend} className="p-5 flex flex-col gap-4">
          {sent ? (
            <div className="flex items-center justify-center gap-2 py-6 text-emerald-600 font-semibold text-sm">
              <Check size={18} /> Message sent!
            </div>
          ) : (
            <>
              <textarea
                autoFocus
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder={`Type your message to ${name}…`}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors"
              />
              <p className="text-xs text-slate-400 -mt-2 text-right">{message.length} chars</p>
              {error && (
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                  <AlertCircle size={13} className="shrink-0" />{error}
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !message.trim()}
                  className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send SMS
                </button>
              </div>
            </>
          )}
        </form>
      </motion.div>
    </div>
  );
}

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({ contact }: { contact: Customer }) {
  const phone = contact.mobile || contact.phone;
  const email = contact.email;
  const [smsOpen, setSmsOpen] = useState(false);
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  function handleSms(e: React.MouseEvent) {
    e.stopPropagation();
    if (isMobile) {
      window.location.href = `sms:${phone}`;
    } else {
      setSmsOpen(true);
    }
  }

  const initials = contact.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  // Colour the avatar based on first char code for variety
  const avatarColors = [
    'bg-violet-100 text-violet-700',
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',
    'bg-indigo-100 text-indigo-700',
  ];
  const colorClass = avatarColors[(contact.name.charCodeAt(0) ?? 0) % avatarColors.length];

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors group">
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black ${colorClass}`}>
          {initials}
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{contact.name}</p>
          {contact.contact_person && (
            <p className="text-[11px] text-slate-400 truncate leading-tight">{contact.contact_person}</p>
          )}
          {!contact.contact_person && (phone || email) && (
            <p className="text-[11px] text-slate-400 truncate leading-tight">{phone ?? email}</p>
          )}
        </div>

        {/* Action buttons — always visible on mobile, visible on hover on desktop */}
        <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={e => e.stopPropagation()}
              title={`Call ${contact.name}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white transition-colors"
            >
              <Phone size={13} strokeWidth={2.2} />
            </a>
          )}
          {phone && (
            <button
              onClick={handleSms}
              title={`SMS ${contact.name}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white transition-colors"
            >
              <MessageSquare size={13} strokeWidth={2.2} />
            </button>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              onClick={e => e.stopPropagation()}
              title={`Email ${contact.name}`}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white transition-colors"
            >
              <Mail size={13} strokeWidth={2.2} />
            </a>
          )}
          <Link
            to={`/customers/${contact.id}`}
            title="View contact"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
          >
            <ChevronRight size={13} strokeWidth={2.2} />
          </Link>
        </div>
      </div>

      <AnimatePresence>
        {smsOpen && phone && (
          <SmsModal to={phone} name={contact.name} onClose={() => setSmsOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ContactsPanel() {
  const [contacts, setContacts] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCustomers('active')
      .then(setContacts)
      .catch(() => setError('Could not load contacts'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = contacts.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.contact_person ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.mobile ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden" data-testid="contacts-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Users size={13} className="text-teal-600 shrink-0" />
          <h2 className="font-heading font-semibold text-xs text-foreground">
            Contacts
            {!loading && contacts.length > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal">({contacts.length})</span>
            )}
          </h2>
        </div>
        <Link
          to="/customers"
          className="text-[11px] text-primary font-medium flex items-center gap-0.5 hover:underline"
        >
          Manage <ExternalLink size={10} className="ml-0.5" />
        </Link>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-primary" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-red-700">
            <AlertCircle size={13} className="shrink-0" />{error}
          </div>
        )}

        {!loading && !error && contacts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4">
            <Users size={20} className="text-slate-300 mb-2" />
            <p className="text-xs text-muted-foreground">No contacts yet.</p>
            <Link to="/customers" className="mt-2 text-xs text-primary font-semibold hover:underline">
              Add your first contact →
            </Link>
          </div>
        )}

        {!loading && !error && contacts.length > 0 && filtered.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No contacts match "{search}"
          </div>
        )}

        {!loading && filtered.map(c => (
          <ContactRow key={c.id} contact={c} />
        ))}
      </div>
    </div>
  );
}
