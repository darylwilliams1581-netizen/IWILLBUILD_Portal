import Foundation

struct LocalWorker: Codable, Identifiable, Equatable {
    var id: String
    var serverId: Int?
    var fullName: String
    var roleTrade: String
    var fitForWork: Bool
}

struct SitePrestartDraft: Codable, Identifiable, Equatable {
    var id: String
    var serverId: Int?
    var jobId: Int
    var status: String
    var date: String
    var supervisorName: String
    var firstAid: String
    var otherHazards: String
    var hazardsActions: String
    var siteConditions: String
    var accessIssues: String
    var liveServices: String
    var plannedWork: String
    var plantEquipment: String
    var assemblyConfirmed: Bool
    var stopWorkConfirmed: Bool
    var noSwmsRequired: Bool
    var workers: [LocalWorker]
    var updatedAt: Date

    var isFinal: Bool { status == "finalised" }

    static func blank(jobId: Int, supervisor: String) -> SitePrestartDraft {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        return SitePrestartDraft(
            id: "local_\(UUID().uuidString)",
            serverId: nil,
            jobId: jobId,
            status: "draft",
            date: fmt.string(from: Date()),
            supervisorName: supervisor,
            firstAid: "",
            otherHazards: "",
            hazardsActions: "",
            siteConditions: "",
            accessIssues: "",
            liveServices: "",
            plannedWork: "",
            plantEquipment: "",
            assemblyConfirmed: false,
            stopWorkConfirmed: false,
            noSwmsRequired: false,
            workers: [],
            updatedAt: Date()
        )
    }

    var apiBody: [String: Any] {
        [
            "prestart_date": date,
            "supervisor_name": supervisorName,
            "first_aid_person": firstAid,
            "other_hazards": otherHazards,
            "hazards_actions": hazardsActions,
            "site_conditions": siteConditions,
            "access_issues": accessIssues,
            "live_services": liveServices,
            "planned_work": plannedWork,
            "plant_equipment": plantEquipment,
            "assembly_point_confirmed": assemblyConfirmed,
            "stop_work_authority_confirmed": stopWorkConfirmed,
            "no_swms_required": noSwmsRequired,
        ]
    }
}

struct FormTemplateInfo: Codable, Identifiable, Equatable {
    var id: Int
    var name: String
    var formType: String?
}

struct FormFieldInfo: Codable, Identifiable, Equatable {
    var id: Int
    var label: String
    var fieldType: String
    var required: Bool
    var optionsJson: String?
    var fieldOrder: Int

    var options: [String] {
        guard let optionsJson,
              let data = optionsJson.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [String]
        else { return [] }
        return arr
    }
}

struct FormDraft: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var jobId: Int
    var templateId: Int
    var templateName: String
    var serverSubmissionId: Int?
    var answers: [String: String]
    var status: String
    var updatedAt: Date
}

enum FieldOpKind: String, Codable {
    case signIn
    case signOut
    case prestartSync
    case formSync
}

struct FieldOp: Codable, Identifiable, Equatable {
    var id: String
    var kind: FieldOpKind
    var jobId: Int
    var payloadId: String?
    var status: QueueStatus
    var error: String?
    var createdAt: Date
}
