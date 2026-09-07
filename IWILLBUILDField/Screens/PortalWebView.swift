import SwiftUI
import WebKit

struct PortalWebView: UIViewRepresentable {
    var onOpenCamera: (Int) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onOpenCamera: onOpenCamera)
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
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var onOpenCamera: (Int) -> Void
        private weak var webView: WKWebView?

        init(onOpenCamera: @escaping (Int) -> Void) {
            self.onOpenCamera = onOpenCamera
        }

        func attach(_ webView: WKWebView) {
            self.webView = webView
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
            if let i = parts.firstIndex(of: "jobs"), i + 1 < parts.count, let id = Int(parts[i + 1]) {
                return id
            }
            return nil
        }
    }
}

struct OfficeView: View {
    @EnvironmentObject private var offline: OfflineStore
    @State private var cameraJob: Job?

    var body: some View {
        PortalWebView { jobId in
            if let job = offline.jobs.first(where: { $0.id == jobId }) {
                cameraJob = job
            } else {
                cameraJob = Job(id: jobId, name: "Job \(jobId)", jobNumber: nil, status: nil, address: nil, client: nil)
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .fullScreenCover(item: $cameraJob) { job in
            LensView(job: job, initialLabel: "")
        }
    }
}
