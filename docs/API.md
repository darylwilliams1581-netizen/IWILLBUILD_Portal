# Portal API used by the field app

Host: `https://iwillbuild.com`

Auth is better-auth (same cookies as the website).

- `POST /api/auth/sign-in/email` JSON `{ "email", "password" }`
- `GET /api/auth/get-session`
- `POST /api/auth/sign-out`
- `GET /api/jobs` → `{ "jobs": [ { "id", "name", "jobNumber", "status", "address" } ] }`
- `POST /api/jobs/:id/signin` JSON `{ "actorType", "notes" }`
- `POST /api/jobs/:id/signout` JSON `{ "notes" }`
- `GET /api/jobs/:id/signin-status` → `{ "signedIn": bool }`
- `POST /api/jobs/:id/site-prestarts`
- `PUT /api/jobs/:id/site-prestarts/:prestartId`
- `POST /api/jobs/:id/site-prestarts/:prestartId/workers`
- `POST /api/jobs/:id/site-prestarts/:prestartId/finalise`
- `GET /api/jobs/:id/forms` → templates + submissions
- `GET /api/forms/:templateId/fields`
- `POST /api/jobs/:id/forms` JSON `{ "templateId" }`
- `PUT /api/job-forms/:id` JSON `{ "answersJson", "status" }`
- `POST /api/jobs/:id/photos` multipart field `photos`, header `X-Client-Id`

Offline: Documents/offline (jobs, attendance, prestarts, forms, outbox) and Documents/queued-photos. Replay when NetworkStatus is online.
