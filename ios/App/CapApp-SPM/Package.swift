// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
        .package(name: "CapacitorCommunityCameraPreview", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor-community+camera_b930b22c81dbd2f9a1528e149d3898c8/node_modules/@capacitor-community/camera-preview"),
        .package(name: "CapacitorCommunityMedia", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor-community+media@9.1.0_@capacitor+core@8.5.2/node_modules/@capacitor-community/media"),
        .package(name: "CapacitorApp", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+app@8.1.1_@capacitor+core@8.5.2/node_modules/@capacitor/app"),
        .package(name: "CapacitorCamera", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+camera@8.2.4_@capacitor+core@8.5.2/node_modules/@capacitor/camera"),
        .package(name: "CapacitorFilesystem", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+filesystem@8.1.3_@capacitor+core@8.5.2/node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorGeolocation", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+geolocation@8.2.2_@capacitor+core@8.5.2/node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorHaptics", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+haptics@8.0.2_@capacitor+core@8.5.2/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorNetwork", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+network@8.0.1_@capacitor+core@8.5.2/node_modules/@capacitor/network"),
        .package(name: "CapacitorPushNotifications", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+push-notifications@8.1.2_@capacitor+core@8.5.2/node_modules/@capacitor/push-notifications"),
        .package(name: "CapacitorShare", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+share@8.0.1_@capacitor+core@8.5.2/node_modules/@capacitor/share"),
        .package(name: "CapacitorSplashScreen", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+splash-screen@8.0.2_@capacitor+core@8.5.2/node_modules/@capacitor/splash-screen"),
        .package(name: "CapacitorStatusBar", path: "../../../../manage-nav-fix/node_modules/.pnpm/@capacitor+status-bar@8.0.3_@capacitor+core@8.5.2/node_modules/@capacitor/status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityCameraPreview", package: "CapacitorCommunityCameraPreview"),
                .product(name: "CapacitorCommunityMedia", package: "CapacitorCommunityMedia"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorNetwork", package: "CapacitorNetwork"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
            ]
        )
    ]
)
