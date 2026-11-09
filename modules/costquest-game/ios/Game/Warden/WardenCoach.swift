import SwiftUI
import UIKit

/// The Warden, showing the player round the game.
///
/// A tutorial is a list of tooltips; this is the character that met you in
/// onboarding carrying on the conversation. One thing at a time, said aloud,
/// and when it is about a button the rest of the screen dims and the button
/// is lit, so "tap Battle" never means hunting for Battle.
struct CoachStep: Equatable, Identifiable {
    let id: String
    let line: String
    /// A `railAnchor` id to light up, or nil to leave the map uncovered.
    var target: String?
    var action = "Show me"
    var later = "Later"
}

extension CoachStep {
    /// The first point's line, in the words of what its card does when
    /// tapped: a duel is a Guardian to fight, a blitz or a sequence is played,
    /// anything else (trivia, rebus) is answered.
    static func firstShrine(name: String, kind: String = "duel") -> CoachStep {
        let line: String
        switch kind {
        case "duel":
            line = "\(name), your first Guardian is right beside you. Tap its card to fight."
        case "blitz", "sequence":
            line = "\(name), your first Quest Point is right beside you. Tap its card to play."
        default:
            line = "\(name), your first Quest Point is right beside you. Tap its card to answer."
        }
        return CoachStep(id: "first-shrine", line: line,
                         target: "starter", action: "Show me", later: "")
    }

    static func unlock(_ u: RoamUnlock) -> CoachStep {
        let line: String
        var target: String? = u.rawValue
        switch u {
        case .codex:
            line = "Every shrine you play leaves a card behind. I keep them here, in your Codex."
        case .relics:
            line = "I've been keeping something for you. Right answers wake Relics, the weapons of the houses. Come and see."
        case .war:
            line = "Your house is at war for this city, every week. Take shrines, hold them, and we win."
        case .battle:
            line = "You're ready for a real fight. Find someone nearby, start a Room, and battle them right here, through your camera."
        case .walking:
            line = "Walk, and I'll reward you for it. Five, twenty-five and fifty kilometres a week."
            target = nil
        case .friends:
            line = "Hold your phone against a friend's and I'll remember you're together. No chat, and no one sees where you are."
            target = nil
        case .raids:
            line = "Every hour a boss wakes somewhere near you. Bring a crew, and bring it down."
            target = nil
        }
        return CoachStep(id: "unlock-\(u.rawValue)", line: line, target: target,
                         // The Codex button opens its own sheet; lighting it is enough.
                         action: target == nil || u == .codex ? "Got it" : "Show me",
                         later: target == nil || u == .codex ? "" : "Later")
    }

    static let siege = CoachStep(
        id: "siege",
        line: "See the shrine flying another house's colours? A Guardian holds it for them. Strike it down with your Relic and it's ours.",
        target: nil, action: "Got it", later: "")
}

/// Which step has already been said, kept on the phone.
enum CoachMemory {
    private static let key = "cq.coach.done"
    static func done(_ id: String) -> Bool {
        (UserDefaults.standard.stringArray(forKey: key) ?? []).contains(id)
    }
    static func mark(_ id: String) {
        var s = UserDefaults.standard.stringArray(forKey: key) ?? []
        if !s.contains(id) { s.append(id) }
        UserDefaults.standard.set(s, forKey: key)
    }
}

/// The dim, the light on the target, and the Warden's bubble.
struct WardenCoachOverlay: View {
    let step: CoachStep
    let tint: Color
    let style: WardenStyle
    let speaker: WardenSpeaker
    let anchors: [String: Anchor<CGRect>]
    var onAction: () -> Void
    var onLater: () -> Void

    @State private var shown = false
    @State private var ring = false

    var body: some View {
        GeometryReader { geo in
            let hole = step.target.flatMap { anchors[$0] }.map { geo[$0].insetBy(dx: -8, dy: -8) }
            ZStack(alignment: .bottom) {
                if let hole {
                    Spotlight(hole: hole)
                        // Not ignoresSafeArea: that would measure the hole from the
                        // screen's top while the anchor is measured inside the safe
                        // area. The path is oversized, so it still covers the edges.
                        .fill(Color.black.opacity(0.55), style: FillStyle(eoFill: true))
                        .contentShape(Spotlight(hole: hole), eoFill: true)
                        .onTapGesture { onLater() }
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .strokeBorder(tint, lineWidth: 3)
                        .frame(width: hole.width, height: hole.height)
                        .scaleEffect(ring ? 1.12 : 1)
                        .opacity(ring ? 0 : 1)
                        .position(x: hole.midX, y: hole.midY)
                        .allowsHitTesting(false)
                    // The lit button itself does what the Warden asked.
                    Color.clear
                        .frame(width: hole.width, height: hole.height)
                        .contentShape(.rect)
                        .position(x: hole.midX, y: hole.midY)
                        .onTapGesture { onAction() }
                }
                bubble
                    .padding(.horizontal, 14)
                    // Clear of the rail column, so a lit rail button is never
                    // under it (a lit card in the tray is below it anyway).
                    .padding(.trailing, hole.map { $0.minX > geo.size.width * 0.6 ? geo.size.width - $0.minX + 6 : 14 } ?? 62)
                    // Above the Nearby tray, which is the player's way out.
                    .padding(.bottom, 236)
                    .offset(y: shown ? 0 : 30)
                    .opacity(shown ? 1 : 0)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .bottom)
        }
        .onAppear {
            withAnimation(.smooth(duration: 0.5).delay(0.4)) { shown = true }
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { ring = true }
            if Preferences.shared.wardenSpeaks { speaker.speak(step.line, style: style) }
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        }
        .onDisappear { speaker.stop() }
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                WardenBadge(tint: tint, size: 38, level: speaker.level)
                VStack(alignment: .leading, spacing: 4) {
                    Text("THE WARDEN")
                        .font(GameFont.display(12)).tracking(1.2)
                        .foregroundStyle(tint)
                    Text(step.line)
                        .font(GameFont.body(16, weight: .semibold))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                WardenClose(action: onLater)
            }
            HStack(spacing: 10) {
                Spacer()
                if !step.later.isEmpty {
                    Button(step.later, action: onLater)
                        .font(GameFont.body(15, weight: .bold))
                        .foregroundStyle(.white.opacity(0.6))
                        .padding(.horizontal, 12)
                        .frame(height: 40)
                }
                Button(step.action, action: onAction)
                    .buttonStyle(.game(tint, size: .small, fullWidth: false))
            }
        }
        .padding(12)
        .frame(maxWidth: 420)
        .background {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(GamePalette.navy.opacity(0.94))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(tint.opacity(0.8), lineWidth: 2))
                .shadow(color: tint.opacity(0.35), radius: 16, y: 6)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("The Warden: \(step.line)")
    }
}

/// The whole screen with a rounded hole where the target is.
private struct Spotlight: Shape {
    let hole: CGRect
    func path(in rect: CGRect) -> Path {
        var p = Path(rect.insetBy(dx: -2000, dy: -2000))
        p.addRoundedRect(in: hole, cornerSize: CGSize(width: 22, height: 22), style: .continuous)
        return p
    }
}
