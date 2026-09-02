/**
 * outlook.ts — mailto: compose helper for IWIIlBUILD
 *
 * Opens the user's default mail client (Outlook, Apple Mail, etc.) with a
 * pre-filled compose window.  No SMTP, no server calls, no attachments.
 *
 * Usage:
 *   import { openOutlookEmail, buildOutlookUrl } from '@/lib/messaging/outlook';
 *
 *   // Open compose window immediately
 *   openOutlookEmail({ subject: 'Quote #123', bodyLines: ['Hi...'] });
 *
 *   // Build URL only (e.g. for an <a href> or clipboard copy)
 *   const url = buildOutlookUrl({ subject: 'Quote #123', bodyLines: ['Hi...'] });
 */

export interface OutlookEmailOptions {
  /** Primary recipient(s) — optional; user can fill in Outlook */
  to?: string | string[];
  /** CC recipient(s) — optional */
  cc?: string | string[];
  /** Email subject line */
  subject: string;
  /**
   * Body lines — each entry becomes a paragraph separated by a blank line.
   * Use plain strings; no HTML.
   */
  bodyLines: string[];
}

// ─── Context shapes (one per module) ─────────────────────────────────────────

export interface JobEmailContext {
  kind: 'job';
  jobNumber: string;
  jobName: string;
  status?: string;
  customerName?: string;
  siteAddress?: string;
  assignedTo?: string;
  link?: string;
  to?: string;
}

export interface EstimateEmailContext {
  kind: 'estimate';
  estimateNumber: string;
  jobName?: string;
  customerName?: string;
  totalAmount?: string;
  status?: string;
  link?: string;
  to?: string;
}

export interface InvoiceEmailContext {
  kind: 'invoice';
  invoiceNumber: string;
  customerName?: string;
  totalAmount?: string;
  dueDate?: string;
  status?: string;
  paymentLink?: string;
  link?: string;
  to?: string;
}

export interface AssetEmailContext {
  kind: 'asset';
  assetName: string;
  assetAcronym?: string;
  assetType?: string;
  inspectionTitle?: string;
  inspectionDate?: string;
  openDefects?: number;
  link?: string;
  to?: string;
}

export interface PlanEmailContext {
  kind: 'plan';
  drawingTitle: string;
  drawingNumber?: string;
  revision?: string;
  projectName?: string;
  link?: string;
  to?: string;
}

export interface FormEmailContext {
  kind: 'form';
  formTitle: string;
  submittedAt?: string;
  submittedBy?: string;
  jobName?: string;
  link?: string;
  to?: string;
}

export type EmailContext =
  | JobEmailContext
  | EstimateEmailContext
  | InvoiceEmailContext
  | AssetEmailContext
  | PlanEmailContext
  | FormEmailContext;

// ─── Context → OutlookEmailOptions ───────────────────────────────────────────

const FOOTER = 'Sent from IWIIlBUILD — https://iwillbuild.com';
const DIVIDER = '─────────────────────────────────────';

export function buildOptionsFromContext(ctx: EmailContext): OutlookEmailOptions {
  switch (ctx.kind) {
    case 'job': {
      const subject = `Job ${ctx.jobNumber}${ctx.jobName ? ` — ${ctx.jobName}` : ''}`;
      const bodyLines = [
        `Hi${ctx.customerName ? ` ${ctx.customerName}` : ''},`,
        '',
        `Please find details for the following job:`,
        '',
        DIVIDER,
        `Job Number:  ${ctx.jobNumber}`,
        ...(ctx.jobName     ? [`Job Name:    ${ctx.jobName}`]     : []),
        ...(ctx.status      ? [`Status:      ${ctx.status}`]      : []),
        ...(ctx.siteAddress ? [`Site:        ${ctx.siteAddress}`] : []),
        ...(ctx.assignedTo  ? [`Assigned To: ${ctx.assignedTo}`]  : []),
        DIVIDER,
        ...(ctx.link ? [`View job: ${ctx.link}`, ''] : []),
        FOOTER,
      ];
      return { to: ctx.to, subject, bodyLines };
    }

    case 'estimate': {
      const subject = `Estimate ${ctx.estimateNumber}${ctx.jobName ? ` — ${ctx.jobName}` : ''}`;
      const bodyLines = [
        `Hi${ctx.customerName ? ` ${ctx.customerName}` : ''},`,
        '',
        `Please find your estimate below:`,
        '',
        DIVIDER,
        `Estimate No: ${ctx.estimateNumber}`,
        ...(ctx.jobName      ? [`Job:         ${ctx.jobName}`]      : []),
        ...(ctx.totalAmount  ? [`Total:       ${ctx.totalAmount}`]   : []),
        ...(ctx.status       ? [`Status:      ${ctx.status}`]       : []),
        DIVIDER,
        ...(ctx.link ? [`View estimate: ${ctx.link}`, ''] : []),
        `Please review and let us know if you have any questions.`,
        '',
        FOOTER,
      ];
      return { to: ctx.to, subject, bodyLines };
    }

    case 'invoice': {
      const subject = `Invoice ${ctx.invoiceNumber}${ctx.customerName ? ` — ${ctx.customerName}` : ''}`;
      const bodyLines = [
        `Hi${ctx.customerName ? ` ${ctx.customerName}` : ''},`,
        '',
        `Please find your invoice attached.`,
        '',
        DIVIDER,
        `Invoice No:  ${ctx.invoiceNumber}`,
        ...(ctx.totalAmount ? [`Amount:      ${ctx.totalAmount}`] : []),
        ...(ctx.dueDate     ? [`Due Date:    ${ctx.dueDate}`]     : []),
        DIVIDER,
        '',
        `Please don't hesitate to contact us if you have any questions.`,
        '',
        FOOTER,
      ];
      return { to: ctx.to, subject, bodyLines };
    }

    case 'asset': {
      const label = ctx.assetAcronym ? `${ctx.assetName} (${ctx.assetAcronym})` : ctx.assetName;
      const subject = ctx.inspectionTitle
        ? `Inspection Report — ${label} — ${ctx.inspectionTitle}`
        : `Asset Report — ${label}`;
      const bodyLines = [
        `Hi,`,
        '',
        `Please find the inspection report for the following asset:`,
        '',
        DIVIDER,
        `Asset:       ${label}`,
        ...(ctx.assetType       ? [`Type:        ${ctx.assetType}`]                                          : []),
        ...(ctx.inspectionTitle ? [`Inspection:  ${ctx.inspectionTitle}`]                                    : []),
        ...(ctx.inspectionDate  ? [`Date:        ${ctx.inspectionDate}`]                                     : []),
        ...(ctx.openDefects !== undefined ? [`Open Defects: ${ctx.openDefects}`]                             : []),
        DIVIDER,
        ...(ctx.link ? [`View report: ${ctx.link}`, ''] : []),
        FOOTER,
      ];
      return { to: ctx.to, subject, bodyLines };
    }

    case 'plan': {
      const subject = ctx.drawingNumber
        ? `Drawing ${ctx.drawingNumber} — ${ctx.drawingTitle}`
        : `Drawing — ${ctx.drawingTitle}`;
      const bodyLines = [
        `Hi,`,
        '',
        `Please find the drawing details below:`,
        '',
        DIVIDER,
        `Title:       ${ctx.drawingTitle}`,
        ...(ctx.drawingNumber ? [`Drawing No:  ${ctx.drawingNumber}`] : []),
        ...(ctx.revision      ? [`Revision:    ${ctx.revision}`]      : []),
        ...(ctx.projectName   ? [`Project:     ${ctx.projectName}`]   : []),
        DIVIDER,
        ...(ctx.link ? [`View drawing: ${ctx.link}`, ''] : []),
        FOOTER,
      ];
      return { to: ctx.to, subject, bodyLines };
    }

    case 'form': {
      const subject = `Form Submission — ${ctx.formTitle}${ctx.jobName ? ` (${ctx.jobName})` : ''}`;
      const bodyLines = [
        `Hi,`,
        '',
        `A form has been submitted:`,
        '',
        DIVIDER,
        `Form:        ${ctx.formTitle}`,
        ...(ctx.jobName     ? [`Job:         ${ctx.jobName}`]     : []),
        ...(ctx.submittedBy ? [`Submitted By: ${ctx.submittedBy}`] : []),
        ...(ctx.submittedAt ? [`Submitted At: ${ctx.submittedAt}`] : []),
        DIVIDER,
        ...(ctx.link ? [`View submission: ${ctx.link}`, ''] : []),
        FOOTER,
      ];
      return { to: ctx.to, subject, bodyLines };
    }
  }
}

// ─── Core mailto builder ──────────────────────────────────────────────────────

/**
 * Builds a `mailto:` URL from the given options.
 * All fields are safely percent-encoded.
 */
export function buildOutlookUrl(opts: OutlookEmailOptions): string {
  const toStr  = Array.isArray(opts.to)  ? opts.to.join(',')  : (opts.to  ?? '');
  const ccStr  = Array.isArray(opts.cc)  ? opts.cc.join(',')  : (opts.cc  ?? '');
  const body   = opts.bodyLines.join('\r\n');

  const params = new URLSearchParams();
  if (ccStr)          params.set('cc',      ccStr);
  params.set('subject', opts.subject);
  params.set('body',    body);

  // URLSearchParams uses + for spaces; mailto: needs %20 in subject/body
  const qs = params.toString().replace(/\+/g, '%20');

  return `mailto:${encodeURIComponent(toStr)}?${qs}`;
}

/**
 * Opens the user's default mail client with a pre-filled compose window.
 * Returns the mailto: URL that was opened (useful for clipboard copy).
 */
export function openOutlookEmail(opts: OutlookEmailOptions): string {
  const url = buildOutlookUrl(opts);
  window.location.href = url;
  return url;
}

/**
 * Convenience: build options from a module context object, then open.
 */
export function composeOutlookEmail(ctx: EmailContext): string {
  return openOutlookEmail(buildOptionsFromContext(ctx));
}

/**
 * Convenience: build options from a module context object, return URL only.
 */
export function buildOutlookUrlFromContext(ctx: EmailContext): string {
  return buildOutlookUrl(buildOptionsFromContext(ctx));
}
