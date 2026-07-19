import { z } from 'zod';
export const schemas = {
  home: z.object({
    tabs: z.array(z.string()),
    rows: z.array(z.object({
      id: z.string(),
      label: z.string(),
      status: z.string(),
      color: z.string(),
    })),
  }),
  roadmap: z.object({
    phases: z.array(z.string()),
    GATES: z.array(z.object({
      id: z.string(),
      label: z.string(),
      status: z.string(),
      criteria: z.array(z.string()),
    }).passthrough()),
  }),
  asset_manager: z.object({
    TABS: z.array(z.string()),
  }),
  asset_report_share: z.object({
    linkUnavailable: z.string(),
    linkExpiredMessage: z.string(),
    assetDetails: z.string(),
    inspectionSummary: z.string(),
  }).passthrough(),
  studio: z.object({
    ALL_TYPES: z.array(z.string()),
  }),
  driver: z.object({
    COST_CATEGORIES: z.array(z.object({
      value: z.string(),
      label: z.string(),
      id: z.string(),
    })),
  }),
};
export type Schemas = typeof schemas;
