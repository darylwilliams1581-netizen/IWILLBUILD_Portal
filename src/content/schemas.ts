import { z } from 'zod';
export const schemas = {
  studio: z.object({
    "ALL_TYPES": z.array(z.string())
  }),
  driver: z.object({
    "CATEGORIES": z.array(z.object({
      "value": z.string(),
      "label": z.string(),
      "id": z.string()
    }))
  })
};
export type Schemas = typeof schemas;