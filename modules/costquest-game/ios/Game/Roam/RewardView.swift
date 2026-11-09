import SwiftUI
import UIKit

/// What a point paid, counted up where you can see it.
///
/// Every number here is the server's: the lines are the server's own reward
/// breakdown and the bar moves from the standing it reported before to the one
/// it reported after. The screen's only job is to make those numbers land.
struct RewardView: View {
    let verdict: RoamVerdict
    let pointName: String
    var onDone: () -> Void

    @State private var shownLines = 0
    @State private var barProgress: Double = 0
    @State private var barLevel: Int = 1
    @State private var xpCounted = 0
    @State private var showLevelUp = false
    @State private var xpDone = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                GameTitle(verdict.correct > 0 && !verdict.late ? "Rewards!" : "For trying",
                          size: 44)
                GamePanel {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(verdict.reward.lines.prefix(shownLines).enumerated()),
                                id: \.offset) { _, line in
                            HStack(spacing: 8) {
                                Text(line.label)
                                    .font(GameFont.body(16, weight: .semibold))
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text("+\(line.xp) XP")
                                    .font(GameFont.display(18))
                                    .foregroundStyle(GamePalette.skyDeep)
                                    .fixedSize()
                            }
                            .transition(.move(edge: .leading).combined(with: .opacity))
                        }
                        Divider().overlay(GamePalette.ink.opacity(0.2))
                        HStack(alignment: .firstTextBaseline) {
                            Text("Level \(barLevel)").font(GameFont.display(22))
                            Text(verdict.after.rank)
                                .font(GameFont.body(14, weight: .semibold))
                                .foregroundStyle(GamePalette.ink.opacity(0.6))
                            Spacer()
                            Text("+\(xpCounted) XP")
                                .font(GameFont.display(22).monospacedDigit())
                                .contentTransition(.numericText())
                                .foregroundStyle(GamePalette.skyDeep)
                        }
                        XPBar(progress: barProgress)
                        ForEach(verdict.extras ?? [], id: \.self) { x in
                            if x.kind == "relic", let relic = x.relic {
                                // Lands after the XP has counted, so it is
                                // its own moment rather than one more line.
                                if xpDone {
                                    RelicDropCard(relic: relic, isNew: x.new ?? true, shards: x.shards)
                                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                                }
                            } else {
                            HStack(spacing: 10) {
                                Image(systemName: x.icon ?? "sparkles")
                                    .font(.system(size: 18, weight: .heavy))
                                    .foregroundStyle(.white)
                                    .frame(width: 34, height: 34)
                                    .background(Circle().fill(GamePalette.skyDeep))
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(x.title).font(GameFont.display(17))
                                    if let sub = x.subtitle {
                                        Text(sub).font(GameFont.body(13, weight: .semibold))
                                            .foregroundStyle(GamePalette.ink.opacity(0.6))
                                    }
                                }
                            }
                            .transition(.scale.combined(with: .opacity))
                            }
                        }
                        if verdict.reward.faction_points > 0 {
                            Label("+\(verdict.reward.faction_points) for your faction",
                                  systemImage: "flag.2.crossed.fill")
                                .font(GameFont.body(14, weight: .semibold))
                                .foregroundStyle(GamePalette.ink.opacity(0.7))
                        }
                    }
                }
                .padding(.horizontal, 18)
                Spacer()
                Button("Back to the map") { onDone() }
                    .buttonStyle(.game(GamePalette.mint))
                    .padding(.horizontal, 18)
                    .padding(.bottom, 20)
            }
            .gameType()
            .opacity(showLevelUp ? 0 : 1)

            if showLevelUp {
                LevelUpView(level: verdict.after.level, rank: verdict.after.rank,
                            rankUp: verdict.rank_up) {
                    withAnimation(.smooth(duration: 0.3)) { showLevelUp = false }
                }
                .transition(.opacity)
            }
        }
        .task { await play() }
    }

    private func play() async {
        barLevel = verdict.before.level
        barProgress = verdict.before.progress
        try? await Task.sleep(for: .milliseconds(250))
        for i in verdict.reward.lines.indices {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { shownLines = i + 1 }
            // CosCoins are bought, not earned: a reward line is XP (and faction
            // points), never coins, so it never plays the coin sound.
            GameSound.shared.play(.tap)
            try? await Task.sleep(for: .milliseconds(280))
        }
        // Count the XP up, then fill the bar, crossing level boundaries on
        // the way if there are any.
        let steps = 20
        for s in 1...steps {
            withAnimation(.linear(duration: 0.03)) {
                xpCounted = verdict.reward.xp * s / steps
            }
            try? await Task.sleep(for: .milliseconds(30))
        }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) { xpDone = true }
        if verdict.leveled_up {
            withAnimation(.easeIn(duration: 0.5)) { barProgress = 1 }
            try? await Task.sleep(for: .milliseconds(550))
            barLevel = verdict.after.level
            barProgress = 0
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            withAnimation(.smooth(duration: 0.3)) { showLevelUp = true }
        }
        withAnimation(.easeOut(duration: 0.6)) { barProgress = verdict.after.progress }
    }
}

struct XPBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(GamePalette.ink.opacity(0.12))
                Capsule()
                    .fill(LinearGradient(colors: [GamePalette.sky, GamePalette.skyDeep],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(12, g.size.width * min(1, max(0, progress))))
                    .overlay(alignment: .top) {
                        Capsule().fill(.white.opacity(0.3)).frame(height: 4).padding(.horizontal, 6)
                            .padding(.top, 2)
                    }
            }
        }
        .frame(height: 16)
    }
}

/// The moment a player goes up a level. Big, brief, and it gets out of the way.
struct LevelUpView: View {
    let level: Int
    let rank: String
    let rankUp: Bool
    var onDone: () -> Void

    @State private var shown = false

    var body: some View {
        ZStack {
            // Opaque enough that the reward panel underneath does not read
            // through the ceremony: this moment is the only thing on screen.
            LinearGradient(colors: [GamePalette.navy, GamePalette.navyEdge],
                           startPoint: .top, endPoint: .bottom)
                .opacity(0.96)
                .ignoresSafeArea()
            Sunburst(colour: GamePalette.sun)
                .frame(width: 560, height: 560)
                .opacity(shown ? 1 : 0)
            ConfettiBurst(colours: [GamePalette.sun, GamePalette.mint, GamePalette.berry,
                                    GamePalette.sky, .white])
                .ignoresSafeArea()
                .allowsHitTesting(false)
            VStack(spacing: 10) {
                GameTitle("LEVEL UP!", size: 50, outline: GamePalette.sunDeep)
                ZStack {
                    Circle().fill(GamePalette.edge(of: GamePalette.sun)).offset(y: 8)
                    Circle().fill(LinearGradient(colors: [GamePalette.sun, GamePalette.sunDeep],
                                                 startPoint: .top, endPoint: .bottom))
                    Circle().strokeBorder(.white, lineWidth: 6)
                    Text("\(level)")
                        .font(GameFont.display(86))
                        .foregroundStyle(.white)
                        .shadow(color: GamePalette.sunDeep, radius: 0, y: 4)
                }
                .frame(width: 170, height: 170)
                .scaleEffect(shown ? 1 : 0.2)
                if rankUp {
                    Text("New rank")
                        .font(GameFont.body(16, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                    GameTitle(rank, size: 36, fill: GamePalette.sun)
                } else {
                    Text(rank)
                        .font(GameFont.display(24))
                        .foregroundStyle(.white.opacity(0.9))
                }
                Button("Nice!") { onDone() }
                    .buttonStyle(.game(GamePalette.sun, fullWidth: false))
                    .padding(.top, 14)
            }
            .opacity(shown ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.6)) { shown = true }
        }
    }
}
