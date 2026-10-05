import Capacitor
import StoreKit
import UIKit

/// StoreKit 2 bridge for the company monthly subscription.
/// The price shown in the app always comes from Apple, never from a hardcoded amount.
@objc(IWBStorePlugin)
public final class IWBStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IWBStorePlugin"
    public let jsName = "IWBStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manage", returnType: CAPPluginReturnPromise)
    ]

    static let productId = "com.iwillbuild.portal.company.monthly"
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

    @objc func getProduct(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await Self.loadProduct() else {
                    call.reject("The App Store subscription is not available yet.")
                    return
                }
                call.resolve(try await Self.payload(for: product))
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await Self.loadProduct() else {
                    call.reject("The App Store subscription is not available yet.")
                    return
                }
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

    private static func loadProduct() async throws -> Product? {
        let products = try await Product.products(for: [productId])
        return products.first
    }

    private static func payload(for product: Product) async throws -> [String: Any] {
        let entitlement = await currentEntitlement()
        return [
            "id": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "currencyCode": product.priceFormatStyle.currencyCode,
            "subscribed": entitlement != nil
        ]
    }

    private static func currentEntitlement() async -> (jws: String, id: UInt64)? {
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? verified(result), transaction.productID == productId else { continue }
            return (result.jwsRepresentation, transaction.id)
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
