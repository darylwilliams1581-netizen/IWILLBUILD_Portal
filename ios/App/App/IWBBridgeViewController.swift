import UIKit
import Capacitor

/// Registers the app-local native Lens plugin with the Capacitor bridge.
///
/// Keep the normal Swift module-qualified runtime name because Main.storyboard
/// resolves this class as App.IWBBridgeViewController. Giving the controller an
/// explicit Objective-C name prevents that lookup and leaves a blank launch UI.
class IWBBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(IWBNativeLensPlugin())
    }
}
