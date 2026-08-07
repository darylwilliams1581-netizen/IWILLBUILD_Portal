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
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
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
            ]
        )
    ]
)
