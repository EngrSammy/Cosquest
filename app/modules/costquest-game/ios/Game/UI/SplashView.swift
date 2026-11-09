import SwiftUI

/// The first second of the app: the wordmark lands, glows, and gives way to
/// the world.
///
/// It starts as an exact copy of the static launch screen (the same logo at
/// its native point size, centred, on LaunchBackground), so the hand-off from
/// iOS's launch image to this view is invisible and the motion reads as the
/// launch screen coming alive rather than a second screen appearing.
struct SplashView: View {
    let onDone: () -> Void

    @State private var glow = false
    @State private var punch = false
    @State private var shine = false
    @State private var leaving = false

    /// The pink of the logo's pin, for the bloom behind it.
    private static let pin = Color(red: 0.80, green: 0.25, blue: 0.62)

    var body: some View {
        ZStack {
            Color("LaunchBackground", bundle: .costQuestGame).ignoresSafeArea()

            Circle()
                .fill(RadialGradient(colors: [Self.pin.opacity(0.55), .clear],
                                     center: .center, startRadius: 0, endRadius: 220))
                .frame(width: 440, height: 440)
                .scaleEffect(glow ? 1 : 0.4)
                .opacity(glow ? 1 : 0)

            Image("Logo", bundle: .costQuestGame)
                .overlay {
                    // One highlight sweeping across the letters, masked to them.
                    GeometryReader { geo in
                        LinearGradient(colors: [.clear, .white.opacity(0.7), .clear],
                                       startPoint: .leading, endPoint: .trailing)
                            .frame(width: geo.size.width * 0.35)
                            .rotationEffect(.degrees(18))
                            .offset(x: shine ? geo.size.width * 1.2 : -geo.size.width * 0.5)
                    }
                    .mask(Image("Logo", bundle: .costQuestGame))
                    .allowsHitTesting(false)
                }
                .shadow(color: .black.opacity(0.45), radius: 12, y: 8)
                .scaleEffect(leaving ? 1.35 : (punch ? 1.08 : 1))
        }
        .opacity(leaving ? 0 : 1)
        .task {
            withAnimation(.easeOut(duration: 0.5)) { glow = true }
            withAnimation(.spring(response: 0.28, dampingFraction: 0.45).delay(0.1)) { punch = true }
            try? await Task.sleep(for: .milliseconds(380))
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { punch = false }
            withAnimation(.easeInOut(duration: 0.6)) { shine = true }
            try? await Task.sleep(for: .milliseconds(750))
            withAnimation(.easeIn(duration: 0.35)) { leaving = true }
            try? await Task.sleep(for: .milliseconds(350))
            onDone()
        }
    }
}
