import SwiftUI

/// Same no-service screen as the Capacitor service-worker fallback.
/// Used when the Office portal cannot load. Site tools stay available.
struct OfflineSplashView: View {
    var onRetry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("You're offline")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Color(red: 1, green: 0.42, blue: 0))
            Text("IWILLBUILD needs an internet connection.\nCheck your connection and try again.")
                .font(.body)
                .foregroundStyle(Color(red: 0.61, green: 0.64, blue: 0.69))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button(action: onRetry) {
                Text("Try Again")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 36)
                    .padding(.vertical, 14)
                    .background(Color(red: 1, green: 0.42, blue: 0), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .padding(.top, 8)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.07, green: 0.09, blue: 0.15).ignoresSafeArea())
    }
}
