import SwiftUI

struct JobHomeView: View {
    let job: Job
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var queue: PhotoQueue
    @EnvironmentObject private var net: NetworkStatus
    @EnvironmentObject private var offline: OfflineStore

    @State private var showLens = false
    @State private var lensLabel = ""
    @State private var showPrestart = false
    @State private var showForms = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                statusRow
                signCard
                action("Camera", subtitle: "Watermarked job photos", system: "camera.fill", tint: Color(red: 0.93, green: 0.45, blue: 0.12)) {
                    lensLabel = ""
                    showLens = true
                }
                action("Site Prestart / HazChat", subtitle: "Daily hazards, crew sign-on", system: "checkmark.shield.fill", tint: .red) {
                    _ = offline.todayPrestart(jobId: job.id, supervisor: auth.user?.name ?? "")
                    showPrestart = true
                }
                action("Forms", subtitle: "Fill on the phone, sync later", system: "doc.text.fill", tint: .indigo) {
                    showForms = true
                    Task { await offline.cacheForms(jobId: job.id) }
                }
                pendingBox
            }
            .padding(16)
        }
        .background(Color(red: 0.07, green: 0.08, blue: 0.10))
        .navigationTitle(job.jobNumber ?? job.name)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $showLens) {
            LensView(job: job, initialLabel: lensLabel)
                .environmentObject(queue)
        }
        .navigationDestination(isPresented: $showPrestart) {
            SitePrestartView(job: job)
        }
        .navigationDestination(isPresented: $showForms) {
            FormsView(job: job)
        }
        .task { await offline.refreshSignIn(jobId: job.id) }
    }

    private var statusRow: some View {
        HStack {
            Circle().fill(net.isOnline ? Color.green : Color.orange).frame(width: 8, height: 8)
            Text(net.isOnline ? "Online — will sync" : "Offline — saving on this phone")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            Spacer()
            if queue.pending(for: job.id).count + offline.pendingCount > 0 {
                Text("\(queue.pending(for: job.id).count + offline.ops.filter { $0.jobId == job.id && $0.status != .synced }.count) waiting")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.2), in: Capsule())
            }
        }
    }

    private var signCard: some View {
        let on = offline.isSignedIn(jobId: job.id)
        return VStack(alignment: .leading, spacing: 10) {
            Text(on ? "You are signed on" : "Not signed on")
                .font(.headline)
            Text(on ? "Sign off when you leave site." : "Sign on even with no reception. It syncs later.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button {
                if on { offline.signOut(jobId: job.id) }
                else { offline.signIn(jobId: job.id) }
            } label: {
                Text(on ? "Sign off" : "Sign on")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(on ? Color.gray.opacity(0.35) : Color.blue, in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(.white)
            }
        }
        .padding(16)
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
    }

    private func action(_ title: String, subtitle: String, system: String, tint: Color, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            HStack(spacing: 14) {
                Image(systemName: system)
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(tint, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(.primary)
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.plain)
    }

    private var pendingBox: some View {
        let items = offline.ops.filter { $0.jobId == job.id && $0.status != .synced }
        let photos = queue.pending(for: job.id)
        if items.isEmpty && photos.isEmpty { return AnyView(EmptyView()) }
        return AnyView(
            VStack(alignment: .leading, spacing: 8) {
                Text("Waiting to sync").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                ForEach(items) { op in
                    HStack {
                        Text(label(op))
                        Spacer()
                        if op.status == .failed {
                            Button("Retry") { offline.retry(op.id) }
                        } else {
                            Text(op.status.rawValue).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .font(.caption)
                }
                ForEach(photos) { p in
                    HStack {
                        Text(p.fileName)
                        Spacer()
                        if p.status == .failed {
                            Button("Retry") { queue.retry(p.id) }
                        }
                    }
                    .font(.caption)
                }
            }
            .padding(14)
            .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
        )
    }

    private func label(_ op: FieldOp) -> String {
        switch op.kind {
        case .signIn: return "Sign on"
        case .signOut: return "Sign off"
        case .prestartSync: return "Site prestart / HazChat"
        case .formSync: return "Form"
        }
    }
}
