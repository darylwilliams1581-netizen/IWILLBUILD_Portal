/**
 * SendInvoiceEmailModal
 * Sends the invoice PDF as an email attachment via the server-side email gateway.
 * The user can confirm or override the recipient address before sending.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  invoiceId: number;
  invoiceNumber: string;
  /** Pre-fill from customer record; user can edit */
  defaultEmail: string;
  onClose: () => void;
}

export default function SendInvoiceEmailModal({ invoiceId, invoiceNumber, defaultEmail, onClose }: Props) {
  const [email, setEmail]       = useState(defaultEmail);
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState('');

  async function handleSend() {
    const to = email.trim();
    if (!to) { setError('Please enter a recipient email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { setError('Please enter a valid email address.'); return; }

    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Send failed (HTTP ${res.status})`);
      } else {
        setSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      >
        {/* Scrim */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
          initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                <Mail size={16} className="text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Send Invoice</p>
                <p className="text-xs text-muted-foreground">{invoiceNumber}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={18} />
            </button>
          </div>

          {sent ? (
            /* Success state */
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <p className="font-semibold text-gray-900">Invoice sent!</p>
              <p className="text-sm text-muted-foreground">
                Invoice {invoiceNumber} has been emailed to <strong>{email}</strong> with the PDF attached.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                The invoice PDF will be generated and attached automatically. Enter the recipient's email address below.
              </p>

              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Recipient email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && !sending && handleSend()}
                placeholder="customer@example.com"
                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 mb-4"
                autoFocus
                disabled={sending}
              />

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-4">
                  <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={onClose}
                  disabled={sending}
                  className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !email.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  {sending ? 'Sending…' : 'Send Invoice'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
