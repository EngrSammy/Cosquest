import CoreLocation
import SwiftUI
import simd

/// What sits over the camera while the game is being played.
///
/// The rule for everything here: a player is looking at a field, not at a
/// screen. They glance. So the HUD shows the smallest number of things that
/// change a decision, each readable in about a third of a second, and puts
/// them where a thumb already is.
///
/// - Their own token count, large, top left, because it is the score. It
///   counts, pops and flashes when it changes so a hit is felt, not read.
/// - One compact capsule top right: live or not, and the sides as a bar.
///   Beside it, small round buttons for the extras (ask, checkpoint tag).
/// - One action at the bottom, whatever the situation makes possible: fire at
///   the player in front of you, take the point you are standing on, answer the
///   question at this stop. Never two at once. When there is nothing to act on,
///   a guide line points at the nearest thing worth walking to.
/// - A short feed, at most three lines, each fading on its own.
///
/// Everything is drawn white on material and pinned dark with `overCamera`,
/// whatever the phone's appearance: black digits over a camera feed vanish.
struct GameHUD: View {
    let session: GameSession
    let field: FieldModel
    let terms: GameTerms
    let warden: Warden
    /// Where the phone is in the field's own frame, from the AR camera.
    let cameraPosition: SIMD3<Float>
    let cameraHeading: Double
    /// True when PlayView draws its corner controls (leave, map) over the
    /// HUD, so rows that share those corners keep clear of them.
    var reservesPlayChrome: Bool = false

    @State private var trivia: GameAnchor?
    @State private var checkpoints = Checkpoints()
    @State private var showWarden = false

    /// A fire in flight. Carries an id so the watchdog only ever clears the
    /// shot it was started for, never a newer one.
    @State private var pendingShot: UUID?
    /// A respawn request in flight.
    @State private var respawning = false
    /// A checkpoint tag problem, shown briefly and then dropped.
    @State private var nfcNotice: String?

    /// Token change animation state.
    @State private var tokenFlash: Color?
    @State private var tokenScale: CGFloat = 1
    @State private var tokenDelta: Int?
    @State private var deltaID = UUID()
    /// The big "CAPTURED!" style reward moments.
    @State private var banners = GameBannerModel()

    private var myColour: Color {
        Theme.faction(terms.factions.first { $0.name == session.faction }?.color)
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Spacer(minLength: 0)
            feed
            actionBar
                .padding(.leading, reservesPlayChrome ? PlayChrome.cornerInset : 0)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 20)
        .overlay { if session.state == "respawning" { downed } }
        .overlay(alignment: .top) { nfcBanner }
        .overlay {
            if let banner = banners.current {
                GameBannerView(banner: banner)
                    .id(banner.id)
                    .offset(y: -90)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.6), value: banners.current)
        .onChange(of: field.tapRequest) { _, request in
            guard let request else { return }
            if request.distance < 6 {
                act(on: request.anchor)
            } else {
                banners.show("WALK CLOSER", subtitle: String(format: "%.0f m away", request.distance),
                             color: GamePalette.skyDeep, sound: .whoosh)
            }
        }
        .overCamera()
        .sheet(isPresented: $showWarden) {
            WardenView(warden: warden, context: wardenContext)
        }
        .sheet(item: $trivia) { anchor in
            TriviaSheet(anchor: anchor) { choice in
                Task { await session.answerTrivia(anchor: anchor.id, answer: choice) }
                trivia = nil
            }
        }
        .animation(.snappy, value: session.state)
        .onChange(of: session.tokens) { old, new in tokensChanged(from: old, to: new) }
        .onChange(of: session.state) { old, new in
            pendingShot = nil
            if new == "respawning", old != "respawning" {
                banners.show("DOWN!", subtitle: "Hang tight", color: GamePalette.berry, sound: .hit)
            }
        }
        .onChange(of: session.lastTokenDelta?.id) { _, _ in
            guard let delta = session.lastTokenDelta else { return }
            celebrate(delta)
        }
        .onChange(of: session.weapon) { old, new in
            if old == nil, let new {
                banners.show("WEAPON UP!", subtitle: new.capitalized, color: GamePalette.skyDeep,
                             sound: .fanfare)
            }
        }
        .task {
            checkpoints.onCheckpoint = { id in
                // The tag names a point; the app does exactly what standing at
                // that point would do. Rules stay on the server, so a tag that
                // was copied still meets the same cooldowns and faction checks.
                guard let anchor = field.anchors.first(where: { $0.id == id }) else {
                    showNFC("That checkpoint is not part of this game.")
                    return
                }
                act(on: anchor)
            }
        }
    }

    // MARK: - Tokens

    private func tokensChanged(from old: Int, to new: Int) {
        guard old != new else { return }
        let gained = new > old
        GameSound.shared.play(gained ? .coin : .hit)
        tokenDelta = new - old
        deltaID = UUID()
        withAnimation(.spring(response: 0.18, dampingFraction: 0.5)) {
            tokenScale = 1.22
            tokenFlash = gained ? Theme.affirm : Theme.refusal
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(220))
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { tokenScale = 1 }
            try? await Task.sleep(for: .milliseconds(600))
            withAnimation(.easeOut(duration: 0.5)) { tokenFlash = nil }
            try? await Task.sleep(for: .milliseconds(700))
            withAnimation(.easeOut(duration: 0.3)) { tokenDelta = nil }
        }
    }

    /// A token change from play, turned into a reward banner.
    private func celebrate(_ delta: GameSession.TokenDelta) {
        let amount = delta.amount > 0 ? "+\(delta.amount)" : "\(delta.amount)"
        switch delta.reason {
        case "capture" where delta.amount > 0:
            banners.show("CAPTURED!", subtitle: amount, color: GamePalette.sun)
        case "hit" where delta.amount > 0:
            banners.show("HIT!", subtitle: amount, color: GamePalette.mint)
        case "trivia" where delta.amount > 0:
            banners.show("CORRECT!", subtitle: amount, color: GamePalette.mint)
        case "hit_by":
            banners.show("OUCH!", subtitle: amount, color: GamePalette.berry, sound: .hit)
        default: break
        }
    }

    // MARK: - Top

    private var topBar: some View {
        HStack(alignment: .top) {
            tokenBlock
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 8) {
                statusCapsule
                HStack(spacing: 8) {
                    if showsCheckpointButton { checkpointButton }
                    askButton
                }
            }
        }
        .padding(.top, 8)
    }

    private var tokenBlock: some View {
        GameHUDPanel(padding: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .center, spacing: 8) {
                    GameCoin(size: 34)
                        .scaleEffect(tokenScale)
                    Text("\(session.tokens)")
                        .font(GameFont.display(44, relativeTo: .largeTitle))
                        .monospacedDigit()
                        .foregroundStyle(tokenFlash ?? .white)
                        .shadow(color: GamePalette.ink, radius: 0, x: 0, y: 3)
                        .shadow(color: .black.opacity(0.6), radius: 2)
                        .shadow(color: (tokenFlash ?? .clear).opacity(0.9), radius: 12)
                        // A counter that animates its digits reads as a score
                        // changing rather than as a number being replaced.
                        .contentTransition(.numericText(value: Double(session.tokens)))
                        .animation(.snappy(duration: 0.45), value: session.tokens)
                        .scaleEffect(tokenScale, anchor: .leading)
                    if let tokenDelta {
                        Text(tokenDelta > 0 ? "+\(tokenDelta)" : "\(tokenDelta)")
                            .font(GameFont.display(22))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(Capsule().fill(tokenDelta > 0 ? GamePalette.mint : GamePalette.berry))
                            .id(deltaID)
                            .transition(.asymmetric(
                                insertion: .move(edge: .bottom).combined(with: .opacity),
                                removal: .move(edge: .top).combined(with: .opacity)))
                    }
                }
                HStack(spacing: 5) {
                    Text("TOKENS")
                    if let faction = session.faction {
                        Text("·")
                        Text(faction.uppercased())
                            .foregroundStyle(myColour)
                    }
                }
                .font(GameFont.display(13, relativeTo: .caption))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.85))
            }
        }
        .fixedSize()
    }

    /// Connection and the sides in one capsule. Numbers alone make a player do
    /// arithmetic while walking; a bar answers "are we ahead" without any.
    private var statusCapsule: some View {
        let scores = session.factionScores
        let total = max(scores.reduce(0) { $0 + $1.tokens }, 1)
        return VStack(alignment: .trailing, spacing: 6) {
            if session.isConnected {
                GameChip(text: "Live", color: GamePalette.berry)
            } else {
                GameChip(text: "Reconnecting", color: Color(white: 0.4))
            }
            if scores.count >= 2 {
                // Tug of war: the sides push against each other on one bar.
                let a = scores[0], b = scores[1]
                let ca = Theme.faction(terms.factions.first { $0.name == a.faction }?.color)
                let cb = Theme.faction(terms.factions.first { $0.name == b.faction }?.color)
                let share = CGFloat(a.tokens) / CGFloat(max(a.tokens + b.tokens, 1))
                GameHUDPanel(padding: 8) {
                    HStack(spacing: 8) {
                        scoreNumber(a.tokens, colour: ca)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(cb)
                                Capsule().fill(ca)
                                    .frame(width: max(10, min(geo.size.width - 10,
                                                              geo.size.width * share)))
                                Capsule().fill(.white.opacity(0.25))
                                    .frame(height: 4).padding(.horizontal, 6)
                                    .offset(y: -3)
                            }
                            .overlay(Capsule().strokeBorder(.white.opacity(0.7), lineWidth: 2))
                        }
                        .frame(width: 96, height: 16)
                        .animation(.spring(response: 0.5, dampingFraction: 0.7), value: share)
                        scoreNumber(b.tokens, colour: cb)
                    }
                }
            } else if !scores.isEmpty {
                GameHUDPanel(padding: 8) {
                    HStack(spacing: 8) {
                        ForEach(scores, id: \.faction) { score in
                            let colour = Theme.faction(terms.factions.first { $0.name == score.faction }?.color)
                            scoreNumber(score.tokens, colour: colour)
                        }
                    }
                }
            }
        }
        .animation(.snappy, value: session.isConnected)
    }

    private func scoreNumber(_ value: Int, colour: Color) -> some View {
        Text("\(value)")
            .font(GameFont.display(20))
            .monospacedDigit()
            .foregroundStyle(.white)
            .shadow(color: GamePalette.edge(of: colour), radius: 0, x: 0, y: 2)
            .contentTransition(.numericText(value: Double(value)))
            .padding(.horizontal, 6)
            .background(Capsule().fill(colour.opacity(0.85)))
    }

    private var hudCapsule: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(GamePalette.navy.opacity(0.8))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(.white.opacity(0.2), lineWidth: 1.5))
            .shadow(color: .black.opacity(0.35), radius: 6, y: 3)
    }

    private func roundButton(_ symbol: String, tint: Color = GamePalette.navy,
                             label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
        }
        .buttonStyle(.gameIcon(tint, diameter: 44))
        .accessibilityLabel(label)
    }

    /// Only when this phone can read tags and the game has points a tag could
    /// name. A button that can only ever fail is worse than no button.
    private var showsCheckpointButton: Bool {
        Checkpoints.isAvailable && field.anchors.contains {
            ["capture_point", "weapon", "trivia", "totem"].contains($0.kind)
        }
    }

    /// Tapping a real tag on a real post. Worth more than it looks: the phone
    /// has to physically be a couple of centimetres from something the
    /// organiser placed, which no amount of spoofing a position gives you.
    private var checkpointButton: some View {
        roundButton("wave.3.right", tint: GamePalette.sunDeep, label: "Tap a checkpoint") {
            let before = checkpoints.lastError
            checkpoints.scan()
            watchNFC(ignoring: before)
        }
    }

    private var askButton: some View {
        roundButton("bubble.left.and.text.bubble.right.fill", tint: GamePalette.skyDeep, label: "Ask the game") {
            showWarden = true
        }
    }

    /// Checkpoints records its errors rather than announcing them, so watch
    /// for one while the reader sheet is up and surface it briefly.
    private func watchNFC(ignoring stale: String?) {
        Task { @MainActor in
            if let now = checkpoints.lastError, now != stale { showNFC(now); return }
            var sawClear = stale == nil
            for _ in 0..<150 {                      // about a minute
                try? await Task.sleep(for: .milliseconds(400))
                let current = checkpoints.lastError
                if current == nil { sawClear = true; continue }
                if let current, current != stale || sawClear {
                    showNFC(current)
                    return
                }
            }
        }
    }

    private func showNFC(_ text: String) {
        withAnimation(.snappy) { nfcNotice = text }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3.5))
            withAnimation(.easeOut) { if nfcNotice == text { nfcNotice = nil } }
        }
    }

    @ViewBuilder private var nfcBanner: some View {
        if let nfcNotice {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Theme.brass)
                Text(nfcNotice)
                    .font(GameFont.body(14, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(hudCapsule)
            .padding(.top, 70)
            .padding(.horizontal, 24)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    // MARK: - Feed

    /// Newest at the bottom, nearest the thumb. Each line lives about six
    /// seconds and fades out on its own; never more than three at once.
    private var feed: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            let now = context.date
            let live = session.feed
                .filter { now.timeIntervalSince($0.at) < Self.feedLifetime }
                .prefix(3)
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array(live.reversed())) { entry in
                    let age = now.timeIntervalSince(entry.at)
                    HStack(spacing: 6) {
                        Image(systemName: entry.isRefusal ? "xmark.octagon.fill" : "sparkle")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(entry.isRefusal ? Theme.refusal : Theme.brass)
                        Text(entry.text)
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(.black.opacity(0.42))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .strokeBorder((entry.isRefusal ? Theme.refusal : .white)
                                        .opacity(0.25), lineWidth: 0.5)))
                    .opacity(age > Self.feedLifetime - 1.5
                             ? max(0, (Self.feedLifetime - age) / 1.5) : 1)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .animation(.snappy, value: live.map(\.id))
        }
        .padding(.bottom, 14)
        .allowsHitTesting(false)
    }

    private static let feedLifetime: TimeInterval = 6

    // MARK: - The one action

    @ViewBuilder
    private var actionBar: some View {
        if session.state == "respawning" {
            EmptyView()
        } else if let target = currentTarget {
            fireButton(target)
        } else if let (placement, distance) = field.nearestActionable(to: cameraPosition),
                  let anchor = placement.anchor {
            anchorButton(anchor, distance: distance)
        } else {
            hint
        }
    }

    private func fireButton(_ target: Targeting.Target) -> some View {
        let armed = session.weapon != nil
        let pending = pendingShot != nil
        return VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "scope")
                Text(target.label)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(target.isPrecise
                     ? String(format: "%.1f m", target.distance)
                     : String(format: "~%.0f m", target.distance))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.white.opacity(0.8))
                // Said, not hidden. A GPS range is five metres wide and a
                // player who thinks it is exact will blame the game when a shot
                // at the edge is refused.
                Text(target.isPrecise ? "UWB" : "GPS")
                    .font(.system(size: 9, weight: .heavy))
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(Capsule().fill(target.isPrecise ? Theme.affirm.opacity(0.35)
                                                                : .white.opacity(0.15)))
            }
            .foregroundStyle(.white)
            .font(GameFont.body(15, weight: .semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(hudCapsule)

            Button {
                guard armed, !pending else { return }
                fire(at: target)
            } label: {
                HStack(spacing: 10) {
                    if pending {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: armed ? "scope" : "hand.raised.fill")
                            .font(.system(size: 22, weight: .heavy))
                    }
                    Text(pending ? "FIRING" : armed ? "FIRE!" : "Find a weapon first")
                }
                .opacity(pending ? 0.8 : 1)
            }
            .buttonStyle(.game(armed ? GamePalette.berry : Color(white: 0.5), size: .large))
            .frame(maxWidth: 300)
            .disabled(!armed || pending)
            .sensoryFeedback(.impact(weight: .heavy), trigger: pendingShot) { _, new in new != nil }
        }
        .animation(.snappy(duration: 0.2), value: pending)
    }

    /// Fire, and recover the button whatever happens. The outbox can queue a
    /// shot while offline, and a button stuck on "Firing" until the network
    /// returns is how a game looks jammed. Six seconds is the hard ceiling.
    private func fire(at target: Targeting.Target) {
        let shot = UUID()
        pendingShot = shot
        Task { @MainActor in
            await session.hit(target: target.id, range: target.distance)
            if pendingShot == shot { pendingShot = nil }
        }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(6))
            if pendingShot == shot { pendingShot = nil }
        }
    }

    private func anchorButton(_ anchor: GameAnchor, distance: Float) -> some View {
        Button { act(on: anchor) } label: {
            HStack(spacing: 10) {
                Image(systemName: symbol(for: anchor))
                    .font(.system(size: 20, weight: .heavy))
                Text(title(for: anchor))
                    .lineLimit(1)
            }
        }
        .buttonStyle(.game(anchorColour(anchor), size: .large))
        .frame(maxWidth: 340)
    }

    private func anchorColour(_ anchor: GameAnchor) -> Color {
        switch anchor.kind {
        case "trivia": GamePalette.skyDeep
        case "weapon": GamePalette.sunDeep
        case "capture_point": GamePalette.mint
        default: myColour
        }
    }

    /// One place where an anchor turns into an action, so a checkpoint tapped
    /// with the phone and a point walked up to do exactly the same thing.
    private func act(on anchor: GameAnchor) {
        switch anchor.kind {
        case "trivia": trivia = anchor
        case "weapon": Task { await session.pickUp(at: anchor) }
        default: Task { await session.capture(anchor: anchor.id) }
        }
    }

    private func title(for anchor: GameAnchor) -> String {
        switch anchor.kind {
        case "trivia": "Answer the question here"
        case "weapon": "Pick up the \(anchor.payload.name ?? anchor.asset)"
        case "capture_point":
            session.captures[anchor.id] == session.faction && session.faction != nil
                ? "Your side holds this point" : "Take this point"
        default: anchor.payload.label ?? "Use this"
        }
    }

    private func symbol(for anchor: GameAnchor) -> String {
        switch anchor.kind {
        case "trivia": "questionmark.bubble.fill"
        case "weapon": "shield.lefthalf.filled"
        case "capture_point": "flag.fill"
        default: "hand.tap.fill"
        }
    }

    // MARK: - Guidance

    private struct Lead {
        let symbol: String
        let text: String
        let distance: Double
        /// Degrees to turn, relative to where the phone points. Nil without a
        /// compass heading, when an arrow would lie.
        let turn: Double?
    }

    private var myCoordinate: CLLocationCoordinate2D? {
        field.location.coordinate ?? session.coordinate
    }

    private func lead(to lat: Double, _ lng: Double, from me: CLLocationCoordinate2D)
        -> (distance: Double, turn: Double?) {
        let distance = Targeting.haversine(me.latitude, me.longitude, lat, lng)
        guard field.location.trueNorth != nil else { return (distance, nil) }
        let bearing = Targeting.compassBearing(from: (me.latitude, me.longitude), to: (lat, lng))
        let turn = ((bearing - cameraHeading) + 540).truncatingRemainder(dividingBy: 360) - 180
        return (distance, turn)
    }

    /// The nearest thing worth walking to, from the field's own data. Unarmed:
    /// the nearest weapon. Armed: the nearest rival, else the nearest point
    /// your side does not hold.
    private var guidance: Lead? {
        guard let me = myCoordinate else { return nil }
        func nearest(_ kind: String, where keep: (GameAnchor) -> Bool = { _ in true }) -> (GameAnchor, Double, Double?)? {
            field.anchors
                .filter { $0.kind == kind && keep($0) }
                .map { a -> (GameAnchor, Double, Double?) in
                    let l = lead(to: a.lat, a.lng, from: me); return (a, l.distance, l.turn)
                }
                .min { $0.1 < $1.1 }
        }
        if session.held == nil {
            if let (a, d, t) = nearest("weapon") {
                return Lead(symbol: "shield.lefthalf.filled",
                            text: "\(a.payload.name?.capitalized ?? "Weapon") ahead",
                            distance: d, turn: t)
            }
        } else if let mine = session.playerID {
            let rival = session.map
                .filter { id, p in
                    id != mine && (p.state ?? "active") == "active"
                        && (session.faction == nil || p.faction != session.faction)
                }
                .map { id, p -> (String, Double, Double?) in
                    let l = lead(to: p.lat, p.lng, from: me); return (id, l.distance, l.turn)
                }
                .min { $0.1 < $1.1 }
            if let (id, d, t) = rival {
                return Lead(symbol: "scope",
                            text: session.handle(of: id) ?? "Rival",
                            distance: d, turn: t)
            }
        }
        if let (_, d, t) = nearest("capture_point", where: {
            session.faction == nil || session.captures[$0.id] != session.faction
        }) {
            return Lead(symbol: "flag.fill", text: "Point to take", distance: d, turn: t)
        }
        if let (_, d, t) = nearest("trivia") {
            return Lead(symbol: "questionmark.bubble.fill", text: "Question stop",
                        distance: d, turn: t)
        }
        return nil
    }

    /// What the player is carrying and where to go next. Shown when there is
    /// nothing to act on, which is when they have the attention to read it.
    private var hint: some View {
        VStack(spacing: 8) {
            if let held = session.held {
                HStack(spacing: 8) {
                    Image(systemName: "bolt.horizontal.fill")
                        .font(.caption)
                        .foregroundStyle(myColour)
                    Text(held.name.capitalized)
                        .font(GameFont.display(16))
                    if !held.abilities.isEmpty {
                        Text(held.abilities.joined(separator: " · "))
                            .font(.caption2)
                            .foregroundStyle(.white.opacity(0.75))
                            .lineLimit(1)
                    }
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(hudCapsule)
            }
            if let lead = guidance {
                HStack(spacing: 10) {
                    ZStack {
                        Circle().fill(.white.opacity(0.12))
                        if let turn = lead.turn {
                            Image(systemName: "location.north.fill")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(GamePalette.sun)
                                .rotationEffect(.degrees(turn))
                                .animation(.smooth(duration: 0.3), value: Int(turn))
                        } else {
                            Image(systemName: lead.symbol)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.brass)
                        }
                    }
                    .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(lead.text)
                            .font(GameFont.display(18))
                            .lineLimit(1)
                        Text(distanceText(lead.distance))
                            .font(GameFont.body(13, weight: .semibold).monospacedDigit())
                            .foregroundStyle(.white.opacity(0.75))
                    }
                }
                .foregroundStyle(.white)
                .padding(.leading, 8)
                .padding(.trailing, 16)
                .padding(.vertical, 7)
                .background(hudCapsule)
            } else if session.held == nil {
                Text("Look around for a weapon")
                    .font(GameFont.display(18))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .background(hudCapsule)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func distanceText(_ metres: Double) -> String {
        metres >= 1000 ? String(format: "%.1f km", metres / 1000)
                       : String(format: "%.0f m away", metres)
    }

    // MARK: - Downed

    private var downed: some View {
        ZStack {
            Rectangle().fill(.black.opacity(0.6)).ignoresSafeArea()
            RadialGradient(colors: [.clear, Theme.refusal.opacity(0.35)],
                           center: .center, startRadius: 120, endRadius: 520)
                .ignoresSafeArea()
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = session.respawnAvailableAt
                    .map { max(0, Int($0.timeIntervalSince(context.date).rounded(.up))) } ?? 0
                VStack(spacing: 14) {
                    Image(systemName: "heart.slash.fill")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(Theme.refusal)
                    GameTitle("YOU'RE DOWN", size: 44, outline: GamePalette.edge(of: GamePalette.berry))
                    if remaining > 0 {
                        Text(String(format: "Back in %d:%02d", remaining / 60, remaining % 60))
                            .font(GameFont.display(30))
                            .foregroundStyle(.white.opacity(0.95))
                            .contentTransition(.numericText(countsDown: true))
                            .animation(.snappy, value: remaining)
                    } else {
                        Text("Ready when you are")
                            .font(GameFont.display(20))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    Button {
                        guard !respawning else { return }
                        respawning = true
                        Task { @MainActor in
                            await session.respawn()
                            respawning = false
                        }
                        Task { @MainActor in
                            try? await Task.sleep(for: .seconds(6))
                            respawning = false
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if respawning { ProgressView().tint(.white) }
                            Text(remaining > 0 ? "Waiting" : "Come back")
                        }
                    }
                    .buttonStyle(.game(GamePalette.mint, size: .large))
                    .frame(width: 260)
                    .disabled(remaining > 0 || respawning)
                }
            }
        }
        .transition(.opacity)
    }

    /// What the model is told about right now. Assembled here because this is
    /// the one place that can see the game, the field and the player at once.
    private var wardenContext: Warden.Context {
        Warden.Context(
            title: terms.title,
            faction: session.faction,
            tokens: session.tokens,
            state: session.state,
            weapon: session.weapon,
            venue: terms.venue.map { String(format: "%.4f, %.4f", $0.lat, $0.lng) },
            nearby: field.nearestActionable(to: cameraPosition)
                .flatMap { $0.placement.anchor }
                .map { [title(for: $0)] } ?? [],
            // The last refusal, which is what a player is nearly always asking
            // about when they open this.
            lastRefusal: session.feed.first { $0.isRefusal }?.text,
            isOnline: session.isConnected)
    }

    // MARK: - Who is in front of the phone

    /// Shared with the reticle drawn in the world, so the thing under the
    /// crosshair is always the thing the button shoots.
    private var currentTarget: Targeting.Target? {
        Targeting.best(session: session, heading: cameraHeading)
    }
}

/// A button that gives under the thumb, like a physical one.
private struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/// One question, four choices, judged by the server.
///
/// The answer is not on the device. The payload the phone holds has the
/// question and the choices and nothing else, so this sheet cannot show a right
/// answer even if it wanted to; it sends the index and reports what came back.
private struct TriviaSheet: View {
    let anchor: GameAnchor
    let onAnswer: (Int) -> Void
    @Environment(\.dismiss) private var dismiss

    private static let choiceColours: [Color] = [
        GamePalette.skyDeep, GamePalette.berry, GamePalette.sunDeep, GamePalette.mint,
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                GameChip(text: "Question stop", color: GamePalette.skyDeep)
                Spacer()
                Button { dismiss() } label: { Image(systemName: "xmark") }
                    .buttonStyle(.gameIcon(GamePalette.berry, diameter: 40))
                    .accessibilityLabel("Close")
            }
            GameHUDPanel(padding: 16) {
                Text(anchor.payload.q ?? "")
                    .font(GameFont.display(24))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 8) {
                ForEach(Array((anchor.payload.choices ?? []).enumerated()), id: \.offset) { index, choice in
                    Button {
                        onAnswer(index)
                        dismiss()
                    } label: {
                        Text(choice)
                            .multilineTextAlignment(.center)
                    }
                    .buttonStyle(.game(Self.choiceColours[index % Self.choiceColours.count],
                                       size: .medium))
                }
            }
            Text("You get one answer.")
                .font(GameFont.body(14, weight: .semibold))
                .foregroundStyle(.white.opacity(0.7))
                .frame(maxWidth: .infinity)
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient(colors: [GamePalette.navy, GamePalette.navyEdge],
                                   startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .presentationDetents([.large])
        .presentationDragIndicator(.hidden)
        // Sits over the camera feed, so it is dark whatever the phone's
        // setting: light chrome disappears against a bright sky.
        .overCamera()
    }

}
