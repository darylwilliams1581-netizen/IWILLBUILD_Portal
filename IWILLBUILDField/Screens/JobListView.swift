import SwiftUI

struct JobListView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var queue: PhotoQueue
    @EnvironmentObject private var net: NetworkStatus
    @EnvironmentObject private var offline: OfflineStore

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !net.isOnline {
                    Text("Offline — using jobs saved on this phone")
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(8)
                        .background(Color.orange.opacity(0.2))
                }
                if !queue.needsAttention.isEmpty || !offline.ops.filter({ $0.status == .failed }).isEmpty {
                    queueBar
                }
                Group {
                    if offline.jobs.isEmpty && offline.lastError != nil {
                        ContentUnavailableView(offline.lastError ?? "No jobs", systemImage: "wifi.exclamationmark")
                    } else if offline.jobs.isEmpty {
                        ProgressView("Loading jobs")
                    } else {
                        List(offline.jobs) { job in
                            NavigationLink(value: job) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(job.title)
                                            .font(.headline)
                                        if let status = job.status, !status.isEmpty {
                                            Text(status).font(.caption).foregroundStyle(.secondary)
                                        }
                                        if offline.isSignedIn(jobId: job.id) {
                                            Text("Signed on")
                                                .font(.caption2.weight(.bold))
                                                .foregroundStyle(.green)
                                        }
                                    }
                                    Spacer()
                                    let n = queue.pending(for: job.id).count
                                        + offline.ops.filter { $0.jobId == job.id && $0.status != .synced }.count
                                    if n > 0 {
                                        Text("\(n) queued")
                                            .font(.caption2.weight(.semibold))
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.orange.opacity(0.2), in: Capsule())
                                    }
                                }
                            }
                        }
                        .listStyle(.plain)
                        .refreshable { await offline.loadJobs() }
                    }
                }
            }
            .navigationTitle("Field")
            .navigationDestination(for: Job.self) { job in
                JobHomeView(job: job)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign out") { Task { await auth.signOut() } }
                }
            }
        }
        .task { await offline.loadJobs() }
    }

    private var queueBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(queue.needsAttention) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.fileName).font(.caption.weight(.semibold))
                        Text(item.error ?? item.status.rawValue).font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Retry") { queue.retry(item.id) }.font(.caption.weight(.semibold))
                }
            }
            ForEach(offline.ops.filter { $0.status == .failed }) { op in
                HStack {
                    Text(op.kind.rawValue).font(.caption.weight(.semibold))
                    Spacer()
                    Button("Retry") { offline.retry(op.id) }.font(.caption.weight(.semibold))
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.15))
    }
}
