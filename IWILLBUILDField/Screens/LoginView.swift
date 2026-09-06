import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            VStack(spacing: 8) {
                Text("IWIllBUIlD")
                    .font(.largeTitle.weight(.heavy))
                    .foregroundStyle(Color(red: 0.93, green: 0.45, blue: 0.12))
                Text("Field lens")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(.secondary)
                Text("In-app camera. Stamps stay on the photo. Syncs to the portal.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
            }
            VStack(spacing: 12) {
                TextField("Email", text: $auth.email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding()
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                SecureField("Password", text: $auth.password)
                    .textContentType(.password)
                    .padding()
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                if let error = auth.error {
                    Text(error).font(.footnote).foregroundStyle(.red)
                }
                Button {
                    Task { await auth.signIn() }
                } label: {
                    Group {
                        if auth.isBusy { ProgressView() }
                        else { Text("Sign in") }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(red: 0.93, green: 0.45, blue: 0.12), in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
                    .font(.headline)
                }
                .disabled(auth.isBusy || auth.email.isEmpty || auth.password.isEmpty)
            }
            .padding(.horizontal, 24)
            Spacer()
            Text("Same account as iwillbuild.com")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(.bottom, 24)
        }
        .background(Color.black.ignoresSafeArea())
    }
}
