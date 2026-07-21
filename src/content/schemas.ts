import { z } from 'zod';
export const schemas = {
  home: z.object({
    tabs: z.array(z.string()),
    rows: z.array(z.object({
      id: z.string(),
      label: z.string(),
      status: z.string(),
      color: z.string()
    }).passthrough())
  }).passthrough(),
  roadmap: z.object({
    phases: z.array(z.string()),
    GATES: z.array(z.object({
      id: z.string(),
      label: z.string(),
      status: z.string(),
      criteria: z.array(z.string())
    }).passthrough())
  }).passthrough(),
  asset_manager: z.object({
    TABS: z.array(z.string())
  }).passthrough(),
  asset_report_share: z.object({
    linkUnavailable: z.string(),
    linkExpiredMessage: z.string(),
    assetDetails: z.string(),
    inspectionSummary: z.string()
  }).passthrough(),
  studio: z.object({
    ALL_TYPES: z.array(z.string()),
    CATEGORIES: z.array(z.string())
  }).passthrough(),
  driver: z.object({
    COST_CATEGORIES: z.array(z.object({
      value: z.string(),
      label: z.string(),
      id: z.string()
    }).passthrough())
  }).passthrough(),
  job_site_prestart: z.object({
    "SITUATION_CHECKS": z.array(z.string()),
    "EXECUTION_CHECKS": z.array(z.string()),
    "ADMIN_CHECKS": z.array(z.string())
  })
};
export type Schemas = typeof schemas;