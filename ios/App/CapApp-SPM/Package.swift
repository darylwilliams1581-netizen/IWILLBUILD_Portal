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
// These product names match the capacitor-swift-pm package at the version
// declared in package.json (@capacitor/* 7.x → capacitor-swift-pm 7.x).
// After editing this file, run:
//   npx cap sync ios
// then open Xcode and confirm CapacitorCamera appears in the SPM dependency tree.
//
// ── Manual fix applied 2026-08-12 ────────────────────────────────────────────
// Added @capacitor/filesystem and @capacitor-community/media.
//
// @capacitor/filesystem — CapacitorFilesystem product from capacitor-swift-pm.
//   Required for readFile() fallback in useIosMediaPicker (attempt 4) and for
//   the "Backup to Camera Roll" feature (saving captured photos to the Photos
//   app via the native Filesystem API).
//
// @capacitor-community/media — CapacitorCommunityMedia product.
//   Required for Media.savePhoto() which writes a captured JPEG to the iOS
//   Photos library. Without this plugin the "Backup to Camera Roll" toggle
//   silently does nothing — the photo is captured but never saved to Photos.
//
// NOTE: @capacitor-community/media is NOT in capacitor-swift-pm. It ships its
// own Swift package at https://github.com/capacitor-community/media.git.
// The dependency block below adds it as a separate SPM remote package.
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
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0"),
        // @capacitor-community/media — not in capacitor-swift-pm; ships its own SPM package
        .package(url: "https://github.com/capacitor-community/media.git", from: "7.0.0"),
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
            ]
        )
    ]
)
