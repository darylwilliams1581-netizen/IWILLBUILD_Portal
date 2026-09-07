import AVFoundation
import Foundation

enum IWBCameraSessionError: LocalizedError {
    case unavailable
    case configurationFailed
    case notRunning
    case captureInProgress
    case captureFailed

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "No camera is available on this device."
        case .configurationFailed:
            return "The camera could not be configured."
        case .notRunning:
            return "The camera is not ready."
        case .captureInProgress:
            return "A photo is already being captured."
        case .captureFailed:
            return "The camera did not return a JPEG image."
        }
    }
}

/// AVFoundation engine adapted from the native Lens handoff.
///
/// Session configuration and start/stop work stay off the main thread. The
/// preview view is managed by IWBNativeLensPlugin so it can always be removed
/// immediately, even while this session is still starting.
final class IWBCameraSession: NSObject, AVCapturePhotoCaptureDelegate {
    let session = AVCaptureSession()

    private let sessionQueue = DispatchQueue(label: "com.iwillbuild.portal.native-lens")
    private let photoOutput = AVCapturePhotoOutput()
    private var activeInput: AVCaptureDeviceInput?
    private var device: AVCaptureDevice?
    private var usingFront = false
    private var flashMode: AVCaptureDevice.FlashMode = .auto
    private var captureCompletion: ((Result<Data, Error>) -> Void)?

    func start(position: String, completion: @escaping (Result<Void, Error>) -> Void) {
        let wantsFront = position == "front"
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            do {
                try self.configureLocked(usingFront: wantsFront)
                if !self.session.isRunning {
                    self.session.startRunning()
                }
                guard self.session.isRunning else {
                    throw IWBCameraSessionError.configurationFailed
                }
                DispatchQueue.main.async { completion(.success(())) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    func stop(completion: (() -> Void)? = nil) {
        sessionQueue.async { [weak self] in
            guard let self = self else {
                DispatchQueue.main.async { completion?() }
                return
            }
            if self.session.isRunning {
                self.session.stopRunning()
            }
            DispatchQueue.main.async { completion?() }
        }
    }

    func isRunning(completion: @escaping (Bool) -> Void) {
        sessionQueue.async { [weak self] in
            let running = self?.session.isRunning ?? false
            DispatchQueue.main.async { completion(running) }
        }
    }

    func flip(completion: @escaping (Result<Void, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            do {
                try self.configureLocked(usingFront: !self.usingFront)
                DispatchQueue.main.async { completion(.success(())) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    func setFlashMode(_ value: String) {
        sessionQueue.async { [weak self] in
            switch value {
            case "on", "torch":
                self?.flashMode = .on
            case "off":
                self?.flashMode = .off
            default:
                self?.flashMode = .auto
            }
        }
    }

    func supportedFlashModes(completion: @escaping ([String]) -> Void) {
        sessionQueue.async { [weak self] in
            let modes = self?.device?.hasFlash == true ? ["auto", "on", "off"] : ["off"]
            DispatchQueue.main.async { completion(modes) }
        }
    }

    func capture(completion: @escaping (Result<Data, Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            guard self.session.isRunning else {
                DispatchQueue.main.async { completion(.failure(IWBCameraSessionError.notRunning)) }
                return
            }
            guard self.captureCompletion == nil else {
                DispatchQueue.main.async { completion(.failure(IWBCameraSessionError.captureInProgress)) }
                return
            }

            let settings: AVCapturePhotoSettings
            if self.photoOutput.availablePhotoCodecTypes.contains(.jpeg) {
                settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            } else {
                settings = AVCapturePhotoSettings()
            }
            if self.device?.hasFlash == true {
                settings.flashMode = self.flashMode
            }
            self.captureCompletion = completion
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        sessionQueue.async { [weak self] in
            guard let self = self, let completion = self.captureCompletion else { return }
            self.captureCompletion = nil
            let result: Result<Data, Error>
            if let error = error {
                result = .failure(error)
            } else if let data = photo.fileDataRepresentation(), !data.isEmpty {
                result = .success(data)
            } else {
                result = .failure(IWBCameraSessionError.captureFailed)
            }
            DispatchQueue.main.async { completion(result) }
        }
    }

    private func configureLocked(usingFront: Bool) throws {
        let position: AVCaptureDevice.Position = usingFront ? .front : .back
        guard let selected = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
            ?? AVCaptureDevice.default(for: .video) else {
            throw IWBCameraSessionError.unavailable
        }
        let input = try AVCaptureDeviceInput(device: selected)

        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo

        if let activeInput = activeInput {
            session.removeInput(activeInput)
        }
        guard session.canAddInput(input) else {
            throw IWBCameraSessionError.configurationFailed
        }
        session.addInput(input)
        activeInput = input

        if !session.outputs.contains(photoOutput) {
            guard session.canAddOutput(photoOutput) else {
                throw IWBCameraSessionError.configurationFailed
            }
            session.addOutput(photoOutput)
        }

        device = selected
        self.usingFront = usingFront
    }
}
