/**
 * Invoice-specific wrapper around the standard document email dialog.
 * Fetches compose defaults from the server before opening the modal.
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import SendDocumentEmailModal from './SendDocumentEmailModal';

interface Props {
  invoiceId: number;
  invoiceNumber: string;
  onClose: () => void;
}

interface Defaults {
  to: string;
  subject: string;
  message: string;
}

export default function SendInvoiceEmailModal({ invoiceId, invoiceNumber, onClose }: Props) {
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    fetch(`/api/invoices/${invoiceId}/compose-defaults`, { credentials: 'include' })
      .then(async (res) => {
        if (res.ok) {
          const d = await res.json() as Defaults;
          setDefaults(d);
        } else {
          setDefaults({ to: '', subject: '', message: '' });
        }
      })
      .catch(() => {
        setLoadError('Could not load email defaults. You can still compose manually.');
        setDefaults({ to: '', subject: '', message: '' });
      });
  }, [invoiceId]);

  if (!defaults) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
          <Loader2 size={24} className="animate-spin text-violet-600" />
          <p className="text-sm text-muted-foreground">Loading…</p>
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
        </div>
      </div>
    );
  }

  return (
    <SendDocumentEmailModal
      endpoint={`/api/invoices/${invoiceId}/send-email`}
      documentLabel="Invoice"
      documentType="invoice"
      documentId={invoiceId}
      documentName={invoiceNumber}
      defaultTo={defaults.to}
      defaultSubject={defaults.subject}
      defaultMessage={defaults.message}
      onClose={onClose}
    />
  );
}
