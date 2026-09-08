import Foundation
import Combine
import Network

@MainActor
final class NetworkStatus: ObservableObject {
    @Published private(set) var isOnline: Bool = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.iwillbuild.field.net")
    private var listeners: [() -> Void] = []
    private var started = false

    init() {
        startIfNeeded()
    }

    func whenOnline(_ block: @escaping () -> Void) {
        listeners.append(block)
        startIfNeeded()
    }

    func retry() {
        startIfNeeded()
        let online = monitor.currentPath.status == .satisfied
        let becameOnline = online && !isOnline
        isOnline = online
        if becameOnline {
            listeners.forEach { $0() }
        }
    }

    private func startIfNeeded() {
        guard !started else { return }
        started = true
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self else { return }
                let online = path.status == .satisfied
                let becameOnline = online && !self.isOnline
                self.isOnline = online
                if becameOnline {
                    self.listeners.forEach { $0() }
                }
            }
        }
        monitor.start(queue: queue)
    }
}
