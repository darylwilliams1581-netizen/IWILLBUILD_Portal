# IWILLBUILD TestFlight Patch Bundle
# Version: 12
# Build: 10
# Generated: 2026-08-12
# Applies to: clean Airo IWILLBUILD_Portal-main download

## Files in this patch
- capacitor.config.json
- ionic.config.json
- ios\App\App.xcodeproj\project.pbxproj
- ios\App\App\capacitor.config.json
- ios\App\CapApp-SPM\Package.swift
- package.json
- package-lock.json
- vite.config.ts
- scripts\publish-build.mjs
- src\server\api\jobs\[id]\photos\POST.ts
- src\server\api\job-cards\[id]\photos\POST.ts
- src\hooks\usePhotoUploadQueue.ts
- src\pages\job-photos-page.tsx
- export-plugins\content-plugin\index.ts
- export-plugins\content-plugin\keys.ts
- public\airo-video-slots.js
- public\manifest.json
- public\assets\app-icon-1024.png
- public\assets\app-icon-192.png
- public\assets\app-icon-512.png
- public\assets\logo.png
- public\assets\logo-horizontal-solid.png
- public\assets\logo-horizontal-transparent.png
- public\assets\logo-square-transparent.png
- public\assets\uploads\airo-logo-shimmer-horizontal.svg
- dev-tools\src\AiroErrorBoundary.tsx
- .git

## Apply steps
1. Take a fresh download from Airo and keep it as a clean project.
2. Extract this patch zip to the clean project root (or copy each file preserving paths). This restores the hidden `.git` folder if the Airo replace step deleted it.
3. Run npm ci.
4. Run npm run build.
5. Run npx cap sync ios.
6. Verify iOS marketing version is 12 and build number is 10.
7. Build and upload to TestFlight.

## Notes
- Do not delete the project's hidden `.git` folder during the Airo replace step. If `.git` is deleted, GitHub Desktop will show "Can't find IWILLBUILD_Portal".
- This patch carries the TestFlight build bump plus the native plugin files for Capacitor Filesystem and Media.
- Camera upload fix included: if server-side image compression fails, the raw photo is saved instead of returning a 400; upload cards now show clearer server/proxy errors; mobile job-photo upload button is fixed-size square.
