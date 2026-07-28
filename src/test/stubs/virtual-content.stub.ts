/**
 * Test stub for virtual:content
 *
 * The real virtual:content module is generated at build time by the
 * content_scaffold plugin. It is not available during Vitest runs, so this
 * stub exports the same named exports with empty/minimal values so that any
 * module that imports from virtual:content doesn't crash during tests.
 *
 * Shape is derived from src/content/virtual-content.d.ts.
 */

export const asset_manager: { TABS: string[] } = { TABS: [] };

export const asset_report_share: {
  linkUnavailable: string;
  linkExpiredMessage: string;
  assetDetails: string;
  inspectionSummary: string;
  defectsLabel: string;
  tendersLabel: string;
  photosLabel: string;
  noExpiry: string;
} = {
  linkUnavailable: '',
  linkExpiredMessage: '',
  assetDetails: '',
  inspectionSummary: '',
  defectsLabel: '',
  tendersLabel: '',
  photosLabel: '',
  noExpiry: '',
};

export const home: {
  tabs: string[];
  rows: Array<{ id: string; label: string; status: string; color: string }>;
} = { tabs: [], rows: [] };

export const roadmap: {
  phases: string[];
  GATES: Array<{ id: string; label: string; status: string; criteria: string[]; unblock: string }>;
} = { phases: [], GATES: [] };

export const studio: { ALL_TYPES: string[] } = { ALL_TYPES: [] };
