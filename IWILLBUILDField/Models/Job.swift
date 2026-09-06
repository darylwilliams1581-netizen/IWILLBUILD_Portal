import Foundation

struct Job: Identifiable, Codable, Hashable {
    let id: Int
    let name: String
    let jobNumber: String?
    let status: String?
    let address: String?
    let client: String?

    var title: String {
        let number = jobNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !number.isEmpty { return "\(number)  \(name)" }
        return name
    }
}

struct JobsResponse: Decodable {
    let jobs: [Job]
}

struct SessionUser: Codable {
    let id: String?
    let email: String?
    let name: String?
}

struct SessionResponse: Decodable {
    let user: SessionUser?
}

struct PhotosUploadResponse: Decodable {
    let photos: [UploadedPhoto]?
    let error: String?
}

struct UploadedPhoto: Decodable {
    let id: Int
    let filename: String?
    let url: String?
}

struct JobFormsResponse: Decodable {
    let templates: [FormTemplateInfo]
}

struct FormFieldsResponse: Decodable {
    let fields: [FormFieldInfo]
}
