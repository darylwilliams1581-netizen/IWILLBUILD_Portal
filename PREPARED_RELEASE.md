# IWILLBUILD release candidate - Version 12, Build 12

This is the prepared GitHub/TestFlight source based on successful Appflow Build Package #59.

- Application base: installed Airo download
- Source Git remote: `https://github.com/darylwilliams1581-netizen/IWILLBUILD_Portal.git`
- Build #59 source commit: `8bf95229e533493b66ca281c2a98044d7f65832d`
- iOS version/build: `12 (12)`
- npm application version: `12.0.0`

## Document email repair

Quote Email now uses IWILLBUILD's server email service and attaches the generated quote PDF. It no longer opens an Outlook `mailto:` draft, and no private in-app link is sent to external customers.

Completed Form Send Email now generates and attaches a PDF containing the form details, stored photos and captured signatures. Invoice Email has been aligned to the same reusable email dialog while retaining its existing attachment endpoint.

The Quote PDF download and email paths share one generator, including correct handling for the application's `Add 10% GST` and `No GST` values.

## Existing release polish

The dependency lockfile is prepared for reliable `npm ci` installs. React Router is updated to 7.18.2, build-only Drizzle tooling is in development dependencies, and iOS Debug/Release build numbers are both 12.

The current Airo camera and Job Photos workflow is preserved. No GPS/location feature or database migration is included.

See `PATCH_MANIFEST.md` for the exact file list, apply instructions and verification record.
