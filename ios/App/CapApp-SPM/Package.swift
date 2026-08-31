// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
//
// ── Manual fix applied 2026-08-07 ────────────────────────────────────────────
// `npx cap sync` regenerates this file on every build. The committed version
// here is overwritten by Appflow before Xcode runs. The only file in this
// package that must survive in git is:
//
//   Sources/CapApp-SPM/CapApp-SPM.swift
//
// That stub file satisfies SPM's requirement that the CapApp-SPM target is
// non-empty. Without it, Xcode fails with:
//   "target 'CapApp-SPM' referenced in product 'CapApp-SPM' is empty"
//
// The actual Package.swift content (dependencies, plugin products) is written
// fresh by `npx cap sync ios` using @capacitor/cli's generatePackageFile().
// It pins capacitor-swift-pm to exact: "<@capacitor/ios version>" and adds
// each installed Capacitor plugin that ships a Package.swift as a local path
// dependency.
//
// ── Plugins confirmed working via SPM (build 11074980) ───────────────────────
// All 10 plugins resolved automatically because each ships its own Package.swift:
//   @capacitor-community/media@9.1.0
//   @capacitor/app@8.1.0
//   @capacitor/camera@8.2.1
//   @capacitor/filesystem@8.1.2
//   @capacitor/geolocation@8.2.0
//   @capacitor/haptics@8.0.2
//   @capacitor/network@8.0.1
//   @capacitor/push-notifications@8.1.1
//   @capacitor/splash-screen@8.0.1
//   @capacitor/status-bar@8.0.2
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
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
            ],
            path: "Sources/CapApp-SPM"
        )
    ]
)
