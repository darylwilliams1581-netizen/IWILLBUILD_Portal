# IWILLBUILD TestFlight v11 patch bundle

Scope:
- Built a deployable TestFlight prep bundle using your current raw project plus the missing iOS/build files from the GitHub recovery copy.
- Set iOS version metadata to Version 11 / Build 3.

Included for apply:
- capacitor.config.json
- dev-tools/src/AiroErrorBoundary.tsx
- scripts/publish-build.mjs
- ios/App/App.xcodeproj/project.pbxproj
- ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist
- ios/App/CapApp-SPM/Package.swift
- ios/App/CapApp-SPM/README.md
- ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift
- ios/App/App/AppDelegate.swift
- ios/App/App/Info.plist
- ios/App/App/Base.lproj/LaunchScreen.storyboard
- ios/App/App/Base.lproj/Main.storyboard
- ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
- ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
- ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
- ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
- ios/debug.xcconfig
- ios/.gitignore

Version updates in this patch:
- ios/App/App.xcodeproj/project.pbxproj
  - MARKETING_VERSION = 11
  - CURRENT_PROJECT_VERSION = 3
- capacitor.config.json
  - ios.buildNumber = "3"

Files intentionally not in this patch:
- public\assets\uploads\airo-logo-shimmer-horizontal.svg
  - this already exists in your current raw project and was not missing.

Why this matters for TestFlight:
- Your raw folder was missing the entire iOS Native project and publish script.
- This patch restores the required iOS/Capacitor integration so `npm run build:cap`, `npx cap sync`, and Xcode/App Store Connect flow can run.

Apply directions:
1. Copy this folder over the same relative path in your working project, excluding this manifest if desired.
2. Confirm app metadata:
   - Bundle ID: `com.iwillbuild.portal`
   - App name: `IWILLBUILD`
3. Build and archive from Xcode, then upload to TestFlight.
4. In App Store Connect, create a new release with version `11`, build `3`.
