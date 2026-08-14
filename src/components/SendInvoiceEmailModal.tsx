/** Invoice-specific wrapper around the standard document email dialog. */
import SendDocumentEmailModal from './SendDocumentEmailModal';

interface Props {
  invoiceId: number;
  invoiceNumber: string;
  /** Pre-fill from customer record; user can edit */
  defaultEmail: string;
  onClose: () => void;
}

export default function SendInvoiceEmailModal({ invoiceId, invoiceNumber, defaultEmail, onClose }: Props) {
  return (
    <SendDocumentEmailModal
      endpoint={`/api/invoices/${invoiceId}/send-email`}
      documentLabel="Invoice"
      documentName={invoiceNumber}
      defaultEmail={defaultEmail}
      onClose={onClose}
    />
  );
}
