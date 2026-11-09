import ExpoModulesCore
import SwiftUI
import UIKit

// Venue Events (paid games at a real venue, played through the camera) for
// the shared React Native game on iOS. They are ARKit + RealityKit end to
// end (AR/ARGameView, FieldModel, the peer mesh, UWB), so they stay native:
// this presents the native game's own Events flow full screen, the same
// views AppRoot shows (Map/DiscoverView -> UI/EntryView -> UI/TravelView ->
// UI/PlayView -> UI/ResultsView), and nothing of the native home around it.
// JS: openVenueEvents({ gameId?, side?, handle? }) in
// modules/costquest-game/src/index.ts; `onVenueEventsClosed` when the player
// comes back. Android has no venue games (no ARCore port), so the RN game
// shows the Events tile only where `venueEventsAvailable` is true.

struct VenueEventsOptionsRecord: Record {
  /// Open one game's terms directly (a Room's game id, an invite).
  @Field var gameId: String? = nil
  /// The side to preselect: the player's faction id and name (Rooms).
  @Field var side: [String]? = nil
  /// The player's own name for the entry form.
  @Field var handle: String? = nil
}

struct VenueEventsOptions: Sendable {
  var gameId: String?
  var side: [String]
  var handle: String?

  init(_ r: VenueEventsOptionsRecord) {
    gameId = r.gameId
    side = r.side ?? []
    handle = r.handle
  }
}

@MainActor
enum VenueEventsIsland {
  static var sink: GameEventSink?
  private static weak var presented: UIViewController?

  static func open(_ options: VenueEventsOptions) throws {
    guard presented == nil else { return }
    // The native views' type (GameKit's Lilita One and Fredoka); in the RN
    // game nothing else has registered them in this process.
    GameFonts.register()
    guard let top = topViewController() else {
      throw helperError("ERR_NO_WINDOW", "There is no window to show the events on.")
    }
    let root = VenueEventsRoot(preselected: options.gameId, side: options.side, handle: options.handle) {
      close()
    }
    let controller = UIHostingController(rootView: root)
    controller.modalPresentationStyle = .fullScreen
    top.present(controller, animated: true)
    presented = controller
  }

  static func close() {
    guard let controller = presented else { return }
    presented = nil
    controller.dismiss(animated: true)
    (sink ?? GameEventSink.current)?.send("onVenueEventsClosed", [:])
  }

  private static func topViewController() -> UIViewController? {
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow }
    var top = window?.rootViewController
    while let next = top?.presentedViewController { top = next }
    return top
  }
}

/// AppRoot's events branch on its own (Game/CostQuestApp.swift): the board of
/// games, one game's terms, the journey to the venue, the field, the result.
struct VenueEventsRoot: View {
  let preselected: String?
  let side: [String]
  let handle: String?
  var onClose: () -> Void

  @State private var warden = Warden()
  @State private var playing: AppRoot.Playing?
  @State private var chosen: String?
  @State private var arrived = false

  var body: some View {
    Group {
      if let inPlay = playing {
        if inPlay.session.isOver {
          ResultsView(session: inPlay.session, terms: inPlay.terms) { leave() }
            .transition(.opacity)
        } else if arrived {
          PlayView(session: inPlay.session, terms: inPlay.terms, warden: warden, onLeave: { leave() })
            .transition(.opacity)
        } else {
          TravelView(session: inPlay.session, terms: inPlay.terms,
                     onArrived: {
                       withAnimation(.smooth(duration: 0.45)) { arrived = true }
                       Presence.shared.status = "playing"
                     },
                     onLeave: { leave() })
            .transition(.opacity)
        }
      } else if let id = chosen ?? preselected {
        EntryView(warden: warden, preselected: id,
                  onBack: { if chosen == nil { onClose() } else { chosen = nil } },
                  presetSide: side,
                  presetHandle: handle) { session, terms in
          playing = AppRoot.Playing(session: session, terms: terms)
        }
        .transition(.opacity)
      } else {
        DiscoverView(warden: warden) { game in chosen = game.game_id }
          .overlay(alignment: .bottomLeading) {
            // Back to the shared game's map (AppRoot's "World" button).
            Button { onClose() } label: {
              Label("World", systemImage: "globe.europe.africa.fill")
            }
            .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
            .padding(.leading, 16)
            .padding(.bottom, 24)
            .accessibilityLabel("Back to the world")
          }
          .transition(.opacity)
      }
    }
    .animation(.smooth(duration: 0.35), value: playing == nil)
    .animation(.smooth(duration: 0.45), value: arrived)
    .animation(.smooth(duration: 0.25), value: chosen)
    .preferredColorScheme(Preferences.shared.appearance.colorScheme)
  }

  /// AppRoot.backToLobby, then home: a finished or abandoned game closes the
  /// events and the player is back on the shared game's map.
  private func leave() {
    playing?.session.leave()
    playing = nil
    arrived = false
    chosen = nil
    Presence.shared.status = "idle"
    Presence.shared.gameID = nil
    onClose()
  }
}
