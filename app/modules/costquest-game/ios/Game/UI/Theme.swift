import SwiftUI

/// The look of the app, in one place.
///
/// The tokens below are SEMANTIC SYSTEM COLOURS, not fixed values. That is the
/// whole point of them: an app built on `Color(.systemBackground)` follows the
/// phone into light mode, into Increase Contrast, into Reduce Transparency and
/// into whatever Apple does next, and an app built on `Color(red: 0.043, ...)`
/// does none of that and looks like a website. This file used to be the second
/// kind, which is why there was no light mode.
///
/// Two things are still ours rather than the system's, and both are content:
///
/// **The faction colour**, authored by the organiser and read from the server,
/// so a venue's branding reaches the players' screens.
///
/// **Brass**, the default accent, which holds up against both a grey English
/// sky and a night field where a saturated hue does not. It is defined per
/// appearance, so it darkens enough to stay legible on white.
///
/// The one place that deliberately does NOT follow the system is anything
/// drawn over the camera. A HUD on a passthrough feed is dark-on-material
/// whatever the phone's setting, because white text over a bright sky is
/// unreadable and because that is what Apple's own camera interfaces do. See
/// `overCamera`.
enum Theme {

    // MARK: - Surfaces and type, from the system

    /// The page. Follows light and dark.
    static let ink = Color(.systemBackground)
    /// A card or a grouped row on the page.
    static let surface = Color(.secondarySystemBackground)
    /// Something lifted off a card: a chip, a well, a segmented track.
    static let raised = Color(.tertiarySystemFill)
    /// Body copy.
    static let text = Color.primary
    /// Supporting copy, labels, units.
    static let dim = Color.secondary

    // MARK: - Meaning

    /// The accent. Darker in light mode: the night-field brass is too pale to
    /// read as a control on white.
    static let brass = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.910, green: 0.702, blue: 0.227, alpha: 1)
            : UIColor(red: 0.667, green: 0.478, blue: 0.055, alpha: 1)
    })
    /// Destructive, refused, failed. The system red, so it matches every alert
    /// and every delete button the player has ever seen.
    static let refusal = Color.red
    /// Confirmed, captured, won.
    static let affirm = Color.green

    /// A faction's colour as the organiser authored it, falling back to brass
    /// rather than to grey: a faction with no colour set should still look like
    /// a faction.
    static func faction(_ hex: String?) -> Color {
        guard let hex, let value = UInt32(hex.dropFirst(hex.hasPrefix("#") ? 1 : 0),
                                          radix: 16), hex.count >= 6 else {
            return brass
        }
        return Color(red: Double((value >> 16) & 0xFF) / 255,
                     green: Double((value >> 8) & 0xFF) / 255,
                     blue: Double(value & 0xFF) / 255)
    }

    /// Numbers a player reads at a glance while moving. Rounded because it is
    /// legible at speed, monospaced digits because a token count that shifts
    /// its own width as it counts up reads as a glitch.
    ///
    /// Relative to `.title3`, so it grows with Dynamic Type instead of staying
    /// 17pt for someone who has asked for larger text.
    static func score(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .rounded).monospacedDigit()
    }
}

extension View {
    /// For anything drawn over the camera feed.
    ///
    /// Pinned dark whatever the phone's appearance. A passthrough HUD is not a
    /// page: it sits over whatever the player is pointing at, and light chrome
    /// disappears against a bright sky. Apple's own camera interfaces are dark
    /// in light mode for the same reason.
    func overCamera() -> some View {
        environment(\.colorScheme, .dark)
    }
}

/// A pill that stays readable over anything the camera is pointed at.
struct GlassPill<Content: View>: View {
    var tint: Color = .clear
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background {
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(Capsule().fill(tint.opacity(0.22)))
                    .overlay(Capsule().strokeBorder(.white.opacity(0.12),
                                                    lineWidth: 0.5))
            }
            .overCamera()
    }
}
