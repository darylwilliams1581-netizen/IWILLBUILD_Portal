/**
 * WHS_PlanBuilder — full multi-step WHS/Safety Management Plan builder.
 * 21 sections covering the complete spec from the Austen plan template.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, ChevronLeft, ChevronRight, Save, Check, AlertTriangle,
  Plus, Trash2, Loader2, ShieldCheck, ClipboardList, Users,
  AlertCircle, Wrench, Zap, Car, FlaskConical, Building2,
  Leaf, FileWarning, RotateCcw, PenLine, BookOpen, Info,
} from 'lucide-react';
import type { WHS_PlanData, WHS_Contact, WHS_HazardRow, WHS_ConsultationRow, WHS_EnvControlRow, WHS_AppendixRow, WHS_RevisionRow } from './safety-types';
import {
  PLAN_TYPES, PLAN_STATUSES, PRINCIPAL_CONTRACTOR_OPTIONS,
  HIGH_RISK_CONSTRUCTION_WORK, OTHER_CONTROLLED_ACTIVITIES,
  STANDARD_SITE_RULES, INDUCTION_TYPES, HAZARDOUS_MATERIALS_LIST,
  AMENITIES_LIST, ENVIRONMENTAL_CONTROLS_LIST, REVIEW_TRIGGERS,
  DEFAULT_CONTACT_ROLES, DEFAULT_RESPONSIBILITIES, DEFAULT_APPENDICES,
} from './safety-types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function today() { return new Date().toISOString().slice(0, 10); }

function emptyContact(role = ''): WHS_Contact {
  return { id: uid(), role, name: '', company: '', position: '', phone: '', email: '', responsibilities: DEFAULT_RESPONSIBILITIES[role] ?? '', authorityToStop: false, alternateContact: '' };
}

function emptyHazard(): WHS_HazardRow {
  return { id: uid(), hazard: '', location: '', peopleExposed: '', initialRisk: 'Medium', controls: '', responsiblePerson: '', dueDate: '', residualRisk: 'Low', status: 'Open', linkedSwms: '', reviewDate: '', closedBy: '', dateClosed: '' };
}

function emptyConsultation(): WHS_ConsultationRow {
  return { id: uid(), activity: '', frequency: '', participants: '', responsiblePerson: '', recordGenerated: '' };
}

function emptyEnvControl(item = ''): WHS_EnvControlRow {
  return { id: uid(), item, controlMeasures: '', inspectionFrequency: '', responsiblePerson: '', incidentResponse: '' };
}

function emptyAppendix(label = '', title = ''): WHS_AppendixRow {
  return { id: uid(), label, title, attached: false };
}

function emptyRevision(): WHS_RevisionRow {
  return { id: uid(), revision: '1.0', date: today(), description: 'Initial issue', preparedBy: '', approvedBy: '' };
}

// ─── Austen plan prefill data ─────────────────────────────────────────────────

export function austenPlanDefaults(): Partial<WHS_PlanData> {
  return {
    planType: 'Contractor WHS&E Management Plan',
    planNumber: 'WHS-001',
    revisionNumber: '1.0',
    status: 'draft',
    datePrepared: today(),
    reviewDate: '',
    preparedBy: 'Daryl Austen',
    reviewedBy: '',
    approvedBy: '',
    revisionHistory: [{ id: uid(), revision: '1.0', date: today(), description: 'Initial issue — Austen plan template', preparedBy: 'Daryl Austen', approvedBy: '' }],
    projectName: 'Austen Construction Project',
    projectNumber: 'PRJ-001',
    projectDescription: 'General construction, civil works and landscaping project.',
    scopeOfWorks: 'Site preparation, earthworks, concrete works, structural framing, roofing, fit-out and landscaping.',
    siteAddress: '',
    siteAccessInstructions: 'Report to site office on arrival. Sign in at the site register. Follow all directional signage.',
    startDate: '',
    expectedCompletion: '',
    normalWorkingHours: 'Monday to Friday 6:30 AM – 5:00 PM. Saturday 7:00 AM – 12:00 PM.',
    projectValue: '',
    projectValueOver250k: 'Yes',
    clientName: '',
    clientContact: '',
    builderContractor: 'IWILLBUILD',
    qbccLicenceHolder: '',
    qbccLicenceNumber: '',
    principalContractorWho: 'Our company',
    principalContractorName: '',
    principalContractorCompany: '',
    contacts: [
      { ...emptyContact('Site Supervisor'), name: 'Daryl Austen', company: 'IWILLBUILD', position: 'Site Supervisor', phone: '', email: '' },
      { ...emptyContact('First Aid Officer'), name: '', company: 'IWILLBUILD', position: 'First Aid Officer', phone: '', email: '' },
      { ...emptyContact('WHS Representative'), name: '', company: 'IWILLBUILD', position: 'WHS Representative', phone: '', email: '' },
      { ...emptyContact('Emergency Coordinator / Warden'), name: '', company: 'IWILLBUILD', position: 'Emergency Coordinator', phone: '', email: '' },
    ],
    emergencyServicesNumber: '000',
    siteAddressForEmergency: '',
    gpsLocation: '',
    emergencyVehicleEntry: 'Main site entrance. Ensure gates are unlocked and access is clear at all times.',
    gateAccessInstructions: 'Contact site supervisor for gate access code.',
    assemblyPointDescription: 'Assembly point is located at the front car park, away from all structures and plant.',
    alarmMethod: 'Verbal alarm and air horn — three short blasts.',
    headCountResponsibility: 'Site Supervisor or Emergency Warden.',
    evacuationProcedure: '1. Sound alarm (three short blasts on air horn).\n2. All workers stop work immediately and proceed to assembly point.\n3. Emergency Warden conducts head count.\n4. Contact emergency services if required (000).\n5. Do not re-enter site until all-clear is given by Site Supervisor.',
    firstAidKitLocation: 'Site office / first aid room.',
    aedLocation: 'Site office.',
    fireExtinguisherLocations: 'Site office, fuel storage area, and near all hot work areas.',
    spillKitLocation: 'Near fuel storage area and chemical storage.',
    eyewashLocation: 'Site office / first aid room.',
    electricalIsolationPoint: 'Main switchboard — located at site office.',
    gasIsolationPoint: 'Gas meter — located at site boundary.',
    rescueEquipmentLocation: 'Site office.',
    nearestMedicalCentre: '',
    medicalCentreAddress: '',
    medicalCentrePhone: '',
    nearestHospital: '',
    hospitalAddress: '',
    hospitalPhone: '',
    estimatedTravelTime: '',
    emergencyDrillFrequency: 'Every 6 months or following any emergency event.',
    selectedSiteRules: [...STANDARD_SITE_RULES],
    additionalSiteRules: '',
    visitorRequirements: 'All visitors must sign in, complete visitor induction and be escorted by a site representative at all times.',
    siteSecurityRequirements: 'Site is secured after hours. All workers must sign in and out. Unauthorised access is prohibited.',
    restrictedAreas: 'Exclusion zones around plant, excavations and overhead work. Refer to site plan.',
    languagesAssistance: '',
    workerSignOffRequired: true,
    visitorSignOffRequired: true,
    selectedInductionTypes: ['General Construction Induction', 'Site-Specific Induction', 'SWMS Briefing'],
    selectedHRCW: ['Risk of a person falling more than 2 metres', 'Work in or near a shaft or trench deeper than 1.5 metres'],
    hrcwDetails: {
      'Risk of a person falling more than 2 metres': { linkedSwms: '', responsibleContractor: 'IWILLBUILD', responsibleSupervisor: 'Daryl Austen', workLocation: 'All elevated work areas', scheduledStart: '', permitRequired: false, monitoringMethod: 'Daily pre-start inspection and supervisor monitoring', workerConsultation: true, status: 'Planned' },
      'Work in or near a shaft or trench deeper than 1.5 metres': { linkedSwms: '', responsibleContractor: 'IWILLBUILD', responsibleSupervisor: 'Daryl Austen', workLocation: 'Excavation areas', scheduledStart: '', permitRequired: true, monitoringMethod: 'Competent person inspection before each entry', workerConsultation: true, status: 'Planned' },
    },
    selectedOtherActivities: ['General excavation', 'Concrete works', 'Manual handling', 'Traffic management'],
    otherActivityDetails: {
      'General excavation': { linkedSwms: '', permit: '', riskAssessment: '', responsiblePerson: 'Site Supervisor' },
      'Concrete works': { linkedSwms: '', permit: '', riskAssessment: '', responsiblePerson: 'Site Supervisor' },
      'Manual handling': { linkedSwms: '', permit: '', riskAssessment: '', responsiblePerson: 'Site Supervisor' },
      'Traffic management': { linkedSwms: '', permit: '', riskAssessment: '', responsiblePerson: 'Site Supervisor' },
    },
    hazardRegister: [
      { id: uid(), hazard: 'Working at heights', location: 'All elevated areas', peopleExposed: 'All workers', initialRisk: 'High', controls: 'Edge protection, harness and lanyard, exclusion zones below work area, toolbox talk prior to commencement.', responsiblePerson: 'Site Supervisor', dueDate: '', residualRisk: 'Low', status: 'Open', linkedSwms: '', reviewDate: '', closedBy: '', dateClosed: '' },
      { id: uid(), hazard: 'Excavation collapse', location: 'Excavation areas', peopleExposed: 'Excavation workers', initialRisk: 'High', controls: 'Benching or shoring, exclusion zones, competent person inspection, no entry without authorisation.', responsiblePerson: 'Site Supervisor', dueDate: '', residualRisk: 'Low', status: 'Open', linkedSwms: '', reviewDate: '', closedBy: '', dateClosed: '' },
      { id: uid(), hazard: 'Plant and pedestrian interaction', location: 'Entire site', peopleExposed: 'All workers', initialRisk: 'High', controls: 'Exclusion zones, spotters, traffic management plan, high-visibility clothing, site induction.', responsiblePerson: 'Site Supervisor', dueDate: '', residualRisk: 'Medium', status: 'Open', linkedSwms: '', reviewDate: '', closedBy: '', dateClosed: '' },
      { id: uid(), hazard: 'Manual handling injuries', location: 'Entire site', peopleExposed: 'All workers', initialRisk: 'Medium', controls: 'Mechanical aids where possible, team lifts, manual handling training, SWMS for heavy lifts.', responsiblePerson: 'Site Supervisor', dueDate: '', residualRisk: 'Low', status: 'Open', linkedSwms: '', reviewDate: '', closedBy: '', dateClosed: '' },
      { id: uid(), hazard: 'Silica dust exposure', location: 'Concrete cutting and grinding areas', peopleExposed: 'Workers performing cutting/grinding', initialRisk: 'High', controls: 'Wet cutting methods, on-tool dust extraction, P2 respirators, exclusion zones, health monitoring.', responsiblePerson: 'Site Supervisor', dueDate: '', residualRisk: 'Low', status: 'Open', linkedSwms: '', reviewDate: '', closedBy: '', dateClosed: '' },
    ],
    dailyPreStartRequired: true,
    toolboxTalkFrequency: 'Weekly',
    siteInspectionFrequency: 'Weekly',
    safetyMeetingFrequency: 'Monthly',
    swmsReviewMethod: 'Review with workers prior to commencement and when conditions change.',
    hazardReportingMethod: 'Verbal report to supervisor, followed by written hazard report form.',
    workerFeedbackMethod: 'Toolbox talks, pre-start meetings, suggestion box at site office.',
    recordsStorageLocation: 'IWILLBUILD Portal — Safety section.',
    consultationActivities: [
      { id: uid(), activity: 'Daily Pre-Start Meeting', frequency: 'Daily', participants: 'All site workers', responsiblePerson: 'Site Supervisor', recordGenerated: 'Pre-start form' },
      { id: uid(), activity: 'Weekly Toolbox Talk', frequency: 'Weekly', participants: 'All site workers', responsiblePerson: 'Site Supervisor', recordGenerated: 'Toolbox talk record' },
      { id: uid(), activity: 'Monthly Safety Meeting', frequency: 'Monthly', participants: 'All site workers and subcontractors', responsiblePerson: 'Project Manager', recordGenerated: 'Meeting minutes' },
      { id: uid(), activity: 'SWMS Review and Sign-Off', frequency: 'Prior to each new activity', participants: 'Affected workers', responsiblePerson: 'Site Supervisor', recordGenerated: 'SWMS sign-off sheet' },
    ],
    plantRegisterRequired: true,
    preStartInspectionsRequired: true,
    operatorCompetencyVerified: true,
    vocRequired: true,
    maintenanceRecordsRequired: true,
    plantIsolationProcedure: 'Isolate energy source, apply lockout/tagout, test before work commences.',
    lockoutTagout: 'All plant and equipment must be locked out and tagged before maintenance or repair.',
    keyControl: 'Plant keys held by Site Supervisor. Keys signed in/out in key register.',
    mobilePlantExclusionZones: 'Minimum 5 metre exclusion zone around all operating mobile plant. Spotters required when exclusion zones cannot be maintained.',
    spottersRequired: true,
    liftingEquipmentRegister: true,
    defectReporting: 'Defective plant must be tagged out immediately and reported to Site Supervisor. Do not use until repaired and cleared.',
    hireEquipmentVerification: true,
    reversingControls: 'Reversing alarms on all plant. Spotters required for reversing in congested areas.',
    plantPedestrianSeparation: 'Designated pedestrian routes separated from plant movement areas. Refer to site traffic management plan.',
    temporarySwitchboard: true,
    rcdProtection: true,
    electricalInspectionTesting: 'All electrical equipment tested and tagged before use on site. Re-test every 3 months.',
    leadManagement: 'All leads elevated or protected from damage. No leads across walkways without protection.',
    electricalIsolation: 'Lockout/tagout procedure applies to all electrical isolation.',
    overheadElectricalServices: 'Identify and mark all overhead services. Maintain minimum approach distances. Spotter required for plant near overhead lines.',
    undergroundElectricalServices: 'Dial Before You Dig (1100) prior to any excavation. Mark all underground services. Hand dig within 300mm of services.',
    workNearEnergisedInstallations: 'Permit required. Authorised persons only. Exclusion zones apply.',
    safetyObserverRequired: true,
    electricalPermitRequired: true,
    clientAccessAuthorityRequired: false,
    siteSpeedLimit: '10 km/h',
    vehicleEntry: 'Main site entrance — refer to site plan.',
    vehicleExit: 'Main site entrance — one-way traffic where possible.',
    deliveryArea: 'Designated delivery zone — refer to site plan.',
    pedestrianRoute: 'Designated pedestrian walkways — refer to site plan.',
    reversingControlsTraffic: 'Reversing alarms required. Spotters for reversing in congested areas.',
    spotterRequirementsTraffic: 'Spotter required when plant is reversing near workers or in congested areas.',
    trafficManagementPlanRequired: true,
    publicRoadAffected: false,
    footpathAffected: false,
    emergencyVehicleAccessTraffic: 'Emergency vehicle access maintained at all times via main site entrance.',
    deliveryBookingRequirements: 'All deliveries must be pre-booked with Site Supervisor. No unscheduled deliveries.',
    selectedHazMat: ['Crystalline Silica', 'Concrete Chemicals', 'Fuel', 'Oils'],
    chemicalRegister: true,
    sdsRegister: true,
    storageLocation: 'Designated chemical storage area — refer to site plan.',
    segregationRequirements: 'Incompatible chemicals stored separately. Flammables in approved storage.',
    spillControls: 'Spill kit located near chemical storage. Contain spill, prevent runoff, report to supervisor.',
    healthMonitoringRequired: true,
    respiratoryProtectionRequired: true,
    fitTestingRequired: true,
    wasteDisposalMethod: 'Hazardous waste disposed of by licensed contractor. Refer to waste management plan.',
    hazMatResponsiblePerson: 'Site Supervisor',
    selectedAmenities: ['Toilets', 'Handwashing', 'Drinking Water', 'Meal Area', 'Shade', 'Secure Storage'],
    amenitiesLocation: 'Refer to site plan.',
    cleaningFrequency: 'Daily cleaning of amenities.',
    servicingProvider: '',
    amenitiesResponsiblePerson: 'Site Supervisor',
    amenitiesInspectionFrequency: 'Weekly inspection.',
    selectedEnvControls: ['Dust', 'Noise', 'Erosion and Sediment', 'Waste', 'Fuel and Chemical Spills'],
    envControlDetails: [
      { id: uid(), item: 'Dust', controlMeasures: 'Water suppression, dust screens, restrict vehicle speeds, minimise exposed areas.', inspectionFrequency: 'Daily', responsiblePerson: 'Site Supervisor', incidentResponse: 'Increase water suppression, cease work if uncontrolled.' },
      { id: uid(), item: 'Noise', controlMeasures: 'Restrict noisy work to approved hours, use quieter equipment where possible, notify neighbours.', inspectionFrequency: 'Weekly', responsiblePerson: 'Site Supervisor', incidentResponse: 'Cease noisy work, investigate and implement additional controls.' },
      { id: uid(), item: 'Erosion and Sediment', controlMeasures: 'Silt fences, sediment basins, stabilise disturbed areas promptly, inspect after rain.', inspectionFrequency: 'After each rain event', responsiblePerson: 'Site Supervisor', incidentResponse: 'Repair controls immediately, prevent sediment leaving site.' },
      { id: uid(), item: 'Waste', controlMeasures: 'Segregate waste at source, use licensed waste contractors, minimise waste generation.', inspectionFrequency: 'Weekly', responsiblePerson: 'Site Supervisor', incidentResponse: 'Remove waste promptly, report illegal dumping.' },
      { id: uid(), item: 'Fuel and Chemical Spills', controlMeasures: 'Bunded storage, spill kits on site, trained personnel, no refuelling near waterways.', inspectionFrequency: 'Daily', responsiblePerson: 'Site Supervisor', incidentResponse: 'Contain spill, use spill kit, report to supervisor and regulator if required.' },
    ],
    incidentReportingMethod: 'Verbal report to supervisor immediately. Written incident report within 24 hours. Notifiable incidents reported to regulator immediately.',
    immediateNotificationContact: 'Site Supervisor',
    pcNotificationContact: 'Project Manager',
    incidentInvestigationResponsibility: 'Site Supervisor with support from Project Manager.',
    notifiableIncidentResponsibility: 'Project Manager — notify regulator (Workplace Health and Safety Queensland) immediately.',
    regulatorNotificationResponsibility: 'Project Manager — 1300 362 128 (WHSQ).',
    incidentSitePreservation: 'Preserve incident scene until released by regulator or Site Supervisor. Do not disturb evidence.',
    correctiveActionRegisterRequired: true,
    emergencyEscalationProcedure: 'Site Supervisor → Project Manager → Company Director. Regulator notified for notifiable incidents.',
    selectedReviewTriggers: ['Scope Change', 'New Contractor', 'Incident or Near Miss', 'New Hazard', 'Legislative Change'],
    scheduledReviewFrequency: 'Every 3 months or as triggered.',
    reviewResponsiblePerson: 'Project Manager',
    lastReviewDate: '',
    nextReviewDate: '',
    reviewNotes: '',
    preparedByName: 'Daryl Austen',
    preparedByPosition: 'Site Supervisor',
    preparedByDate: today(),
    reviewedByName: '',
    reviewedByPosition: '',
    reviewedByDate: '',
    approvedByName: '',
    approvedByPosition: '',
    approvedByDate: '',
    pcAcceptanceName: '',
    pcAcceptanceCompany: '',
    pcAcceptancePosition: '',
    pcAcceptanceDate: '',
    pcAcceptanceComments: '',
    appendices: DEFAULT_APPENDICES.map((a) => ({ ...emptyAppendix(a.label, a.title) })),
    jobId: '',
    jobName: '',
  };
}

// ─── blank plan defaults ──────────────────────────────────────────────────────

export function blankPlanDefaults(): WHS_PlanData {
  return {
    planType: 'Site Safety Plan',
    planNumber: '',
    revisionNumber: '1.0',
    status: 'draft',
    datePrepared: today(),
    reviewDate: '',
    preparedBy: '',
    reviewedBy: '',
    approvedBy: '',
    revisionHistory: [emptyRevision()],
    projectName: '', projectNumber: '', projectDescription: '', scopeOfWorks: '',
    siteAddress: '', siteAccessInstructions: '', startDate: '', expectedCompletion: '',
    normalWorkingHours: '', projectValue: '', projectValueOver250k: 'No',
    clientName: '', clientContact: '', builderContractor: '', qbccLicenceHolder: '',
    qbccLicenceNumber: '', principalContractorWho: 'Our company',
    principalContractorName: '', principalContractorCompany: '',
    contacts: [emptyContact('Site Supervisor'), emptyContact('First Aid Officer')],
    emergencyServicesNumber: '000', siteAddressForEmergency: '', gpsLocation: '',
    emergencyVehicleEntry: '', gateAccessInstructions: '', assemblyPointDescription: '',
    alarmMethod: '', headCountResponsibility: '', evacuationProcedure: '',
    firstAidKitLocation: '', aedLocation: '', fireExtinguisherLocations: '',
    spillKitLocation: '', eyewashLocation: '', electricalIsolationPoint: '',
    gasIsolationPoint: '', rescueEquipmentLocation: '', nearestMedicalCentre: '',
    medicalCentreAddress: '', medicalCentrePhone: '', nearestHospital: '',
    hospitalAddress: '', hospitalPhone: '', estimatedTravelTime: '', emergencyDrillFrequency: '',
    selectedSiteRules: ['Sign in and sign out', 'Complete site induction', 'Hold a current White Card', 'Wear required PPE', 'Report hazards and incidents', 'No drugs or alcohol'],
    additionalSiteRules: '', visitorRequirements: '', siteSecurityRequirements: '',
    restrictedAreas: '', languagesAssistance: '', workerSignOffRequired: true,
    visitorSignOffRequired: false, selectedInductionTypes: ['General Construction Induction', 'Site-Specific Induction'],
    selectedHRCW: [], hrcwDetails: {}, selectedOtherActivities: [], otherActivityDetails: {},
    hazardRegister: [],
    dailyPreStartRequired: true, toolboxTalkFrequency: 'Weekly', siteInspectionFrequency: 'Weekly',
    safetyMeetingFrequency: 'Monthly', swmsReviewMethod: '', hazardReportingMethod: '',
    workerFeedbackMethod: '', recordsStorageLocation: '', consultationActivities: [],
    plantRegisterRequired: true, preStartInspectionsRequired: true, operatorCompetencyVerified: true,
    vocRequired: false, maintenanceRecordsRequired: true, plantIsolationProcedure: '',
    lockoutTagout: '', keyControl: '', mobilePlantExclusionZones: '', spottersRequired: false,
    liftingEquipmentRegister: false, defectReporting: '', hireEquipmentVerification: false,
    reversingControls: '', plantPedestrianSeparation: '',
    temporarySwitchboard: false, rcdProtection: true, electricalInspectionTesting: '',
    leadManagement: '', electricalIsolation: '', overheadElectricalServices: '',
    undergroundElectricalServices: '', workNearEnergisedInstallations: '',
    safetyObserverRequired: false, electricalPermitRequired: false, clientAccessAuthorityRequired: false,
    siteSpeedLimit: '10 km/h', vehicleEntry: '', vehicleExit: '', deliveryArea: '',
    pedestrianRoute: '', reversingControlsTraffic: '', spotterRequirementsTraffic: '',
    trafficManagementPlanRequired: false, publicRoadAffected: false, footpathAffected: false,
    emergencyVehicleAccessTraffic: '', deliveryBookingRequirements: '',
    selectedHazMat: [], chemicalRegister: false, sdsRegister: false, storageLocation: '',
    segregationRequirements: '', spillControls: '', healthMonitoringRequired: false,
    respiratoryProtectionRequired: false, fitTestingRequired: false, wasteDisposalMethod: '',
    hazMatResponsiblePerson: '',
    selectedAmenities: ['Toilets', 'Handwashing', 'Drinking Water'],
    amenitiesLocation: '', cleaningFrequency: '', servicingProvider: '',
    amenitiesResponsiblePerson: '', amenitiesInspectionFrequency: '',
    selectedEnvControls: [], envControlDetails: [],
    incidentReportingMethod: '', immediateNotificationContact: '', pcNotificationContact: '',
    incidentInvestigationResponsibility: '', notifiableIncidentResponsibility: '',
    regulatorNotificationResponsibility: '', incidentSitePreservation: '',
    correctiveActionRegisterRequired: true, emergencyEscalationProcedure: '',
    selectedReviewTriggers: [], scheduledReviewFrequency: 'Every 3 months',
    reviewResponsiblePerson: '', lastReviewDate: '', nextReviewDate: '', reviewNotes: '',
    preparedByName: '', preparedByPosition: '', preparedByDate: today(),
    reviewedByName: '', reviewedByPosition: '', reviewedByDate: '',
    approvedByName: '', approvedByPosition: '', approvedByDate: '',
    pcAcceptanceName: '', pcAcceptanceCompany: '', pcAcceptancePosition: '',
    pcAcceptanceDate: '', pcAcceptanceComments: '',
    appendices: DEFAULT_APPENDICES.map((a) => ({ ...emptyAppendix(a.label, a.title) })),
    jobId: '', jobName: '',
  };
}

// ─── section definitions ──────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'setup',        label: 'Plan Setup',              icon: ClipboardList },
  { id: 'project',      label: 'Project Details',         icon: Building2 },
  { id: 'doccontrol',   label: 'Document Control',        icon: BookOpen },
  { id: 'contacts',     label: 'Responsibilities',        icon: Users },
  { id: 'emergency',    label: 'Emergency Planning',      icon: AlertCircle },
  { id: 'siterules',    label: 'Site Rules & Induction',  icon: ShieldCheck },
  { id: 'hrcw',         label: 'High-Risk Work',          icon: AlertTriangle },
  { id: 'other',        label: 'Other Activities',        icon: Wrench },
  { id: 'hazards',      label: 'Hazard Register',         icon: FileWarning },
  { id: 'consultation', label: 'Consultation',            icon: Users },
  { id: 'plant',        label: 'Plant & Equipment',       icon: Wrench },
  { id: 'electrical',   label: 'Electrical Safety',       icon: Zap },
  { id: 'traffic',      label: 'Traffic & Access',        icon: Car },
  { id: 'hazmat',       label: 'Hazardous Materials',     icon: FlaskConical },
  { id: 'amenities',    label: 'Amenities & Welfare',     icon: Building2 },
  { id: 'environment',  label: 'Environmental Controls',  icon: Leaf },
  { id: 'incidents',    label: 'Incident Management',     icon: AlertTriangle },
  { id: 'review',       label: 'Review & Monitoring',     icon: RotateCcw },
  { id: 'approval',     label: 'Approval & Sign-Off',     icon: PenLine },
  { id: 'appendices',   label: 'Appendices',              icon: BookOpen },
] as const;

type SectionId = typeof SECTIONS[number]['id'];

// ─── shared field components ──────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
const textareaCls = `${inputCls} resize-y min-h-[72px]`;
const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';
const sectionHeadCls = 'text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100';
const checkboxRowCls = 'flex items-center gap-2 cursor-pointer select-none';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

function CheckToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={checkboxRowCls}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-primary rounded" />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function MultiCheck({ items, selected, onChange }: { items: readonly string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (item: string) => {
    onChange(selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]);
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {items.map((item) => (
        <label key={item} className={checkboxRowCls}>
          <input type="checkbox" checked={selected.includes(item)} onChange={() => toggle(item)} className="w-3.5 h-3.5 accent-primary rounded shrink-0" />
          <span className="text-xs text-slate-700">{item}</span>
        </label>
      ))}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-800">
      <Info size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// ─── section renderers ────────────────────────────────────────────────────────

function SectionSetup({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Plan Setup</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Plan Type" required>
            <select value={d.planType} onChange={(e) => set('planType', e.target.value)} className={inputCls}>
              {PLAN_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Plan Number"><input value={d.planNumber} onChange={(e) => set('planNumber', e.target.value)} className={inputCls} placeholder="e.g. WHS-001" /></Field>
        <Field label="Revision Number"><input value={d.revisionNumber} onChange={(e) => set('revisionNumber', e.target.value)} className={inputCls} placeholder="1.0" /></Field>
        <Field label="Status">
          <select value={d.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
            {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
          </select>
        </Field>
        <Field label="Date Prepared"><input type="date" value={d.datePrepared} onChange={(e) => set('datePrepared', e.target.value)} className={inputCls} /></Field>
        <Field label="Review Date"><input type="date" value={d.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} className={inputCls} /></Field>
        <Field label="Prepared By"><input value={d.preparedBy} onChange={(e) => set('preparedBy', e.target.value)} className={inputCls} placeholder="Name" /></Field>
        <Field label="Reviewed By"><input value={d.reviewedBy} onChange={(e) => set('reviewedBy', e.target.value)} className={inputCls} placeholder="Name" /></Field>
        <Field label="Approved By"><input value={d.approvedBy} onChange={(e) => set('approvedBy', e.target.value)} className={inputCls} placeholder="Name" /></Field>
      </div>
    </div>
  );
}

function SectionProject({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Project Details</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Project Name" required><input value={d.projectName} onChange={(e) => set('projectName', e.target.value)} className={inputCls} placeholder="Project name" /></Field>
        <Field label="Project Number"><input value={d.projectNumber} onChange={(e) => set('projectNumber', e.target.value)} className={inputCls} placeholder="PRJ-001" /></Field>
        <div className="sm:col-span-2"><Field label="Project Description"><textarea value={d.projectDescription} onChange={(e) => set('projectDescription', e.target.value)} className={textareaCls} placeholder="Brief description of the project" /></Field></div>
        <div className="sm:col-span-2"><Field label="Scope of Works"><textarea value={d.scopeOfWorks} onChange={(e) => set('scopeOfWorks', e.target.value)} className={textareaCls} placeholder="Describe the scope of works" /></Field></div>
        <div className="sm:col-span-2"><Field label="Full Site Address" required><input value={d.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} className={inputCls} placeholder="Street address, suburb, state, postcode" /></Field></div>
        <div className="sm:col-span-2"><Field label="Site Access Instructions"><textarea value={d.siteAccessInstructions} onChange={(e) => set('siteAccessInstructions', e.target.value)} className={textareaCls} placeholder="How to access the site" /></Field></div>
        <Field label="Start Date"><input type="date" value={d.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} /></Field>
        <Field label="Expected Completion"><input type="date" value={d.expectedCompletion} onChange={(e) => set('expectedCompletion', e.target.value)} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Normal Working Hours"><input value={d.normalWorkingHours} onChange={(e) => set('normalWorkingHours', e.target.value)} className={inputCls} placeholder="e.g. Mon–Fri 6:30 AM – 5:00 PM" /></Field></div>
        <Field label="Project Value ($)"><input type="number" min="0" value={d.projectValue} onChange={(e) => set('projectValue', e.target.value)} className={inputCls} placeholder="0" /></Field>
        <Field label="Client Name"><input value={d.clientName} onChange={(e) => set('clientName', e.target.value)} className={inputCls} placeholder="Client name" /></Field>
        <Field label="Client Contact"><input value={d.clientContact} onChange={(e) => set('clientContact', e.target.value)} className={inputCls} placeholder="Name & phone" /></Field>
        <Field label="Builder / Contractor"><input value={d.builderContractor} onChange={(e) => set('builderContractor', e.target.value)} className={inputCls} placeholder="Company name" /></Field>
        <Field label="QBCC Licence Holder"><input value={d.qbccLicenceHolder} onChange={(e) => set('qbccLicenceHolder', e.target.value)} className={inputCls} placeholder="Name" /></Field>
        <Field label="QBCC Licence Number"><input value={d.qbccLicenceNumber} onChange={(e) => set('qbccLicenceNumber', e.target.value)} className={inputCls} placeholder="Licence number" /></Field>
        <div className="sm:col-span-2">
          <Field label="Is the construction work valued at $250,000 or more?">
            <select value={d.projectValueOver250k} onChange={(e) => set('projectValueOver250k', e.target.value)} className={inputCls}>
              {['Yes', 'No', 'Unsure'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Who is the Principal Contractor?">
            <select value={d.principalContractorWho} onChange={(e) => set('principalContractorWho', e.target.value)} className={inputCls}>
              {PRINCIPAL_CONTRACTOR_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>
        {d.principalContractorWho !== 'Our company' && (
          <>
            <Field label="Principal Contractor Name"><input value={d.principalContractorName} onChange={(e) => set('principalContractorName', e.target.value)} className={inputCls} placeholder="Name" /></Field>
            <Field label="Principal Contractor Company"><input value={d.principalContractorCompany} onChange={(e) => set('principalContractorCompany', e.target.value)} className={inputCls} placeholder="Company" /></Field>
            <div className="sm:col-span-2">
              <InfoBox>This Contractor WHS&amp;E Management Plan must be read in conjunction with the Principal Contractor's WHS Management Plan, site requirements, permits and project procedures.</InfoBox>
            </div>
          </>
        )}
        {d.projectValueOver250k === 'Yes' && !d.principalContractorName && d.principalContractorWho !== 'Our company' && (
          <div className="sm:col-span-2"><WarnBox>Project value is $250,000 or more — Principal Contractor details are required before this plan can be approved.</WarnBox></div>
        )}
      </div>
    </div>
  );
}

function SectionDocControl({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const rows = d.revisionHistory;
  const addRow = () => set('revisionHistory', [...rows, emptyRevision()]);
  const updateRow = (idx: number, field: keyof WHS_RevisionRow, val: string) => {
    const next = rows.map((r, i) => i === idx ? { ...r, [field]: val } : r);
    set('revisionHistory', next);
  };
  const removeRow = (idx: number) => set('revisionHistory', rows.filter((_, i) => i !== idx));
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Document Control — Revision History</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50">
              {['Revision', 'Date', 'Description', 'Prepared By', 'Approved By', ''].map((h) => (
                <th key={h} className="border border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="border border-slate-200 p-1"><input value={r.revision} onChange={(e) => updateRow(i, 'revision', e.target.value)} className="w-16 px-2 py-1 border border-slate-200 rounded text-xs" /></td>
                <td className="border border-slate-200 p-1"><input type="date" value={r.date} onChange={(e) => updateRow(i, 'date', e.target.value)} className="px-2 py-1 border border-slate-200 rounded text-xs" /></td>
                <td className="border border-slate-200 p-1"><input value={r.description} onChange={(e) => updateRow(i, 'description', e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-xs" /></td>
                <td className="border border-slate-200 p-1"><input value={r.preparedBy} onChange={(e) => updateRow(i, 'preparedBy', e.target.value)} className="w-28 px-2 py-1 border border-slate-200 rounded text-xs" /></td>
                <td className="border border-slate-200 p-1"><input value={r.approvedBy} onChange={(e) => updateRow(i, 'approvedBy', e.target.value)} className="w-28 px-2 py-1 border border-slate-200 rounded text-xs" /></td>
                <td className="border border-slate-200 p-1 text-center"><button onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-orange-600 transition-colors self-start">
        <Plus size={13} />Add Revision
      </button>
    </div>
  );
}

function SectionContacts({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const contacts = d.contacts;
  const addContact = () => set('contacts', [...contacts, emptyContact()]);
  const updateContact = (idx: number, field: keyof WHS_Contact, val: unknown) => {
    const next = contacts.map((c, i) => {
      if (i !== idx) return c;
      const updated = { ...c, [field]: val };
      if (field === 'role') updated.responsibilities = DEFAULT_RESPONSIBILITIES[val as string] ?? c.responsibilities;
      return updated;
    });
    set('contacts', next);
  };
  const removeContact = (idx: number) => set('contacts', contacts.filter((_, i) => i !== idx));

  const hasSupervisor = contacts.some((c) => c.role === 'Site Supervisor' && c.name);
  const hasFirstAid = contacts.some((c) => c.role === 'First Aid Officer' && c.name);
  const hasAltSupervisor = contacts.some((c) => c.role === 'Alternate Supervisor');
  const hasAltFirstAid = contacts.some((c) => c.role === 'Alternate First Aid Officer');
  const missingPhones = contacts.filter((c) => c.name && !c.phone);

  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Responsibilities &amp; Contacts</h3>
      {!hasSupervisor && <WarnBox>No Site Supervisor nominated. A Site Supervisor is required.</WarnBox>}
      {!hasFirstAid && <WarnBox>No First Aid Officer nominated. A First Aid Officer is required.</WarnBox>}
      {!hasAltSupervisor && <WarnBox>No Alternate Supervisor nominated.</WarnBox>}
      {!hasAltFirstAid && <WarnBox>No Alternate First Aid Officer nominated.</WarnBox>}
      {missingPhones.length > 0 && <WarnBox>Missing phone numbers: {missingPhones.map((c) => c.name).join(', ')}</WarnBox>}

      <div className="flex flex-col gap-4">
        {contacts.map((c, i) => (
          <div key={c.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-600">Contact {i + 1}</span>
              <button onClick={() => removeContact(i)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Role">
                <select value={c.role} onChange={(e) => updateContact(i, 'role', e.target.value)} className={inputCls}>
                  <option value="">— Select role —</option>
                  {DEFAULT_CONTACT_ROLES.map((r) => <option key={r}>{r}</option>)}
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Name"><input value={c.name} onChange={(e) => updateContact(i, 'name', e.target.value)} className={inputCls} placeholder="Full name" /></Field>
              <Field label="Company"><input value={c.company} onChange={(e) => updateContact(i, 'company', e.target.value)} className={inputCls} placeholder="Company" /></Field>
              <Field label="Position"><input value={c.position} onChange={(e) => updateContact(i, 'position', e.target.value)} className={inputCls} placeholder="Position title" /></Field>
              <Field label="Phone"><input value={c.phone} onChange={(e) => updateContact(i, 'phone', e.target.value)} className={inputCls} placeholder="Phone number" /></Field>
              <Field label="Email"><input value={c.email} onChange={(e) => updateContact(i, 'email', e.target.value)} className={inputCls} placeholder="Email address" /></Field>
              <div className="sm:col-span-2">
                <Field label="Responsibilities"><textarea value={c.responsibilities} onChange={(e) => updateContact(i, 'responsibilities', e.target.value)} className={textareaCls} placeholder="Responsibilities for this role" /></Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Alternate Contact"><input value={c.alternateContact} onChange={(e) => updateContact(i, 'alternateContact', e.target.value)} className={inputCls} placeholder="Alternate contact name & phone" /></Field>
              </div>
              <div className="sm:col-span-2">
                <CheckToggle label="Authority to Stop Work" checked={c.authorityToStop} onChange={(v) => updateContact(i, 'authorityToStop', v)} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addContact} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-orange-600 transition-colors self-start">
        <Plus size={13} />Add Contact
      </button>
    </div>
  );
}

function SectionEmergency({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Emergency Planning</h3>
      {!d.nearestHospital && <WarnBox>No hospital recorded. This is required before the plan can be approved.</WarnBox>}
      {!d.assemblyPointDescription && <WarnBox>No emergency assembly point recorded.</WarnBox>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Emergency Services Number"><input value={d.emergencyServicesNumber} onChange={f('emergencyServicesNumber')} className={inputCls} placeholder="000" /></Field>
        <Field label="GPS Location"><input value={d.gpsLocation} onChange={f('gpsLocation')} className={inputCls} placeholder="Lat, Long" /></Field>
        <div className="sm:col-span-2"><Field label="Site Address to Give Emergency Services"><input value={d.siteAddressForEmergency} onChange={f('siteAddressForEmergency')} className={inputCls} placeholder="Full address" /></Field></div>
        <div className="sm:col-span-2"><Field label="Emergency Vehicle Entry"><textarea value={d.emergencyVehicleEntry} onChange={f('emergencyVehicleEntry')} className={textareaCls} placeholder="How emergency vehicles access the site" /></Field></div>
        <div className="sm:col-span-2"><Field label="Gate & Access Instructions"><textarea value={d.gateAccessInstructions} onChange={f('gateAccessInstructions')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Emergency Assembly Point Description" required><textarea value={d.assemblyPointDescription} onChange={f('assemblyPointDescription')} className={textareaCls} placeholder="Location description" /></Field></div>
        <Field label="Alarm Method"><input value={d.alarmMethod} onChange={f('alarmMethod')} className={inputCls} placeholder="e.g. Air horn — 3 blasts" /></Field>
        <Field label="Head Count Responsibility"><input value={d.headCountResponsibility} onChange={f('headCountResponsibility')} className={inputCls} placeholder="Role or name" /></Field>
        <div className="sm:col-span-2"><Field label="Evacuation Procedure"><textarea value={d.evacuationProcedure} onChange={f('evacuationProcedure')} className={textareaCls} rows={4} placeholder="Step-by-step evacuation procedure" /></Field></div>
        <Field label="First Aid Kit Location"><input value={d.firstAidKitLocation} onChange={f('firstAidKitLocation')} className={inputCls} /></Field>
        <Field label="AED Location"><input value={d.aedLocation} onChange={f('aedLocation')} className={inputCls} /></Field>
        <Field label="Fire Extinguisher Locations"><input value={d.fireExtinguisherLocations} onChange={f('fireExtinguisherLocations')} className={inputCls} /></Field>
        <Field label="Spill Kit Location"><input value={d.spillKitLocation} onChange={f('spillKitLocation')} className={inputCls} /></Field>
        <Field label="Eyewash Location"><input value={d.eyewashLocation} onChange={f('eyewashLocation')} className={inputCls} /></Field>
        <Field label="Electrical Isolation Point"><input value={d.electricalIsolationPoint} onChange={f('electricalIsolationPoint')} className={inputCls} /></Field>
        <Field label="Gas Isolation Point"><input value={d.gasIsolationPoint} onChange={f('gasIsolationPoint')} className={inputCls} /></Field>
        <Field label="Rescue Equipment Location"><input value={d.rescueEquipmentLocation} onChange={f('rescueEquipmentLocation')} className={inputCls} /></Field>
        <Field label="Nearest Medical Centre" required><input value={d.nearestMedicalCentre} onChange={f('nearestMedicalCentre')} className={inputCls} placeholder="Name" /></Field>
        <Field label="Medical Centre Address"><input value={d.medicalCentreAddress} onChange={f('medicalCentreAddress')} className={inputCls} /></Field>
        <Field label="Medical Centre Phone"><input value={d.medicalCentrePhone} onChange={f('medicalCentrePhone')} className={inputCls} /></Field>
        <Field label="Nearest Hospital" required><input value={d.nearestHospital} onChange={f('nearestHospital')} className={inputCls} placeholder="Hospital name" /></Field>
        <Field label="Hospital Address"><input value={d.hospitalAddress} onChange={f('hospitalAddress')} className={inputCls} /></Field>
        <Field label="Hospital Phone"><input value={d.hospitalPhone} onChange={f('hospitalPhone')} className={inputCls} /></Field>
        <Field label="Estimated Travel Time"><input value={d.estimatedTravelTime} onChange={f('estimatedTravelTime')} className={inputCls} placeholder="e.g. 15 minutes" /></Field>
        <Field label="Emergency Drill Frequency"><input value={d.emergencyDrillFrequency} onChange={f('emergencyDrillFrequency')} className={inputCls} placeholder="e.g. Every 6 months" /></Field>
      </div>
    </div>
  );
}

function SectionSiteRules({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Site Rules &amp; Induction</h3>
      <div>
        <label className={labelCls}>Standard Site Rules</label>
        <MultiCheck items={STANDARD_SITE_RULES} selected={d.selectedSiteRules} onChange={(v) => set('selectedSiteRules', v)} />
      </div>
      <Field label="Additional Site-Specific Rules"><textarea value={d.additionalSiteRules} onChange={f('additionalSiteRules')} className={textareaCls} placeholder="Any additional rules specific to this site" /></Field>
      <Field label="Visitor Requirements"><textarea value={d.visitorRequirements} onChange={f('visitorRequirements')} className={textareaCls} /></Field>
      <Field label="Site Security Requirements"><textarea value={d.siteSecurityRequirements} onChange={f('siteSecurityRequirements')} className={textareaCls} /></Field>
      <Field label="Restricted Areas"><textarea value={d.restrictedAreas} onChange={f('restrictedAreas')} className={textareaCls} /></Field>
      <Field label="Languages / Literacy Assistance Required"><input value={d.languagesAssistance} onChange={f('languagesAssistance')} className={inputCls} placeholder="e.g. Mandarin interpreter available" /></Field>
      <div className="flex flex-col gap-2">
        <CheckToggle label="Worker Sign-Off Required" checked={d.workerSignOffRequired} onChange={(v) => set('workerSignOffRequired', v)} />
        <CheckToggle label="Visitor Sign-Off Required" checked={d.visitorSignOffRequired} onChange={(v) => set('visitorSignOffRequired', v)} />
      </div>
      <div>
        <label className={labelCls}>Induction Types Required</label>
        <MultiCheck items={INDUCTION_TYPES} selected={d.selectedInductionTypes} onChange={(v) => set('selectedInductionTypes', v)} />
      </div>
    </div>
  );
}

function SectionHRCW({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const selected = d.selectedHRCW;
  const details = d.hrcwDetails;
  const toggleHRCW = (item: string) => {
    const next = selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item];
    set('selectedHRCW', next);
  };
  const updateDetail = (item: string, field: string, val: unknown) => {
    set('hrcwDetails', { ...details, [item]: { ...(details[item] ?? {}), [field]: val } });
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>High-Risk Construction Work</h3>
      <InfoBox>Select all high-risk construction work activities that apply to this project. Each selected activity requires a linked SWMS before the plan can be approved.</InfoBox>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {HIGH_RISK_CONSTRUCTION_WORK.map((item) => (
          <label key={item} className={checkboxRowCls}>
            <input type="checkbox" checked={selected.includes(item)} onChange={() => toggleHRCW(item)} className="w-3.5 h-3.5 accent-primary rounded shrink-0" />
            <span className="text-xs text-slate-700">{item}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-col gap-4 mt-2">
          {selected.map((item) => {
            const det = details[item] ?? {};
            return (
              <div key={item} className="border border-orange-200 rounded-xl p-4 bg-orange-50/30">
                <div className="text-xs font-bold text-orange-700 mb-3">{item}</div>
                {!det.linkedSwms && <WarnBox>No SWMS linked — required before approval.</WarnBox>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <Field label="Linked SWMS"><input value={det.linkedSwms ?? ''} onChange={(e) => updateDetail(item, 'linkedSwms', e.target.value)} className={inputCls} placeholder="SWMS title or number" /></Field>
                  <Field label="Responsible Contractor"><input value={det.responsibleContractor ?? ''} onChange={(e) => updateDetail(item, 'responsibleContractor', e.target.value)} className={inputCls} /></Field>
                  <Field label="Responsible Supervisor"><input value={det.responsibleSupervisor ?? ''} onChange={(e) => updateDetail(item, 'responsibleSupervisor', e.target.value)} className={inputCls} /></Field>
                  <Field label="Work Location"><input value={det.workLocation ?? ''} onChange={(e) => updateDetail(item, 'workLocation', e.target.value)} className={inputCls} /></Field>
                  <Field label="Scheduled Start"><input type="date" value={det.scheduledStart ?? ''} onChange={(e) => updateDetail(item, 'scheduledStart', e.target.value)} className={inputCls} /></Field>
                  <Field label="Status"><input value={det.status ?? ''} onChange={(e) => updateDetail(item, 'status', e.target.value)} className={inputCls} placeholder="Planned / Active / Complete" /></Field>
                  <div className="sm:col-span-2"><Field label="Monitoring Method"><input value={det.monitoringMethod ?? ''} onChange={(e) => updateDetail(item, 'monitoringMethod', e.target.value)} className={inputCls} /></Field></div>
                  <div className="flex gap-4">
                    <CheckToggle label="Permit Required" checked={!!det.permitRequired} onChange={(v) => updateDetail(item, 'permitRequired', v)} />
                    <CheckToggle label="Worker Consultation Done" checked={!!det.workerConsultation} onChange={(v) => updateDetail(item, 'workerConsultation', v)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionOtherActivities({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const selected = d.selectedOtherActivities;
  const details = d.otherActivityDetails;
  const toggle = (item: string) => {
    set('selectedOtherActivities', selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]);
  };
  const updateDetail = (item: string, field: string, val: string) => {
    set('otherActivityDetails', { ...details, [item]: { ...(details[item] ?? {}), [field]: val } });
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Other Controlled Activities</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {OTHER_CONTROLLED_ACTIVITIES.map((item) => (
          <label key={item} className={checkboxRowCls}>
            <input type="checkbox" checked={selected.includes(item)} onChange={() => toggle(item)} className="w-3.5 h-3.5 accent-primary rounded shrink-0" />
            <span className="text-xs text-slate-700">{item}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          {selected.map((item) => {
            const det = details[item] ?? {};
            return (
              <div key={item} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <div className="text-xs font-bold text-slate-700 mb-2">{item}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="Linked SWMS"><input value={det.linkedSwms ?? ''} onChange={(e) => updateDetail(item, 'linkedSwms', e.target.value)} className={inputCls} placeholder="SWMS title" /></Field>
                  <Field label="Responsible Person"><input value={det.responsiblePerson ?? ''} onChange={(e) => updateDetail(item, 'responsiblePerson', e.target.value)} className={inputCls} /></Field>
                  <Field label="Permit"><input value={det.permit ?? ''} onChange={(e) => updateDetail(item, 'permit', e.target.value)} className={inputCls} placeholder="Permit type if required" /></Field>
                  <Field label="Risk Assessment"><input value={det.riskAssessment ?? ''} onChange={(e) => updateDetail(item, 'riskAssessment', e.target.value)} className={inputCls} placeholder="RA reference" /></Field>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SectionHazards({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const rows = d.hazardRegister;
  const addRow = () => set('hazardRegister', [...rows, emptyHazard()]);
  const updateRow = (idx: number, field: keyof WHS_HazardRow, val: unknown) => {
    set('hazardRegister', rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const removeRow = (idx: number) => set('hazardRegister', rows.filter((_, i) => i !== idx));
  const riskColors: Record<string, string> = { High: 'text-red-600', Medium: 'text-amber-600', Low: 'text-emerald-600' };
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Project Hazard Register</h3>
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={r.id} className="border border-slate-200 rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-600">Hazard {i + 1}</span>
              <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><Field label="Hazard"><input value={r.hazard} onChange={(e) => updateRow(i, 'hazard', e.target.value)} className={inputCls} placeholder="Describe the hazard" /></Field></div>
              <Field label="Location"><input value={r.location} onChange={(e) => updateRow(i, 'location', e.target.value)} className={inputCls} /></Field>
              <Field label="People Exposed"><input value={r.peopleExposed} onChange={(e) => updateRow(i, 'peopleExposed', e.target.value)} className={inputCls} /></Field>
              <Field label="Initial Risk">
                <select value={r.initialRisk} onChange={(e) => updateRow(i, 'initialRisk', e.target.value)} className={`${inputCls} font-semibold ${riskColors[r.initialRisk] ?? ''}`}>
                  {['Extreme', 'High', 'Medium', 'Low'].map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Residual Risk">
                <select value={r.residualRisk} onChange={(e) => updateRow(i, 'residualRisk', e.target.value)} className={`${inputCls} font-semibold ${riskColors[r.residualRisk] ?? ''}`}>
                  {['Extreme', 'High', 'Medium', 'Low'].map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2"><Field label="Control Measures"><textarea value={r.controls} onChange={(e) => updateRow(i, 'controls', e.target.value)} className={textareaCls} placeholder="List all control measures" /></Field></div>
              <Field label="Responsible Person"><input value={r.responsiblePerson} onChange={(e) => updateRow(i, 'responsiblePerson', e.target.value)} className={inputCls} /></Field>
              <Field label="Due Date"><input type="date" value={r.dueDate} onChange={(e) => updateRow(i, 'dueDate', e.target.value)} className={inputCls} /></Field>
              <Field label="Status">
                <select value={r.status} onChange={(e) => updateRow(i, 'status', e.target.value as WHS_HazardRow['status'])} className={inputCls}>
                  {['Open', 'In Progress', 'Controlled', 'Closed', 'Overdue'].map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Linked SWMS"><input value={r.linkedSwms} onChange={(e) => updateRow(i, 'linkedSwms', e.target.value)} className={inputCls} placeholder="SWMS title or number" /></Field>
            </div>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-orange-600 transition-colors self-start">
        <Plus size={13} />Add Hazard
      </button>
    </div>
  );
}

function SectionConsultation({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  const rows = d.consultationActivities;
  const addRow = () => set('consultationActivities', [...rows, emptyConsultation()]);
  const updateRow = (idx: number, field: keyof WHS_ConsultationRow, val: string) => {
    set('consultationActivities', rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const removeRow = (idx: number) => set('consultationActivities', rows.filter((_, i) => i !== idx));
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Consultation &amp; Communication</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><CheckToggle label="Daily Pre-Start Required" checked={d.dailyPreStartRequired} onChange={(v) => set('dailyPreStartRequired', v)} /></div>
        <Field label="Toolbox Talk Frequency"><input value={d.toolboxTalkFrequency} onChange={f('toolboxTalkFrequency')} className={inputCls} placeholder="e.g. Weekly" /></Field>
        <Field label="Site Inspection Frequency"><input value={d.siteInspectionFrequency} onChange={f('siteInspectionFrequency')} className={inputCls} placeholder="e.g. Weekly" /></Field>
        <Field label="Safety Meeting Frequency"><input value={d.safetyMeetingFrequency} onChange={f('safetyMeetingFrequency')} className={inputCls} placeholder="e.g. Monthly" /></Field>
        <Field label="SWMS Review Method"><input value={d.swmsReviewMethod} onChange={f('swmsReviewMethod')} className={inputCls} /></Field>
        <Field label="Hazard Reporting Method"><input value={d.hazardReportingMethod} onChange={f('hazardReportingMethod')} className={inputCls} /></Field>
        <Field label="Worker Feedback Method"><input value={d.workerFeedbackMethod} onChange={f('workerFeedbackMethod')} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Records Storage Location"><input value={d.recordsStorageLocation} onChange={f('recordsStorageLocation')} className={inputCls} /></Field></div>
      </div>
      <h4 className="text-xs font-bold text-slate-700 mt-2">Consultation Activities</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50">
              {['Activity', 'Frequency', 'Participants', 'Responsible Person', 'Record Generated', ''].map((h) => (
                <th key={h} className="border border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                {(['activity', 'frequency', 'participants', 'responsiblePerson', 'recordGenerated'] as const).map((field) => (
                  <td key={field} className="border border-slate-200 p-1">
                    <input value={r[field]} onChange={(e) => updateRow(i, field, e.target.value)} className="w-full px-2 py-1 border border-slate-200 rounded text-xs min-w-[80px]" />
                  </td>
                ))}
                <td className="border border-slate-200 p-1 text-center"><button onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-orange-600 transition-colors self-start">
        <Plus size={13} />Add Activity
      </button>
    </div>
  );
}

function SectionPlant({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Plant &amp; Equipment</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CheckToggle label="Plant Register Required" checked={d.plantRegisterRequired} onChange={(v) => set('plantRegisterRequired', v)} />
        <CheckToggle label="Pre-Start Inspections Required" checked={d.preStartInspectionsRequired} onChange={(v) => set('preStartInspectionsRequired', v)} />
        <CheckToggle label="Operator Competency Verified" checked={d.operatorCompetencyVerified} onChange={(v) => set('operatorCompetencyVerified', v)} />
        <CheckToggle label="VOC Required" checked={d.vocRequired} onChange={(v) => set('vocRequired', v)} />
        <CheckToggle label="Maintenance Records Required" checked={d.maintenanceRecordsRequired} onChange={(v) => set('maintenanceRecordsRequired', v)} />
        <CheckToggle label="Spotters Required" checked={d.spottersRequired} onChange={(v) => set('spottersRequired', v)} />
        <CheckToggle label="Lifting Equipment Register" checked={d.liftingEquipmentRegister} onChange={(v) => set('liftingEquipmentRegister', v)} />
        <CheckToggle label="Hire Equipment Verification" checked={d.hireEquipmentVerification} onChange={(v) => set('hireEquipmentVerification', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <div className="sm:col-span-2"><Field label="Plant Isolation Procedure"><textarea value={d.plantIsolationProcedure} onChange={f('plantIsolationProcedure')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Lockout / Tagout"><textarea value={d.lockoutTagout} onChange={f('lockoutTagout')} className={textareaCls} /></Field></div>
        <Field label="Key Control"><input value={d.keyControl} onChange={f('keyControl')} className={inputCls} /></Field>
        <Field label="Reversing Controls"><input value={d.reversingControls} onChange={f('reversingControls')} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Mobile Plant Exclusion Zones"><textarea value={d.mobilePlantExclusionZones} onChange={f('mobilePlantExclusionZones')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Plant & Pedestrian Separation"><textarea value={d.plantPedestrianSeparation} onChange={f('plantPedestrianSeparation')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Defect Reporting"><textarea value={d.defectReporting} onChange={f('defectReporting')} className={textareaCls} /></Field></div>
      </div>
    </div>
  );
}

function SectionElectrical({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Electrical Safety</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CheckToggle label="Temporary Switchboard" checked={d.temporarySwitchboard} onChange={(v) => set('temporarySwitchboard', v)} />
        <CheckToggle label="RCD Protection" checked={d.rcdProtection} onChange={(v) => set('rcdProtection', v)} />
        <CheckToggle label="Safety Observer Required" checked={d.safetyObserverRequired} onChange={(v) => set('safetyObserverRequired', v)} />
        <CheckToggle label="Electrical Permit Required" checked={d.electricalPermitRequired} onChange={(v) => set('electricalPermitRequired', v)} />
        <CheckToggle label="Client Access Authority Required" checked={d.clientAccessAuthorityRequired} onChange={(v) => set('clientAccessAuthorityRequired', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <div className="sm:col-span-2"><Field label="Electrical Inspection & Testing"><textarea value={d.electricalInspectionTesting} onChange={f('electricalInspectionTesting')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Lead Management"><textarea value={d.leadManagement} onChange={f('leadManagement')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Electrical Isolation"><textarea value={d.electricalIsolation} onChange={f('electricalIsolation')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Overhead Electrical Services"><textarea value={d.overheadElectricalServices} onChange={f('overheadElectricalServices')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Underground Electrical Services"><textarea value={d.undergroundElectricalServices} onChange={f('undergroundElectricalServices')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Work Near Energised Installations"><textarea value={d.workNearEnergisedInstallations} onChange={f('workNearEnergisedInstallations')} className={textareaCls} /></Field></div>
      </div>
    </div>
  );
}

function SectionTraffic({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Traffic &amp; Site Access</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Site Speed Limit"><input value={d.siteSpeedLimit} onChange={f('siteSpeedLimit')} className={inputCls} placeholder="e.g. 10 km/h" /></Field>
        <Field label="Vehicle Entry"><input value={d.vehicleEntry} onChange={f('vehicleEntry')} className={inputCls} /></Field>
        <Field label="Vehicle Exit"><input value={d.vehicleExit} onChange={f('vehicleExit')} className={inputCls} /></Field>
        <Field label="Delivery Area"><input value={d.deliveryArea} onChange={f('deliveryArea')} className={inputCls} /></Field>
        <Field label="Pedestrian Route"><input value={d.pedestrianRoute} onChange={f('pedestrianRoute')} className={inputCls} /></Field>
        <Field label="Reversing Controls"><input value={d.reversingControlsTraffic} onChange={f('reversingControlsTraffic')} className={inputCls} /></Field>
        <Field label="Spotter Requirements"><input value={d.spotterRequirementsTraffic} onChange={f('spotterRequirementsTraffic')} className={inputCls} /></Field>
        <Field label="Emergency Vehicle Access"><input value={d.emergencyVehicleAccessTraffic} onChange={f('emergencyVehicleAccessTraffic')} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Delivery Booking Requirements"><textarea value={d.deliveryBookingRequirements} onChange={f('deliveryBookingRequirements')} className={textareaCls} /></Field></div>
        <CheckToggle label="Traffic Management Plan Required" checked={d.trafficManagementPlanRequired} onChange={(v) => set('trafficManagementPlanRequired', v)} />
        <CheckToggle label="Public Road Affected" checked={d.publicRoadAffected} onChange={(v) => set('publicRoadAffected', v)} />
        <CheckToggle label="Footpath Affected" checked={d.footpathAffected} onChange={(v) => set('footpathAffected', v)} />
      </div>
    </div>
  );
}

function SectionHazMat({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Hazardous Materials</h3>
      <div>
        <label className={labelCls}>Hazardous Materials Present on Site</label>
        <MultiCheck items={HAZARDOUS_MATERIALS_LIST} selected={d.selectedHazMat} onChange={(v) => set('selectedHazMat', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CheckToggle label="Chemical Register" checked={d.chemicalRegister} onChange={(v) => set('chemicalRegister', v)} />
        <CheckToggle label="SDS Register" checked={d.sdsRegister} onChange={(v) => set('sdsRegister', v)} />
        <CheckToggle label="Health Monitoring Required" checked={d.healthMonitoringRequired} onChange={(v) => set('healthMonitoringRequired', v)} />
        <CheckToggle label="Respiratory Protection Required" checked={d.respiratoryProtectionRequired} onChange={(v) => set('respiratoryProtectionRequired', v)} />
        <CheckToggle label="Fit Testing Required" checked={d.fitTestingRequired} onChange={(v) => set('fitTestingRequired', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <Field label="Storage Location"><input value={d.storageLocation} onChange={f('storageLocation')} className={inputCls} /></Field>
        <Field label="Responsible Person"><input value={d.hazMatResponsiblePerson} onChange={f('hazMatResponsiblePerson')} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Segregation Requirements"><textarea value={d.segregationRequirements} onChange={f('segregationRequirements')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Spill Controls"><textarea value={d.spillControls} onChange={f('spillControls')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Waste Disposal Method"><textarea value={d.wasteDisposalMethod} onChange={f('wasteDisposalMethod')} className={textareaCls} /></Field></div>
      </div>
    </div>
  );
}

function SectionAmenities({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Amenities &amp; Welfare</h3>
      <div>
        <label className={labelCls}>Facilities Provided</label>
        <MultiCheck items={AMENITIES_LIST} selected={d.selectedAmenities} onChange={(v) => set('selectedAmenities', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <div className="sm:col-span-2"><Field label="Amenities Location"><input value={d.amenitiesLocation} onChange={f('amenitiesLocation')} className={inputCls} /></Field></div>
        <Field label="Cleaning Frequency"><input value={d.cleaningFrequency} onChange={f('cleaningFrequency')} className={inputCls} /></Field>
        <Field label="Servicing Provider"><input value={d.servicingProvider} onChange={f('servicingProvider')} className={inputCls} /></Field>
        <Field label="Responsible Person"><input value={d.amenitiesResponsiblePerson} onChange={f('amenitiesResponsiblePerson')} className={inputCls} /></Field>
        <Field label="Inspection Frequency"><input value={d.amenitiesInspectionFrequency} onChange={f('amenitiesInspectionFrequency')} className={inputCls} /></Field>
      </div>
    </div>
  );
}

function SectionEnvironment({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const selected = d.selectedEnvControls;
  const details = d.envControlDetails;
  const updateRow = (idx: number, field: keyof WHS_EnvControlRow, val: string) => {
    set('envControlDetails', details.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Environmental Controls</h3>
      <div>
        <label className={labelCls}>Environmental Aspects Present</label>
        <MultiCheck items={ENVIRONMENTAL_CONTROLS_LIST} selected={selected} onChange={(v) => {
          const added = v.filter((x) => !selected.includes(x));
          const removed = selected.filter((x) => !v.includes(x));
          let newDetails = [...details];
          added.forEach((item) => { newDetails.push(emptyEnvControl(item)); });
          removed.forEach((item) => { newDetails = newDetails.filter((r) => r.item !== item); });
          set('selectedEnvControls', v);
          set('envControlDetails', newDetails);
        }} />
      </div>
      {details.length > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          {details.map((r, i) => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              <div className="text-xs font-bold text-slate-700 mb-2">{r.item}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2"><Field label="Control Measures"><textarea value={r.controlMeasures} onChange={(e) => updateRow(i, 'controlMeasures', e.target.value)} className={textareaCls} /></Field></div>
                <Field label="Inspection Frequency"><input value={r.inspectionFrequency} onChange={(e) => updateRow(i, 'inspectionFrequency', e.target.value)} className={inputCls} /></Field>
                <Field label="Responsible Person"><input value={r.responsiblePerson} onChange={(e) => updateRow(i, 'responsiblePerson', e.target.value)} className={inputCls} /></Field>
                <div className="sm:col-span-2"><Field label="Incident Response"><textarea value={r.incidentResponse} onChange={(e) => updateRow(i, 'incidentResponse', e.target.value)} className={textareaCls} /></Field></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionIncidents({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Incident Management</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><Field label="Incident Reporting Method"><textarea value={d.incidentReportingMethod} onChange={f('incidentReportingMethod')} className={textareaCls} /></Field></div>
        <Field label="Immediate Notification Contact"><input value={d.immediateNotificationContact} onChange={f('immediateNotificationContact')} className={inputCls} /></Field>
        <Field label="Principal Contractor Notification Contact"><input value={d.pcNotificationContact} onChange={f('pcNotificationContact')} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Incident Investigation Responsibility"><input value={d.incidentInvestigationResponsibility} onChange={f('incidentInvestigationResponsibility')} className={inputCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Notifiable Incident Assessment Responsibility"><input value={d.notifiableIncidentResponsibility} onChange={f('notifiableIncidentResponsibility')} className={inputCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Regulator Notification Responsibility"><input value={d.regulatorNotificationResponsibility} onChange={f('regulatorNotificationResponsibility')} className={inputCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Incident Site Preservation Procedure"><textarea value={d.incidentSitePreservation} onChange={f('incidentSitePreservation')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><Field label="Emergency Escalation Procedure"><textarea value={d.emergencyEscalationProcedure} onChange={f('emergencyEscalationProcedure')} className={textareaCls} /></Field></div>
        <div className="sm:col-span-2"><CheckToggle label="Corrective Action Register Required" checked={d.correctiveActionRegisterRequired} onChange={(v) => set('correctiveActionRegisterRequired', v)} /></div>
      </div>
    </div>
  );
}

function SectionReview({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Review &amp; Monitoring</h3>
      <div>
        <label className={labelCls}>Automatic Review Triggers</label>
        <MultiCheck items={REVIEW_TRIGGERS} selected={d.selectedReviewTriggers} onChange={(v) => set('selectedReviewTriggers', v)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        <Field label="Scheduled Review Frequency"><input value={d.scheduledReviewFrequency} onChange={f('scheduledReviewFrequency')} className={inputCls} placeholder="e.g. Every 3 months" /></Field>
        <Field label="Person Responsible for Review"><input value={d.reviewResponsiblePerson} onChange={f('reviewResponsiblePerson')} className={inputCls} /></Field>
        <Field label="Last Review Date"><input type="date" value={d.lastReviewDate} onChange={f('lastReviewDate')} className={inputCls} /></Field>
        <Field label="Next Review Date"><input type="date" value={d.nextReviewDate} onChange={f('nextReviewDate')} className={inputCls} /></Field>
        <div className="sm:col-span-2"><Field label="Review Notes"><textarea value={d.reviewNotes} onChange={f('reviewNotes')} className={textareaCls} /></Field></div>
      </div>
    </div>
  );
}

function SectionApproval({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const f = (k: keyof WHS_PlanData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value);
  const SignBlock = ({ title, nameKey, posKey, dateKey }: { title: string; nameKey: keyof WHS_PlanData; posKey: keyof WHS_PlanData; dateKey: keyof WHS_PlanData }) => (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
      <div className="text-xs font-bold text-slate-700 mb-3">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Name"><input value={d[nameKey] as string} onChange={f(nameKey)} className={inputCls} /></Field>
        <Field label="Position"><input value={d[posKey] as string} onChange={f(posKey)} className={inputCls} /></Field>
        <Field label="Date"><input type="date" value={d[dateKey] as string} onChange={f(dateKey)} className={inputCls} /></Field>
      </div>
      <div className="mt-3 border border-dashed border-slate-300 rounded-lg h-14 flex items-center justify-center">
        <span className="text-xs text-slate-400">Signature block — signed on approval</span>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Approval &amp; Sign-Off</h3>
      <SignBlock title="Prepared By" nameKey="preparedByName" posKey="preparedByPosition" dateKey="preparedByDate" />
      <SignBlock title="Reviewed By" nameKey="reviewedByName" posKey="reviewedByPosition" dateKey="reviewedByDate" />
      <SignBlock title="Approved By" nameKey="approvedByName" posKey="approvedByPosition" dateKey="approvedByDate" />
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
        <div className="text-xs font-bold text-slate-700 mb-3">Principal Contractor Acceptance</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name"><input value={d.pcAcceptanceName} onChange={f('pcAcceptanceName')} className={inputCls} /></Field>
          <Field label="Company"><input value={d.pcAcceptanceCompany} onChange={f('pcAcceptanceCompany')} className={inputCls} /></Field>
          <Field label="Position"><input value={d.pcAcceptancePosition} onChange={f('pcAcceptancePosition')} className={inputCls} /></Field>
          <Field label="Date"><input type="date" value={d.pcAcceptanceDate} onChange={f('pcAcceptanceDate')} className={inputCls} /></Field>
          <div className="sm:col-span-2"><Field label="Comments"><textarea value={d.pcAcceptanceComments} onChange={f('pcAcceptanceComments')} className={textareaCls} /></Field></div>
        </div>
      </div>
    </div>
  );
}

function SectionAppendices({ d, set }: { d: WHS_PlanData; set: (k: keyof WHS_PlanData, v: unknown) => void }) {
  const rows = d.appendices;
  const addRow = () => set('appendices', [...rows, emptyAppendix(`Appendix ${String.fromCharCode(65 + rows.length)}`, '')]);
  const updateRow = (idx: number, field: keyof WHS_AppendixRow, val: unknown) => {
    set('appendices', rows.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const removeRow = (idx: number) => set('appendices', rows.filter((_, i) => i !== idx));
  return (
    <div className="flex flex-col gap-4">
      <h3 className={sectionHeadCls}>Appendices</h3>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-white">
            <input value={r.label} onChange={(e) => updateRow(i, 'label', e.target.value)} className="w-24 px-2 py-1 border border-slate-200 rounded text-xs font-semibold" placeholder="Appendix A" />
            <input value={r.title} onChange={(e) => updateRow(i, 'title', e.target.value)} className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs" placeholder="Title" />
            <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
              <input type="checkbox" checked={r.attached} onChange={(e) => updateRow(i, 'attached', e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
              Attached
            </label>
            <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-500 transition-colors shrink-0"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-orange-600 transition-colors self-start">
        <Plus size={13} />Add Appendix
      </button>
    </div>
  );
}

// ─── validation ───────────────────────────────────────────────────────────────

function getWarnings(d: WHS_PlanData): string[] {
  const w: string[] = [];
  if (!d.projectName) w.push('Project name is required.');
  if (!d.siteAddress) w.push('Site address is required.');
  if (!d.contacts.some((c) => c.role === 'Site Supervisor' && c.name)) w.push('No Site Supervisor nominated.');
  if (!d.contacts.some((c) => c.role === 'First Aid Officer' && c.name)) w.push('No First Aid Officer nominated.');
  if (!d.assemblyPointDescription) w.push('No emergency assembly point recorded.');
  if (!d.nearestHospital) w.push('No hospital or medical centre recorded.');
  if (d.projectValueOver250k === 'Yes' && d.principalContractorWho !== 'Our company' && !d.principalContractorName) w.push('Project value ≥ $250k — Principal Contractor details required.');
  d.selectedHRCW.forEach((item) => {
    if (!d.hrcwDetails[item]?.linkedSwms) w.push(`High-risk activity "${item}" has no linked SWMS.`);
  });
  if (!d.preparedByName) w.push('Prepared By signature is missing.');
  return w;
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  initial?: Partial<WHS_PlanData> | null;
  planTitle?: string;
  existingPlanId?: number | null;
  jobs: Array<{ id: number; name: string; jobNumber: string | null }>;
  onClose: () => void;
  onSaved: (planId: number, title: string) => void;
}

export default function WHS_PlanBuilder({ initial, planTitle, existingPlanId, jobs, onClose, onSaved }: Props) {
  const defaults = { ...blankPlanDefaults(), ...(initial ?? {}) };
  const [data, setData] = useState<WHS_PlanData>(defaults);
  const [savedPlanId, setSavedPlanId] = useState<number | null>(existingPlanId ?? null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  const set = useCallback((k: keyof WHS_PlanData, v: unknown) => {
    setData((prev) => ({ ...prev, [k]: v }));
  }, []);

  const warnings = getWarnings(data);
  const totalSteps = SECTIONS.length;
  const progress = Math.round(((step + 1) / totalSteps) * 100);

  async function handleSave(andClose = false) {
    setSaving(true); setSaveError('');
    try {
      const resolvedTitle = planTitle || data.projectName || 'WHS Management Plan';
      const body = {
        title: resolvedTitle,
        plan_data: JSON.stringify(data),
        status: data.status,
        job_id: data.jobId ? parseInt(data.jobId) : null,
        // Legacy fields for backward compat
        site_address: data.siteAddress,
        site_supervisor: data.contacts.find((c) => c.role === 'Site Supervisor')?.name ?? '',
        first_aid_officer: data.contacts.find((c) => c.role === 'First Aid Officer')?.name ?? '',
        emergency_contact: data.emergencyServicesNumber,
        nearest_hospital: data.nearestHospital,
        emergency_assembly_point: data.assemblyPointDescription,
        evacuation_notes: data.evacuationProcedure,
        project_value: data.projectValue,
        is_principal_contractor: data.principalContractorWho === 'Our company' ? 1 : 0,
        high_risk_activities: data.selectedHRCW.join('|'),
      };

      let planId = savedPlanId;
      let resp: Record<string, unknown>;

      if (planId) {
        // Update existing plan
        const r = await fetch(`/api/safety/plans/${planId}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        resp = await r.json();
        if (!r.ok) throw new Error((resp.error as string) ?? 'Failed to save');
      } else {
        // Create new plan
        const r = await fetch('/api/safety/plans', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        resp = await r.json();
        if (!r.ok) throw new Error((resp.error as string) ?? 'Failed to save');
        planId = (resp.plan as Record<string, unknown>)?.id as number;
        setSavedPlanId(planId);
      }

      onSaved(planId!, resolvedTitle);
      if (andClose) onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const sectionProps = { d: data, set };

  function renderSection() {
    const id = SECTIONS[step].id;
    switch (id) {
      case 'setup':        return <SectionSetup {...sectionProps} />;
      case 'project':      return <SectionProject {...sectionProps} />;
      case 'doccontrol':   return <SectionDocControl {...sectionProps} />;
      case 'contacts':     return <SectionContacts {...sectionProps} />;
      case 'emergency':    return <SectionEmergency {...sectionProps} />;
      case 'siterules':    return <SectionSiteRules {...sectionProps} />;
      case 'hrcw':         return <SectionHRCW {...sectionProps} />;
      case 'other':        return <SectionOtherActivities {...sectionProps} />;
      case 'hazards':      return <SectionHazards {...sectionProps} />;
      case 'consultation': return <SectionConsultation {...sectionProps} />;
      case 'plant':        return <SectionPlant {...sectionProps} />;
      case 'electrical':   return <SectionElectrical {...sectionProps} />;
      case 'traffic':      return <SectionTraffic {...sectionProps} />;
      case 'hazmat':       return <SectionHazMat {...sectionProps} />;
      case 'amenities':    return <SectionAmenities {...sectionProps} />;
      case 'environment':  return <SectionEnvironment {...sectionProps} />;
      case 'incidents':    return <SectionIncidents {...sectionProps} />;
      case 'review':       return <SectionReview {...sectionProps} />;
      case 'approval':     return <SectionApproval {...sectionProps} />;
      case 'appendices':   return <SectionAppendices {...sectionProps} />;
      default:             return null;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white w-full max-w-5xl mx-auto my-4 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/20 rounded-md"><ShieldCheck size={15} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-sm">WHS Management Plan Builder</h2>
              <p className="text-xs text-slate-400">{data.planType || 'Site Safety Plan'} {data.projectName ? `— ${data.projectName}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save Draft
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><X size={16} /></button>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="h-1 bg-slate-200 shrink-0">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── Sidebar nav ── */}
          <div className="w-48 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto hidden md:flex flex-col py-2">
            {SECTIONS.map(({ id, label, icon: Icon }, i) => (
              <button
                key={id}
                onClick={() => setStep(i)}
                className={[
                  'flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                  i === step
                    ? 'bg-primary text-white font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
                ].join(' ')}
              >
                <Icon size={12} className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* ── Content ── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Mobile step indicator */}
            <div className="md:hidden flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500 shrink-0">
              <span className="font-bold text-slate-700">{SECTIONS[step].label}</span>
              <span>({step + 1} of {totalSteps})</span>
            </div>

            {/* Validation warnings */}
            {showValidation && warnings.length > 0 && (
              <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-2"><AlertTriangle size={13} />Validation Issues ({warnings.length})</div>
                <ul className="space-y-1">
                  {warnings.map((w, i) => <li key={i} className="text-xs text-amber-700 flex gap-1.5"><span className="shrink-0">•</span>{w}</li>)}
                </ul>
              </div>
            )}

            {saveError && (
              <div className="mx-4 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs shrink-0">
                <AlertCircle size={13} className="shrink-0" />{saveError}
              </div>
            )}

            {/* Section content */}
            <div className="flex-1 overflow-y-auto p-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.15 }}
                >
                  {renderSection()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* ── Footer nav ── */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-white shrink-0 gap-3">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                <ChevronLeft size={15} />Previous
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowValidation((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${warnings.length > 0 ? 'text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100' : 'text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                >
                  <AlertTriangle size={12} />
                  {warnings.length > 0 ? `${warnings.length} issue${warnings.length !== 1 ? 's' : ''}` : 'No issues'}
                </button>

                {step === totalSteps - 1 ? (
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Save Plan
                  </button>
                ) : (
                  <button
                    onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}
                    className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
                  >
                    Next<ChevronRight size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
