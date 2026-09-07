import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Group {
            if auth.isSignedIn {
                MainTabs()
            } else {
                LoginView()
            }
        }
        .tint(Color(red: 0.93, green: 0.45, blue: 0.12))
    }
}

private struct MainTabs: View {
    var body: some View {
        TabView {
            OfficeView()
                .tabItem { Label("Office", systemImage: "building.2.fill") }
            JobListView()
                .tabItem { Label("Site", systemImage: "hammer.fill") }
        }
    }
}
