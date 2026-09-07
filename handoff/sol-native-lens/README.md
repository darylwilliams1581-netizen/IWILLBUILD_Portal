# IWIllBUIlD native lens handoff (for Sol / Codex)

This zip is **engine + prompt only**. It is not an app.

## What Daryl wants

Solocator-style **in-app** camera:

- Purple **Camera** on Lens opens the **existing Capacitor camera page**
- Live glass behind that chrome (not website `getUserMedia`, not system Camera.app as the product)
- Existing watermark, LOCK, FIELDS, shutter
- Fast first frame
- Back to Lens

## What is in this zip

`swift-camera-engine/` — from the previous Swift field app (do **not** merge `IWILLBUILDField` as the IPA):

| File | Use |
|---|---|
| `CameraSession.swift` | AVFoundation session, permission, start/stop, flip, torch, `capture()` → JPEG |
| `CameraPreview.swift` | `AVCaptureVideoPreviewLayer` (the live glass) |
| `WatermarkComposer.swift` | Native stamp — **optional**; Capacitor already stamps in JS |
| `WatermarkSettings.swift` | Same toggles as `useWatermarkSettings.ts` |
| `LensView.REFERENCE_ONLY.swift` | Layout reference only. **Do not** replace `job-photos-camera.tsx` |

## What is NOT in this zip (already on the Capacitor branch)

On `fix/capacitor-camera-getusermedia-hang`:

- `src/pages/job-photos-camera.tsx` — **keep this UI**
- `src/hooks/useWatermarkSettings.ts`
- `src/lib/capturePhotoLocally.ts` — last-resort fallback only
- `src/hooks/usePhotoUploadQueue.ts` — keep; do not use Swift PhotoQueue

## How to use

1. Open `SOL_PROMPT.txt` and paste the whole file into Sol.
2. Attach this zip (or the `swift-camera-engine` folder).
3. Sol implements on the Capacitor branch. Daryl owns push / TestFlight.

Do not push, merge `main`, touch Airo, restore `server.url`, or bump past 13 (36) without Daryl.
