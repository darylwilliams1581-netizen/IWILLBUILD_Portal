/**
 * In-memory support session store.
 * Maps session token → support context.
 * Lightweight — no DB table needed. Clears on server restart (acceptable).
 */

export interface SupportContext {
  companyId: number;
  companyName: string;
  enteredAt: string;
}

// Module-level singleton map
export const supportSessionStore = new Map<string, SupportContext>();
