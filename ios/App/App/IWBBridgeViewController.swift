import Capacitor

/// Registers the app-local native Lens plugin with the Capacitor bridge.
@objc(IWBBridgeViewController)
final class IWBBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(IWBNativeLensPlugin())
    }
}
