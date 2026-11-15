# Fleet logbook client integration

Base: approved Capacitor source `dc07988d55cd46d8cf140bc77ed5e2bfe346c947` (version 13, build 95 in the review evidence).

This is a targeted client port for the approved app. It does not replace it with the separate Swift field-app shell. Authentication, native startup, signing and native UI are retained. Release metadata advances to version 14, build 97 or higher; the manual TestFlight workflow runs the Fleet tests before building the approved Capacitor project.

## Behaviour

- Logbook enabled: Start requires an actual odometer reading. A durable request UUID ties the server session to its logbook capture; timeouts and duplicate clicks reuse the request.
- Logbook disabled: the existing vehicle selection starts normal driving without an odometer step.
- Home, badge, provider and Fleet administrator Stop use the shared stop service. GPS watchers and intervals stop at the click, and late GPS callbacks are discarded. Failed server stops retain their original timestamp for retry.
- A global completion sheet survives route/badge unmounting. Only an authorised logbook capture opens it; it does not depend on the checkbox remaining enabled after the drive.
- Completion requires explicit Business/Private selection and a valid ending odometer. Business entries also require purpose and destination/journey description; Other requires a reason.
- Answers survive closing/restarting. Completed entries are queued atomically, with original driver/company checks before upload. Upload failures and conflicts remain visible; retry never changes the captured facts.
- Administrator-ended captures are recovered for their original driver. The administrator is not asked to classify someone else's journey.

## Backend dependency

Use the reviewed Airo Fleet backend (export 15 or equivalent), including its database migration and ownership/idempotency safeguards. Required contracts are `/api/me`, `/api/fleet/vehicles` with `logbook_active`, session Start/Stop with linked capture metadata, `/api/fleet/logbook-pending` and owner-checked trip-log POST.

This branch intentionally retains the approved repository's server files. It is a client integration branch for the Capacitor bundle, not a replacement deployment of the current Airo website/backend.

## Local checks

`npm run test:fleet-native` exercises actual Start/Stop UI, completion, recovery, storage, the native GPS provider and the telemetry hook using mocked browser/native/network boundaries. It does not establish physical iPhone or production database behaviour.

The only new development dependency is `fake-indexeddb@6.2.8`. Its lock entry is pinned. Production dependencies are unchanged.

The TestFlight build must be checked on an iPhone for Start/Stop, GPS shutdown, offline restart, account switch, administrator stop and recovery with logbook on/off against the published backend. Automated tests do not establish production database or physical device behaviour. This branch is for TestFlight testing, not an App Store live release or an Airo backend deployment.
