import Foundation
import Combine

@MainActor
final class PhotoQueue: ObservableObject {
    @Published private(set) var items: [QueuedPhoto] = []

    var isOnline: Bool { net.isOnline }

    nonisolated static var directory: URL {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("queued-photos", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private var indexURL: URL { Self.directory.appendingPathComponent("index.json") }
    private var uploading = false
    private let net: NetworkStatus

    var needsAttention: [QueuedPhoto] {
        items.filter { $0.status == .failed || $0.status == .saved }
    }

    init(net: NetworkStatus) {
        self.net = net
        load()
        net.whenOnline { [weak self] in
            Task { await self?.process() }
        }
        Task { await process() }
    }

    func enqueue(jobId: Int, jpeg: Data, label: String?) throws -> QueuedPhoto {
        let id = "tmp_\(Int(Date().timeIntervalSince1970 * 1000))_\(UUID().uuidString.prefix(8))"
        let name = "\(id).jpg"
        let url = Self.directory.appendingPathComponent(name)
        try jpeg.write(to: url, options: .atomic)
        let item = QueuedPhoto(
            id: id,
            jobId: jobId,
            fileName: name,
            relativePath: name,
            status: .saved,
            error: nil,
            createdAt: Date(),
            serverPhotoId: nil
        )
        items.insert(item, at: 0)
        persist()
        UserDefaults.standard.set(label, forKey: "iwb_last_label_\(jobId)")
        Task { await process() }
        return item
    }

    func retry(_ id: String) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        items[i].status = .saved
        items[i].error = nil
        persist()
        Task { await process() }
    }

    func pending(for jobId: Int) -> [QueuedPhoto] {
        items.filter { $0.jobId == jobId && $0.status != .synced }
    }

    func process() async {
        guard isOnline, !uploading else { return }
        guard let next = items.first(where: { $0.status == .saved }) else { return }
        uploading = true
        if let i = items.firstIndex(where: { $0.id == next.id }) {
            items[i].status = .uploading
            persist()
        }
        let label = UserDefaults.standard.string(forKey: "iwb_last_label_\(next.jobId)")
        do {
            let photo = try await APIClient.shared.uploadPhoto(
                jobId: next.jobId,
                fileURL: next.fileURL,
                clientId: next.id,
                label: label
            )
            if let i = items.firstIndex(where: { $0.id == next.id }) {
                items[i].status = .synced
                items[i].serverPhotoId = photo.id
                items[i].error = nil
            }
            try? FileManager.default.removeItem(at: next.fileURL)
        } catch {
            if let i = items.firstIndex(where: { $0.id == next.id }) {
                items[i].status = .failed
                items[i].error = error.localizedDescription
            }
        }
        persist()
        uploading = false
        await process()
    }

    private func load() {
        guard let data = try? Data(contentsOf: indexURL) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let decoded = try? decoder.decode([QueuedPhoto].self, from: data) else { return }
        items = decoded.map { item in
            var copy = item
            if copy.status == .uploading { copy.status = .saved }
            return copy
        }
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(items) {
            try? data.write(to: indexURL, options: .atomic)
        }
    }
}
