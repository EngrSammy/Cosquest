import SwiftUI

/// The game's root inside the CosQuest app: the standalone app's AppRoot,
/// with what its `@main` App struct added around it, minus the splash (the
/// swipe is the entrance now; the shell fades the map up from the player's
/// faction colour) and minus the self tests.
struct GameEmbedRoot: View {
    var body: some View {
        AppRoot()
            .overlay(alignment: .bottom) {
                // Never mistake a test build for the real game.
                if !CQConfig.isProduction {
                    Text(CQConfig.baseURLString.contains("staging") ? "STAGING" : "TEST SERVER")
                        .font(.system(size: 9, weight: .heavy)).tracking(1.2)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 1)
                        .background(Capsule().fill(Color.purple.opacity(0.8)))
                        .padding(.bottom, 2)
                        .ignoresSafeArea(edges: .bottom)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
    }
}
