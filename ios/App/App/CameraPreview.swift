import AVFoundation
import UIKit

/// A bounded native camera surface owned by the Capacitor WebView.
///
/// The view itself is clipped to the CSS-point rectangle supplied by the Lens
/// page. Using AVCaptureVideoPreviewLayer as the backing layer avoids the
/// double-offset bug in the community plugin (`previewLayer.frame = view.frame`).
final class IWBCameraPreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

    var previewLayer: AVCaptureVideoPreviewLayer {
        return layer as! AVCaptureVideoPreviewLayer
    }

    init(frame: CGRect, session: AVCaptureSession) {
        super.init(frame: frame)
        clipsToBounds = true
        isUserInteractionEnabled = false
        backgroundColor = .black
        previewLayer.session = session
        previewLayer.videoGravity = .resizeAspectFill
        updateOrientation()
    }

    required init?(coder: NSCoder) {
        return nil
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        updateOrientation()
    }

    private func updateOrientation() {
        guard let connection = previewLayer.connection else { return }
        if #available(iOS 17.0, *) {
            if connection.isVideoRotationAngleSupported(90) {
                connection.videoRotationAngle = 90
            }
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
    }
}
