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
  }),
  job_risky: z.object({
    "HAZARD_OPTIONS": z.array(z.string()),
    "PERMIT_TYPE_OPTIONS": z.array(z.string())
  }),
  incidents: z.object({
    "INCIDENT_TYPES": z.array(z.string())
  }),
  incident_detail: z.object({
    "THIRD_PARTY_ROLES": z.array(z.string())
  }),
  forms: z.object({
    "page": z.object({
      "title": z.string(),
      "heading": z.string(),
      "metaDescription": z.string()
    }),
    "FORM_TYPES": z.array(z.string()),
    "emptyState": z.object({
      "heading": z.string(),
      "body": z.string()
    }),
    "deleteConfirm": z.object({
      "heading": z.string(),
      "body": z.string(),
      "confirmLabel": z.string(),
      "deletingLabel": z.string(),
      "cancelLabel": z.string()
    }),
    "drawer": z.object({
      "createHeading": z.string(),
      "editHeading": z.string(),
      "namePlaceholder": z.string(),
      "categoryPlaceholder": z.string(),
      "descriptionPlaceholder": z.string(),
      "availabilityLabel": z.string(),
      "activeLabel": z.string(),
      "dashboardLabel": z.string(),
      "jobsLabel": z.string(),
      "fleetLabel": z.string()
    })
  }),
  job_field_docs: z.object({
    "page": z.object({
      "title": z.string(),
      "heading": z.string(),
      "metaDescription": z.string()
    }),
    "emptyState": z.object({
      "heading": z.string(),
      "body": z.string(),
      "addLabel": z.string()
    }),
    "signOnRegister": z.object({
      "heading": z.string(),
      "workerNote": z.string(),
      "noSignOnsBody": z.string()
    }),
    "addDocModal": z.object({
      "heading": z.string(),
      "addLabel": z.string(),
      "cancelLabel": z.string()
    })
  }),
  login: z.object({
    "page": z.object({
      "title": z.string(),
      "metaDescription": z.string(),
      "ogTitle": z.string(),
      "ogDescription": z.string()
    }),
    "heading": z.string(),
    "subheading": z.string(),
    "tabs": z.object({
      "password": z.string(),
      "pin": z.string()
    }),
    "twoFactor": z.object({
      "heading": z.string()
    }),
    "banners": z.object({
      "emailVerified": z.string()
    }),
    "errors": z.object({
      "missingCredentials": z.string(),
      "pinLength": z.string(),
      "pinVerifiedFallback": z.string()
    }),
    "submitLabel": z.string()
  }),
  lists: z.object({
    "SEVERITY_OPTIONS": z.array(z.string())
  }),
  risk_register: z.object({
    "LIKELIHOOD_OPTIONS": z.array(z.object({
      "value": z.string(),
      "label": z.string(),
      "desc": z.string(),
      "id": z.string()
    })),
    "CONSEQUENCE_OPTIONS": z.array(z.object({
      "value": z.string(),
      "label": z.string(),
      "desc": z.string(),
      "id": z.string()
    }))
  })
};
export type Schemas = typeof schemas;