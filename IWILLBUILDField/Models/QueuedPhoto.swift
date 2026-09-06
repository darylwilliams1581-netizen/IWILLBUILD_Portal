import Foundation

enum QueueStatus: String, Codable {
    case saved
    case uploading
    case synced
    case failed
}

struct QueuedPhoto: Identifiable, Codable, Equatable {
    var id: String
    var jobId: Int
    var fileName: String
    var relativePath: String
    var status: QueueStatus
    var error: String?
    var createdAt: Date
    var serverPhotoId: Int?

    var fileURL: URL {
        PhotoQueue.directory.appendingPathComponent(relativePath)
    }
}
