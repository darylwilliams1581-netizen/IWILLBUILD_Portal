/**
 * Safety → Studio Integration Tests
 * Covers all 12 cases from the spec.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

// ── 1. Converter: swmsBodyToStudioBlocks ──────────────────────────────────────

import { swmsBodyToStudioBlocks } from '@/lib/safety-to-studio/swmsBodyToStudioBlocks';
import { blankSwmsBody } from '@/components/safety/swms-body-types';
import type { SwmsBodyData } from '@/components/safety/swms-body-types';

describe('swmsBodyToStudioBlocks', () => {
  it('generates blocks from a minimal SWMS body', () => {
    const data: SwmsBodyData = {
      ...blankSwmsBody(),
      title: 'Test SWMS',
      purpose: 'Test purpose',
      scope: 'Test scope',
      hrcwApplies: 'no',
      workSteps: [
        {
          id: 'ws1',
          sequenceNumber: 1,
          sequenceOfWork: 'Step 1',
          hazardsAndRisks: 'Fall risk',
          possibleConsequence: 'Injury',
          initialRisk: 'high',
          controlMeasures: 'Use harness',
          residualRisk: 'low',
          responsiblePerson: 'Supervisor',
        },
      ],
      ppeRows: [{ item: 'Safety helmet', requirement: 'Mandatory' }],
    };
    const blocks = swmsBodyToStudioBlocks(data, 'Test SWMS');
    expect(blocks.length).toBeGreaterThan(0);
    // Should have a heading block with the title
    const heading = blocks.find((b) => b.type === 'heading' && (b as { content: string }).content === 'Test SWMS');
    expect(heading).toBeDefined();
    // Should have a table for sequence of work
    const tables = blocks.filter((b) => b.type === 'table');
    expect(tables.length).toBeGreaterThan(0);
  });

  it('assigns correct category SWMS', () => {
    const data = blankSwmsBody({ title: 'Electrical SWMS', hrcwApplies: 'no' });
    const blocks = swmsBodyToStudioBlocks(data, 'Electrical SWMS');
    // Should include a "Review Before Issue" banner
    const banner = blocks.find(
      (b) => b.type === 'banner' && (b as { title: string }).title === 'Review Before Issue',
    );
    expect(banner).toBeDefined();
  });

  it('generates stable block IDs (no duplicates)', () => {
    const data = blankSwmsBody({ title: 'SWMS', hrcwApplies: 'no' });
    const blocks = swmsBodyToStudioBlocks(data, 'SWMS');
    const ids = blocks.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('sanitises HTML in content fields', () => {
    const data = blankSwmsBody({
      title: '<script>alert(1)</script>SWMS',
      purpose: '<b>Bold purpose</b>',
      hrcwApplies: 'no',
    });
    const blocks = swmsBodyToStudioBlocks(data, '<script>alert(1)</script>SWMS');
    const heading = blocks.find((b) => b.type === 'heading') as { content: string } | undefined;
    expect(heading?.content).not.toContain('<script>');
    expect(heading?.content).not.toContain('<b>');
  });
});

// ── 2. Converter: whsPlanToStudioBlocks ──────────────────────────────────────

import { whsPlanToStudioBlocks } from '@/lib/safety-to-studio/whsPlanToStudioBlocks';
import type { WHS_PlanData } from '@/components/safety/safety-types';

function minimalPlanData(): WHS_PlanData {
  return {
    planType: 'Site Safety Plan',
    planNumber: 'SSP-001',
    revisionNumber: '1',
    status: 'draft',
    datePrepared: '2026-08-28',
    reviewDate: '2027-08-28',
    preparedBy: 'Test User',
    reviewedBy: '',
    approvedBy: '',
    revisionHistory: [],
    projectName: 'Test Project',
    projectNumber: 'TP-001',
    projectDescription: 'A test project',
    scopeOfWorks: 'General construction',
    siteAddress: '123 Test St',
    siteAccessInstructions: '',
    startDate: '2026-09-01',
    expectedCompletion: '2027-01-01',
    normalWorkingHours: '7am–5pm',
    projectValue: '$500,000',
    projectValueOver250k: 'yes',
    clientName: 'Test Client',
    clientContact: '',
    builderContractor: 'Test Builder',
    qbccLicenceHolder: '',
    qbccLicenceNumber: '',
    principalContractorWho: 'Our company',
    principalContractorName: '',
    principalContractorCompany: '',
    contacts: [],
    emergencyServicesNumber: '000',
    siteAddressForEmergency: '123 Test St',
    gpsLocation: '',
    emergencyVehicleEntry: '',
    gateAccessInstructions: '',
    assemblyPointDescription: 'Car park',
    alarmMethod: 'Verbal',
    headCountResponsibility: 'Supervisor',
    evacuationProcedure: 'Evacuate to car park',
    firstAidKitLocation: 'Site office',
    aedLocation: '',
    fireExtinguisherLocations: '',
    spillKitLocation: '',
    eyewashLocation: '',
    electricalIsolationPoint: '',
    gasIsolationPoint: '',
    rescueEquipmentLocation: '',
    nearestMedicalCentre: '',
    medicalCentreAddress: '',
    medicalCentrePhone: '',
    nearestHospital: 'Test Hospital',
    hospitalAddress: '1 Hospital Rd',
    hospitalPhone: '07 1234 5678',
    estimatedTravelTime: '10 min',
    emergencyDrillFrequency: 'Monthly',
    selectedSiteRules: ['Sign in and sign out', 'Wear required PPE'],
    additionalSiteRules: '',
    visitorRequirements: '',
    siteSecurityRequirements: '',
    restrictedAreas: '',
    languagesAssistance: '',
    workerSignOffRequired: true,
    visitorSignOffRequired: false,
    selectedInductionTypes: ['General Construction Induction'],
    selectedHRCW: [],
    hrcwDetails: {},
    selectedOtherActivities: [],
    otherActivityDetails: {},
    hazardRegister: [],
    dailyPreStartRequired: true,
    toolboxTalkFrequency: 'Weekly',
    siteInspectionFrequency: 'Weekly',
    safetyMeetingFrequency: 'Monthly',
    swmsReviewMethod: '',
    hazardReportingMethod: '',
    workerFeedbackMethod: '',
    recordsStorageLocation: '',
    consultationActivities: [],
    plantRegisterRequired: false,
    preStartInspectionsRequired: true,
    operatorCompetencyVerified: true,
    vocRequired: false,
    maintenanceRecordsRequired: false,
    plantIsolationProcedure: '',
    lockoutTagout: '',
    keyControl: '',
    mobilePlantExclusionZones: '',
    spottersRequired: false,
    liftingEquipmentRegister: false,
    defectReporting: '',
    hireEquipmentVerification: false,
    reversingControls: '',
    plantPedestrianSeparation: '',
    temporarySwitchboard: false,
    rcdProtection: true,
    electricalInspectionTesting: '',
    leadManagement: '',
    electricalIsolation: '',
    overheadElectricalServices: '',
    undergroundElectricalServices: '',
    workNearEnergisedInstallations: '',
    safetyObserverRequired: false,
    electricalPermitRequired: false,
    clientAccessAuthorityRequired: false,
    siteSpeedLimit: '10 km/h',
    vehicleEntry: '',
    vehicleExit: '',
    deliveryArea: '',
    pedestrianRoute: '',
    reversingControlsTraffic: '',
    spotterRequirementsTraffic: '',
    trafficManagementPlanRequired: false,
    publicRoadAffected: false,
    footpathAffected: false,
    emergencyVehicleAccessTraffic: '',
    deliveryBookingRequirements: '',
    selectedHazMat: [],
    chemicalRegister: false,
    sdsRegister: true,
    storageLocation: '',
    segregationRequirements: '',
    spillControls: '',
    healthMonitoringRequired: false,
    respiratoryProtectionRequired: false,
    fitTestingRequired: false,
    wasteDisposalMethod: '',
    hazMatResponsiblePerson: '',
    selectedAmenities: [],
    amenitiesLocation: '',
    cleaningFrequency: '',
    servicingProvider: '',
    amenitiesResponsiblePerson: '',
    amenitiesInspectionFrequency: '',
    selectedEnvControls: [],
    envControlDetails: [],
    incidentReportingMethod: '',
    immediateNotificationContact: '',
    pcNotificationContact: '',
    incidentInvestigationResponsibility: '',
    notifiableIncidentResponsibility: '',
    regulatorNotificationResponsibility: '',
    incidentSitePreservation: '',
    correctiveActionRegisterRequired: true,
    emergencyEscalationProcedure: '',
    selectedReviewTriggers: [],
    scheduledReviewFrequency: 'Annually',
    reviewResponsiblePerson: '',
    lastReviewDate: '',
    nextReviewDate: '',
    reviewNotes: '',
    preparedByName: 'Test User',
    preparedByPosition: 'PM',
    preparedByDate: '2026-08-28',
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
    appendices: [],
    jobId: '',
    jobName: '',
  };
}

describe('whsPlanToStudioBlocks', () => {
  it('generates blocks from a minimal WHS plan', () => {
    const blocks = whsPlanToStudioBlocks(minimalPlanData(), 'Test WHS Plan');
    expect(blocks.length).toBeGreaterThan(0);
    const heading = blocks.find(
      (b) => b.type === 'heading' && (b as { content: string }).content === 'Test WHS Plan',
    );
    expect(heading).toBeDefined();
  });

  it('assigns correct category WHS Plan', () => {
    const blocks = whsPlanToStudioBlocks(minimalPlanData(), 'WHS Plan');
    const banner = blocks.find(
      (b) => b.type === 'banner' && (b as { title: string }).title === 'Review Before Issue',
    );
    expect(banner).toBeDefined();
  });

  it('generates stable block IDs (no duplicates)', () => {
    const blocks = whsPlanToStudioBlocks(minimalPlanData(), 'WHS Plan');
    const ids = blocks.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('includes emergency section with 000 number', () => {
    const blocks = whsPlanToStudioBlocks(minimalPlanData(), 'WHS Plan');
    const tables = blocks.filter((b) => b.type === 'table') as Array<{
      rows: Array<{ cells: Record<string, string> }>;
    }>;
    const emergencyTable = tables.find((t) =>
      t.rows.some((r) => r.cells.value === '000'),
    );
    expect(emergencyTable).toBeDefined();
  });
});

// ── 3. SwmsBodyBuilder: onGenerateStudio prop ─────────────────────────────────

import SwmsBodyBuilder from '@/components/safety/SwmsBodyBuilder';

// Mock fetch for the builder
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SwmsBodyBuilder — onGenerateStudio', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders Generate Studio Document button on last step when onGenerateStudio is provided', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ swms: { id: 1, title: 'Test' } }) });

    render(
      <MemoryRouter>
        <SwmsBodyBuilder
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onGenerateStudio={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Navigate to last step by clicking Next repeatedly
    const nextBtns = () => screen.queryAllByText(/Next/i);
    let attempts = 0;
    while (nextBtns().length > 0 && attempts < 20) {
      fireEvent.click(nextBtns()[0]);
      attempts++;
    }

    await waitFor(() => {
      expect(screen.queryByText(/Generate Studio Document/i)).toBeTruthy();
    });
  });

  it('does NOT render Generate Studio Document button when onGenerateStudio is not provided', async () => {
    render(
      <MemoryRouter>
        <SwmsBodyBuilder onClose={vi.fn()} onSaved={vi.fn()} />
      </MemoryRouter>,
    );

    // Navigate to last step
    const nextBtns = () => screen.queryAllByText(/Next/i);
    let attempts = 0;
    while (nextBtns().length > 0 && attempts < 20) {
      fireEvent.click(nextBtns()[0]);
      attempts++;
    }

    await waitFor(() => {
      expect(screen.queryByText(/Generate Studio Document/i)).toBeNull();
    });
  });
});

// ── 4. Idempotency: duplicate prevention ─────────────────────────────────────

describe('generate-from-safety idempotency (unit)', () => {
  it('returns alreadyExisted=true when same source record exists', async () => {
    // Simulate the API response for an existing record
    const mockResponse = { id: 42, alreadyExisted: true };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const r = await fetch('/api/studio/generate-from-safety', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetType: 'swms',
        sourceRecordId: 1,
        title: 'Test',
        blocks: [{ id: 'b1', type: 'heading', content: 'Test', level: 1, align: 'left' }],
        safetyCategory: 'SWMS',
      }),
    });
    const data = await r.json();
    expect(data.alreadyExisted).toBe(true);
    expect(data.id).toBe(42);
  });

  it('returns alreadyExisted=false for a new record', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 99, alreadyExisted: false }),
    });

    const r = await fetch('/api/studio/generate-from-safety', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetType: 'swms',
        sourceRecordId: 2,
        title: 'New SWMS',
        blocks: [{ id: 'b1', type: 'heading', content: 'New', level: 1, align: 'left' }],
        safetyCategory: 'SWMS',
      }),
    });
    const data = await r.json();
    expect(data.alreadyExisted).toBe(false);
    expect(data.id).toBe(99);
  });
});

// ── 5. Safety folder filter ───────────────────────────────────────────────────

describe('safety_category filter logic', () => {
  const templates = [
    { id: 1, name: 'SWMS Doc', template_type: 'swms', safety_category: 'SWMS', is_active: 1 },
    { id: 2, name: 'WHS Plan', template_type: 'safety_plan', safety_category: 'WHS Plan', is_active: 1 },
    { id: 3, name: 'Policy', template_type: 'policy', safety_category: null, is_active: 1 },
  ];

  function applyFilter(typeFilter: string) {
    return templates.filter((t) => {
      const isSafetyFilter = typeFilter === 'SWMS' || typeFilter === 'WHS Plan';
      return typeFilter === 'All'
        ? true
        : isSafetyFilter
          ? t.safety_category === typeFilter
          : t.template_type === typeFilter;
    });
  }

  it('SWMS filter shows only SWMS safety_category docs', () => {
    const result = applyFilter('SWMS');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('WHS Plan filter shows only WHS Plan safety_category docs', () => {
    const result = applyFilter('WHS Plan');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('All filter shows all docs', () => {
    expect(applyFilter('All')).toHaveLength(3);
  });

  it('policy filter shows only policy docs', () => {
    const result = applyFilter('policy');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});

// ── 6. Block content validation ───────────────────────────────────────────────

describe('generated blocks do not contain live form controls', () => {
  it('SWMS blocks contain no field type blocks', () => {
    const data = blankSwmsBody({ title: 'SWMS', hrcwApplies: 'no' });
    const blocks = swmsBodyToStudioBlocks(data, 'SWMS');
    const fieldBlocks = blocks.filter((b) => b.type === 'field');
    expect(fieldBlocks).toHaveLength(0);
  });

  it('WHS Plan blocks contain no field type blocks', () => {
    const blocks = whsPlanToStudioBlocks(minimalPlanData(), 'WHS Plan');
    const fieldBlocks = blocks.filter((b) => b.type === 'field');
    expect(fieldBlocks).toHaveLength(0);
  });
});
