import { z } from 'zod';
export const schemas = {
  studio: z.object({
    "ALL_TYPES": z.array(z.string())
  })
};
export type Schemas = typeof schemas;