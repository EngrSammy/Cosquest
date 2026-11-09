import CoreText
import Foundation

private final class CostQuestGameBundleToken {}

extension Bundle {
    /// The module's resources (CostQuestGame.bundle: the game's fonts, its
    /// logo and launch colour). The copied sources read named assets from
    /// here: scripts/sync-game-from-ios.sh rewrites Image("Logo") to
    /// Image("Logo", bundle: .costQuestGame).
    static let costQuestGame: Bundle = {
        let code = Bundle(for: CostQuestGameBundleToken.self)
        for base in [code, Bundle.main] {
            if let url = base.url(forResource: "CostQuestGame", withExtension: "bundle"),
               let bundle = Bundle(url: url) {
                return bundle
            }
        }
        return code
    }()
}

/// The game's type (Lilita One, Fredoka; see UI/GameKit.swift). Standalone,
/// Info.plist's UIAppFonts registered them; here they live in the module's
/// bundle and are registered for this process on first use of the game.
enum GameFonts {
    @MainActor private static var registered = false

    @MainActor static func register() {
        guard !registered else { return }
        registered = true
        for name in ["LilitaOne-Regular", "Fredoka"] {
            let url = Bundle.costQuestGame.url(forResource: name, withExtension: "ttf")
                ?? Bundle.costQuestGame.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts")
            guard let url else { continue }
            _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}
