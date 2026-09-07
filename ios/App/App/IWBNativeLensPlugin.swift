import AVFoundation
import Capacitor
import UIKit

@objc(IWBNativeLensPlugin)
public final class IWBNativeLensPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IWBNativeLensPlugin"
    public let jsName = "IWBNativeLens"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedFlashModes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFlashMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isCameraStarted", returnType: CAPPluginReturnPromise)
    ]

    private let camera = IWBCameraSession()
    private var previewView: IWBCameraPreviewView?
    private var generation = 0
    private var pendingStartCall: CAPPluginCall?
    private var backgroundObserver: NSObjectProtocol?
    private var savedWebViewAppearance: (opaque: Bool, background: UIColor?, scrollBackground: UIColor?)?

    override public func load() {
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.stopImmediately(reason: "Camera stopped while the app was in the background.")
        }
    }

    deinit {
        if let backgroundObserver = backgroundObserver {
            NotificationCenter.default.removeObserver(backgroundObserver)
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let webView = self.webView else {
                call.reject("The Lens WebView is unavailable.")
                return
            }

            let width = max(1, call.getDouble("width") ?? 1)
            let height = max(1, call.getDouble("height") ?? 1)
            let viewportRect = CGRect(
                x: max(0, call.getDouble("x") ?? 0),
                y: max(0, call.getDouble("y") ?? 0),
                width: width,
                height: height
            )
            let position = call.getString("position") ?? "rear"

            self.generation += 1
            let startGeneration = self.generation
            self.pendingStartCall?.reject("A newer camera start replaced this request.")
            self.pendingStartCall = call
            self.removePreviewView()

            if self.savedWebViewAppearance == nil {
                self.savedWebViewAppearance = (
                    opaque: webView.isOpaque,
                    background: webView.backgroundColor,
                    scrollBackground: webView.scrollView.backgroundColor
                )
            }
            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear

            // getBoundingClientRect() is expressed in CSS points relative to the
            // visible WebView. Convert that rectangle into the scroll view's
            // coordinate system and insert below WKContentView. The native glass
            // is therefore bounded to Lens and never becomes a sibling covering
            // the app's Back/header/footer controls.
            let scrollRect = webView.convert(viewportRect, to: webView.scrollView)
            let preview = IWBCameraPreviewView(frame: scrollRect, session: self.camera.session)
            self.previewView = preview
            webView.scrollView.insertSubview(preview, at: 0)

            self.requestCameraAccess { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    guard startGeneration == self.generation else { return }
                    guard granted else {
                        self.finishStart(.failure(IWBNativeLensError.permissionDenied), generation: startGeneration)
                        return
                    }
                    self.camera.start(position: position) { [weak self] result in
                        self?.finishStart(result, generation: startGeneration)
                    }
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.stopImmediately(reason: "Camera start cancelled.") {
                call.resolve()
            }
        }
    }

    @objc func capture(_ call: CAPPluginCall) {
        camera.capture { result in
            switch result {
            case .success(let jpeg):
                call.resolve(["value": jpeg.base64EncodedString()])
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func flip(_ call: CAPPluginCall) {
        camera.flip { result in
            switch result {
            case .success:
                call.resolve()
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func getSupportedFlashModes(_ call: CAPPluginCall) {
        camera.supportedFlashModes { modes in
            call.resolve(["result": modes])
        }
    }

    @objc func setFlashMode(_ call: CAPPluginCall) {
        camera.setFlashMode(call.getString("flashMode") ?? "auto")
        call.resolve()
    }

    @objc func isCameraStarted(_ call: CAPPluginCall) {
        camera.isRunning { running in
            call.resolve(["value": running])
        }
    }

    private func requestCameraAccess(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video, completionHandler: completion)
        default:
            completion(false)
        }
    }

    private func finishStart(_ result: Result<Void, Error>, generation startGeneration: Int) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard startGeneration == self.generation else {
                return
            }
            let call = self.pendingStartCall
            self.pendingStartCall = nil
            switch result {
            case .success:
                call?.resolve()
            case .failure(let error):
                self.removePreviewView()
                self.restoreWebViewAppearance()
                call?.reject(error.localizedDescription)
            }
        }
    }

    /// Remove the native surface first and unconditionally. Session shutdown is
    /// deliberately separate so a blocked startRunning() can never leave a view
    /// covering the Capacitor UI.
    private func stopImmediately(reason: String, completion: (() -> Void)? = nil) {
        generation += 1
        pendingStartCall?.reject(reason)
        pendingStartCall = nil
        removePreviewView()
        restoreWebViewAppearance()
        camera.stop(completion: completion)
    }

    private func removePreviewView() {
        previewView?.previewLayer.session = nil
        previewView?.removeFromSuperview()
        previewView = nil
    }

    private func restoreWebViewAppearance() {
        guard let webView = webView, let saved = savedWebViewAppearance else { return }
        webView.isOpaque = saved.opaque
        webView.backgroundColor = saved.background
        webView.scrollView.backgroundColor = saved.scrollBackground
        savedWebViewAppearance = nil
    }
}

private enum IWBNativeLensError: LocalizedError {
    case permissionDenied

    var errorDescription: String? {
        return "Camera access is off. Allow Camera access in iPhone Settings."
    }
}
