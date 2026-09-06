import SwiftUI

struct SitePrestartView: View {
    let job: Job
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var queue: PhotoQueue
    @EnvironmentObject private var net: NetworkStatus
    @EnvironmentObject private var offline: OfflineStore

    @State private var draft: SitePrestartDraft
    @State private var workerName = ""
    @State private var workerTrade = ""
    @State private var showLens = false
    @State private var confirmFinal = false

    init(job: Job) {
        self.job = job
        _draft = State(initialValue: SitePrestartDraft.blank(jobId: job.id, supervisor: ""))
    }

    var body: some View {
        Form {
            Section("HazChat") {
                Text("Write hazards as you see them. Photos stamp on the job and wait for reception.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Hazards on site right now", text: $draft.otherHazards, axis: .vertical)
                    .lineLimit(3...8)
                TextField("What we are doing about them", text: $draft.hazardsActions, axis: .vertical)
                    .lineLimit(2...6)
                Button {
                    showLens = true
                } label: {
                    Label("Take hazard photo", systemImage: "camera.fill")
                }
            }

            Section("Today") {
                LabeledContent("Date", value: draft.date)
                TextField("Supervisor", text: $draft.supervisorName)
                TextField("First aider", text: $draft.firstAid)
                TextField("Site conditions", text: $draft.siteConditions, axis: .vertical)
                TextField("Access issues", text: $draft.accessIssues, axis: .vertical)
                TextField("Live services", text: $draft.liveServices, axis: .vertical)
                TextField("Planned work", text: $draft.plannedWork, axis: .vertical)
                TextField("Plant / equipment", text: $draft.plantEquipment, axis: .vertical)
                Toggle("Assembly point confirmed", isOn: $draft.assemblyConfirmed)
                Toggle("Stop-work authority confirmed", isOn: $draft.stopWorkConfirmed)
                Toggle("No SWMS required today", isOn: $draft.noSwmsRequired)
            }

            Section("Crew sign-on") {
                ForEach(draft.workers) { w in
                    VStack(alignment: .leading) {
                        Text(w.fullName).font(.headline)
                        Text(w.roleTrade.isEmpty ? "Fit for work" : w.roleTrade)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                TextField("Worker name", text: $workerName)
                TextField("Trade (optional)", text: $workerTrade)
                Button("Sign worker on") {
                    let name = workerName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    offline.addWorker(prestartId: draft.id, name: name, trade: workerTrade)
                    refresh()
                    workerName = ""
                    workerTrade = ""
                }
            }

            Section {
                Button("Save on this phone") {
                    offline.savePrestart(draft)
                }
                if draft.status != "finalised" {
                    Button("Finalise prestart") { confirmFinal = true }
                        .foregroundStyle(.red)
                } else {
                    Text("Finalised — waiting to sync if needed")
                        .foregroundStyle(.secondary)
                }
            } footer: {
                Text(net.isOnline ? "Online. Changes go to iwillbuild.com." : "No reception. This stays on the phone until you have signal.")
            }
        }
        .navigationTitle("Prestart / HazChat")
        .onAppear {
            draft = offline.todayPrestart(jobId: job.id, supervisor: auth.user?.name ?? "")
        }
        .onChange(of: draft.otherHazards) { _, _ in persistSoft() }
        .onChange(of: draft.hazardsActions) { _, _ in persistSoft() }
        .onDisappear { offline.savePrestart(draft) }
        .fullScreenCover(isPresented: $showLens) {
            LensView(job: job, initialLabel: "HazChat")
                .environmentObject(queue)
        }
        .confirmationDialog("Finalise this prestart?", isPresented: $confirmFinal, titleVisibility: .visible) {
            Button("Finalise", role: .destructive) {
                offline.savePrestart(draft)
                offline.finalisePrestart(draft.id)
                refresh()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Crew can still be added later on the portal if needed.")
        }
    }

    private func persistSoft() {
        offline.savePrestart(draft)
    }

    private func refresh() {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        let today = fmt.string(from: Date())
        if let latest = offline.prestarts.first(where: { $0.jobId == job.id && $0.date == today }) {
            draft = latest
        }
    }
}
