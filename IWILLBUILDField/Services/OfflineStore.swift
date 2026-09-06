import Foundation
import Combine

@MainActor
final class OfflineStore: ObservableObject {
    @Published var jobs: [Job] = []
    @Published var signedInJobIds: Set<Int> = []
    @Published var prestarts: [SitePrestartDraft] = []
    @Published var formDrafts: [FormDraft] = []
    @Published var templatesByJob: [Int: [FormTemplateInfo]] = [:]
    @Published var fieldsByTemplate: [Int: [FormFieldInfo]] = [:]
    @Published var ops: [FieldOp] = []
    @Published var lastError: String?

    private let net: NetworkStatus
    private var pumping = false
    private var dir: URL {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("offline", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    var pendingCount: Int { ops.filter { $0.status != .synced }.count }

    init(net: NetworkStatus) {
        self.net = net
        load()
        net.whenOnline { [weak self] in
            Task { await self?.pump() }
        }
        Task { await pump() }
    }

    // MARK: Jobs

    func loadJobs() async {
        do {
            let fresh = try await APIClient.shared.jobs()
            jobs = fresh
            persistJobs()
            lastError = nil
        } catch {
            if jobs.isEmpty { lastError = error.localizedDescription }
        }
    }

    // MARK: Attendance

    func isSignedIn(jobId: Int) -> Bool { signedInJobIds.contains(jobId) }

    func signIn(jobId: Int) {
        signedInJobIds.insert(jobId)
        enqueue(.signIn, jobId: jobId)
        persist()
    }

    func signOut(jobId: Int) {
        signedInJobIds.remove(jobId)
        enqueue(.signOut, jobId: jobId)
        persist()
    }

    func refreshSignIn(jobId: Int) async {
        guard net.isOnline else { return }
        if let status = try? await APIClient.shared.signInStatus(jobId: jobId) {
            if status {
                signedInJobIds.insert(jobId)
            } else {
                signedInJobIds.remove(jobId)
            }
            persist()
        }
    }

    // MARK: Prestart / HazChat

    func todayPrestart(jobId: Int, supervisor: String) -> SitePrestartDraft {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        let today = fmt.string(from: Date())
        if let existing = prestarts.first(where: { $0.jobId == jobId && $0.date == today }) {
            return existing
        }
        let draft = SitePrestartDraft.blank(jobId: jobId, supervisor: supervisor)
        prestarts.insert(draft, at: 0)
        persist()
        enqueue(.prestartSync, jobId: jobId, payloadId: draft.id)
        return draft
    }

    func savePrestart(_ draft: SitePrestartDraft) {
        var copy = draft
        copy.updatedAt = Date()
        if let i = prestarts.firstIndex(where: { $0.id == copy.id }) {
            prestarts[i] = copy
        } else {
            prestarts.insert(copy, at: 0)
        }
        persist()
        enqueue(.prestartSync, jobId: copy.jobId, payloadId: copy.id)
    }

    func addWorker(prestartId: String, name: String, trade: String) {
        guard let i = prestarts.firstIndex(where: { $0.id == prestartId }) else { return }
        let worker = LocalWorker(
            id: UUID().uuidString,
            serverId: nil,
            fullName: name,
            roleTrade: trade,
            fitForWork: true
        )
        prestarts[i].workers.append(worker)
        prestarts[i].updatedAt = Date()
        persist()
        enqueue(.prestartSync, jobId: prestarts[i].jobId, payloadId: prestartId)
    }

    func finalisePrestart(_ id: String) {
        guard let i = prestarts.firstIndex(where: { $0.id == id }) else { return }
        prestarts[i].status = "queuedFinalise"
        prestarts[i].updatedAt = Date()
        persist()
        enqueue(.prestartSync, jobId: prestarts[i].jobId, payloadId: id)
    }

    // MARK: Forms

    func cacheForms(jobId: Int) async {
        guard net.isOnline else { return }
        if let pack = try? await APIClient.shared.jobForms(jobId: jobId) {
            templatesByJob[jobId] = pack.templates
            persist()
            for t in pack.templates {
                if let fields = try? await APIClient.shared.formFields(templateId: t.id) {
                    fieldsByTemplate[t.id] = fields
                }
            }
            persist()
        }
    }

    func startForm(jobId: Int, template: FormTemplateInfo) -> FormDraft {
        if let existing = formDrafts.first(where: {
            $0.jobId == jobId && $0.templateId == template.id && $0.status != "completed"
        }) {
            return existing
        }
        let draft = FormDraft(
            id: "form_\(UUID().uuidString)",
            jobId: jobId,
            templateId: template.id,
            templateName: template.name,
            serverSubmissionId: nil,
            answers: [:],
            status: "in_progress",
            updatedAt: Date()
        )
        formDrafts.insert(draft, at: 0)
        persist()
        enqueue(.formSync, jobId: jobId, payloadId: draft.id)
        return draft
    }

    func saveForm(_ draft: FormDraft) {
        var copy = draft
        copy.updatedAt = Date()
        if let i = formDrafts.firstIndex(where: { $0.id == copy.id }) {
            formDrafts[i] = copy
        } else {
            formDrafts.insert(copy, at: 0)
        }
        persist()
        enqueue(.formSync, jobId: copy.jobId, payloadId: copy.id)
    }

    func completeForm(_ id: String) {
        guard let i = formDrafts.firstIndex(where: { $0.id == id }) else { return }
        formDrafts[i].status = "completed"
        formDrafts[i].updatedAt = Date()
        persist()
        enqueue(.formSync, jobId: formDrafts[i].jobId, payloadId: id)
    }

    func retry(_ id: String) {
        guard let i = ops.firstIndex(where: { $0.id == id }) else { return }
        ops[i].status = .saved
        ops[i].error = nil
        persist()
        Task { await pump() }
    }

    // MARK: Queue

    private func enqueue(_ kind: FieldOpKind, jobId: Int, payloadId: String? = nil) {
        if let i = ops.firstIndex(where: {
            $0.kind == kind && $0.jobId == jobId && $0.payloadId == payloadId && $0.status != .synced
        }) {
            ops[i].status = .saved
            ops[i].error = nil
        } else {
            ops.insert(FieldOp(
                id: UUID().uuidString,
                kind: kind,
                jobId: jobId,
                payloadId: payloadId,
                status: .saved,
                error: nil,
                createdAt: Date()
            ), at: 0)
        }
        Task { await pump() }
    }

    func pump() async {
        guard net.isOnline, !pumping else { return }
        guard let next = ops.first(where: { $0.status == .saved }) else { return }
        pumping = true
        if let i = ops.firstIndex(where: { $0.id == next.id }) {
            ops[i].status = .uploading
            persist()
        }
        do {
            try await perform(next)
            if let i = ops.firstIndex(where: { $0.id == next.id }) {
                ops[i].status = .synced
                ops[i].error = nil
            }
        } catch {
            if let i = ops.firstIndex(where: { $0.id == next.id }) {
                ops[i].status = .failed
                ops[i].error = error.localizedDescription
            }
        }
        persist()
        pumping = false
        await pump()
    }

    private func perform(_ op: FieldOp) async throws {
        switch op.kind {
        case .signIn:
            _ = try await APIClient.shared.jobSignIn(jobId: op.jobId)
        case .signOut:
            _ = try await APIClient.shared.jobSignOut(jobId: op.jobId)
        case .prestartSync:
            guard let payloadId = op.payloadId,
                  let i = prestarts.firstIndex(where: { $0.id == payloadId })
            else { return }
            var draft = prestarts[i]
            if draft.serverId == nil {
                draft.serverId = try await APIClient.shared.createPrestart(jobId: draft.jobId)
            }
            if let sid = draft.serverId {
                try await APIClient.shared.updatePrestart(jobId: draft.jobId, prestartId: sid, body: draft.apiBody)
                for w in draft.workers.indices where draft.workers[w].serverId == nil {
                    let wid = try await APIClient.shared.addPrestartWorker(
                        jobId: draft.jobId,
                        prestartId: sid,
                        name: draft.workers[w].fullName,
                        trade: draft.workers[w].roleTrade
                    )
                    draft.workers[w].serverId = wid
                }
                if draft.status == "queuedFinalise" {
                    try await APIClient.shared.finalisePrestart(
                        jobId: draft.jobId,
                        prestartId: sid,
                        supervisorName: draft.supervisorName
                    )
                    draft.status = "finalised"
                }
            }
            draft.updatedAt = Date()
            prestarts[i] = draft
        case .formSync:
            guard let payloadId = op.payloadId,
                  let i = formDrafts.firstIndex(where: { $0.id == payloadId })
            else { return }
            var draft = formDrafts[i]
            if draft.serverSubmissionId == nil {
                draft.serverSubmissionId = try await APIClient.shared.startForm(
                    jobId: draft.jobId,
                    templateId: draft.templateId
                )
            }
            if let sid = draft.serverSubmissionId {
                let data = try JSONEncoder().encode(draft.answers)
                let json = String(data: data, encoding: .utf8) ?? "{}"
                try await APIClient.shared.saveForm(
                    submissionId: sid,
                    answersJson: json,
                    status: draft.status == "completed" ? "completed" : "in_progress"
                )
            }
            formDrafts[i] = draft
        }
    }

    // MARK: Persist

    private func persistJobs() { write(jobs, name: "jobs.json") }
    private func persist() {
        persistJobs()
        write(Array(signedInJobIds), name: "signedin.json")
        write(prestarts, name: "prestarts.json")
        write(formDrafts, name: "forms.json")
        write(ops, name: "ops.json")
        write(templatesByJob.mapKeys(), name: "templates.json")
        write(fieldsByTemplate.mapKeys(), name: "fields.json")
    }

    private func load() {
        jobs = read("jobs.json") ?? []
        signedInJobIds = Set(read("signedin.json") ?? [Int]())
        prestarts = read("prestarts.json") ?? []
        formDrafts = read("forms.json") ?? []
        ops = (read("ops.json") ?? [FieldOp]()).map { op in
            var copy = op
            if copy.status == .uploading { copy.status = .saved }
            return copy
        }
        if let t: [String: [FormTemplateInfo]] = read("templates.json") {
            templatesByJob = t.compactMapKeys()
        }
        if let f: [String: [FormFieldInfo]] = read("fields.json") {
            fieldsByTemplate = f.compactMapKeys()
        }
    }

    private func write<T: Encodable>(_ value: T, name: String) {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        if let data = try? enc.encode(value) {
            try? data.write(to: dir.appendingPathComponent(name), options: .atomic)
        }
    }

    private func read<T: Decodable>(_ name: String) -> T? {
        guard let data = try? Data(contentsOf: dir.appendingPathComponent(name)) else { return nil }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(T.self, from: data)
    }
}

private extension Dictionary where Key == Int {
    func mapKeys() -> [String: Value] {
        Dictionary<String, Value>(uniqueKeysWithValues: map { (String($0.key), $0.value) })
    }
}

private extension Dictionary where Key == String {
    func compactMapKeys<T>() -> [Int: T] where Value == T {
        var out: [Int: T] = [:]
        for (k, v) in self {
            if let i = Int(k) { out[i] = v }
        }
        return out
    }
}
