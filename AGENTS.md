# Agent rules for IWILLBUILD-iOS

Native Swift / SwiftUI iPhone **field app**. Offline-first.

## Do

- In-app `AVCaptureSession` preview (Solocator-style)
- Live overlay of job / date / time / GPS / label
- Bake watermark into JPEG on shutter
- Persist on device, then upload to `https://iwillbuild.com/api/jobs/:id/photos` (`photos` form field, `X-Client-Id`)
- Sign on/off, Site Prestart / HazChat, and job forms must work with no reception and sync later
- Cache jobs and form templates on the phone

## Do not

- Capacitor, Cordova, or WKWebView of the website as the camera
- `UIImagePickerController` / PhotosPicker as the primary shutter
- `getUserMedia`
- Copy office portal screens (quotes, billing, Dazza)
- Let Airo export into this repo
- Bundle id other than `com.iwillbuild.portal` (that is the live TestFlight app; we replaced Capacitor)
- Require a live network call before the shutter, sign-on, or prestart can be used
