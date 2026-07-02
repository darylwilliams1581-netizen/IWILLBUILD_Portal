/**
 * Smart Document Builder — System Field Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Full catalogue of all system fields that can be inserted as {{ token }} chips
 * inside text, rich text, tables, banners, and headers/footers.
 */

import type { SystemFieldToken } from './types';

export const SYSTEM_FIELDS: SystemFieldToken[] = [
  // ── Company ──────────────────────────────────────────────────────────────
  { key: 'company_name',           label: 'Company Name',           group: 'Company',         bindingPath: 'company.name',              fallback: '[Company Name]',           allowOverride: false, showOnExport: true },
  { key: 'company_abn',            label: 'ABN',                    group: 'Company',         bindingPath: 'company.abn',               fallback: '[ABN]',                    allowOverride: false, showOnExport: true },
  { key: 'company_acn',            label: 'ACN',                    group: 'Company',         bindingPath: 'company.acn',               fallback: '[ACN]',                    allowOverride: false, showOnExport: true },
  { key: 'company_address',        label: 'Company Address',        group: 'Company',         bindingPath: 'company.address',           fallback: '[Company Address]',        allowOverride: false, showOnExport: true },
  { key: 'company_phone',          label: 'Company Phone',          group: 'Company',         bindingPath: 'company.phone',             fallback: '[Company Phone]',          allowOverride: false, showOnExport: true },
  { key: 'company_email',          label: 'Company Email',          group: 'Company',         bindingPath: 'company.email',             fallback: '[Company Email]',          allowOverride: false, showOnExport: true },
  { key: 'company_website',        label: 'Company Website',        group: 'Company',         bindingPath: 'company.website',           fallback: '[Company Website]',        allowOverride: false, showOnExport: true },
  { key: 'company_director',       label: 'Company Director',       group: 'Company',         bindingPath: 'company.director',          fallback: '[Director]',               allowOverride: true,  showOnExport: true },
  { key: 'company_license_number', label: 'License Number',         group: 'Company',         bindingPath: 'company.licenseNumber',     fallback: '[License No.]',            allowOverride: true,  showOnExport: true },

  // ── Customer ──────────────────────────────────────────────────────────────
  { key: 'customer_name',          label: 'Customer Name',          group: 'Customer',        bindingPath: 'customer.name',             fallback: '[Customer Name]',          allowOverride: true,  showOnExport: true },
  { key: 'customer_company',       label: 'Customer Company',       group: 'Customer',        bindingPath: 'customer.company',          fallback: '[Customer Company]',       allowOverride: true,  showOnExport: true },
  { key: 'customer_contact_name',  label: 'Contact Name',           group: 'Customer',        bindingPath: 'customer.contactName',      fallback: '[Contact Name]',           allowOverride: true,  showOnExport: true },
  { key: 'customer_phone',         label: 'Customer Phone',         group: 'Customer',        bindingPath: 'customer.phone',            fallback: '[Customer Phone]',         allowOverride: true,  showOnExport: true },
  { key: 'customer_email',         label: 'Customer Email',         group: 'Customer',        bindingPath: 'customer.email',            fallback: '[Customer Email]',         allowOverride: true,  showOnExport: true },
  { key: 'customer_billing_address', label: 'Billing Address',      group: 'Customer',        bindingPath: 'customer.billingAddress',   fallback: '[Billing Address]',        allowOverride: true,  showOnExport: true },
  { key: 'customer_site_address',  label: 'Site Address',           group: 'Customer',        bindingPath: 'customer.siteAddress',      fallback: '[Site Address]',           allowOverride: true,  showOnExport: true },

  // ── Job ───────────────────────────────────────────────────────────────────
  { key: 'job_number',             label: 'Job Number',             group: 'Job',             bindingPath: 'job.number',                fallback: '[Job No.]',                allowOverride: false, showOnExport: true },
  { key: 'job_name',               label: 'Job Name',               group: 'Job',             bindingPath: 'job.name',                  fallback: '[Job Name]',               allowOverride: false, showOnExport: true },
  { key: 'job_title',              label: 'Job Title',              group: 'Job',             bindingPath: 'job.title',                 fallback: '[Job Title]',              allowOverride: false, showOnExport: true },
  { key: 'job_address',            label: 'Job Address',            group: 'Job',             bindingPath: 'job.address',               fallback: '[Job Address]',            allowOverride: true,  showOnExport: true },
  { key: 'job_site_address',       label: 'Site Address',           group: 'Job',             bindingPath: 'job.siteAddress',           fallback: '[Site Address]',           allowOverride: true,  showOnExport: true },
  { key: 'job_start_date',         label: 'Start Date',             group: 'Job',             bindingPath: 'job.startDate',             fallback: '[Start Date]',             allowOverride: true,  format: 'date', showOnExport: true },
  { key: 'job_completion_date',    label: 'Completion Date',        group: 'Job',             bindingPath: 'job.completionDate',        fallback: '[Completion Date]',        allowOverride: true,  format: 'date', showOnExport: true },
  { key: 'job_due_date',           label: 'Due Date',               group: 'Job',             bindingPath: 'job.dueDate',               fallback: '[Due Date]',               allowOverride: true,  format: 'date', showOnExport: true },
  { key: 'job_status',             label: 'Job Status',             group: 'Job',             bindingPath: 'job.status',                fallback: '[Status]',                 allowOverride: false, showOnExport: true },
  { key: 'job_type',               label: 'Job Type',               group: 'Job',             bindingPath: 'job.type',                  fallback: '[Job Type]',               allowOverride: false, showOnExport: true },
  { key: 'job_description',        label: 'Job Description',        group: 'Job',             bindingPath: 'job.description',           fallback: '[Description]',            allowOverride: true,  showOnExport: true },
  { key: 'job_scope_of_works',     label: 'Scope of Works',         group: 'Job',             bindingPath: 'job.scopeOfWorks',          fallback: '[Scope of Works]',         allowOverride: true,  showOnExport: true },
  { key: 'job_supervisor',         label: 'Supervisor',             group: 'Job',             bindingPath: 'job.supervisor',            fallback: '[Supervisor]',             allowOverride: true,  showOnExport: true },
  { key: 'job_project_manager',    label: 'Project Manager',        group: 'Job',             bindingPath: 'job.projectManager',        fallback: '[Project Manager]',        allowOverride: true,  showOnExport: true },
  { key: 'job_principal_contractor', label: 'Principal Contractor', group: 'Job',             bindingPath: 'job.principalContractor',   fallback: '[Principal Contractor]',   allowOverride: true,  showOnExport: true },
  { key: 'job_client_reference',   label: 'Client Reference',       group: 'Job',             bindingPath: 'job.clientReference',       fallback: '[Client Ref.]',            allowOverride: true,  showOnExport: true },
  { key: 'job_purchase_order',     label: 'Purchase Order',         group: 'Job',             bindingPath: 'job.purchaseOrder',         fallback: '[PO No.]',                 allowOverride: true,  showOnExport: true },
  { key: 'job_cost_code',          label: 'Cost Code',              group: 'Job',             bindingPath: 'job.costCode',              fallback: '[Cost Code]',              allowOverride: true,  showOnExport: true },

  // ── User / Worker ─────────────────────────────────────────────────────────
  { key: 'current_user_name',      label: 'Current User Name',      group: 'User / Worker',   bindingPath: 'user.name',                 fallback: '[User Name]',              allowOverride: false, showOnExport: true },
  { key: 'current_user_email',     label: 'Current User Email',     group: 'User / Worker',   bindingPath: 'user.email',                fallback: '[User Email]',             allowOverride: false, showOnExport: false },
  { key: 'current_user_phone',     label: 'Current User Phone',     group: 'User / Worker',   bindingPath: 'user.phone',                fallback: '[User Phone]',             allowOverride: false, showOnExport: false },
  { key: 'current_user_role',      label: 'Current User Role',      group: 'User / Worker',   bindingPath: 'user.role',                 fallback: '[Role]',                   allowOverride: false, showOnExport: true },
  { key: 'worker_name',            label: 'Worker Name',            group: 'User / Worker',   bindingPath: 'worker.name',               fallback: '[Worker Name]',            allowOverride: true,  showOnExport: true },
  { key: 'worker_position',        label: 'Worker Position',        group: 'User / Worker',   bindingPath: 'worker.position',           fallback: '[Position]',               allowOverride: true,  showOnExport: true },
  { key: 'worker_phone',           label: 'Worker Phone',           group: 'User / Worker',   bindingPath: 'worker.phone',              fallback: '[Worker Phone]',           allowOverride: true,  showOnExport: false },
  { key: 'worker_email',           label: 'Worker Email',           group: 'User / Worker',   bindingPath: 'worker.email',              fallback: '[Worker Email]',           allowOverride: true,  showOnExport: false },
  { key: 'worker_license_number',  label: 'License Number',         group: 'User / Worker',   bindingPath: 'worker.licenseNumber',      fallback: '[License No.]',            allowOverride: true,  showOnExport: true },
  { key: 'worker_ticket_number',   label: 'Ticket Number',          group: 'User / Worker',   bindingPath: 'worker.ticketNumber',       fallback: '[Ticket No.]',             allowOverride: true,  showOnExport: true },

  // ── Document ──────────────────────────────────────────────────────────────
  { key: 'document_title',         label: 'Document Title',         group: 'Document',        bindingPath: 'document.title',            fallback: '[Document Title]',         allowOverride: true,  showOnExport: true },
  { key: 'document_number',        label: 'Document Number',        group: 'Document',        bindingPath: 'document.number',           fallback: '[Doc No.]',                allowOverride: true,  showOnExport: true },
  { key: 'document_revision',      label: 'Revision',               group: 'Document',        bindingPath: 'document.revision',         fallback: '[Rev.]',                   allowOverride: true,  showOnExport: true },
  { key: 'document_created_date',  label: 'Created Date',           group: 'Document',        bindingPath: 'document.createdDate',      fallback: '[Created Date]',           allowOverride: false, format: 'date', showOnExport: true },
  { key: 'document_review_date',   label: 'Review Date',            group: 'Document',        bindingPath: 'document.reviewDate',       fallback: '[Review Date]',            allowOverride: true,  format: 'date', showOnExport: true },
  { key: 'document_completed_date', label: 'Completed Date',        group: 'Document',        bindingPath: 'document.completedDate',    fallback: '[Completed Date]',         allowOverride: true,  format: 'date', showOnExport: true },
  { key: 'document_status',        label: 'Document Status',        group: 'Document',        bindingPath: 'document.status',           fallback: '[Status]',                 allowOverride: true,  showOnExport: true },
  { key: 'document_author',        label: 'Author',                 group: 'Document',        bindingPath: 'document.author',           fallback: '[Author]',                 allowOverride: true,  showOnExport: true },
  { key: 'page_number',            label: 'Page Number',            group: 'Document',        bindingPath: 'document.pageNumber',       fallback: '1',                        allowOverride: false, showOnExport: true },
  { key: 'total_pages',            label: 'Total Pages',            group: 'Document',        bindingPath: 'document.totalPages',       fallback: '1',                        allowOverride: false, showOnExport: true },

  // ── Asset / Plant ─────────────────────────────────────────────────────────
  { key: 'asset_name',             label: 'Asset Name',             group: 'Asset / Plant',   bindingPath: 'asset.name',                fallback: '[Asset Name]',             allowOverride: true,  showOnExport: true },
  { key: 'asset_id',               label: 'Asset ID',               group: 'Asset / Plant',   bindingPath: 'asset.id',                  fallback: '[Asset ID]',               allowOverride: true,  showOnExport: true },
  { key: 'asset_registration',     label: 'Registration',           group: 'Asset / Plant',   bindingPath: 'asset.registration',        fallback: '[Rego]',                   allowOverride: true,  showOnExport: true },
  { key: 'asset_make',             label: 'Make',                   group: 'Asset / Plant',   bindingPath: 'asset.make',                fallback: '[Make]',                   allowOverride: true,  showOnExport: true },
  { key: 'asset_model',            label: 'Model',                  group: 'Asset / Plant',   bindingPath: 'asset.model',               fallback: '[Model]',                  allowOverride: true,  showOnExport: true },
  { key: 'asset_serial_number',    label: 'Serial Number',          group: 'Asset / Plant',   bindingPath: 'asset.serialNumber',        fallback: '[Serial No.]',             allowOverride: true,  showOnExport: true },
  { key: 'asset_next_service_date', label: 'Next Service Date',     group: 'Asset / Plant',   bindingPath: 'asset.nextServiceDate',     fallback: '[Service Date]',           allowOverride: true,  format: 'date', showOnExport: true },
  { key: 'asset_inspection_due_date', label: 'Inspection Due',      group: 'Asset / Plant',   bindingPath: 'asset.inspectionDueDate',   fallback: '[Inspection Due]',         allowOverride: true,  format: 'date', showOnExport: true },

  // ── Location / Weather ────────────────────────────────────────────────────
  { key: 'site_latitude',          label: 'Latitude',               group: 'Location / Weather', bindingPath: 'location.latitude',      fallback: '[Lat]',                    allowOverride: false, showOnExport: true },
  { key: 'site_longitude',         label: 'Longitude',              group: 'Location / Weather', bindingPath: 'location.longitude',     fallback: '[Lng]',                    allowOverride: false, showOnExport: true },
  { key: 'site_gps',               label: 'GPS Coordinates',        group: 'Location / Weather', bindingPath: 'location.gps',           fallback: '[GPS]',                    allowOverride: false, showOnExport: true },
  { key: 'site_weather',           label: 'Weather',                group: 'Location / Weather', bindingPath: 'location.weather',       fallback: '[Weather]',                allowOverride: false, showOnExport: true },
  { key: 'site_temperature',       label: 'Temperature',            group: 'Location / Weather', bindingPath: 'location.temperature',   fallback: '[Temp]',                   allowOverride: false, showOnExport: true },
  { key: 'site_wind',              label: 'Wind',                   group: 'Location / Weather', bindingPath: 'location.wind',          fallback: '[Wind]',                   allowOverride: false, showOnExport: true },
  { key: 'site_rain_status',       label: 'Rain Status',            group: 'Location / Weather', bindingPath: 'location.rainStatus',    fallback: '[Rain Status]',            allowOverride: false, showOnExport: true },
];

export const SYSTEM_FIELD_MAP = Object.fromEntries(SYSTEM_FIELDS.map((f) => [f.key, f]));

export const SYSTEM_FIELD_GROUPS = [...new Set(SYSTEM_FIELDS.map((f) => f.group))];

export function getSystemField(key: string): SystemFieldToken | undefined {
  return SYSTEM_FIELD_MAP[key];
}

/**
 * Resolve a system field token against a context object.
 * Returns the resolved string value or the field's fallback.
 */
export function resolveSystemField(
  key: string,
  context: Record<string, unknown>
): string {
  const field = SYSTEM_FIELD_MAP[key];
  if (!field) return `{{ ${key} }}`;

  const parts = field.bindingPath.split('.');
  let value: unknown = context;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') { value = undefined; break; }
    value = (value as Record<string, unknown>)[part];
  }

  if (value == null || value === '') return field.fallback;
  return String(value);
}

/**
 * Resolve all {{ token }} placeholders in a string.
 */
export function resolveTokensInString(
  text: string,
  context: Record<string, unknown>
): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) =>
    resolveSystemField(key, context)
  );
}
