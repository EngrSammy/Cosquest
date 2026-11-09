import CoreLocation
import SwiftUI
import UIKit

/// Where a player spends a game.
///
/// The organiser's points, the other players, the venue boundary and your own
/// standing, on one surface you can read while walking. Augmented reality is
/// reached FROM here, for a point you have arrived at or an opponent who has
/// closed on you, and returns here when that moment is over.
///
/// The camera used to be the whole game, which could not work: continuous
/// ARKit beside GPS, ultra wideband, a peer mesh and a language model throttles
/// a phone inside one session, and a player cannot see an opponent across a
/// 250 m venue through a viewfinder. The map is what makes the game legible;
/// AR is what makes a moment of it feel real.
struct FieldMapView: View {
    let session: GameSession
    let terms: GameTerms
    let warden: Warden

    @State private var anchors: [GameAnchor] = []
    @State private var engaging: GameAnchor?
    @State private var showField = false
    /// Who else is in this game. The one surface that makes a session
    /// feel like other people are in it rather than a scoreboard.
    @State private var showRoster = false
    @State private var loadFailed = false
    private let client = GameClient()

    /// How close you must be to act on one of the organiser's points. The
    /// server is the judge either way; this only decides when the button stops
    /// being greyed out, so it is deliberately a little looser than the
    /// server's own check to avoid a button that refuses what the server would
    /// have allowed.
    private let reachM: Double = 25

    private var me: CLLocationCoordinate2D? { session.coordinate }

    var body: some View {
        ZStack(alignment: .bottom) {
            // The SAME town the player just chose this game from.
            //
            // Discovery and play used to be two different worlds: you tapped a
            // beacon standing in an authored town and arrived in a rendering of
            // the organiser's real venue, which looked nothing like it. Now
            // entering a game moves the camera ACROSS the town to that game's
            // landmark. The runtime is never restarted and the world never
            // rebuilt, so it reads as travelling rather than as a cut.
            //
            // The organiser's points come with it, as offsets from their venue
            // centre rather than coordinates, so the arrangement they authored
            // survives being relocated.
            #if NO_UNITY
            WorldView(centre: venueCentre,
                      radiusM: min(Double(terms.venue?.radius_m ?? 250), 400) * 1.6)
                .ignoresSafeArea()
            #else
            UnityWorldView(
                latitude: venueCentre.latitude,
                longitude: venueCentre.longitude,
                radiusM: min(Double(terms.venue?.radius_m ?? 250), 400) * 1.6,
                hour: Double(Calendar.current.component(.hour, from: Date())),
                anchors: [],
                onSelect: nil,
                focusSpot: TownSpots.spot(for: terms.game_id),
                checkpoints: anchors.map(checkpoint),
                onCheckpoint: { id in
                    engaging = anchors.first { $0.id == id }
                })
                .ignoresSafeArea()
                // Nothing else paused Unity, so its render loop ran on behind
                // the camera, the Warden and the map for the rest of the day.
                .onAppear { UnityBridge.shared.pause(false) }
                .onDisappear { UnityBridge.shared.pause(true) }
            #endif

            VStack(spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                    FieldStatusBar(session: session, terms: terms)
                    rosterButton
                }
                Spacer()
                if let encounter = nearestEncounter {
                    EncounterBar(distance: encounter.distance) { showField = true }
                } else if let a = engaging {
                    AnchorCard(anchor: a,
                               distance: distance(to: a),
                               reachM: reachM,
                               onEngage: { showField = true },
                               onDismiss: { engaging = nil })
                }
            }
            .padding(14)
            .animation(.smooth(duration: 0.25), value: engaging?.id)
            .animation(.smooth(duration: 0.25), value: nearestEncounter?.id)
        }
        .task {
            // A game with no anchors is scenery rather than an error: a
            // free-for-all has no points at all.
            do { anchors = try await client.anchors(gameID: terms.game_id) }
            catch { loadFailed = true }
        }
        // The camera is presented, not navigated to, and it is torn down on
        // dismissal. That is the whole thermal argument in one modifier.
        .fullScreenCover(isPresented: $showField) {
            ARGameView(session: session, terms: terms, warden: warden)
        }
        .sheet(isPresented: $showRoster) {
            RosterView(session: session, terms: terms)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    /// How many people are in here, and a way to see who.
    ///
    /// The count is the point as much as the list is: a game with eleven
    /// players in it should say so on the screen you spend the session
    /// looking at, not only when you go looking.
    private var rosterButton: some View {
        Button { showRoster = true } label: {
            Image(systemName: "person.2.fill")
        }
        .buttonStyle(.gameIcon(GamePalette.skyDeep, diameter: 52))
        .overlay(alignment: .topTrailing) {
            Text("\(session.players.count)")
                .font(GameFont.display(13))
                .foregroundStyle(.white)
                .padding(.horizontal, 6).padding(.vertical, 1)
                .background(Capsule().fill(GamePalette.berry)
                    .overlay(Capsule().strokeBorder(.white, lineWidth: 1.5)))
                .offset(x: 6, y: -4)
                .allowsHitTesting(false)
        }
        .accessibilityLabel("Who is playing")
    }

    #if !NO_UNITY
    /// One of the organiser's points, as an offset from their venue centre.
    ///
    /// Sent as metres rather than coordinates because the town is not where the
    /// venue is. The RELATIVE layout is what the organiser actually authored,
    /// and it is the part worth preserving.
    private func checkpoint(_ a: GameAnchor) -> UnityWorldView.Checkpoint {
        let c = venueCentre
        let dx = (a.lng - c.longitude) * 111_320 * cos(c.latitude * .pi / 180)
        let dz = (a.lat - c.latitude) * 111_320
        return UnityWorldView.Checkpoint(
            id: a.id,
            kind: a.kind,
            dx: dx,
            dz: dz,
            colour: terms.factions.first { $0.name == a.faction }?.color,
            taken: session.captures[a.id] != nil)
    }
    #endif

    private var venueCentre: CLLocationCoordinate2D {
        terms.venue.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
            ?? CLLocationCoordinate2D(latitude: 0, longitude: 0)
    }

    /// Where the player is standing, in metres east and north of the venue
    /// centre. The world is cut around the VENUE rather than the player: a
    /// venue does not move, and re-cutting the ground every time someone takes
    /// a step would be a download per step.
    private var playerOffset: SIMD2<Float> {
        guard let me else { return .zero }
        let c = venueCentre
        let x = (me.longitude - c.longitude) * 111_320
            * cos(c.latitude * .pi / 180)
        let z = (me.latitude - c.latitude) * 111_320
        return SIMD2<Float>(Float(x), Float(z))
    }

    /// The organiser's points and the other players, standing in the world.
    ///
    /// Decoration is left off deliberately: it is scenery for the AR layer,
    /// and putting it here would bury the handful of objects that can be acted
    /// on.
    private var sceneObjects: [SceneObject] {
        let c = venueCentre
        func offset(_ lat: Double, _ lng: Double) -> SIMD2<Float> {
            SIMD2<Float>(Float((lng - c.longitude) * 111_320
                               * cos(c.latitude * .pi / 180)),
                         Float((lat - c.latitude) * 111_320))
        }
        let points = anchors.filter { $0.kind != "decoration" }.map {
            SceneObject(id: $0.id,
                        offset: offset($0.lat, $0.lng),
                        tint: Self.tint(for: $0.kind),
                        // What you can reach glows, so a player crossing a
                        // venue can see which objective has come into range
                        // without reading anything.
                        isLive: (distance(to: $0) ?? .infinity) <= reachM)
        }
        // Other players are NOT drawn. Where a person is standing is game
        // state rather than environment, and a world that plots real people
        // reads as surveillance. It comes back when there is a reason for it
        // and a decision about who may see whom.
        return points
    }

    /// An opponent the server has told us about. The server decides what an
    /// encounter is, including the fifteen metres and the debounce, so this
    /// reads its answer rather than measuring its own.
    private var nearestEncounter: (id: String, distance: Double)? {
        session.bearings
            .filter { $0.value.isFresh }
            .min { $0.value.distance < $1.value.distance }
            .map { ($0.key, $0.value.distance) }
    }

    private func distance(to a: GameAnchor) -> Double? {
        guard let me else { return nil }
        return CLLocation(latitude: me.latitude, longitude: me.longitude)
            .distance(from: CLLocation(latitude: a.lat, longitude: a.lng))
    }

    private func factionTint(_ name: String?) -> UIColor {
        guard let name, let f = terms.factions.first(where: { $0.name == name })
        else { return .lightGray }
        return UIColor(hex: f.color) ?? .lightGray
    }

    static func label(for kind: String) -> String {
        switch kind {
        case "trivia": "Question"
        case "weapon": "Weapon"
        case "capture_point": "Capture point"
        case "totem": "Totem"
        default: kind.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    /// One colour per kind, and none of them a faction colour: a player has to
    /// be able to tell an objective from an opponent at a glance.
    static func tint(for kind: String) -> UIColor {
        switch kind {
        case "trivia": UIColor(red: 0.85, green: 0.72, blue: 0.30, alpha: 1)
        case "weapon": UIColor(red: 0.55, green: 0.80, blue: 0.95, alpha: 1)
        case "capture_point": UIColor(red: 0.60, green: 0.90, blue: 0.60, alpha: 1)
        default: .white
        }
    }
}

/// The prompt to raise the phone. The only thing on this screen that asks a
/// player to stop reading the map.
private struct EncounterBar: View {
    let distance: Double
    let onRaise: () -> Void

    var body: some View {
        GamePanel(face: GamePalette.navy, padding: 14) {
            HStack(spacing: 12) {
                Image(systemName: "dot.radiowaves.left.and.right")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(GamePalette.berry)
                        .overlay(Circle().strokeBorder(.white.opacity(0.6), lineWidth: 2)))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Opponent \(Int(distance)) m away")
                        .font(GameFont.display(19))
                    Text("Raise your phone to lock on")
                        .font(GameFont.body(13, weight: .semibold)).opacity(0.75)
                }
                .foregroundStyle(.white)
                Spacer(minLength: 4)
                Button("Engage", action: onRaise)
                    .buttonStyle(.game(GamePalette.berry, size: .small, fullWidth: false))
            }
        }
    }
}

/// One of the organiser's points, tapped on the map.
private struct AnchorCard: View {
    let anchor: GameAnchor
    let distance: Double?
    let reachM: Double
    let onEngage: () -> Void
    let onDismiss: () -> Void

    private var inReach: Bool { (distance ?? .infinity) <= reachM }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(anchor.payload.name ?? FieldMapView.label(for: anchor.kind))
                    .font(GameFont.display(22))
                Spacer()
                Button {
                    onDismiss()
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.gameIcon(GamePalette.berry, diameter: 34))
                .accessibilityLabel("Close")
            }

            if let q = anchor.payload.q, anchor.kind == "trivia" {
                // The question, but never the answer: the payload a player
                // receives is allow-listed server side for exactly this reason.
                Text(q).font(GameFont.body(16, weight: .semibold)).opacity(0.8)
            }

            HStack(spacing: 6) {
                Image(systemName: inReach ? "figure.stand" : "figure.walk")
                Text(distance.map { inReach ? "You are here"
                                            : "\(Int($0)) m away" } ?? "Finding you…")
            }
            .font(GameFont.display(14))
            .foregroundStyle(.white)
            .padding(.horizontal, 12).padding(.vertical, 5)
            .background(Capsule().fill(inReach ? GamePalette.mint : GamePalette.skyDeep))

            Button(action: onEngage) {
                Text(inReach ? "Open" : "Walk closer")
            }
            .buttonStyle(.game(GamePalette.sun, size: .medium))
            .disabled(!inReach)
        }
        .padding(0)
        .modifier(AnchorPanel())
    }
}


/// Wraps the anchor card in a raised game panel.
private struct AnchorPanel: ViewModifier {
    func body(content: Content) -> some View {
        GamePanel(padding: 16) { content }
    }
}

/// What a player needs to know while walking: their side, their score, whether
/// the server is still hearing them.
///
/// Not GameHUD. That one belongs to the camera and needs the field model and
/// the AR camera's position to place a reticle; this one has to be readable at
/// arm's length in daylight with nothing behind it but a map.
private struct FieldStatusBar: View {
    let session: GameSession
    let terms: GameTerms

    private var myColour: Color {
        Theme.faction(terms.factions.first { $0.name == session.faction }?.color)
    }

    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(myColour)
                .overlay(Circle().strokeBorder(.white, lineWidth: 2.5))
                .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text((session.faction ?? terms.title).capitalized)
                    .font(GameFont.display(19))
                    .lineLimit(1).minimumScaleFactor(0.7)
                GameChip(text: stateLine,
                         color: stateLine == "In play" ? GamePalette.mint : GamePalette.berry)
                    .scaleEffect(0.85, anchor: .leading)
            }
            Spacer(minLength: 4)
            HStack(spacing: 6) {
                GameCoin(size: 26)
                Text("\(session.tokens)").font(GameFont.display(26))
            }
            // A dropped socket is the difference between a quiet game and a
            // broken one, and it is invisible unless it is said.
            if !session.isConnected {
                Image(systemName: "wifi.exclamationmark")
                    .foregroundStyle(.orange)
                    .accessibilityLabel("Reconnecting")
            }
        }
        .padding(.horizontal, 2)
        .modifier(StatusPanel())
    }

    private struct StatusPanel: ViewModifier {
        func body(content: Content) -> some View {
            GameHUDPanel(padding: 12) { content }
        }
    }

    private var stateLine: String {
        switch session.state {
        case "downed": "Downed: respawn to rejoin"
        case "respawning": "Respawning"
        case "eliminated": "Eliminated"
        default: session.gameStatus == "finished" ? "Game over" : "In play"
        }
    }
}
