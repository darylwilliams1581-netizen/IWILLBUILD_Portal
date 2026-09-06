import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Group {
            if auth.isSignedIn {
                JobListView()
            } else {
                LoginView()
            }
        }
        .tint(Color(red: 0.93, green: 0.45, blue: 0.12))
    }
}
