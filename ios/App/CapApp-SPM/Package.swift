// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
//
// ── Manual fix applied 2026-08-07 ────────────────────────────────────────────
// `npx cap sync` failed to add the plugin products for @capacitor/camera,
// @capacitor/geolocation, @capacitor/push-notifications, and @capacitor/app.
// Without these entries the native plugins are not compiled into the Xcode
// project, so:
//   - Camera.getPhoto() silently fails (black viewfinder, no shutter action)
//   - Geolocation.checkPermissions() throws at runtime
//   - PushNotifications.register() is a no-op
//   - iOS Settings shows only Photos — no Camera, Location, or Notifications
//
// ── Manual fix applied 2026-08-12 ────────────────────────────────────────────
// Added @capacitor/filesystem and @capacitor-community/media.
//
// ── Manual fix applied 2026-08-12 (build 11075091 failure) ──────────────────
// PROBLEM: Appflow build failed with:
//   "target 'CapApp-SPM' referenced in product 'CapApp-SPM' is empty"
//
// ROOT CAUSE: `npx cap sync ios` runs during the Appflow build and regenerates
// Package.swift. The installed Capacitor packages are 8.4.1 but this file
// previously referenced capacitor-swift-pm from: "7.0.0". The 8.x package has
// a different internal layout — when Xcode resolved the 8.x tag against a
// Package.swift that declared 7.x products, the target resolved with no source
// files and SPM rejected it.
//
// FIX: Updated capacitor-swift-pm to from: "8.0.0" to match @capacitor/* 8.4.1.
// The product names (CapacitorCamera, CapacitorGeolocation, etc.) are unchanged
// between 7.x and 8.x — only the minimum version constraint changes.
//
// NOTE: @capacitor-community/media is NOT in capacitor-swift-pm. It ships its
// own Swift package at https://github.com/capacitor-community/media.git.
// ─────────────────────────────────────────────────────────────────────────────

let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        // Must match installed @capacitor/* version (currently 8.4.1)
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        // @capacitor-community/media ^9.1.0 — not in capacitor-swift-pm; ships its own SPM package
        .package(url: "https://github.com/capacitor-community/media.git", from: "9.1.0"),
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                // ── Capacitor core (always required) ──────────────────────────
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),

                // ── Native plugins ────────────────────────────────────────────
                // @capacitor/camera — Camera.getPhoto(), checkPermissions(),
                //   requestPermissions(). Required for the shutter to open the
                //   native iOS camera and for Camera/Photos to appear in
                //   iPhone Settings → IWILLBUILD.
                .product(name: "CapacitorCamera", package: "capacitor-swift-pm"),

                // @capacitor/geolocation — Geolocation.getCurrentPosition(),
                //   watchPosition(), checkPermissions(). Required for Location
                //   to appear in iPhone Settings → IWILLBUILD.
                .product(name: "CapacitorGeolocation", package: "capacitor-swift-pm"),

                // @capacitor/push-notifications — PushNotifications.register(),
                //   requestPermissions(). Required for Notifications to appear
                //   in iPhone Settings → IWILLBUILD.
                .product(name: "CapacitorPushNotifications", package: "capacitor-swift-pm"),

                // @capacitor/app — App.addListener('appStateChange'), getInfo().
                //   Required for foreground/background lifecycle events and
                //   deep-link handling.
                .product(name: "CapacitorApp", package: "capacitor-swift-pm"),

                // @capacitor/haptics — Haptics.impact(), notification().
                .product(name: "CapacitorHaptics", package: "capacitor-swift-pm"),

                // @capacitor/network — Network.getStatus(), addListener().
                .product(name: "CapacitorNetwork", package: "capacitor-swift-pm"),

                // @capacitor/status-bar — StatusBar.setStyle(), hide(), show().
                .product(name: "CapacitorStatusBar", package: "capacitor-swift-pm"),

                // @capacitor/splash-screen — SplashScreen.hide().
                .product(name: "CapacitorSplashScreen", package: "capacitor-swift-pm"),

                // @capacitor/filesystem — Filesystem.readFile(), writeFile(), etc.
                //   Required for the readFile() fallback in useIosMediaPicker (attempt 4)
                //   and for saving captured photos to the native filesystem before
                //   writing them to the iOS Photos library.
                .product(name: "CapacitorFilesystem", package: "capacitor-swift-pm"),

                // @capacitor-community/media — Media.savePhoto(), saveVideo(), etc.
                //   Required for "Backup to Camera Roll": saves captured JPEG blobs to
                //   the iOS Photos library. Without this the toggle does nothing.
                .product(name: "CapacitorCommunityMedia", package: "media"),
            ],
            // Explicit path ensures SPM always finds the stub source file even
            // when the working directory differs (e.g. Appflow CI clone paths).
            path: "Sources/CapApp-SPM"
        )
    ]
)
