import Capacitor
import StoreKit
import UIKit

/// StoreKit 2 bridge for company subscriptions with 1–20 seat tiers.
/// The price shown in the app always comes from Apple, never from a hardcoded amount.
@objc(IWBStorePlugin)
public final class IWBStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IWBStorePlugin"
    public let jsName = "IWBStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise)
    ]

    static let productIds = ["com.iwillbuild.portal.company.monthly"] + (2...20).map {
        "com.iwillbuild.portal.company.monthly.seats\($0)"
    }
    private static let eligibilityURL = URL(string: "https://iwillbuild.com/api/subscription/eligibility")!
    private var updates: Task<Void, Never>?

    override public func load() {
        updates = Task {
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Self.loadProducts()
                guard !products.isEmpty else {
                    call.reject("The App Store subscriptions are not available yet.")
                    return
                }
                let entitlement = await Self.currentEntitlement()
                let payload = products.map { product in
                    Self.payload(for: product, currentProductId: entitlement?.productId)
                }
                call.resolve(["products": payload])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                guard let productId = call.getString("productId"), Self.productIds.contains(productId) else {
                    call.reject("Choose a valid IWILLBUILD seat subscription.")
                    return
                }
                guard let product = try await Self.loadProduct(id: productId) else {
                    call.reject("This App Store seat subscription is not available yet.")
                    return
                }
                // Enforce the billing-provider check at the native StoreKit boundary too.
                // Fail closed: if the authenticated server check cannot be completed,
                // never present Apple's payment sheet.
                try await checkSubscriptionEligibility()
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    let transaction = try Self.verified(verification)
                    let jws = verification.jwsRepresentation
                    await transaction.finish()
                    call.resolve([
                        "status": "purchased",
                        "transactionId": String(transaction.id),
                        "productId": transaction.productID,
                        "jws": jws
                    ])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.reject("Apple returned an unknown purchase result.")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let entitlement = await Self.currentEntitlement()
                call.resolve([
                    "subscribed": entitlement != nil,
                    "productId": entitlement?.productId ?? "",
                    "jws": entitlement?.jws ?? ""
                ])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func manage(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive })
                ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
            else {
                call.reject("Apple subscription settings are not available.")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private static func loadProducts() async throws -> [Product] {
        try await Product.products(for: productIds)
    }

    private static func loadProduct(id: String) async throws -> Product? {
        try await Product.products(for: [id]).first
    }

    @MainActor
    private func checkSubscriptionEligibility() async throws {
        guard let webView = bridge?.webView else {
            throw eligibilityError("Could not verify this company's billing status. Please try again before purchasing.")
        }

        let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
            webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
        let host = Self.eligibilityURL.host ?? "iwillbuild.com"
        let matchingCookies = cookies.filter { cookie in
            let domain = cookie.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
            let requestHost = host.lowercased()
            let domainMatches = requestHost == domain || requestHost.hasSuffix("." + domain)
            let pathMatches = Self.eligibilityURL.path.hasPrefix(cookie.path)
            return domainMatches && pathMatches && (!cookie.isSecure || Self.eligibilityURL.scheme == "https")
        }
        guard !matchingCookies.isEmpty else {
            throw eligibilityError("Your sign-in session could not be verified. Please sign in again before purchasing.")
        }

        var request = URLRequest(url: Self.eligibilityURL)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        for (name, value) in HTTPCookie.requestHeaderFields(with: matchingCookies) {
            request.setValue(value, forHTTPHeaderField: name)
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw eligibilityError("Could not check subscription eligibility. Please try again before purchasing.")
        }

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            throw eligibilityError("Could not check subscription eligibility. Please try again before purchasing.")
        }

        guard payload["eligible"] as? Bool == true else {
            let message = payload["managementMessage"] as? String
                ?? payload["message"] as? String
                ?? payload["error"] as? String
                ?? "This company cannot start an Apple subscription right now. Check its current billing provider or try again."
            throw eligibilityError(message)
        }
    }

    private func eligibilityError(_ message: String) -> NSError {
        NSError(domain: "IWBStore", code: 2, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func payload(for product: Product, currentProductId: String?) -> [String: Any] {
        let seatCount = product.id == productIds[0]
            ? 1
            : (Int(product.id.components(separatedBy: ".seats").last ?? "") ?? 1)
        return [
            "id": product.id,
            "seatCount": seatCount,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "subscribed": currentProductId == product.id
        ]
    }

    private static func currentEntitlement() async -> (jws: String, id: UInt64, productId: String)? {
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? verified(result), productIds.contains(transaction.productID) else { continue }
            return (result.jwsRepresentation, transaction.id, transaction.productID)
        }
        return nil
    }

    private static func verified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified:
            throw NSError(
                domain: "IWBStore",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Apple could not verify this purchase."]
            )
        }
    }
}
