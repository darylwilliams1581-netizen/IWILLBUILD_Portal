import SwiftUI
import WebKit

struct PortalWebView: UIViewRepresentable {
    var reloadToken: Int
    var onOpenCamera: (Int) -> Void
    var onLoadFailed: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onOpenCamera: onOpenCamera, onLoadFailed: onLoadFailed)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.attach(view)
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.onOpenCamera = onOpenCamera
        context.coordinator.onLoadFailed = onLoadFailed
        if context.coordinator.reloadToken != reloadToken {
            context.coordinator.reloadToken = reloadToken
            context.coordinator.reload(uiView)
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var onOpenCamera: (Int) -> Void
        var onLoadFailed: () -> Void
        var reloadToken = 0
        private weak var webView: WKWebView?

        init(onOpenCamera: @escaping (Int) -> Void, onLoadFailed: @escaping () -> Void) {
            self.onOpenCamera = onOpenCamera
            self.onLoadFailed = onLoadFailed
        }

        func attach(_ webView: WKWebView) {
            self.webView = webView
            Task { await syncCookiesAndLoad(webView) }
        }

        func reload(_ webView: WKWebView) {
            Task { await syncCookiesAndLoad(webView) }
        }

        private func syncCookiesAndLoad(_ webView: WKWebView) async {
            let host = APIClient.host
            let cookies = HTTPCookieStorage.shared.cookies(for: host) ?? HTTPCookieStorage.shared.cookies ?? []
            for cookie in cookies where cookie.domain.contains("iwillbuild.com") || host.host.map({ cookie.domain.contains($0) }) == true {
                await webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
            }
            await MainActor.run {
                webView.load(URLRequest(url: host))
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            if let jobId = Self.cameraJobId(from: url) {
                onOpenCamera(jobId)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            onLoadFailed()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            onLoadFailed()
        }

        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            if type == .camera || type == .cameraAndMicrophone {
                decisionHandler(.deny)
                if let jobId = Self.cameraJobId(from: webView.url) {
                    onOpenCamera(jobId)
                }
                return
            }
            decisionHandler(.grant)
        }

        static func cameraJobId(from url: URL?) -> Int? {
            guard let url else { return nil }
            let path = url.path.lowercased()
            let looksLikeCamera = path.contains("camera") || path.contains("job-photos")
            guard looksLikeCamera else { return nil }
            let parts = url.path.split(separator: "/").map(String.init)
            if let idx = parts.firstIndex(of: "jobs"), parts.indices.contains(idx + 1), let id = Int(parts[idx + 1]) {
                return id
            }
            return nil
        }
    }
}

struct OfficeView: View {
    @EnvironmentObject private var offline: OfflineStore
    @EnvironmentObject private var net: NetworkStatus
    @State private var cameraJob: Job?
    @State private var webFailed = false
    @State private var reloadToken = 0

    private var showOffline: Bool { !net.isOnline || webFailed }

    var body: some View {
        ZStack {
            PortalWebView(
                reloadToken: reloadToken,
                onOpenCamera: { jobId in
                    if let job = offline.jobs.first(where: { $0.id == jobId }) {
                        cameraJob = job
                    } else {
                        cameraJob = Job(id: jobId, name: "Job \(jobId)", jobNumber: nil, status: nil, address: nil, client: nil)
                    }
                },
                onLoadFailed: { webFailed = true }
            )
            .ignoresSafeArea(edges: .bottom)
            .opacity(showOffline ? 0 : 1)

            if showOffline {
                OfflineSplashView {
                    webFailed = false
                    net.retry()
                    reloadToken += 1
                }
            }
        }
        .fullScreenCover(item: $cameraJob) { job in
            LensView(job: job, initialLabel: "")
        }
        .onChange(of: net.isOnline) { _, online in
            if online { webFailed = false }
        }
    }
}
