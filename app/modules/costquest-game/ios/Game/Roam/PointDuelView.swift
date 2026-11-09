import SwiftUI

/// Arriving at a Quest Point whose Guardian fights: a briefing page (who you
/// are about to fight, where, how hard, and you) and "Fight" opens the duel.
/// It used to raise a 3D shrine, or open the camera; it is flat now, so the
/// fight is one tap away and nothing on the page needs a loading wait
/// (costquest-research/22_everything_is_a_fight.md).
struct PointDuelView: View {
    let store: RoamStore
    let point: QuestPoint
    let voice: WardenVoice
    var onDone: (DuelOutcome?) -> Void

    @State private var fighting = false
    @State private var shown = false

    var body: some View {
        if fighting {
            DuelView(store: store, request: .point(point), onDone: onDone)
                .transition(.opacity)
        } else {
            briefing
        }
    }

    private var realm: Color { RoamStyle.realmColor(point.realm) }

    private var briefing: some View {
        VStack(spacing: 0) {
            header
            lower
        }
        .background(GamePalette.cream.ignoresSafeArea())
        .gameType()
        .statusBarHidden()
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { shown = true }
            if RoamDev.autoPlay {
                Task {
                    try? await Task.sleep(for: .seconds(1.5))
                    fight()
                }
            }
        }
        .onDisappear { voice.quiet() }
    }

    /// The top of the page in the Guardian's realm colour, with a hard edge
    /// and the realm's mark large and flat, cropped by the screen. It takes
    /// whatever height the lower half leaves.
    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            topBar
            Spacer(minLength: 24)
            VStack(alignment: .leading, spacing: 6) {
                Text("\(store.factionName(point.realm)) Guardian".uppercased())
                    .font(GameFont.display(13)).tracking(1.6)
                    .foregroundStyle(.white.opacity(0.9))
                Text(DuelModes.guardian(point))
                    .font(GameFont.display(40))
                    .foregroundStyle(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.6)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .offset(y: shown ? 0 : 30)
            .opacity(shown ? 1 : 0)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(alignment: .topTrailing) {
            GeometryReader { geo in
                Image(systemName: emblem)
                    .font(.system(size: geo.size.width * 0.85, weight: .black))
                    .foregroundStyle(.black.opacity(0.10))
                    .frame(width: geo.size.width, height: geo.size.height, alignment: .topTrailing)
                    .offset(x: geo.size.width * 0.25, y: geo.size.height * 0.05)
            }
            .clipped()
        }
        .background(realm.ignoresSafeArea(edges: .top))
        .overlay(alignment: .bottom) {
            Rectangle().fill(GamePalette.navy).frame(height: 5)
        }
    }

    /// The realm's own mark. The realm list's sparkles read as decoration,
    /// so the anime realm gets a flame here.
    private var emblem: String {
        point.realm == "anime" ? "flame.fill" : RoamStyle.realmSymbol(point.realm)
    }

    private var topBar: some View {
        HStack {
            Button { onDone(nil) } label: { Image(systemName: "xmark") }
                .buttonStyle(.gameIcon(GamePalette.navy.opacity(0.85), diameter: 42))
                .accessibilityLabel("Leave")
            Spacer()
            Text(point.name.uppercased())
                .font(GameFont.display(13)).tracking(1.4)
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Capsule().fill(GamePalette.navy.opacity(0.85)))
        }
        .padding(.top, 8)
    }

    private var lower: some View {
        VStack(alignment: .leading, spacing: 18) {
            facts

            Text(blurb)
                .font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            Button { fight() } label: { Label("Fight", systemImage: "figure.fencing") }
                .buttonStyle(.game(GamePalette.sun))
        }
        .padding(.horizontal, 16)
        .padding(.top, 22)
        .padding(.bottom, 24)
        .offset(y: shown ? 0 : 40)
        .opacity(shown ? 1 : 0)
    }

    /// Three facts in a row, each a label over a value, divided by hairlines.
    private var facts: some View {
        HStack(spacing: 0) {
            fact("DIFFICULTY", DuelModes.difficulty(point.tier), RoamStyle.tierColor(point.tier))
            divider
            fact("YOU", youValue, GamePalette.ink)
            divider
            fact("DISTANCE", RoamStyle.distance(point.distance_m), GamePalette.ink)
        }
        .padding(.vertical, 14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(GamePalette.ink.opacity(0.12), lineWidth: 1.5))
        .accessibilityElement(children: .combine)
    }

    private var divider: some View {
        Rectangle().fill(GamePalette.ink.opacity(0.12)).frame(width: 1.5, height: 36)
    }

    private func fact(_ label: String, _ value: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .font(GameFont.display(11)).tracking(1.2)
                .foregroundStyle(GamePalette.mist)
            Text(value)
                .font(GameFont.display(20))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private var youValue: String {
        guard let s = store.me?.standing else { return "-" }
        return "Lv \(s.level)"
    }

    private var blurb: String {
        if let holder = point.extra?["holder_name"] ?? point.extra?["holder"].map({ store.factionName($0) }) {
            return "\(holder) holds \(point.name). Beat its Guardian to take it for your faction."
        }
        return "Beat it to take \(point.name) for your faction."
    }

    private func fight() {
        guard !fighting else { return }
        voice.quiet()
        GameSound.shared.play(.whoosh)
        withAnimation(.smooth(duration: 0.3)) { fighting = true }
    }
}
