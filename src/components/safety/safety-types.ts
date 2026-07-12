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
  plan_data: string | null;
  plan_type: string | null;
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
export const PLAN_STATUSES = ['draft', 'active', 'under_review', 'superseded', 'closed'] as const;

export const PLAN_TYPES = [
  'Principal Contractor WHS Management Plan',
  'Contractor WHS&E Management Plan',
  'Site Safety Plan',
  'Project Safety Plan',
] as const;

export type PlanType = typeof PLAN_TYPES[number];

export const PRINCIPAL_CONTRACTOR_OPTIONS = ['Our company', 'Client', 'Head contractor', 'Other'] as const;

export const HIGH_RISK_CONSTRUCTION_WORK = [
  'Risk of a person falling more than 2 metres',
  'Telecommunications tower work',
  'Demolition of a load-bearing structure',
  'Work involving or likely to involve asbestos disturbance',
  'Structural alterations requiring temporary support',
  'Work in or near a confined space',
  'Work in or near a shaft or trench deeper than 1.5 metres',
  'Tunnel work',
  'Explosives',
  'Work on or near pressurised gas mains or piping',
  'Work on or near chemical, fuel or refrigerant lines',
  'Work on or near energised electrical installations or services',
  'Work in a contaminated or flammable atmosphere',
  'Tilt-up or precast concrete',
  'Work on or adjacent to an active road, railway or traffic corridor',
  'Work in an area where powered mobile plant is operating',
  'Work in artificial temperature extremes',
  'Work in or near water where there is a drowning risk',
  'Diving work',
] as const;

export const OTHER_CONTROLLED_ACTIVITIES = [
  'General excavation', 'Underground services', 'Overhead services', 'Silica-generating work',
  'Power tools', 'Hot work', 'Crane and rigging operations', 'Scaffolding', 'Formwork', 'Roofing',
  'Hazardous chemicals', 'Manual handling', 'Traffic management', 'Remote or isolated work',
  'Heat exposure', 'Public interface', 'Deliveries and unloading', 'Fuel storage',
  'Concrete works', 'Environmental disturbance',
] as const;

export const STANDARD_SITE_RULES = [
  'Sign in and sign out', 'Complete site induction', 'Hold a current White Card', 'Wear required PPE',
  'Follow site speed limits', 'Observe exclusion zones', 'Do not operate plant without authorisation',
  'Report hazards and incidents', 'Maintain housekeeping', 'Tag out defective equipment',
  'No drugs or alcohol', 'No unauthorised mobile phone use', 'Smoking only in designated areas',
  'Visitors must be escorted', 'Follow permits and SWMS', 'All workers have stop-work authority',
] as const;

export const INDUCTION_TYPES = [
  'General Construction Induction', 'Client Induction', 'Site-Specific Induction',
  'Electrical or Substation Induction', 'Environmental Induction', 'Plant Verification',
  'SWMS Briefing', 'Visitor Induction',
] as const;

export const HAZARDOUS_MATERIALS_LIST = [
  'Crystalline Silica', 'Asbestos', 'Lead Paint', 'Treated Timber', 'Mould',
  'Contaminated Soil', 'Fuel', 'Oils', 'Concrete Chemicals', 'Herbicides',
  'Pesticides', 'Other Hazardous Chemicals',
] as const;

export const AMENITIES_LIST = [
  'Toilets', 'Handwashing', 'Drinking Water', 'Meal Area', 'Shade', 'Change Facilities',
  'Showers', 'Secure Storage', 'Female-Designated Amenities Where Required',
  'Heat Recovery Area', 'Remote Work Communication Equipment',
] as const;

export const ENVIRONMENTAL_CONTROLS_LIST = [
  'Dust', 'Noise', 'Erosion and Sediment', 'Stormwater', 'Waste', 'Hazardous Waste',
  'Fuel and Chemical Spills', 'Waterway Protection', 'Vegetation Protection',
  'Weed and Seed Hygiene', 'Biosecurity', 'Neighbouring Properties', 'Working Hours',
  'Cultural Heritage', 'Contaminated Material',
] as const;

export const REVIEW_TRIGGERS = [
  'Scope Change', 'New Contractor', 'New Plant', 'New Chemical', 'New Work Method',
  'New Hazard', 'Incident or Near Miss', 'SWMS Not Followed', 'Control Failure',
  'Site Condition Change', 'Client Requirement Change', 'Legislative Change',
  'Emergency Arrangement Change',
] as const;

export const DEFAULT_CONTACT_ROLES = [
  'Principal Contractor Representative', 'Project Manager', 'Site Supervisor',
  'WHS Representative', 'First Aid Officer', 'Emergency Coordinator / Warden',
  'Environmental Representative', 'Electrical Safety Contact', 'Client Representative',
  'Alternate Supervisor', 'Alternate First Aid Officer',
] as const;

export const DEFAULT_RESPONSIBILITIES: Record<string, string> = {
  'Principal Contractor Representative': 'Overall responsibility for WHS management on site. Ensure the WHS Management Plan is implemented, maintained and communicated to all workers and contractors.',
  'Project Manager': 'Day-to-day management of project WHS requirements. Coordinate SWMS reviews, inductions and toolbox talks. Report incidents and hazards promptly.',
  'Site Supervisor': 'Direct supervision of all site activities. Ensure workers follow SWMS and site rules. Conduct pre-start meetings and site inspections. Authority to stop unsafe work.',
  'WHS Representative': 'Represent workers in WHS consultation. Assist with hazard identification and risk assessments. Participate in incident investigations.',
  'First Aid Officer': 'Provide first aid treatment as required. Maintain first aid kit and records. Coordinate emergency response until emergency services arrive.',
  'Emergency Coordinator / Warden': 'Coordinate site evacuation. Conduct head count at assembly point. Liaise with emergency services. Maintain emergency contact list.',
  'Environmental Representative': 'Monitor environmental controls. Ensure compliance with environmental permits and conditions. Report and respond to environmental incidents.',
  'Electrical Safety Contact': 'Oversee electrical safety on site. Ensure all electrical work is performed by licensed persons. Manage electrical isolation and lockout/tagout procedures.',
  'Client Representative': 'Represent client interests on site. Review and accept SWMS and safety plans. Approve variations to scope that affect safety.',
  'Alternate Supervisor': 'Act as Site Supervisor in their absence. Maintain same authority and responsibilities as Site Supervisor.',
  'Alternate First Aid Officer': 'Provide first aid in the absence of the primary First Aid Officer. Maintain current first aid certification.',
};

export const DEFAULT_APPENDICES = [
  { label: 'Appendix A', title: 'Risk Matrix' },
  { label: 'Appendix B', title: 'PPE Requirements' },
  { label: 'Appendix C', title: 'Emergency Assembly Point Poster' },
  { label: 'Appendix D', title: 'Emergency Contacts Poster' },
  { label: 'Appendix E', title: 'Site Layout or Evacuation Plan' },
  { label: 'Appendix F', title: 'Daily Pre-Start Form' },
  { label: 'Appendix G', title: 'Toolbox Talk Record' },
  { label: 'Appendix H', title: 'Incident Report Form' },
  { label: 'Appendix I', title: 'Worker Sign-Off Register' },
  { label: 'Appendix J', title: 'Plant Pre-Start Checklist' },
  { label: 'Appendix K', title: 'SWMS Register' },
  { label: 'Appendix L', title: 'Project SWMS Pack' },
];

// ── Extended WHS Plan data shape ──────────────────────────────────────────────

export interface WHS_Contact {
  id: string;
  role: string;
  name: string;
  company: string;
  position: string;
  phone: string;
  email: string;
  responsibilities: string;
  authorityToStop: boolean;
  alternateContact: string;
}

export interface WHS_HazardRow {
  id: string;
  hazard: string;
  location: string;
  peopleExposed: string;
  initialRisk: string;
  controls: string;
  responsiblePerson: string;
  dueDate: string;
  residualRisk: string;
  status: 'Open' | 'In Progress' | 'Controlled' | 'Closed' | 'Overdue';
  linkedSwms: string;
  reviewDate: string;
  closedBy: string;
  dateClosed: string;
}

export interface WHS_ConsultationRow {
  id: string;
  activity: string;
  frequency: string;
  participants: string;
  responsiblePerson: string;
  recordGenerated: string;
}

export interface WHS_EnvControlRow {
  id: string;
  item: string;
  controlMeasures: string;
  inspectionFrequency: string;
  responsiblePerson: string;
  incidentResponse: string;
}

export interface WHS_AppendixRow {
  id: string;
  label: string;
  title: string;
  attached: boolean;
}

export interface WHS_RevisionRow {
  id: string;
  revision: string;
  date: string;
  description: string;
  preparedBy: string;
  approvedBy: string;
}

export interface WHS_PlanData {
  planType: string;
  planNumber: string;
  revisionNumber: string;
  status: string;
  datePrepared: string;
  reviewDate: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  revisionHistory: WHS_RevisionRow[];
  projectName: string;
  projectNumber: string;
  projectDescription: string;
  scopeOfWorks: string;
  siteAddress: string;
  siteAccessInstructions: string;
  startDate: string;
  expectedCompletion: string;
  normalWorkingHours: string;
  projectValue: string;
  projectValueOver250k: string;
  clientName: string;
  clientContact: string;
  builderContractor: string;
  qbccLicenceHolder: string;
  qbccLicenceNumber: string;
  principalContractorWho: string;
  principalContractorName: string;
  principalContractorCompany: string;
  contacts: WHS_Contact[];
  emergencyServicesNumber: string;
  siteAddressForEmergency: string;
  gpsLocation: string;
  emergencyVehicleEntry: string;
  gateAccessInstructions: string;
  assemblyPointDescription: string;
  alarmMethod: string;
  headCountResponsibility: string;
  evacuationProcedure: string;
  firstAidKitLocation: string;
  aedLocation: string;
  fireExtinguisherLocations: string;
  spillKitLocation: string;
  eyewashLocation: string;
  electricalIsolationPoint: string;
  gasIsolationPoint: string;
  rescueEquipmentLocation: string;
  nearestMedicalCentre: string;
  medicalCentreAddress: string;
  medicalCentrePhone: string;
  nearestHospital: string;
  hospitalAddress: string;
  hospitalPhone: string;
  estimatedTravelTime: string;
  emergencyDrillFrequency: string;
  selectedSiteRules: string[];
  additionalSiteRules: string;
  visitorRequirements: string;
  siteSecurityRequirements: string;
  restrictedAreas: string;
  languagesAssistance: string;
  workerSignOffRequired: boolean;
  visitorSignOffRequired: boolean;
  selectedInductionTypes: string[];
  selectedHRCW: string[];
  hrcwDetails: Record<string, { linkedSwms: string; responsibleContractor: string; responsibleSupervisor: string; workLocation: string; scheduledStart: string; permitRequired: boolean; monitoringMethod: string; workerConsultation: boolean; status: string; }>;
  selectedOtherActivities: string[];
  otherActivityDetails: Record<string, { linkedSwms: string; permit: string; riskAssessment: string; responsiblePerson: string; }>;
  hazardRegister: WHS_HazardRow[];
  dailyPreStartRequired: boolean;
  toolboxTalkFrequency: string;
  siteInspectionFrequency: string;
  safetyMeetingFrequency: string;
  swmsReviewMethod: string;
  hazardReportingMethod: string;
  workerFeedbackMethod: string;
  recordsStorageLocation: string;
  consultationActivities: WHS_ConsultationRow[];
  plantRegisterRequired: boolean;
  preStartInspectionsRequired: boolean;
  operatorCompetencyVerified: boolean;
  vocRequired: boolean;
  maintenanceRecordsRequired: boolean;
  plantIsolationProcedure: string;
  lockoutTagout: string;
  keyControl: string;
  mobilePlantExclusionZones: string;
  spottersRequired: boolean;
  liftingEquipmentRegister: boolean;
  defectReporting: string;
  hireEquipmentVerification: boolean;
  reversingControls: string;
  plantPedestrianSeparation: string;
  temporarySwitchboard: boolean;
  rcdProtection: boolean;
  electricalInspectionTesting: string;
  leadManagement: string;
  electricalIsolation: string;
  overheadElectricalServices: string;
  undergroundElectricalServices: string;
  workNearEnergisedInstallations: string;
  safetyObserverRequired: boolean;
  electricalPermitRequired: boolean;
  clientAccessAuthorityRequired: boolean;
  siteSpeedLimit: string;
  vehicleEntry: string;
  vehicleExit: string;
  deliveryArea: string;
  pedestrianRoute: string;
  reversingControlsTraffic: string;
  spotterRequirementsTraffic: string;
  trafficManagementPlanRequired: boolean;
  publicRoadAffected: boolean;
  footpathAffected: boolean;
  emergencyVehicleAccessTraffic: string;
  deliveryBookingRequirements: string;
  selectedHazMat: string[];
  chemicalRegister: boolean;
  sdsRegister: boolean;
  storageLocation: string;
  segregationRequirements: string;
  spillControls: string;
  healthMonitoringRequired: boolean;
  respiratoryProtectionRequired: boolean;
  fitTestingRequired: boolean;
  wasteDisposalMethod: string;
  hazMatResponsiblePerson: string;
  selectedAmenities: string[];
  amenitiesLocation: string;
  cleaningFrequency: string;
  servicingProvider: string;
  amenitiesResponsiblePerson: string;
  amenitiesInspectionFrequency: string;
  selectedEnvControls: string[];
  envControlDetails: WHS_EnvControlRow[];
  incidentReportingMethod: string;
  immediateNotificationContact: string;
  pcNotificationContact: string;
  incidentInvestigationResponsibility: string;
  notifiableIncidentResponsibility: string;
  regulatorNotificationResponsibility: string;
  incidentSitePreservation: string;
  correctiveActionRegisterRequired: boolean;
  emergencyEscalationProcedure: string;
  selectedReviewTriggers: string[];
  scheduledReviewFrequency: string;
  reviewResponsiblePerson: string;
  lastReviewDate: string;
  nextReviewDate: string;
  reviewNotes: string;
  preparedByName: string;
  preparedByPosition: string;
  preparedByDate: string;
  reviewedByName: string;
  reviewedByPosition: string;
  reviewedByDate: string;
  approvedByName: string;
  approvedByPosition: string;
  approvedByDate: string;
  pcAcceptanceName: string;
  pcAcceptanceCompany: string;
  pcAcceptancePosition: string;
  pcAcceptanceDate: string;
  pcAcceptanceComments: string;
  appendices: WHS_AppendixRow[];
  jobId: string;
  jobName: string;
}
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
