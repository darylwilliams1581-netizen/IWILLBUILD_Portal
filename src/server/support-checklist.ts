export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: 'company_profile', label: 'Company profile completed', description: 'Name, ABN, phone, email, address filled in', completed: false },
  { id: 'logo_uploaded', label: 'Logo uploaded', description: 'Company logo added to profile', completed: false },
  { id: 'users_invited', label: 'Users invited', description: 'At least one team member invited', completed: false },
  { id: 'permissions_configured', label: 'Permissions configured', description: 'User roles and permissions set up', completed: false },
  { id: 'cost_guide_added', label: 'Cost guide added', description: 'At least one cost guide item created', completed: false },
  { id: 'form_templates_created', label: 'Form templates created', description: 'At least one form template built', completed: false },
  { id: 'fleet_assets_added', label: 'Fleet assets added', description: 'Fleet vehicles/equipment added', completed: false },
  { id: 'first_job_created', label: 'First job created', description: 'First job record entered in the system', completed: false },
  { id: 'files_storage_checked', label: 'Files/storage checked', description: 'File storage working and accessible', completed: false },
  { id: 'dazza_knowledge_added', label: 'Dazza AI knowledge added', description: 'Company knowledge configured for Dazza AI', completed: false },
];
