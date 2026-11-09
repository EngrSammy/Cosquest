import CoreLocation
import os
import SwiftUI

private let discoverLog = Logger(subsystem: "net.costquest", category: "discover")

/// Where the app opens: the world around you, with what is on standing in it.
///
/// Not a list of games. The previous version was a directory — a search field,
/// rows, a title — which is what you build when you think of this as a map
/// app. A player at a venue is not browsing; they are looking at where they
/// are. So the screen is the world, the games are objects in it, and the only
/// furniture is who you are and what is close.
///
/// Two controls, both at the bottom where a thumb is: what is around you, and
/// yourself. Everything else is in the world.
struct DiscoverView: View {
    let warden: Warden
    var onEnter: (GameSummary) -> Void

    @State private var location = PlayerLocation()
    @State private var games: [GameSummary] = []
    @State private var selected: GameSummary?
    @State private var loading = true
    /// Why the town has no games in it, when it has none.
    @State private var fetchError: TownNotice.Kind?
    @State private var retrying = false
    /// Games this player has already finished, from their wall. Drives which
    /// side of the path a node sits on: history behind, what is next ahead.
    @State private var playedIDs: Set<String> = []
    @State private var showProfile = false
    @State private var asking = false
    private let client = GameClient()


    var body: some View {
        // The rendered world, everywhere. This screen was swapped three
        // times, so what settled it is written down.
        //
        // The world shows roughly six hundred metres around the player, and
        // this app's venues sit kilometres apart, which looked at first like a
        // reason it could not work here. It is not: Pokémon GO's world shows
        // only your surroundings too, and anything further away is found in
        // the Nearby list, walked to, and only then appears around you. We
        // have that list already, behind the button bottom right.
        //
        // What actually broke it was COVERAGE. The tile archive on the server
        // covered fourteen kilometres of Lagos and the player was outside it,
        // so the world had nothing to draw and rendered a figure standing on
        // empty earth. Re-cut at thirty-five kilometres, that is ground.
        //
        // The camera is anchored to the player — orbit and dolly, never pan —
        // which is the other half of why this works without street names.
        worldLayer
            // Nothing until there is a world to put it on.
            //
            // The interface used to appear the instant this view did, over a
            // grey rectangle Unity was still starting behind: it read as the
            // app having loaded and the world having failed. Unity now says
            // when it has built and rendered, and the chrome waits for that.
            .overlay(alignment: .top) { topBar }
            .overlay(alignment: .bottom) { focused }
            .overlay(alignment: .center) { if loading { worldSplash } }
            .overlay(alignment: .center) {
                // Only once the splash has gone: between retries the splash is
                // still up, and a failure card flashing over it read as broken.
                if !loading, let fetchError {
                    TownNotice(kind: fetchError,
                               retrying: retrying,
                               onRetry: { Task { await retry() } })
                        .padding(.horizontal, 28)
                        .transition(.scale(scale: 0.94).combined(with: .opacity))
                }
            }
            .animation(.smooth(duration: 0.4), value: loading)
            .sheet(isPresented: $showProfile) { ProfileView() }
            .sheet(isPresented: $asking) {
                WardenView(warden: warden,
                           context: Warden.Context(title: selected?.title ?? "CostQuest",
                                                   isOnline: true))
            }
            .task {
                // Say we are here, and find out who else is. The hub is the
                // place you are when you are not at a venue, so idle is the
                // honest status for this screen.
                presence.status = "idle"
                presence.gameID = nil
                presence.start()
                location.start()
                // The wall says what has already been played. Failing to load
                // it is not worth an error: everything simply appears ahead of
                // you, which is the right default for a new player anyway.
                if let profile = try? await client.myProfile() {
                    playedIDs = Set(profile.wall.map(\.game_id))
                }
                await refresh()
            }
            .onChange(of: location.coordinate?.latitude) { _, _ in
                Task { await refresh() }
            }
    }

    private var centre: CLLocationCoordinate2D {
        if let s = selected {
            return CLLocationCoordinate2D(latitude: s.venue.lat, longitude: s.venue.lng)
        }
        return location.coordinate
            ?? games.first.map { CLLocationCoordinate2D(latitude: $0.venue.lat,
                                                        longitude: $0.venue.lng) }
            ?? CLLocationCoordinate2D(latitude: 6.4474, longitude: 3.4548)
    }



    /// The ground is cut around the PLAYER: it is what they are standing on.
    /// The ground the whole screen sits on: ours, either way.
    ///
    /// Two renderers of the same venue, from the same /v1/map/ground data.
    /// RealityKit is the default; Unity is reached with the "unity" default so
    /// the two can be held against each other WITH the real interface on top,
    /// rather than as a bare world with none of it.
    ///
    /// Everything above this line is unchanged between them. The profile chip,
    /// the nearby tray and the focus card belong to the app, not to whichever
    /// engine happens to be drawing the buildings.
    @ViewBuilder
    private var worldLayer: some View {
        // A drawn board, not a rendered world.
        //
        // Unity drew this screen until today, and every serious bug in this
        // app came from embedding it: a window that ate every tap, a callback
        // race that hid the interface behind a spinner, a runtime left paused,
        // a camera that slid back under your thumb, and two worlds drawn on
        // top of each other. It was also 488MB to render a lobby.
        //
        // None of those failures exist here, and the thing the reference lobby
        // does well, being READ rather than navigated, is what a fixed 2D
        // board gives you directly.
        //
        // The 3D work is not wasted: the venue still renders natively, which
        // is where a world earns its place and what Mark's spec asks for.
        LobbyView(games: games,
                  playedIDs: playedIDs,
                  crowd: crowd,
                  onPick: { g in
                      withAnimation(.smooth(duration: 0.3)) { selected = g }
                  })
    }

    /// How many people are at each game right now, by id.
    private var crowd: [String: Int] {
        Dictionary(grouping: presence.people.compactMap(\.game_id)) { $0 }
            .mapValues(\.count)
    }

    /// Who else is about. See Presence.
    private var presence: Presence { Presence.shared }

    /// What is on screen before the games are.
    ///
    /// Almost nothing on purpose, and it is over in a moment now: there is no
    /// engine to start, only a list to fetch.
    @ViewBuilder private var worldSplash: some View {
        ZStack {
            GameBackdrop()
            SplashTitle()
        }
        .ignoresSafeArea()
        .transition(.opacity)
        // A view at zero opacity still receives touches, and this one covers
        // the screen. Without this its fade-out silently ate every tap.
        .allowsHitTesting(false)
    }

    /// How far the player really is from where this game is played.
    ///
    /// Computed here rather than asked of the server, because the games list is
    /// deliberately fetched without a location now: every game should be
    /// visible in the town whether or not you are near it. But WHERE a game is
    /// remains the most important fact about it, since the town is a hub and
    /// the game happens at a real venue you have to physically reach.
    ///
    /// Nil until the phone has a fix, which is honest: "unknown" is different
    /// from "nearby" and the card says so.
    private func metresTo(_ g: GameSummary) -> Double? {
        guard let me = location.coordinate else { return nil }
        let here = CLLocation(latitude: me.latitude, longitude: me.longitude)
        let there = CLLocation(latitude: g.venue.lat, longitude: g.venue.lng)
        return here.distance(from: there)
    }

    /// Played games first, then the rest. The world splits the path on that
    /// boundary, so the order carries meaning rather than being cosmetic.
    private var orderedGames: [GameSummary] {
        let played = games.filter { playedIDs.contains($0.game_id) }
        let rest = games.filter { !playedIDs.contains($0.game_id) }
        return played + rest
    }

    private func placeName(for g: GameSummary) -> String? {
        TownSpots.place(for: g.game_id)
    }


    private static func marker(_ g: GameSummary) -> MapMarker {
        MapMarker(id: g.game_id,
                  coordinate: CLLocationCoordinate2D(latitude: g.venue.lat,
                                                     longitude: g.venue.lng),
                  title: g.title,
                  subtitle: g.status == "live" ? "Live now"
                                               : "\(g.players_joined) joined",
                  tint: UIColor(hex: g.factions.first?.color) ?? .systemYellow,
                  symbol: g.status == "live" ? "bolt.fill" : "flag.fill",
                  badge: g.status == "live" ? "LIVE" : g.startsIn,
                  isLive: g.status == "live")
    }

    // MARK: - Furniture

    private var topBar: some View {
        HStack {
            Button { showProfile = true } label: {
                YouBadge()
            }
            .buttonStyle(PressScale())
            .accessibilityLabel("You")

            if presence.here > 0 {
                HStack(spacing: 5) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(GamePalette.sun)
                    Text("\(presence.here)")
                        .font(GameFont.display(17).monospacedDigit())
                }
                .padding(.horizontal, 2)
                .modifier(HUDWrap())
                .padding(.leading, 8)
                .transition(.opacity)
            }

            Spacer()

            Button { asking = true } label: {
                Image(systemName: "sparkles")
            }
            .buttonStyle(.gameIcon(GamePalette.skyDeep, diameter: 46))
            .accessibilityLabel("Ask about the game")
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    /// The object the player tapped, opened just far enough to decide. Not a
    /// drawer of everything: one thing, because they pointed at one thing.
    @ViewBuilder private var focused: some View {
        if let g = selected {
            FocusCard(game: g,
                      place: placeName(for: g),
                      awayM: metresTo(g),
                      onEnter: { onEnter(g) },
                      onDismiss: { withAnimation(.smooth(duration: 0.25)) {
                          selected = nil
                      } })
                .padding(.horizontal, 14)
                .padding(.bottom, 20)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // MARK: - Data

    private static func object(_ g: GameSummary) -> MapMarker {
        MapMarker(id: g.game_id,
                  coordinate: CLLocationCoordinate2D(latitude: g.venue.lat,
                                                     longitude: g.venue.lng),
                  title: g.title,
                  subtitle: g.status == "live" ? "Live now"
                                               : "\(g.players_joined) joined",
                  tint: UIColor(hex: g.factions.first?.color) ?? .systemYellow,
                  symbol: g.status == "live" ? "bolt.fill" : "flag.fill",
                  badge: g.status == "live" ? "LIVE" : g.startsIn,
                  isLive: g.status == "live")
    }

    private func refresh() async {
        // No location filter.
        //
        // The world is an authored town now, and games stand at its landmarks,
        // so "near me" has stopped meaning anything: filtering by a player's
        // real position just produced an empty town for anyone who happened to
        // be far from a venue. Every game is reachable because every game is
        // somewhere in this town.
        // Three attempts, backing off.
        //
        // Not defensive padding: two of the last three launches came up with
        // no games and the one between them found six, from the same device
        // against the same server. Whatever the cause (the app asks during
        // launch, while Unity is loading a hundred megabytes of world and the
        // radio is busy), one failed request should not leave the town looking
        // abandoned for the whole session.
        for attempt in 1...3 {
            do {
                let found = try await client.gamesNearby(lat: nil, lng: nil)
                games = found
                if let sel = selected {
                    selected = found.first { $0.game_id == sel.game_id }
                }
                withAnimation(.smooth(duration: 0.3)) {
                    fetchError = found.isEmpty ? .empty : nil
                }
                loading = false
                discoverLog.info("games fetched: \(found.count) (attempt \(attempt))")
                return
            } catch {
                // Was `try?`, which made a failed request and an empty world
                // look identical: the town came up with nothing in it, the log
                // said "placed 0 game anchors", and there was no way to tell
                // which had happened.
                discoverLog.error("games fetch failed (attempt \(attempt)): \(String(describing: error))")
                if attempt == 3, games.isEmpty {
                    withAnimation(.smooth(duration: 0.3)) { fetchError = .unreachable }
                }
                if attempt < 3 {
                    try? await Task.sleep(for: .seconds(Double(attempt) * 1.5))
                }
            }
        }
        loading = false
    }

    /// The notice's Retry. Keeps the card up with a spinner in its button
    /// rather than dropping back to the full splash.
    private func retry() async {
        retrying = true
        defer { retrying = false }
        await refresh()
    }
}

// MARK: - Empty and error states

/// What the town says when it has nothing to show: a designed card with a
/// way forward, not a bare pill.
struct TownNotice: View {
    enum Kind { case empty, unreachable }
    let kind: Kind
    var retrying = false
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(GamePalette.sun)
                    .frame(width: 64, height: 64)
                    .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 4))
                    .shadow(color: GamePalette.sunDeep, radius: 0, y: 4)
                Image(systemName: kind == .empty ? "flag.2.crossed.fill" : "wifi.exclamationmark")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(.white)
            }
            VStack(spacing: 6) {
                Text(kind == .empty ? "No games on right now" : "Can't reach the games")
                    .font(GameFont.display(24))
                Text(kind == .empty
                     ? "New games appear here as organisers open them. Check back soon."
                     : "Check your connection and try again.")
                    .font(GameFont.body(15))
                    .foregroundStyle(GamePalette.ink.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button(action: onRetry) {
                HStack(spacing: 8) {
                    if retrying { ProgressView().controlSize(.small).tint(.white) }
                    Text(kind == .empty ? "Refresh" : "Try again")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.game(GamePalette.mint))
            .disabled(retrying)
        }
        .frame(maxWidth: .infinity)
        .modifier(PanelWrap(padding: 22))
        .frame(maxWidth: 360)
    }
}

// MARK: - The focused object

/// One game, opened out. Reads as a card on the world rather than a sheet over
/// it, so the player keeps their place.
private struct FocusCard: View {
    let game: GameSummary
    /// Which of the town's landmarks this game stands at. Kept for callers;
    /// no longer shown, since it read as a real address.
    let place: String?
    /// Metres from the player to the REAL venue, or nil before a fix.
    let awayM: Double?
    let onEnter: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        GamePanel(padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            if game.status == "live" { GameChip(text: "Live") }
                            Text(game.title)
                                .font(GameFont.display(26))
                                .foregroundStyle(GamePalette.ink)
                                .lineLimit(2)
                                .minimumScaleFactor(0.7)
                        }
                        Text(subtitle)
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.6))
                    }
                    Spacer()
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.gameIcon(GamePalette.berry, diameter: 38))
                    .accessibilityLabel("Close")
                }

                HStack(spacing: 10) {
                    HStack(spacing: 6) {
                        GameCoin(size: 28)
                        Text(game.entry_fee_cents == 0 ? "FREE"
                             : Money.text(game.entry_fee_cents, game.currency))
                            .font(GameFont.display(20))
                    }
                    if game.pot_cents > 0 {
                        HStack(spacing: 6) {
                            Image(systemName: "trophy.fill")
                                .foregroundStyle(GamePalette.sunDeep)
                            Text(Money.text(game.pot_cents, game.currency))
                                .font(GameFont.display(20))
                        }
                    }
                    Spacer()
                }
                .foregroundStyle(GamePalette.ink)

                HStack(spacing: 8) {
                    ForEach(game.factions, id: \.name) { f in
                        HStack(spacing: 5) {
                            Circle().fill(Theme.faction(f.color))
                                .frame(width: 12, height: 12)
                                .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 2))
                            Text(f.name.capitalized).font(GameFont.display(15))
                            Text("\(f.players)").font(GameFont.body(13, weight: .bold))
                                .foregroundStyle(GamePalette.ink.opacity(0.55))
                        }
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Capsule().fill(Theme.faction(f.color).opacity(0.18))
                            .overlay(Capsule().strokeBorder(Theme.faction(f.color), lineWidth: 2)))
                    }
                    Spacer()
                }

                Button(action: onEnter) {
                    HStack(spacing: 10) {
                        Image(systemName: "play.fill")
                        Text(game.status == "live" ? "JOIN NOW" : "PLAY")
                    }
                }
                .buttonStyle(.game(game.status == "live" ? GamePalette.mint : GamePalette.sun))
                // A game with no built environment has nothing to render, and
                // paying into it is the worst moment to discover that.
                .disabled(!game.environment_ready)

                Group {
                    if !game.environment_ready {
                        Text("The organiser is still building this one.")
                            .foregroundStyle(GamePalette.ink.opacity(0.6))
                    } else if let awayM, awayM > Double(game.venue.radius_m) {
                        // Says the quiet part out loud: the game is played on
                        // foot at a real venue, so say so before money moves.
                        Label(awayM < 1000
                              ? "Played on foot at the venue, \(Int(awayM.rounded())) m from here"
                              : String(format: "Played on foot at the venue, %.1f km from here",
                                       awayM / 1000),
                              systemImage: "figure.walk")
                            .foregroundStyle(GamePalette.ink.opacity(0.6))
                    } else if awayM != nil {
                        Label("You are at the venue", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(GamePalette.mint)
                    }
                }
                .font(GameFont.body(13, weight: .semibold))
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
            .strokeBorder(GamePalette.ink, lineWidth: 3)
            .padding(.bottom, 6))
    }

    private var subtitle: String {
        var bits: [String] = []
        // Distance is back, and it is the most important line on this card.
        //
        // I removed it when the world became an authored town, on the grounds
        // that "400 m away" is not true of a place you are not standing in.
        // That was right about the town and wrong about the GAME: the town is
        // a hub, and the game is played at a real venue you have to physically
        // get to. How far that is, is the first thing a player needs.
        if let awayM {
            bits.append(awayM < 1000
                        ? "\(Int(awayM.rounded())) m away"
                        : String(format: "%.1f km away", awayM / 1000))
        } else {
            bits.append("Distance unknown")
        }
        bits.append(game.entry_fee_cents == 0 ? "Free"
                    : Money.text(game.entry_fee_cents, game.currency))
        if game.pot_cents > 0 {
            bits.append("Pot \(Money.text(game.pot_cents, game.currency))")
        }
        return bits.joined(separator: "  ·  ")
    }
}

// MARK: - Game-style helpers (lobby only)

/// The first-load title moment: the game's name bouncing in over the sky.
private struct SplashTitle: View {
    @State private var shown = false
    @State private var bob = false

    var body: some View {
        VStack(spacing: 22) {
            GameTitle("CosQuest", size: 62, fill: GamePalette.sun)
                .scaleEffect(shown ? 1 : 0.2)
                .rotationEffect(.degrees(shown ? -4 : -20))
                .offset(y: bob ? -6 : 6)
            HStack(spacing: 10) {
                ProgressView().tint(.white)
                Text("Finding games...").font(GameFont.display(18))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(Capsule().fill(GamePalette.navy.opacity(0.8))
                .overlay(Capsule().strokeBorder(.white.opacity(0.4), lineWidth: 2)))
            .opacity(shown ? 1 : 0)
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.5)) { shown = true }
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true).delay(0.5)) {
                bob = true
            }
            GameSound.shared.play(.whoosh)
        }
    }
}

/// The player's own badge, top left: a round avatar in a thick ring with a
/// name plate, like a game HUD rather than a nav button.
private struct YouBadge: View {
    var body: some View {
        HStack(spacing: -10) {
            ZStack {
                Circle().fill(GamePalette.edge(of: GamePalette.sun)).offset(y: 3)
                Circle().fill(GamePalette.sun)
                    .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 3))
                Image(systemName: "person.fill")
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.3), radius: 0, y: 1.5)
            }
            .frame(width: 46, height: 46)
            .zIndex(1)
            Text("YOU")
                .font(GameFont.display(17))
                .foregroundStyle(.white)
                .padding(.leading, 16).padding(.trailing, 12).padding(.vertical, 6)
                .background(Capsule().fill(GamePalette.navy)
                    .overlay(Capsule().strokeBorder(.white.opacity(0.35), lineWidth: 2)))
        }
    }
}

private struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, down in
                if down { GameSound.shared.play(.tap) }
            }
    }
}

private struct HUDWrap: ViewModifier {
    func body(content: Content) -> some View {
        GameHUDPanel(padding: 8) { content }
    }
}

private struct PanelWrap: ViewModifier {
    var padding: CGFloat
    func body(content: Content) -> some View {
        GamePanel(padding: padding) { content }
    }
}
