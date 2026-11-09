import SwiftUI
import UIKit

/// How Roam's things look, in one place, so the map, the tray, the encounter
/// and the reward all agree that a gold crystal is an epic point.
enum RoamStyle {
    static func tierColor(_ tier: String) -> Color {
        switch tier {
        case "epic": return GamePalette.sun
        case "rare": return Color(red: 0.60, green: 0.38, blue: 0.97)
        default: return GamePalette.sky
        }
    }

    static func tierUIColor(_ tier: String) -> UIColor { UIColor(tierColor(tier)) }

    static func tierName(_ tier: String) -> String { tier.capitalized }

    static func realmColor(_ realm: String?) -> Color {
        switch realm {
        case "anime": return Color(red: 1.00, green: 0.36, blue: 0.60)
        case "marvel": return Color(red: 0.89, green: 0.21, blue: 0.21)
        case "dc": return Color(red: 0.16, green: 0.45, blue: 0.93)
        case "movies": return Color(red: 0.96, green: 0.62, blue: 0.13)
        case "gaming": return Color(red: 0.20, green: 0.78, blue: 0.45)
        default: return GamePalette.skyDeep
        }
    }

    static func realmSymbol(_ realm: String?) -> String {
        switch realm {
        case "anime": return "sparkles"
        case "marvel": return "shield.lefthalf.filled"
        case "dc": return "bolt.shield.fill"
        case "movies": return "film.fill"
        case "gaming": return "gamecontroller.fill"
        default: return "flag.fill"
        }
    }

    static func challengeName(_ kind: String) -> String {
        switch kind {
        case "sequence": return "Sequence"
        case "rebus": return "Rebus"
        case "blitz": return "Blitz"
        case "duel": return "Duel"
        default: return "Trivia"
        }
    }

    static func challengeSymbol(_ kind: String) -> String {
        switch kind {
        case "sequence": return "list.number"
        case "rebus": return "face.smiling.inverse"
        case "blitz": return "bolt.fill"
        case "duel": return "figure.fencing"
        default: return "questionmark.bubble.fill"
        }
    }

    static func challengeBlurb(_ kind: String) -> String {
        switch kind {
        case "sequence": return "Put four moments in the right order."
        case "rebus": return "Read the emoji. Name what they are."
        case "blitz": return "Five questions against the clock."
        case "duel": return "A Guardian keeps this place. Beat it in a fight."
        default: return "One question. One answer."
        }
    }

    /// "120 m", "1.4 km".
    static func distance(_ m: Double?) -> String {
        guard let m else { return "…" }
        if m < 1000 { return "\(Int(m.rounded())) m" }
        return String(format: "%.1f km", m / 1000)
    }
}
