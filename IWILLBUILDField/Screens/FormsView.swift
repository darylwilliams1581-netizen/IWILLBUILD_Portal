import SwiftUI

struct FormsView: View {
    let job: Job
    @EnvironmentObject private var offline: OfflineStore
    @EnvironmentObject private var net: NetworkStatus
    @State private var filling: FormDraft?

    var templates: [FormTemplateInfo] {
        offline.templatesByJob[job.id] ?? []
    }

    var drafts: [FormDraft] {
        offline.formDrafts.filter { $0.jobId == job.id }
    }

    var body: some View {
        List {
            if !net.isOnline && templates.isEmpty {
                Text("No forms cached yet. Open this job once while you have reception and they stay on the phone.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Start a form") {
                ForEach(templates) { t in
                    Button {
                        filling = offline.startForm(jobId: job.id, template: t)
                    } label: {
                        Text(t.name).foregroundStyle(.primary)
                    }
                }
            }
            if !drafts.isEmpty {
                Section("On this phone") {
                    ForEach(drafts) { d in
                        Button {
                            filling = d
                        } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(d.templateName)
                                    Text(d.status)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Forms")
        .task { await offline.cacheForms(jobId: job.id) }
        .navigationDestination(item: $filling) { draft in
            FormFillView(draft: draft)
        }
    }
}

struct FormFillView: View {
    @EnvironmentObject private var offline: OfflineStore
    @State var draft: FormDraft

    var fields: [FormFieldInfo] {
        (offline.fieldsByTemplate[draft.templateId] ?? []).sorted { $0.fieldOrder < $1.fieldOrder }
    }

    var body: some View {
        Form {
            if fields.isEmpty {
                Text("Form fields were not cached. Connect once so this template can be filled offline.")
                    .font(.caption)
            }
            ForEach(fields.filter { $0.fieldType != "page_break" && $0.fieldType != "instruction_image" }) { field in
                Section {
                    fieldView(field)
                } header: {
                    Text(field.label + (field.required ? " *" : ""))
                }
            }
            Section {
                Button("Save on this phone") { offline.saveForm(draft) }
                if draft.status != "completed" {
                    Button("Mark complete") {
                        draft.status = "completed"
                        offline.completeForm(draft.id)
                        offline.saveForm(draft)
                    }
                }
            }
        }
        .navigationTitle(draft.templateName)
        .onDisappear { offline.saveForm(draft) }
    }

    @ViewBuilder
    private func fieldView(_ field: FormFieldInfo) -> some View {
        let key = String(field.id)
        switch field.fieldType {
        case "yes_no":
            Picker("Answer", selection: binding(key)) {
                Text("").tag("")
                Text("Yes").tag("yes")
                Text("No").tag("no")
            }
            .pickerStyle(.segmented)
        case "checkbox":
            Toggle("Yes", isOn: boolBinding(key))
        case "long_text":
            TextField("Notes", text: binding(key), axis: .vertical).lineLimit(3...8)
        case "single_choice" where !field.options.isEmpty:
            Picker("Choose", selection: binding(key)) {
                Text("—").tag("")
                ForEach(field.options, id: \.self) { Text($0).tag($0) }
            }
        case "section", "instruction":
            EmptyView()
        default:
            TextField("Answer", text: binding(key))
        }
    }

    private func binding(_ key: String) -> Binding<String> {
        Binding(
            get: { draft.answers[key] ?? "" },
            set: { draft.answers[key] = $0 }
        )
    }

    private func boolBinding(_ key: String) -> Binding<Bool> {
        Binding(
            get: { draft.answers[key] == "true" || draft.answers[key] == "yes" },
            set: { draft.answers[key] = $0 ? "true" : "false" }
        )
    }
}
