import Foundation
import CoreLocation
import Combine

@MainActor
final class LocationFix: NSObject, ObservableObject {
    @Published var coordinate: CLLocationCoordinate2D?
    @Published var status: String = "GPS idle"

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 5
    }

    func start() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
            status = "GPS on"
        case .denied, .restricted:
            status = "GPS denied"
        @unknown default:
            status = "GPS idle"
        }
    }

    func stop() {
        manager.stopUpdatingLocation()
    }
}

extension LocationFix: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            start()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        Task { @MainActor in
            coordinate = last.coordinate
            status = String(format: "%.4f, %.4f", last.coordinate.latitude, last.coordinate.longitude)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            status = "GPS failed"
        }
    }
}
