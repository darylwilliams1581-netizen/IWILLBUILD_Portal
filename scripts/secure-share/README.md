# scripts/secure-share/

Offline test scripts for the Secure Share system.

These scripts were previously exposed as HTTP endpoints under
`/api/admin/test-share-*` and have been removed from production.

They are preserved here for reference and for running against a local
development instance or staging environment.

## Scripts

| File | Purpose |
|---|---|
| `test-share-runtime.ts` | 12-item authenticated runtime test suite (idempotency, revoke, rotate, isolation, no-leak) |
| `test-share-concurrency.ts` | Concurrent POST test — proves advisory lock produces exactly 1 active row |
| `test-share-deletion.ts` | Source deletion lifecycle — proves revoke-on-delete, 410 after deletion, audit event |

## How to run (local dev only)

These scripts are Express handler functions. To run them:

1. Start the dev server: `npm run dev`
2. Temporarily register the route in `src/server/entry.ts` (local only — never commit)
3. Call with your session cookie:
   ```
   curl -X POST http://localhost:5173/api/admin/test-share-runtime \
     -H "Cookie: <your-session-cookie>"
   ```
4. Remove the registration before committing.

## IMPORTANT

**Never register these routes in production.**
They mutate the database (insert/revoke synthetic rows) and must not be
exposed as production HTTP endpoints.
