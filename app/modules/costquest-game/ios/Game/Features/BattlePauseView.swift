import SwiftUI

/// The pause page over a fight in progress: the fight is frozen behind it.
/// Resume, how the controls work, and leaving (which counts as a loss, said
/// plainly and confirmed on the page itself, not in a system dialog).
struct BattlePauseView: View {
    /// What is being fought, e.g. "Final Guard of Big Ben".
    let title: String
    /// Where, e.g. "Big Ben".
    let place: String?
    let tint: Color
    var onResume: () -> Void
    var onLeave: () -> Void

    @State private var showControls = false
    @State private var confirmingLeave = false

    var body: some View {
        ZStack {
            GamePalette.navyEdge.opacity(0.9).ignoresSafeArea()
                .onTapGesture {}                       // nothing behind the page hears a touch
            VStack(spacing: 0) {
                header
                VStack(spacing: 14) {
                    if confirmingLeave { leaveConfirm } else if showControls { controls } else { menu }
                }
                .padding(18)
                .frame(maxWidth: .infinity)
                .background(GamePalette.cream)
            }
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(GamePalette.navy, lineWidth: 3))
            .padding(.horizontal, 22)
            .frame(maxWidth: 460)
        }
        .transition(.opacity)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PAUSED")
                .font(GameFont.display(13)).tracking(1.8)
                .foregroundStyle(.white.opacity(0.85))
            Text(title)
                .font(GameFont.display(26))
                .foregroundStyle(.white)
                .lineLimit(2).minimumScaleFactor(0.7)
            if let place {
                Text(place.uppercased())
                    .font(GameFont.body(12, weight: .heavy)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(tint)
        .overlay(alignment: .bottom) { Rectangle().fill(GamePalette.navy).frame(height: 4) }
    }

    private var menu: some View {
        VStack(spacing: 12) {
            Button { onResume() } label: { Label("Resume", systemImage: "play.fill") }
                .buttonStyle(.game(GamePalette.sun))
            Button { withAnimation(.smooth(duration: 0.2)) { showControls = true } } label: {
                Label("How to play", systemImage: "hand.tap.fill")
            }
            .buttonStyle(.game(GamePalette.skyDeep, size: .medium))
            Button { withAnimation(.smooth(duration: 0.2)) { confirmingLeave = true } } label: {
                Text("Leave the fight")
                    .font(GameFont.body(16, weight: .heavy))
                    .foregroundStyle(GamePalette.berry)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
        }
    }

    private var leaveConfirm: some View {
        VStack(spacing: 12) {
            Text("Leave this fight?")
                .font(GameFont.display(22)).foregroundStyle(GamePalette.ink)
            Text("It counts as a loss, and the point stays out of reach for a while.")
                .font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.7))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button { onResume() } label: { Text("Keep fighting") }
                .buttonStyle(.game(GamePalette.sun))
            Button { onLeave() } label: {
                Text("Leave (counts as a loss)")
                    .font(GameFont.body(16, weight: .heavy))
                    .foregroundStyle(GamePalette.berry)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
        }
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            row("Move", "Left thumb, anywhere on the left. Push to the rim to sprint.")
            row("Attack", "Tap for a combo. Hold to charge a spin. Attack while sprinting to lunge.")
            row("Dodge", "Flick on the right side to roll that way, or tap Dodge. Roll as a red area fires for a perfect dodge.")
            row("Guard", "Hold to block. Press it just as a hit lands to parry.")
            row("Skills", "Drag from a skill to aim, let go to cast. Ultimate fills from combos, parries and perfect dodges.")
            Button { withAnimation(.smooth(duration: 0.2)) { showControls = false } } label: { Text("Back") }
                .buttonStyle(.game(GamePalette.skyDeep, size: .medium))
                .padding(.top, 4)
        }
    }

    private func row(_ name: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(name.uppercased())
                .font(GameFont.display(12)).tracking(1.0)
                .foregroundStyle(tint)
                .frame(width: 62, alignment: .leading)
            Text(text)
                .font(GameFont.body(14, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
