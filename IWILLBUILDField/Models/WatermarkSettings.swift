import Foundation
import CoreLocation

struct WatermarkSettings: Codable, Equatable {
    var showDate: Bool = true
    var showTime: Bool = true
    var showJobName: Bool = true
    var showLabel: Bool = true
    var showGps: Bool = true
    /// "0" bottom-left horizontal, "-90" bottom-right vertical
    var orientation: String = "0"

    static let storageKey = "iwb_field_watermark_v2"

    static func load() -> WatermarkSettings {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let value = try? JSONDecoder().decode(WatermarkSettings.self, from: data) else {
            return WatermarkSettings()
        }
        return value
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    func lines(jobName: String, label: String, coordinate: CLLocationCoordinate2D?, now: Date = Date()) -> (line1: String, line2: String) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_AU")
        var parts: [String] = []
        if showJobName {
            let n = jobName.trimmingCharacters(in: .whitespacesAndNewlines)
            if !n.isEmpty { parts.append(String(n.prefix(60))) }
        }
        if showDate {
            formatter.dateFormat = "dd/MM/yyyy"
            parts.append(formatter.string(from: now))
        }
        if showTime {
            formatter.dateFormat = "HH:mm"
            parts.append(formatter.string(from: now))
        }
        if showGps, let coordinate {
            parts.append(String(format: "%.5f, %.5f", coordinate.latitude, coordinate.longitude))
        }
        let line1 = parts.joined(separator: "  —  ")
        let cleaned = Self.sanitize(label)
        let line2 = (showLabel && !cleaned.isEmpty) ? String(cleaned.prefix(120)) : ""
        return (line1, line2)
    }

    static func sanitize(_ raw: String) -> String {
        var s = raw
        s = s.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"[\r\n]+"#, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: #" {2,}"#, with: " ", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
