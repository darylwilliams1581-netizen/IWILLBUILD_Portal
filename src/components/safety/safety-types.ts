// Shared types and helpers for safety page components

export interface SwmsTemplate {
  id: number;
  title: string;
  work_activity: string | null;
  hazards: string | null;
  risks: string | null;
  controls: string | null;
  ppe: string | null;
  plant_equipment: string | null;
  training_competency: string | null;
  emergency_controls: string | null;
  environmental_controls: string | null;
  sign_off_requirements: string | null;
  revision_number: string;
  review_date: string | null;
  status: string;
  author_name: string | null;
  approved_by_name: string | null;
  created_at: string;
}

export interface SafetyPlan {
  id: number;
  job_id: number | null;
  title: string;
  project_value: string | null;
  is_principal_contractor: number;
  site_address: string | null;
  site_supervisor: string | null;
  first_aid_officer: string | null;
  emergency_contact: string | null;
  nearest_hospital: string | null;
  emergency_assembly_point: string | null;
  evacuation_notes: string | null;
  site_rules: string | null;
  high_risk_activities: string | null;
  status: string;
  job_name: string | null;
  job_number: string | null;
  created_at: string;
}

export interface SafetyDocument {
  id: number;
  title: string;
  doc_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  review_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface SafetyPoster {
  id: number;
  title: string;
  poster_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  notes: string | null;
  created_at: string;
}

export interface GeneratedPoster {
  id: number;
  title: string;
  poster_type: string;
  data_json: string;
  created_at: string;
}

export interface JobSwms {
  id: number;
  job_id: number;
  template_id: number | null;
  title: string;
  work_activity: string | null;
  hazards: string | null;
  risks: string | null;
  controls: string | null;
  ppe: string | null;
  plant_equipment: string | null;
  training_competency: string | null;
  emergency_controls: string | null;
  environmental_controls: string | null;
  sign_off_requirements: string | null;
  permits_approvals: string | null;
  monitoring_review: string | null;
  notes: string | null;
  revision_number: string;
  review_date: string | null;
  status: string;
  reviewed_at: string | null;
  approved_at: string | null;
  job_name: string | null;
  job_number: string | null;
  client_name: string | null;
  job_site_address: string | null;
  supervisor: string | null;
  created_at: string;
  updated_at: string;
}

export interface SwmsPrintData {
  title: string;
  work_activity?: string | null;
  revision_number?: string;
  review_date?: string | null;
  status?: string;
  author_name?: string | null;
  approved_by_name?: string | null;
  hazards?: string | null;
  risks?: string | null;
  controls?: string | null;
  ppe?: string | null;
  plant_equipment?: string | null;
  training_competency?: string | null;
  emergency_controls?: string | null;
  environmental_controls?: string | null;
  sign_off_requirements?: string | null;
  permits_approvals?: string | null;
  monitoring_review?: string | null;
  notes?: string | null;
  job_name?: string | null;
  job_number?: string | null;
  client_name?: string | null;
  job_site_address?: string | null;
  supervisor?: string | null;
}

export const SWMS_STATUSES = ['draft', 'active', 'archived'] as const;
export const PLAN_STATUSES = ['draft', 'active', 'archived'] as const;
export const JOB_SWMS_STATUSES = ['draft', 'reviewed', 'approved', 'archived'] as const;

export const HIGH_RISK_ACTIVITIES = [
  'Working at heights (>2m)',
  'Excavation / trenching',
  'Confined spaces',
  'Demolition',
  'Asbestos removal',
  'Electrical work',
  'Crane / rigging operations',
  'Pressurised systems',
  'Hot work (welding/cutting)',
  'Hazardous chemicals',
  'Tilt-up construction',
  'Formwork / falsework',
  'Tunnelling',
  'Diving operations',
];

export const POLICY_TYPES = [
  'WHS Policy',
  'Environmental Policy',
  'Drug & Alcohol Policy',
  'Fatigue Management',
  'Manual Handling',
  'Excavation & Underground Services',
  'Working Near Electrical Assets',
  'PPE Policy',
  'Training & Competency',
  'Consultation & Communication',
  'Risk Management',
  'Spill Response',
  'Document Control',
  'Bullying / Harassment / Equal Opportunity',
  'Other',
];

export const POSTER_TYPES = [
  'Emergency Contacts',
  'Emergency Assembly Point',
  'Risk Matrix',
  'Life Saving Rules',
  'PPE / Safety Icons',
  'Sign-on Poster',
  'Incident Reporting',
  'Other',
];

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    reviewed: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    archived: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return map[status] ?? 'bg-slate-100 text-slate-500 border-slate-200';
}
