import SwiftUI

/// Playing a game.
///
/// AR is the game, and it is what you get when you enter one. That sounds
/// obvious and it was not what this app did: entering a game put you on a
/// top-down field map, with the camera reachable only after you had walked
/// within range of a point and tapped twice more. There is a reasoned argument
/// in FieldMapView for that order, about battery and about not being able to
/// see across a venue through a viewfinder, and it is a good argument about
/// SUSTAINED play. It is the wrong answer to "I opened an augmented reality
/// game and got a map".
///
/// So the camera is the surface, and the map is a glance away rather than the
/// other way round. The thermal argument is answered by the map being a sheet:
/// pull it up and the AR session is still there behind it, pull it down and you
/// are back in the world.
struct PlayView: View {
    let session: GameSession
    let terms: GameTerms
    let warden: Warden
    /// Back to the lobby. The root owns routing; this only asks for it.
    var onLeave: (() -> Void)? = nil

    @State private var showMap = false
    @State private var confirmLeave = false

    var body: some View {
        ARGameView(session: session, terms: terms, warden: warden,
                   onLeave: onLeave == nil ? nil : { leave() },
                   reservesPlayChrome: true)
            .overlay(alignment: .bottomLeading) { mapButton }
            .overlay(alignment: .topLeading) {
                if onLeave != nil { leaveButton }
            }
            .sheet(isPresented: $showMap) {
                FieldMapView(session: session, terms: terms, warden: warden)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            #if DEBUG
            .task {
                if UserDefaults.standard.bool(forKey: "showFieldMap") {
                    try? await Task.sleep(for: .seconds(2))
                    showMap = true
                }
            }
            #endif
            .confirmationDialog("Leave the game?", isPresented: $confirmLeave,
                                titleVisibility: .visible) {
                Button("Leave", role: .destructive) { leave() }
                Button("Stay", role: .cancel) {}
            } message: {
                Text("You can rejoin while it's live.")
            }
    }

    private func leave() {
        session.leave()
        onLeave?()
    }

    /// Out of the game. Small and in the corner, with a confirmation, because
    /// it is the one control on this screen that should never be hit by
    /// accident mid fight.
    private var leaveButton: some View {
        Button { confirmLeave = true } label: {
            Image(systemName: "xmark")
        }
        .buttonStyle(.gameIcon(GamePalette.berry, diameter: PlayChrome.leaveSize))
        .padding(.leading, 16)
        .padding(.top, 8)
        .accessibilityLabel("Leave the game")
    }

    /// The overhead view, one tap away.
    ///
    /// Bottom left, away from the reticle and the action buttons: this is for
    /// orienting between moments, not something to reach for mid-capture. The
    /// HUD insets its action bar by the same amount so the two never overlap.
    private var mapButton: some View {
        Button { showMap = true } label: {
            Image(systemName: "map.fill")
        }
        .buttonStyle(.gameIcon(GamePalette.grass, diameter: PlayChrome.mapSize))
        .padding(.leading, 16)
        .padding(.bottom, PlayChrome.bottomPadding)
        .accessibilityLabel("Show the field map")
    }
}

/// The sizes PlayView's corner controls take, shared with the HUD so it can
/// keep clear of them.
enum PlayChrome {
    static let leaveSize: CGFloat = 40
    static let mapSize: CGFloat = 46
    static let bottomPadding: CGFloat = 20
    /// How much further in than its own 16 pt margin the HUD keeps content
    /// that shares a row with a corner control: the control's width plus a
    /// 10 pt gap.
    static let cornerInset: CGFloat = mapSize + 10
}
