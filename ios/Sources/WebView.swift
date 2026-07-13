import SwiftUI
import WebKit

/// Full-bleed WKWebView serving the bundled web/ folder.
///
/// Serving choice — loadFileURL, not a custom WKURLSchemeHandler:
/// WebKit treats file:// as a potentially-trustworthy (secure-context) origin, so
/// navigator.geolocation exists and DeviceOrientationEvent.requestPermission()
/// (the compass) works. A custom scheme is NOT a secure context in WKWebView and
/// there is no public API to make it one — geolocation would be undefined and the
/// compass permanently dead. The one thing file:// blocks — cross-origin fetch to
/// the weather APIs — is re-enabled below via allowUniversalAccessFromFileURLs.
struct WebView: UIViewRepresentable {
    @Binding var isLoaded: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Persistent store: her hand-placed gardens and verses live in localStorage.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // Identifiable UA component (OSM tile policy asks for one).
        config.applicationNameForUserAgent = "SecretGarden/1.0"
        // file:// origins block cross-origin fetch by default; the garden's live data
        // (Open-Meteo, RainViewer, OSRM, BigDataCloud — all permissive-CORS https)
        // needs it or the app silently shows stale weather forever.
        // ponytail: KVC on a non-public-but-long-stable WebKit key, same trick
        // Cordova/Capacitor shipped for years; swap to a WKURLSchemeHandler + JS
        // geolocation bridge if App Review ever objects. Guarded: if a future iOS
        // drops the key, degrade to file:// CORS (stale cached weather) instead of
        // an NSUnknownKeyException launch crash on every already-installed copy.
        if config.responds(to: NSSelectorFromString("_setAllowUniversalAccessFromFileURLs:")) {
            config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
        }

        // Parity with Android settings.textZoom = 100: pin text size so the
        // system font scale can't break the game layout.
        let lockTextZoom = WKUserScript(
            source: "document.documentElement.style.webkitTextSizeAdjust='100%';",
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(lockTextZoom)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        // No back-forward history ever accrues (the page is one document; every
        // external link goes to Safari), so the gesture can never fire — off. And
        // link-preview would peek a remote page in-app, violating that same "all
        // external content opens in Safari" policy — off too.
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0xE9 / 255.0, green: 0xF0 / 255.0, blue: 0xE2 / 255.0, alpha: 1)

        // The page owns every gesture (touch-action: none + pointer events) and
        // reads env(safe-area-inset-*) itself; scroll-view insets would eat them
        // and rubber-banding would fight the look-up drag.
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        context.coordinator.loadStart(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var parent: WebView

        init(_ parent: WebView) { self.parent = parent }

        func loadStart(in webView: WKWebView) {
            guard let webDir = Bundle.main.url(forResource: "web", withExtension: nil) else {
                // assertionFailure is stripped in Release; show a visible message so a
                // broken folder reference in CI reads as broken, not an eternal sage screen.
                assertionFailure("Bundled web/ folder missing — check the project.yml folder reference")
                webView.loadHTMLString(
                    "<meta name='viewport' content='width=device-width'>"
                    + "<body style='margin:0;height:100vh;display:flex;align-items:center;"
                    + "justify-content:center;background:#E9F0E2;color:#22331B;"
                    + "font:16px -apple-system,system-ui;text-align:center'>"
                    + "<p>The garden could not load.<br>Please reinstall Secret Garden.</p></body>",
                    baseURL: nil
                )
                return
            }
            let index = webDir.appendingPathComponent("index.html")
            webView.loadFileURL(index, allowingReadAccessTo: webDir)
        }

        // External links leave the shell (mirrors Android shouldOverrideUrlLoading).
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if url.isFileURL || url.scheme == "about" {
                decisionHandler(.allow)
                return
            }
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        // target="_blank" (weather chips, credit links) — without this they are
        // silently dead in WKWebView. Route to Safari, never spawn a child web view.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url, !url.isFileURL {
                UIApplication.shared.open(url)
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoaded = true
        }

        // Mirrors Android onRenderProcessGone: same view instance survives on iOS,
        // a reload of the start URL is the whole recovery.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            // Re-show the splash during recovery, same as first launch — otherwise the
            // user sees a blank white webview flash instead of the sage handoff.
            parent.isLoaded = false
            loadStart(in: webView)
        }
    }
}
