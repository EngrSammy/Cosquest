// [merged-app] Copied from costquest-ios by scripts/sync-game-from-ios.sh,
// with the @main App struct and its delegate removed: the CosQuest app is
// the app now, and modules/costquest-game/ios/Embed hosts AppRoot.
import CoreLocation
import SwiftUI
import UIKit

/// Three states, and the whole app is the move between them: a map of what is
/// on, the terms of one game, and the field.
///
/// The map is the home. It replaced a screen that could only be reached by
/// typing a code an organiser handed out, which was a demo path rather than a
/// product, and it is also where a player spends almost all of a session.
///
/// The camera is a PLACE YOU GO, not the app. That is not a preference:
/// continuous ARKit beside the camera, GPS, ultra wideband, a peer mesh and a
/// language model will throttle a phone inside one session, Apple's
/// geo-anchoring has imagery only for streets a car can drive down, and a
/// player cannot see an opponent two hundred metres away through a viewfinder.
/// So the field opens for an encounter or a point and closes again.
struct AppRoot: View {
    @State private var playing: Playing?
    /// The on-device model is fetched and loaded once, at the top, and handed
    /// down. Deferred until the assistant is first wanted, see below.
    @State private var models = ModelStore()
    @State private var warden = Warden()
    /// The always-on game, and the home screen. Made once, here, so leaving
    /// an event returns to a map that is already standing.
    @State private var roam = RoamStore()
    /// The Coins sheet opened from the top of the app (debug launches).
    @State private var coinsSheet = false
    /// Whether the scheduled events are showing instead of the world.
    @State private var showEvents = UserDefaults.standard.bool(forKey: "events")

    struct Playing {
        let session: GameSession
        let terms: GameTerms
    }

    /// The game chosen on the map, before its terms have been accepted.
    @State private var chosen: String?

    /// Whether the player has reached the venue. Joining a game does not
    /// put them there, and the app used to behave as though it did.
    @State private var arrived = false

    /// Set once the player has backed out of a game opened from the launch
    /// argument, so the lobby is reachable rather than the same terms again.
    @State private var leftLaunchGame = false

    /// Set when the chosen game is a Room: the side is the Roam faction.
    @State private var roomSide: [String] = []

    var body: some View {
        Group {
            if let inPlay = playing {
                // Two states, not one. The outpost is where players gather and
                // the game is played on foot at a real venue, so between
                // joining and playing there is a JOURNEY. Dropping someone
                // straight onto a field map for a venue five kilometres away
                // gave them a screen where nothing was in reach and nothing
                // said why.
                //
                // The field map is the game, not the camera: ARGameView is
                // presented from it for a point reached or an opponent closed
                // on, and torn down after.
                // "settled" is what the server broadcasts once the payout has
                // been written, after "finished". It is the same moment for
                // the player, and missing it dropped them back into the camera.
                if inPlay.session.isOver {
                    // The game resolving is the moment a player paid for. It
                    // used to pass in silence: the session stopped being live,
                    // the field map carried on showing a field nobody was
                    // playing on, and any winnings surfaced later only if
                    // someone opened their profile.
                    ResultsView(session: inPlay.session, terms: inPlay.terms) {
                        backToLobby()
                    }
                    .transition(.opacity)
                } else if arrived {
                    // The camera, not a map. Entering an augmented reality game
                    // and being handed a top-down plan was the single most
                    // surprising thing in this app. The map is a sheet away.
                    PlayView(session: inPlay.session, terms: inPlay.terms,
                             warden: warden, onLeave: { backToLobby() })
                        .transition(.opacity)
                } else {
                    TravelView(session: inPlay.session, terms: inPlay.terms,
                               onArrived: {
                                   withAnimation(.smooth(duration: 0.45)) { arrived = true }
                                   Presence.shared.status = "playing"
                               },
                               onLeave: { backToLobby() })
                        .transition(.opacity)
                }
            } else if UserDefaults.standard.bool(forKey: "world") {
                // The rendered venue on its own, so it can be looked at and
                // measured before it is wired into the game.
                WorldView(centre: CLLocationCoordinate2D(
                              latitude: UserDefaults.standard.double(forKey: "worldLat"),
                              longitude: UserDefaults.standard.double(forKey: "worldLng")),
                          radiusM: 400)
            } else if UserDefaults.standard.bool(forKey: "devHarness") {
                PackHarnessView()
            } else if chosen != nil
                        || (!leftLaunchGame
                            && UserDefaults.standard.string(forKey: "gameID") != nil) {
                EntryView(warden: warden, preselected: chosen,
                          onBack: { backToLobby() },
                          presetSide: roomSide,
                          // The player's own name, not the phone's: iOS
                          // reports every phone as "iPhone" to apps now.
                          presetHandle: roomSide.isEmpty
                              ? (roam.profile?.handle ?? roam.me?.handle)
                              : roam.playerName) { session, terms in
                    playing = Playing(session: session, terms: terms)
                }
                .transition(.opacity)
            } else if showEvents {
                DiscoverView(warden: warden) { game in chosen = game.game_id }
                    .overlay(alignment: .bottomLeading) {
                        Button {
                            withAnimation(.smooth(duration: 0.35)) { showEvents = false }
                        } label: {
                            Label("World", systemImage: "globe.europe.africa.fill")
                        }
                        .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
                        .padding(.leading, 16)
                        .padding(.bottom, 24)
                    }
                    .transition(.opacity)
            } else {
                RoamHomeView(store: roam, warden: warden, onEvents: {
                    withAnimation(.smooth(duration: 0.35)) { showEvents = true }
                }, onRoom: { gameID in
                    roomSide = [roam.me?.faction, roam.me?.faction_name].compactMap { $0 }
                    chosen = gameID
                })
                .transition(.opacity)
            }
        }
        .task {
            roam.start()
            #if DEBUG
            // -coinsSheet 1 (or -coinsDemo sheet|moment): the Coins sheet on
            // launch, over the home screen.
            if UserDefaults.standard.bool(forKey: "coinsSheet")
                || ["sheet", "moment"].contains(UserDefaults.standard.string(forKey: "coinsDemo") ?? "") {
                try? await Task.sleep(for: .seconds(2))
                coinsSheet = true
            }
            #endif
        }
        // Back from Stripe's checkout: cosquest://coins?order=…&result=…
        .onOpenURL { url in Task { await CoinsModel.shared.handle(url, store: roam) } }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task { await CoinsModel.shared.refresh(roam) }
        }
        // [merged-app] Driven by the CosQuest app around it (Embed/GameHost).
        // An invite opens on the world home; a game in progress is not left.
        .modifier(GameHostHooks(roam: roam) {
            if playing == nil { chosen = nil; showEvents = false }
        })
        .sheet(isPresented: $coinsSheet) { CoinsSheet(store: roam) }
        .animation(.smooth(duration: 0.35), value: playing == nil)
        .animation(.smooth(duration: 0.45), value: arrived)
        // The player's choice, applied once at the root. Nil means "follow the
        // system", which is why this is not a Bool.
        .preferredColorScheme(Preferences.shared.appearance.colorScheme)
        .animation(.smooth(duration: 0.25), value: chosen)
        // The model is prepared on demand, not at launch: loading ~300 MB
        // beside ARKit and Unity is a memory risk on the field, and most of a
        // session never touches the assistant. The first question (or the
        // assistant sheet calling `warden.requestModel()`) starts it, off the
        // main thread; the rulebook answers until it is ready.
        .onChange(of: warden.requests) { _, _ in
            guard warden.wantsModel else { return }
            switch models.phase {
            case .ready(let model, let tokenizer): warden.load(modelPath: model, tokenizerPath: tokenizer)
            case .downloading, .checking, .verifying: break
            default: models.prepare(wifiOnly: warden.wifiOnly)
            }
        }
        .onChange(of: warden.wantsModel) { _, wants in
            guard wants else { return }
            if case .ready(let model, let tokenizer) = models.phase {
                warden.load(modelPath: model, tokenizerPath: tokenizer)
            } else {
                models.prepare(wifiOnly: warden.wifiOnly)
            }
        }
        .onChange(of: models.phase) { _, phase in
            if case .ready(let model, let tokenizer) = phase, warden.wantsModel {
                warden.load(modelPath: model, tokenizerPath: tokenizer)
            }
        }
    }

    /// Back to the map, from anywhere in a game's flow. Clears the chosen game
    /// too: without that, leaving a game reopened its terms instead of the
    /// lobby.
    private func backToLobby() {
        // Close the live link and the outbox's retries for the game being
        // left, from every exit (results, travel, the field). Idempotent.
        playing?.session.leave()
        playing = nil
        arrived = false
        chosen = nil
        roomSide = []
        leftLaunchGame = true
        // Back to the world, not the events board: the world is home.
        showEvents = false
        Presence.shared.status = "idle"
        Presence.shared.gameID = nil
    }
}
