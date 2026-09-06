import Foundation

enum APIError: LocalizedError {
    case unauthorised
    case server(String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .unauthorised: return "Session expired — sign in again"
        case .server(let m): return m
        case .badResponse: return "Unexpected response from iwillbuild.com"
        }
    }
}

final class APIClient {
    static let shared = APIClient()
    static let host = URL(string: "https://iwillbuild.com")!

    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 60
        session = URLSession(configuration: config)
    }

    func signIn(email: String, password: String) async throws -> SessionUser {
        var req = URLRequest(url: Self.host.appendingPathComponent("/api/auth/sign-in/email"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email,
            "password": password
        ])
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorised }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(Self.message(data) ?? "Sign-in failed (\(http.statusCode))")
        }
        if let session = try? Self.decoder.decode(SessionResponse.self, from: data),
           let user = session.user {
            return user
        }
        return try await getSession()
    }

    func getSession() async throws -> SessionUser {
        var req = URLRequest(url: Self.host.appendingPathComponent("/api/auth/get-session"))
        req.httpMethod = "GET"
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.unauthorised
        }
        let decoded = try Self.decoder.decode(SessionResponse.self, from: data)
        guard let user = decoded.user else { throw APIError.unauthorised }
        return user
    }

    func signOut() async {
        var req = URLRequest(url: Self.host.appendingPathComponent("/api/auth/sign-out"))
        req.httpMethod = "POST"
        _ = try? await session.data(for: req)
        HTTPCookieStorage.shared.cookies?.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
    }

    func jobs() async throws -> [Job] {
        var req = URLRequest(url: Self.host.appendingPathComponent("/api/jobs"))
        req.httpMethod = "GET"
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorised }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(Self.message(data) ?? "Could not load jobs")
        }
        let decoded = try Self.decoder.decode(JobsResponse.self, from: data)
        return decoded.jobs
    }

    func uploadPhoto(jobId: Int, fileURL: URL, clientId: String, label: String?) async throws -> UploadedPhoto {
        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: Self.host.appendingPathComponent("/api/jobs/\(jobId)/photos"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.setValue(clientId, forHTTPHeaderField: "X-Client-Id")

        var body = Data()
        let filename = fileURL.lastPathComponent
        let fileData = try Data(contentsOf: fileURL)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"photos\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)
        if let label, !label.isEmpty {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"label\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(label)\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorised }
        let decoded = try Self.decoder.decode(PhotosUploadResponse.self, from: data)
        if (200..<300).contains(http.statusCode), let photo = decoded.photos?.first {
            return photo
        }
        throw APIError.server(decoded.error ?? "Upload failed (\(http.statusCode))")
    }

    func jobSignIn(jobId: Int) async throws {
        let data = try await json("POST", path: "/api/jobs/\(jobId)/signin", body: [
            "actorType": "employee",
            "notes": "iOS field app"
        ])
        let obj = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        if obj["ok"] as? Bool == true { return }
        throw APIError.server((obj["error"] as? String) ?? "Sign-in failed")
    }

    func jobSignOut(jobId: Int) async throws {
        let data = try await json("POST", path: "/api/jobs/\(jobId)/signout", body: [
            "notes": "iOS field app"
        ])
        let obj = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        if obj["ok"] as? Bool == true { return }
        throw APIError.server((obj["error"] as? String) ?? "Sign-out failed")
    }

    func signInStatus(jobId: Int) async throws -> Bool {
        let data = try await json("GET", path: "/api/jobs/\(jobId)/signin-status")
        let obj = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        return obj["signedIn"] as? Bool ?? false
    }

    func createPrestart(jobId: Int) async throws -> Int {
        let data = try await json("POST", path: "/api/jobs/\(jobId)/site-prestarts", body: [:])
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let pre = obj["prestart"] as? [String: Any],
              let id = intValue(pre["id"])
        else { throw APIError.badResponse }
        return id
    }

    func updatePrestart(jobId: Int, prestartId: Int, body: [String: Any]) async throws {
        _ = try await json("PUT", path: "/api/jobs/\(jobId)/site-prestarts/\(prestartId)", body: body)
    }

    func addPrestartWorker(jobId: Int, prestartId: Int, name: String, trade: String) async throws -> Int? {
        let data = try await json("POST", path: "/api/jobs/\(jobId)/site-prestarts/\(prestartId)/workers", body: [
            "fullName": name,
            "roleTrade": trade,
            "fitForWork": true
        ])
        let obj = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        let worker = obj["worker"] as? [String: Any]
        return intValue(worker?["id"])
    }

    func finalisePrestart(jobId: Int, prestartId: Int, supervisorName: String) async throws {
        _ = try await json("POST", path: "/api/jobs/\(jobId)/site-prestarts/\(prestartId)/finalise", body: [
            "supervisorSignoffName": supervisorName
        ])
    }

    func jobForms(jobId: Int) async throws -> (templates: [FormTemplateInfo], submissions: [[String: Any]]) {
        let data = try await json("GET", path: "/api/jobs/\(jobId)/forms")
        let decoded = try Self.decoder.decode(JobFormsResponse.self, from: data)
        return (decoded.templates, [])
    }

    func formFields(templateId: Int) async throws -> [FormFieldInfo] {
        let data = try await json("GET", path: "/api/forms/\(templateId)/fields")
        return try Self.decoder.decode(FormFieldsResponse.self, from: data).fields
    }

    func startForm(jobId: Int, templateId: Int) async throws -> Int {
        let data = try await json("POST", path: "/api/jobs/\(jobId)/forms", body: ["templateId": templateId])
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let sub = obj["submission"] as? [String: Any],
              let id = intValue(sub["id"])
        else { throw APIError.badResponse }
        return id
    }

    func saveForm(submissionId: Int, answersJson: String, status: String) async throws {
        _ = try await json("PUT", path: "/api/job-forms/\(submissionId)", body: [
            "answersJson": answersJson,
            "status": status
        ])
    }

    private func json(_ method: String, path: String, body: [String: Any]? = nil) async throws -> Data {
        var req = URLRequest(url: Self.host.appending(path: path))
        req.httpMethod = method
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse }
        if http.statusCode == 401 { throw APIError.unauthorised }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(Self.message(data) ?? "Request failed (\(http.statusCode))")
        }
        return data
    }

    private func intValue(_ any: Any?) -> Int? {
        if let i = any as? Int { return i }
        if let n = any as? NSNumber { return n.intValue }
        if let s = any as? String { return Int(s) }
        return nil
    }

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    private static func message(_ data: Data) -> String? {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
    }
}
