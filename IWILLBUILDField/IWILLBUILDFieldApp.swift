import SwiftUI

@main
struct IWILLBUILDFieldApp: App {
    @StateObject private var auth: AuthStore
    @StateObject private var queue: PhotoQueue
    @StateObject private var net: NetworkStatus
    @StateObject private var offline: OfflineStore

    init() {
        let net = NetworkStatus()
        _net = StateObject(wrappedValue: net)
        _queue = StateObject(wrappedValue: PhotoQueue(net: net))
        _offline = StateObject(wrappedValue: OfflineStore(net: net))
        _auth = StateObject(wrappedValue: AuthStore())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(queue)
                .environmentObject(net)
                .environmentObject(offline)
                .preferredColorScheme(.dark)
        }
    }
}
