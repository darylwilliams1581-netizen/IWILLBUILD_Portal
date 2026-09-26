import AuthenticationServices
import Capacitor
import CryptoKit
import UIKit

/// Native Sign in with Apple. Apple performs its own Apple ID check, including
/// Face ID or the Apple ID code, before this returns an identity token.
@objc(IWBAppleAuthPlugin)
public final class IWBAppleAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "IWBAppleAuthPlugin"
    public let jsName = "IWBAppleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var rawNonce = ""

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.pendingCall != nil {
                call.reject("Apple sign-in is already open.")
                return
            }
            let nonce = UUID().uuidString + UUID().uuidString
            self.rawNonce = nonce
            self.pendingCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = self.sha256(nonce)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            pendingCall?.reject("Apple did not return an identity token.")
            pendingCall = nil
            return
        }
        var fullName = ""
        if let name = credential.fullName {
            fullName = [name.givenName, name.familyName].compactMap { $0 }.joined(separator: " ")
        }
        pendingCall?.resolve([
            "status": "signed_in",
            "identityToken": identityToken,
            "nonce": rawNonce,
            "email": credential.email ?? "",
            "fullName": fullName
        ])
        pendingCall = nil
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        if cancelled {
            pendingCall?.resolve(["status": "cancelled"])
        } else {
            pendingCall?.reject(error.localizedDescription)
        }
        pendingCall = nil
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }

    private func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
