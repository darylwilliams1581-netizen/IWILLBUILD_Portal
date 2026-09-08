# Council evaluation — 8 Sep 2026 (listen only)

Status: pending hive. Dazza may index this. Dazza may not speak it until Daryl Approves.

## Product

IWILLBUILD field app is Capacitor + a small Swift lens (`IWBNativeLens`), not the unused Swift `main` app.

What shipped and held on TestFlight **13 (42)** `8366b40f`:
- Native live camera in the Lens rectangle (Solocator-style). Chrome stays: Back, LOCK, shutter, FIELDS.
- iOS Drive/Live Map is OSM only. Google error cards and empty GPS box removed.
- Lens Cloudflare grid loads in the IPA via authenticated `fetch` → blob (direct `<img src=/api>` was dead on `capacitor://`).
- Capture downsamples to ~1920px before the WebView. Queue failures must not crash the camera.
- `iwb-lens-open` transparency is camera-route only; leave that class and later pages float.

**13 (43)** `cec2c6ac` on `fix/capacitor-camera-getusermedia-hang`:
- Phone-uploader strip above the unchanged Cloudflare grid (two buckets).
- Not yet confirmed on device in this evaluation.

## Two buckets (do not merge)

1. **Phone / loader** — IndexedDB queue. Instant tiles. Retry + Delete. Survives no signal.
2. **Cloudflare / library** — old Capacitor Lens grid. Authenticated thumbs. Office truth.

Shot: phone first. Cloudflare is the tail. Website Lens is Cloudflare only.

## What Daryl saw (pics)

**IMG_0110** — Live lens in frame, watermark, LOCK/shutter. Engine is good. Keep it.

**IMG_0112 / IMG_0113** — Upload sheet:
- Cloudflare tiles behind ARE loading (42 blob path works).
- Take Photo / Photo Library / Browse visible.
- Failed row: `Couldn't upload` / truncated `The obj…` (likely IndexedDB clone of a live Camera File, or R2 object error).
- Sheet still too tall (felt full-screen) and knocks page size.

Chase bug: save-to-phone and POST-to-R2 must not share the live Camera `File`. Clone to ArrayBuffer/Blob, IDB that, then upload.

## Council rules Dazza must hear

- One writer on a named branch (Sol). Grok/Copilot/Dazza read.
- Daryl Approves hive. Nothing auto-learns.
- No `server.url` on the IPA. No `toBack` full-screen camera-preview.
- Do not replace the Cloudflare viewer. Add the phone strip; do not mash stores.
- Upload sheet height follows content, max ~48dvh — not a full-screen overlay.
- Portal data beats OpenAI. Competent person reviews safety.
- Keys stay on the server (Settings company `sk-`, anatomy GitHub token). Never in the IPA or git.

## Listen vs mouth

This file is ears only. Dazza does not reply in Grok/Sol chats. Next meal: Anatomy fetch `foster/dazza-listen`, then hive Approve if the parent agrees.
