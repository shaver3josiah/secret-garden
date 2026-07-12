import SwiftUI

/// garden_bg (#E9F0E2) — same misty sage as the Android splash/status bar.
let gardenBg = Color(red: 0xE9 / 255.0, green: 0xF0 / 255.0, blue: 0xE2 / 255.0)

@main
struct SecretGardenApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var webLoaded = false

    var body: some View {
        ZStack {
            // Sage backdrop so the moment before first paint matches the launch screen.
            gardenBg.ignoresSafeArea()

            WebView(isLoaded: $webLoaded)
                .ignoresSafeArea()

            // Hold the launch-screen look until the page has actually rendered,
            // then fade — mirrors the Android splash -> WebView handoff.
            if !webLoaded {
                ZStack {
                    gardenBg.ignoresSafeArea()
                    Image("SplashLogo")
                }
                .transition(.opacity)
                .accessibilityHidden(true) // else VoiceOver announces "SplashLogo" at launch
            }
        }
        .animation(.easeOut(duration: 0.35), value: webLoaded)
    }
}
