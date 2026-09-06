import AVFoundation
import UIKit
import Combine

@MainActor
final class CameraSession: NSObject, ObservableObject {
    let session = AVCaptureSession()
    @Published var isRunning = false
    @Published var error: String?
    @Published var torchOn = false
    @Published var usingFront = false
    @Published var authorization: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)

    private let sessionQueue = DispatchQueue(label: "com.iwillbuild.field.camera")
    private let photoOutput = AVCapturePhotoOutput()
    private var device: AVCaptureDevice?
    private var continuations: [Int64: CheckedContinuation<UIImage, Error>] = [:]
    private var requestId: Int64 = 0

    func requestAccess() async {
        authorization = AVCaptureDevice.authorizationStatus(for: .video)
        if authorization == .notDetermined {
            let ok = await AVCaptureDevice.requestAccess(for: .video)
            authorization = ok ? .authorized : .denied
        }
    }

    func start() {
        Task {
            await requestAccess()
            guard authorization == .authorized else {
                error = "Camera permission is required for the field lens."
                return
            }
            let front = usingFront
            sessionQueue.async { [weak self] in
                self?.configureLocked(usingFront: front)
            }
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.session.isRunning { self.session.stopRunning() }
            DispatchQueue.main.async { self.isRunning = false }
        }
    }

    func flip() {
        usingFront.toggle()
        let front = usingFront
        sessionQueue.async { [weak self] in
            self?.configureLocked(usingFront: front)
        }
    }

    func toggleTorch() {
        sessionQueue.async { [weak self] in
            guard let device = self?.device, device.hasTorch else { return }
            do {
                try device.lockForConfiguration()
                let next: AVCaptureDevice.TorchMode = device.torchMode == .on ? .off : .on
                if device.isTorchModeSupported(next) {
                    device.torchMode = next
                }
                device.unlockForConfiguration()
                DispatchQueue.main.async { self?.torchOn = next == .on }
            } catch { }
        }
    }

    func capture() async throws -> UIImage {
        try await withCheckedThrowingContinuation { continuation in
            requestId += 1
            let id = requestId
            continuations[id] = continuation
            sessionQueue.async { [photoOutput] in
                let settings: AVCapturePhotoSettings
                if photoOutput.availablePhotoCodecTypes.contains(.jpeg) {
                    settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
                } else {
                    settings = AVCapturePhotoSettings()
                }
                settings.flashMode = .off
                photoOutput.capturePhoto(with: settings, delegate: PhotoDelegate(owner: self, id: id))
            }
        }
    }

    fileprivate func finish(id: Int64, image: UIImage?, error: Error?) {
        guard let cont = continuations.removeValue(forKey: id) else { return }
        if let image {
            cont.resume(returning: image)
        } else {
            cont.resume(throwing: error ?? CameraError.captureFailed)
        }
    }

    private func configureLocked(usingFront: Bool) {
        session.beginConfiguration()
        session.sessionPreset = .photo
        session.inputs.forEach { session.removeInput($0) }

        let position: AVCaptureDevice.Position = usingFront ? .front : .back
        let discovered = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
            ?? AVCaptureDevice.default(for: .video)
        device = discovered
        guard let discovered, let input = try? AVCaptureDeviceInput(device: discovered) else {
            session.commitConfiguration()
            DispatchQueue.main.async { self.error = "No camera available." }
            return
        }
        if session.canAddInput(input) { session.addInput(input) }
        if !session.outputs.contains(photoOutput), session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }
        session.commitConfiguration()
        if !session.isRunning { session.startRunning() }
        DispatchQueue.main.async {
            self.isRunning = true
            self.error = nil
        }
    }
}

enum CameraError: LocalizedError {
    case captureFailed
    var errorDescription: String? { "Could not capture frame." }
}

private final class PhotoDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    weak var owner: CameraSession?
    let id: Int64
    init(owner: CameraSession, id: Int64) {
        self.owner = owner
        self.id = id
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let image = photo.fileDataRepresentation().flatMap(UIImage.init(data:))
        Task { @MainActor in
            owner?.finish(id: id, image: image, error: error)
        }
    }
}
