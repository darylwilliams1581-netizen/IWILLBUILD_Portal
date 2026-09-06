import Foundation
import Combine

@MainActor
final class AuthStore: ObservableObject {
    @Published var user: SessionUser?
    @Published var email: String = UserDefaults.standard.string(forKey: "iwb_email") ?? ""
    @Published var password: String = ""
    @Published var isBusy = false
    @Published var error: String?

    var isSignedIn: Bool { user != nil }

    init() {
        if let data = UserDefaults.standard.data(forKey: "iwb_user"),
           let cached = try? JSONDecoder().decode(SessionUser.self, from: data) {
            user = cached
        }
        Task { await restore() }
    }

    func restore() async {
        do {
            let fresh = try await APIClient.shared.getSession()
            user = fresh
            cache(fresh)
        } catch APIError.unauthorised {
            user = nil
            UserDefaults.standard.removeObject(forKey: "iwb_user")
        } catch {
            // Offline — keep the last signed-in user so field work continues.
        }
    }

    func signIn() async {
        error = nil
        isBusy = true
        defer { isBusy = false }
        do {
            user = try await APIClient.shared.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password
            )
            UserDefaults.standard.set(email, forKey: "iwb_email")
            if let user { cache(user) }
            password = ""
        } catch {
            self.error = error.localizedDescription
            user = nil
        }
    }

    func signOut() async {
        await APIClient.shared.signOut()
        user = nil
        UserDefaults.standard.removeObject(forKey: "iwb_user")
    }

    private func cache(_ user: SessionUser) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: "iwb_user")
        }
    }
}
