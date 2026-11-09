import SwiftUI

/// How it went.
///
/// The game ended and the app said nothing. The session simply stopped being
/// live, the field map carried on showing a field nobody was playing on, and
/// whatever a player had won only appeared later if they happened to open their
/// profile. For a game people pay real money to enter, the moment it resolves
/// is the moment that matters most.
///
/// The authoritative result is the server's, not the session's: the wall row is
/// written by settlement and carries the placing and the prize. This asks for
/// it rather than adding up tokens locally, because a screen that guesses your
/// winnings and guesses differently from the ledger is worse than one that
/// waits a second.
struct ResultsView: View {
    let session: GameSession
    let terms: GameTerms
    let onDone: () -> Void

    @State private var result: Profile.Result?
    /// The player's level after this game paid into it. Events and Roam build
    /// one player, and this is where that becomes visible.
    @State private var roam: RoamMe?
    @State private var loading = true
    /// Whether real card payments are connected. Until the server says so, a
    /// prize is described neutrally rather than as money in an account.
    @State private var paymentsLive = false
    /// Drives the reveal: the hero lands, then the board rises under it.
    @State private var revealed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let client = GameClient()

    private var myFaction: Scoreboard.FactionScore? {
        session.factionScores.first { $0.faction == session.faction }
    }

    private var won: Bool {
        guard let mine = session.faction,
              let top = session.factionScores.first else { return false }
        return top.faction == mine
    }

    private var cancelled: Bool { session.gameStatus == "cancelled" }

    /// A moment worth confetti: a podium placing, or your side on top.
    private var celebrate: Bool {
        guard !cancelled else { return false }
        if let placing = result?.placing { return placing <= 3 }
        return won && !loading
    }

    private var factionColour: Color {
        colour(for: session.faction)
    }

    private func colour(for faction: String?) -> Color {
        Theme.faction(terms.factions.first { $0.name == faction }?.color)
    }

    /// How many stat panels have popped in so far.
    @State private var statsShown = 0
    @State private var playedFanfare = false

    /// The big outlined headline, the way an end-of-match screen shouts it.
    private var bannerText: String {
        if cancelled { return "CALLED OFF" }
        if let placing = result?.placing {
            if placing == 1 { return "VICTORY!" }
            if placing <= 3 { return "PODIUM!" }
            return "GAME OVER"
        }
        if loading { return won ? "VICTORY!" : "GAME OVER" }
        return won ? "VICTORY!" : "DEFEAT"
    }

    private var bannerIsWin: Bool {
        bannerText == "VICTORY!" || bannerText == "PODIUM!"
    }

    var body: some View {
        ZStack {
            GameBackdrop()
            if !cancelled {
                LinearGradient(colors: [factionColour.opacity(0.35), .clear],
                               startPoint: .top, endPoint: .center)
                    .ignoresSafeArea()
            }

            ScrollView {
                VStack(spacing: 22) {
                    VStack(spacing: 10) {
                        GameChip(text: terms.title,
                                 color: cancelled ? GamePalette.ink : GamePalette.berry)
                        GameTitle(bannerText, size: bannerIsWin ? 62 : 54,
                                  fill: bannerIsWin ? GamePalette.sun
                                      : (cancelled ? GamePalette.cream : GamePalette.berry),
                                  outline: GamePalette.ink)
                            .scaleEffect(revealed ? 1 : 0.3)
                            .rotationEffect(.degrees(revealed ? -3 : -12))
                            .opacity(revealed ? 1 : 0)
                            .animation(.spring(response: 0.5, dampingFraction: 0.5),
                                       value: revealed)
                            .contentTransition(.opacity)
                    }
                    .padding(.top, 36)

                    hero

                    if !cancelled {
                        Group {
                            if session.factionScores.count > 1 { podium }
                            tally
                            if let roam { levelPanel(roam) }
                        }
                        .opacity(revealed ? 1 : 0)
                        .offset(y: revealed ? 0 : 24)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    Button { onDone() } label: {
                        Label("Back to the map", systemImage: "map.fill")
                    }
                    .buttonStyle(.game(cancelled ? GamePalette.sun : GamePalette.mint))

                    // Only once the wall row has actually been read back.
                    if result != nil {
                        Text("Saved to your profile.")
                            .font(GameFont.body(13, weight: .semibold))
                            .foregroundStyle(.white)
                            .shadow(color: .black.opacity(0.35), radius: 0, y: 1)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity)
                // A floor under the button: without one the tally scrolled up
                // behind it and "Saved to your profile." sat on top of the
                // numbers (M3 rehearsal, 30 Sep).
                .background {
                    Rectangle().fill(.ultraThinMaterial)
                        .ignoresSafeArea(edges: .bottom)
                }
            }

            if celebrate && !reduceMotion {
                ConfettiBurst(colours: [factionColour, GamePalette.sun, .white,
                                        GamePalette.berry, GamePalette.mint,
                                        Color(red: 0.35, green: 0.7, blue: 0.95)])
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        .gameType()
        .sensoryFeedback(.success, trigger: celebrate) { _, new in new }
        .task { await load() }
        .task { await popStats() }
        .task {
            // Settlement pays the XP; give it a moment to land, then ask.
            try? await Task.sleep(for: .seconds(2))
            if let r = try? await client.roamMe() { withAnimation { roam = r } }
        }
        .onAppear {
            if won && !cancelled {
                GameSound.shared.play(.fanfare)
                playedFanfare = true
            } else {
                GameSound.shared.play(.whoosh)
            }
            withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(0.35)) {
                revealed = true
            }
        }
        .onChange(of: celebrate) { _, now in
            guard now, !playedFanfare else { return }
            playedFanfare = true
            GameSound.shared.play(.fanfare)
        }
    }

    /// Stat panels land one after another, each with a coin tick.
    private func popStats() async {
        guard !cancelled else { return }
        try? await Task.sleep(for: .seconds(0.9))
        for i in 1...3 {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.55)) { statsShown = i }
            GameSound.shared.play(.coin)
            try? await Task.sleep(for: .seconds(0.32))
        }
    }

    private func popIn(_ index: Int) -> some ViewModifier {
        PopIn(shown: statsShown >= index)
    }

    /// The placing, big, in the player's colours. The one thing on the screen
    /// a player should be able to read from across a room.
    @ViewBuilder private var hero: some View {
        VStack(spacing: 14) {
            ZStack {
                if celebrate {
                    Sunburst(colour: heroColour)
                        .frame(width: 260, height: 260)
                        .transition(.scale.combined(with: .opacity))
                }
                Circle()
                    .fill(GamePalette.ink)
                    .frame(width: 164, height: 164)
                    .offset(y: 8)
                Circle()
                    .fill(GamePalette.edge(of: heroColour))
                    .frame(width: 164, height: 164)
                    .offset(y: 5)
                Circle()
                    .fill(LinearGradient(colors: [heroColour, GamePalette.edge(of: heroColour)],
                                         startPoint: .top, endPoint: .bottom))
                    .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 6))
                    .overlay(Circle().inset(by: 10)
                        .strokeBorder(.white.opacity(0.55), lineWidth: 3))
                    .overlay(alignment: .top) {
                        Capsule().fill(.white.opacity(0.3))
                            .frame(width: 80, height: 16).padding(.top, 18)
                    }
                    .frame(width: 164, height: 164)
                Group {
                    if cancelled {
                        Image(systemName: "xmark")
                            .font(.system(size: 60, weight: .black))
                    } else if let placing = result?.placing {
                        VStack(spacing: 0) {
                            if placing <= 3 {
                                Image(systemName: placing == 1 ? "trophy.fill" : "medal.fill")
                                    .font(.system(size: 28, weight: .heavy))
                                    .shadow(color: GamePalette.ink.opacity(0.5), radius: 0, y: 2)
                            }
                            GameTitle(Self.ordinal(placing), size: placing <= 3 ? 54 : 60)
                                .minimumScaleFactor(0.5)
                                .lineLimit(1)
                        }
                        .padding(.horizontal, 12)
                        .transition(.scale(scale: 0.3).combined(with: .opacity))
                    } else if loading {
                        ProgressView().controlSize(.large).tint(.white)
                    } else {
                        Image(systemName: won ? "flag.checkered" : "flag.fill")
                            .font(.system(size: 58, weight: .heavy))
                            .shadow(color: GamePalette.ink.opacity(0.5), radius: 0, y: 3)
                    }
                }
                .frame(width: 164, height: 164)
            }
            .foregroundStyle(.white)
            .frame(height: celebrate ? 210 : 180)
            .animation(.spring(response: 0.55, dampingFraction: 0.62), value: result?.placing)
            .animation(.smooth(duration: 0.4), value: celebrate)

            GameTitle(headline, size: 30)
                .multilineTextAlignment(.center)
                .contentTransition(.opacity)

            if cancelled {
                Text(terms.isFree || !paymentsLive
                     ? "The organiser cancelled this one."
                     : "The organiser cancelled this one. Your entry has been refunded.")
                    .font(GameFont.body(16, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.35), radius: 0, y: 1)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 10)
            } else if let faction = session.faction {
                GameChip(text: "Team \(faction.capitalized)", color: factionColour)
            }
        }
        .padding(.top, 6)
    }

    private var heroColour: Color {
        if cancelled { return Color.gray }
        if result?.placing == 1 { return GamePalette.sun }
        return factionColour
    }

    private var headline: String {
        if cancelled { return "No result this time" }
        if let placing = result?.placing {
            switch placing {
            case 1: return "You won!"
            case 2, 3: return "On the podium"
            default: return "You finished \(Self.ordinal(placing))"
            }
        }
        if loading { return "Counting the tokens" }
        return won ? "Your side took it!" : "Good game"
    }

    /// 1st, 2nd, 3rd, 11th, 21st, in the phone's own language.
    static func ordinal(_ n: Int) -> String {
        ordinalFormatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    private static let ordinalFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .ordinal
        return f
    }()

    /// The top three sides, stood on chunky blocks: second, first, third.
    private var podium: some View {
        let top = Array(session.factionScores.prefix(3))
        let order: [Int] = top.count == 3 ? [1, 0, 2] : (top.count == 2 ? [1, 0] : [0])
        let heights: [CGFloat] = [128, 94, 70]
        return HStack(alignment: .bottom, spacing: 8) {
            ForEach(order, id: \.self) { rank in
                let s = top[rank]
                let mine = s.faction == session.faction
                let face = colour(for: s.faction)
                VStack(spacing: 6) {
                    if rank == 0 {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 26, weight: .black))
                            .foregroundStyle(GamePalette.sun)
                            .shadow(color: GamePalette.ink, radius: 0, y: 3)
                    }
                    Text(s.faction.capitalized)
                        .font(GameFont.display(mine ? 19 : 17))
                        .foregroundStyle(.white)
                        .shadow(color: GamePalette.ink.opacity(0.6), radius: 0, y: 2)
                        .lineLimit(1).minimumScaleFactor(0.6)
                    HStack(spacing: 4) {
                        GameCoin(size: 16)
                        Text("\(s.tokens)").font(GameFont.display(16))
                    }
                    .foregroundStyle(GamePalette.ink)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(GamePalette.cream)
                        .overlay(Capsule().strokeBorder(GamePalette.ink, lineWidth: 2)))
                    ZStack(alignment: .top) {
                        UnevenRoundedRectangle(topLeadingRadius: 12, topTrailingRadius: 12)
                            .fill(GamePalette.edge(of: face))
                            .offset(y: 6)
                        UnevenRoundedRectangle(topLeadingRadius: 12, topTrailingRadius: 12)
                            .fill(LinearGradient(colors: [face, GamePalette.edge(of: face)],
                                                 startPoint: .top, endPoint: .bottom))
                            .overlay(UnevenRoundedRectangle(topLeadingRadius: 12, topTrailingRadius: 12)
                                .strokeBorder(mine ? GamePalette.sun : GamePalette.ink,
                                              lineWidth: mine ? 5 : 4))
                            .overlay(alignment: .top) {
                                Capsule().fill(.white.opacity(0.3))
                                    .frame(height: 8).padding(.horizontal, 12).padding(.top, 8)
                            }
                        GameTitle("\(rank + 1)", size: rank == 0 ? 44 : 36)
                            .padding(.top, 16)
                    }
                    .frame(height: revealed ? heights[rank] : 8)
                    .clipped()
                    .animation(.spring(response: 0.6, dampingFraction: 0.55)
                        .delay(0.45 + Double(2 - rank) * 0.14), value: revealed)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 16)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(GamePalette.navyEdge).offset(y: 6)
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(GamePalette.navy)
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .strokeBorder(.white.opacity(0.2), lineWidth: 2))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.bottom, 6)
    }

    @ViewBuilder private var tally: some View {
        VStack(spacing: 14) {
            // The prize first when there is one: it is what a player came for.
            if let r = result, r.prize_cents > 0 {
                GamePanel(face: GamePalette.sun) {
                    VStack(spacing: 2) {
                        GameTitle(Money.text(r.prize_cents, r.currency ?? terms.currency),
                                  size: 44)
                        // Only said when money really moves: a free game, or an
                        // event whose card payments are not connected, pays nothing
                        // into anyone's account.
                        Text(!terms.isFree && paymentsLive ? "paid into your account" : "your prize")
                            .font(GameFont.display(16))
                            .foregroundStyle(GamePalette.ink)
                    }
                    .frame(maxWidth: .infinity)
                }
                .modifier(popIn(1))
            }

            HStack(spacing: 12) {
                GamePanel(padding: 14) {
                    stat("\(result?.tokens ?? session.tokens)", "Your tokens", coin: true)
                }
                .modifier(popIn(2))
                if let f = myFaction {
                    GamePanel(face: colour(for: f.faction), padding: 14) {
                        stat("\(f.tokens)", "Team \(f.faction.capitalized)", coin: false)
                            .foregroundStyle(.white)
                    }
                    .modifier(popIn(3))
                }
            }

            // The rest of the board, below the podium.
            if session.factionScores.count > 3 {
                GamePanel(padding: 14) {
                    VStack(spacing: 8) {
                        ForEach(Array(session.factionScores.enumerated().dropFirst(3)),
                                id: \.element.faction) { i, s in
                            HStack(spacing: 10) {
                                Text(Self.ordinal(i + 1))
                                    .font(GameFont.display(16))
                                    .frame(width: 38, alignment: .leading)
                                Circle()
                                    .fill(colour(for: s.faction))
                                    .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 2))
                                    .frame(width: 14, height: 14)
                                Text(s.faction.capitalized)
                                    .font(GameFont.body(16, weight: s.faction == session.faction
                                                        ? .bold : .medium))
                                Spacer()
                                GameCoin(size: 16)
                                Text("\(s.tokens)")
                                    .font(GameFont.display(16))
                            }
                        }
                    }
                }
                .modifier(popIn(3))
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func stat(_ value: String, _ label: String, coin: Bool) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                if coin { GameCoin(size: 28) }
                Text(value).font(GameFont.display(34))
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
            Text(label.uppercased())
                .font(GameFont.display(13))
                .tracking(0.8)
                .opacity(0.8)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }

    private func levelPanel(_ r: RoamMe) -> some View {
        GamePanel(padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Level \(r.standing.level)").font(GameFont.display(24))
                    Text(r.standing.rank)
                        .font(GameFont.body(15, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                    Spacer()
                    Image(systemName: "sparkles").foregroundStyle(GamePalette.skyDeep)
                }
                XPBar(progress: r.standing.progress)
                Text("Every event pays into your level and your faction.")
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.6))
            }
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func load() async {
        if !terms.isFree, let health = try? await client.health() {
            paymentsLive = health.paymentsAreLive
        }
        // Settlement writes the wall row, and it may land a moment after the
        // status broadcast. Two tries rather than one, so a player does not
        // see "good game" when they actually came first.
        for attempt in 1...2 {
            if let profile = try? await client.myProfile() {
                if let row = profile.wall.first(where: { $0.game_id == terms.game_id }) {
                    withAnimation { result = row }
                    break
                }
            }
            if attempt == 1 { try? await Task.sleep(for: .seconds(2)) }
        }
        withAnimation { loading = false }
    }
}

// MARK: - Celebration

/// A panel that pops in from small with a spring.
private struct PopIn: ViewModifier {
    let shown: Bool
    func body(content: Content) -> some View {
        content
            .scaleEffect(shown ? 1 : 0.4)
            .opacity(shown ? 1 : 0)
    }
}

/// Slow-turning rays behind a winning placing.
struct Sunburst: View {
    let colour: Color
    @State private var spin = false

    var body: some View {
        Canvas { ctx, size in
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let r = min(size.width, size.height) / 2
            let rays = 14
            for i in 0..<rays {
                let a0 = Double(i) / Double(rays) * 2 * .pi
                let a1 = a0 + .pi / Double(rays)
                var p = Path()
                p.move(to: c)
                p.addLine(to: CGPoint(x: c.x + r * cos(a0), y: c.y + r * sin(a0)))
                p.addLine(to: CGPoint(x: c.x + r * cos(a1), y: c.y + r * sin(a1)))
                p.closeSubpath()
                ctx.fill(p, with: .radialGradient(
                    Gradient(colors: [colour.opacity(0.55), colour.opacity(0)]),
                    center: c, startRadius: 40, endRadius: r))
            }
        }
        .rotationEffect(.degrees(spin ? 360 : 0))
        .onAppear {
            withAnimation(.linear(duration: 24).repeatForever(autoreverses: false)) {
                spin = true
            }
        }
    }
}

/// A single burst of falling confetti, drawn in one Canvas so it costs one
/// layer rather than a hundred views.
struct ConfettiBurst: View {
    let colours: [Color]
    @State private var start = Date()
    /// Set once every piece has fallen and faded, so the animation clock stops
    /// instead of redrawing an empty canvas every frame for as long as the
    /// results screen is open.
    @State private var finished = false

    private struct Piece {
        let x: Double, delay: Double, speed: Double, sway: Double
        let spin: Double, size: Double, colour: Int
    }

    private let pieces: [Piece] = (0..<90).map { _ in
        Piece(x: .random(in: 0...1), delay: .random(in: 0...0.9),
              speed: .random(in: 0.28...0.5), sway: .random(in: 10...36),
              spin: .random(in: 2...7), size: .random(in: 6...11),
              colour: .random(in: 0..<16))
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: finished)) { timeline in
            let t = timeline.date.timeIntervalSince(start)
            Canvas { ctx, size in
                for p in pieces {
                    let life = t - p.delay
                    guard life > 0 else { continue }
                    let y = -20 + life * p.speed * size.height
                    guard y < size.height + 20 else { continue }
                    let x = p.x * size.width + sin(life * 3 + p.x * 10) * p.sway
                    let fade = t > 4 ? max(0, 1 - (t - 4)) : 1
                    var piece = ctx
                    piece.opacity = fade
                    piece.translateBy(x: x, y: y)
                    piece.rotate(by: .radians(life * p.spin))
                    let rect = CGRect(x: -p.size / 2, y: -p.size / 4,
                                      width: p.size, height: p.size / 2)
                    piece.fill(Path(roundedRect: rect, cornerRadius: 1.5),
                               with: .color(colours[p.colour % colours.count]))
                }
            }
        }
        .opacity(finished ? 0 : 1)
        .onAppear { start = Date() }
        .task {
            try? await Task.sleep(for: .seconds(5.5))
            finished = true
        }
    }
}
