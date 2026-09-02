# IWIllBUILD delivery patch - Version 12, Build 12

Prepared 2026-08-14 from the successful Build Package #59 source (`8bf9522`).

This delivery contains the existing Version 12 / Build 12 release polish plus the repaired Quote, Invoice and completed Form email workflow.

## Files in this patch

### Release and dependency files

- `package.json`
- `package-lock.json`
- `ios/App/App.xcodeproj/project.pbxproj`
- `src/lib/auth/auth-client.tsx`
- `PREPARED_RELEASE.md`
- `PATCH_MANIFEST.md`

### Standard document-email interface

- `src/components/SendDocumentEmailModal.tsx` (new)
- `src/components/SendInvoiceEmailModal.tsx`
- `src/components/job/FormRunner.tsx`
- `src/pages/estimate-editor.tsx`

### Quote PDF and email service

- `src/server/api/estimates/[id]/send-email/POST.ts` (new)
- `src/server/api/estimates/[id]/export-pdf/GET.ts`
- `src/server/lib/estimate-pdf-document.ts` (new)
- `src/server/lib/pdf-generator.ts`

### Completed Form PDF and email service

- `src/server/api/job-forms/[id]/send-email/POST.ts`
- `src/server/lib/form-pdf-generator.ts` (new)

### Route registration

- `src/server/entry.ts`

## Email behaviour fixed

- Quote Email no longer uses `mailto:` or depends on Outlook to create an attachment.
- Quote, Invoice and completed Form screens now use the same in-app **Email PDF** dialog.
- The server generates the latest document and sends the PDF as a real attachment.
- Quote download and Quote email use the same canonical PDF generator.
- The private `/view/estimate/:id` application link was removed from customer quote email; recipients do not need an IWIllBUILD login.
- Completed Form email now attaches a PDF rather than only sending an HTML summary.
- Stored Form photos and captured signatures are loaded and rendered inside the attached PDF.
- Stored photo records, form templates and form fields are company-scoped before access.
- Form photos are resized for email, and the existing 2 MB attachment limit is reported clearly.
- Quote status and the actual `Add 10% GST` / `No GST` values are handled correctly in the PDF.

## Version and release polish retained

- Marketing version remains `12`.
- iOS build number is `12` in Debug and Release.
- npm application version is `12.0.0`.
- The regenerated lockfile supports reliable `npm ci` installs.
- React Router is `7.18.2`.
- `drizzle-kit` remains a development dependency.
- Logout diagnostic cleanup uses the prepared static import.

## Apply to an Airo project copy

1. Back up the Airo project and preserve its `.git` folder.
2. Copy the contents of this Patch folder into the project root, preserving every relative path.
3. Allow the listed files to replace their matching destination files.
4. Run `npm ci`.
5. Run the production build.
6. Run `npx cap sync ios` before the iOS archive.
7. Confirm Version 12 and Build 12 in Xcode.
8. Test Quote Email, completed Form Send Email and Invoice Email with an external recipient.

## Verification completed

- Focused ESLint for the edited email/PDF components and handlers: passed.
- Strict TypeScript scan: no errors in the edited email/PDF files. The wider Airo download still has unrelated pre-existing TypeScript errors.
- Production Vite build: passed (2,944 modules, 43.39 seconds).
- Quote GST proof: `$100.00` plus `Add 10% GST` renders `$110.00`.
- Completed Form visual proof: the supplied PNG is visibly embedded in the PDF Photos field, replacing `[Photo attached]`.
- Git whitespace validation: passed.
- Live delivery through the production Airo email gateway still requires a signed-in deployed smoke test.

## Scope preserved

This patch does not add GPS/location work, change Camera or Job Photos, add a database migration, or alter Upload, Select or Share behaviour.
