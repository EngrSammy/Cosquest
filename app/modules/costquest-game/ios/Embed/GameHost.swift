import SwiftUI
import UIKit

// The CostQuest game, embedded in the CosQuest app.
//
// One object between the two: the React Native shell calls in through the
// Expo module (CostQuestGameModule.swift) and the game's own views read it
// through two small hooks (GameHostHooks on AppRoot, GameHostOpenHook on the
// world home), added by patches/ so the copied sources stay the upstream's.
//
// It owns the game's one hosting controller. The controller is made once and
// kept, so the world, the store and everything the player was doing survive
// the swipe back to chat and the view being remounted: "warm" means this
// object and that controller exist.

/// Something the chat asked the game to open: a point by id (a shrine, a raid
/// boss or a duel Guardian are all Quest Points), or just a place.
struct GameOpenRequest: Sendable, Equatable {
    enum Kind: String, Sendable { case shrine, raid, duel, place }
    let kind: Kind
    let targetId: String?
    let lat: Double?
    let lng: Double?
    let place: String?
    let madeAt: Date

    /// An invite is for now-ish: after ten minutes an unresolved one is
    /// dropped rather than popping a card into a later session.
    var isExpired: Bool { Date().timeIntervalSince(madeAt) > 600 }
}

/// The last messages, for the bubble's long press.
struct GameChatPreview: Sendable, Equatable, Identifiable {
    let chatId: String
    let title: String
    let text: String
    var id: String { chatId }
}

/// An ongoing CosQuest call, shown as a pill over the game.
struct GameCallPill: Sendable, Equatable {
    let title: String
    let video: Bool
    /// Epoch milliseconds of the answer, nil while it rings.
    let answeredAtMs: Double?
}

/// Where module events go: the Expo module, held weakly. Thread-safe on the
/// module's side (sendEvent hands the payload to the JS thread).
final class GameEventSink: @unchecked Sendable {
    /// The latest module's sink, set synchronously by OnCreate (the helpers
    /// read it until their own main-queue copy lands).
    nonisolated(unsafe) static var current: GameEventSink?

    weak var module: CostQuestGameModule?

    init(module: CostQuestGameModule?) { self.module = module }

    func send(_ name: String, _ body: [String: Any?] = [:]) {
        module?.sendEvent(name, body)
    }
}

@MainActor
@Observable
final class GameHost {
    static let shared = GameHost()

    /// Always true in this module: the copied sources check it so the same
    /// files would still behave as the standalone game without it.
    let embedded = true

    /// The game page is on screen (the swipe settled on it, or a drag toward
    /// it began). Off screen the game stops its location updates and Unity.
    private(set) var visible = false
    /// Bumped when the signing identity changes (CosQuest sign-in or out), so
    /// the store reloads who the player is.
    private(set) var identityTick = 0
    /// Bumped on every open request; GameHostOpenHook consumes `pendingOpen`.
    private(set) var openTick = 0
    var pendingOpen: GameOpenRequest?

    private(set) var unread = 0
    private(set) var previews: [GameChatPreview] = []
    private(set) var call: GameCallPill?
    var callActive: Bool { call != nil }

    /// What the account's SSO answered last, for diagnostics and events.
    private(set) var playerKey: String?

    /// The Expo module's event sink. A new one (a JS reload) gets onReady
    /// again if the world is already standing, or its veil would never lift.
    @ObservationIgnored var sink: GameEventSink? {
        didSet {
            if rootAppeared, sink != nil {
                readySent = false
                noteReady()
            }
        }
    }
    /// Set by GameHostHooks: hands a cosquest://coins return to the game.
    @ObservationIgnored var urlHandler: ((URL) -> Void)?

    @ObservationIgnored private var controller: UIHostingController<GameEmbedRoot>?
    @ObservationIgnored private var sessionToken: String?
    @ObservationIgnored private var sessionTask: Task<Void, Never>?
    @ObservationIgnored private var unityPausedByHost = false
    @ObservationIgnored private var readySent = false
    @ObservationIgnored private var rootAppeared = false
    @ObservationIgnored private let chrome: GameChromeWindowController
    var chromeController: GameChromeWindowController { chrome }

    private init() {
        chrome = GameChromeWindowController()
    }

    // MARK: - Lifecycle

    /// The one hosting controller, made on first ask.
    /// The controller if it has been made, without making it (parking and
    /// layout must not build a world).
    var existingController: UIHostingController<GameEmbedRoot>? { controller }

    func hostingController() -> UIHostingController<GameEmbedRoot> {
        if let controller { return controller }
        GameFonts.register()
        AccountKey.shared.loadSaved()
        let made = UIHostingController(rootView: GameEmbedRoot())
        made.view.backgroundColor = .clear
        controller = made
        return made
    }

    /// Build the world before the first swipe: fonts, the hosting controller
    /// and its view. The SwiftUI tasks (the player, the points) start when
    /// the React side mounts the view, which it does right after this.
    /// Unity stays cold, as in the standalone game: only events and fights
    /// use it, and it costs ~100 MB once started.
    func prewarm() {
        _ = hostingController().view
    }

    /// The world is standing: AppRoot appeared. Sent once per process.
    func noteReady() {
        rootAppeared = true
        guard !readySent, sink != nil else { return }
        readySent = true
        sink?.send("onReady", ["playerKey": playerKey])
    }

    func setVisible(_ visible: Bool) {
        guard visible != self.visible else { return }
        self.visible = visible
        #if !NO_UNITY
        let unity = UnityBridge.shared
        if !visible, unity.state == .running, !unity.isPaused {
            unity.pause(true)
            unityPausedByHost = true
        } else if visible, unityPausedByHost {
            unity.pause(false)
            unityPausedByHost = false
        }
        #endif
        chrome.update(host: self)
    }

    /// The app is signing out or another person is signing in: forget the
    /// player and start the next one from nothing.
    func reset() {
        setSession(nil)
        pendingOpen = nil
        unread = 0
        previews = []
        call = nil
        chrome.update(host: self)
    }

    // MARK: - Requests from the chat

    func open(_ request: GameOpenRequest) {
        pendingOpen = request
        openTick &+= 1
    }

    func setUnread(_ count: Int, previews: [GameChatPreview]) {
        unread = max(0, count)
        self.previews = Array(previews.prefix(3))
        chrome.update(host: self)
    }

    func setCallPill(_ pill: GameCallPill?) {
        call = pill
        chrome.update(host: self)
    }

    func handleURL(_ url: URL) {
        urlHandler?(url)
    }

    /// One login: trade the chat session for the account's player key.
    /// nil signs out (the phone's own device identity is used again).
    func setSession(_ token: String?) {
        // Signed out (or never signed in): always forget the account key,
        // even if no token was ever set in this process; one saved by an
        // earlier run must not play on without a CosQuest session.
        guard let token, !token.isEmpty else {
            sessionTask?.cancel()
            sessionTask = nil
            sessionToken = nil
            if AccountKey.shared.clear() { identityChanged() }
            playerKey = nil
            return
        }
        guard token != sessionToken else { return }
        sessionToken = token
        sessionTask?.cancel()
        sessionTask = Task { [weak self] in
            do {
                let answer = try await GameSSO.exchange(chatToken: token)
                guard !Task.isCancelled, let self else { return }
                let changed = try AccountKey.shared.install(seedHex: answer.key.seed_hex,
                                                            subject: answer.subject,
                                                            nonceFloor: answer.nonce_floor)
                self.playerKey = answer.player.device_key
                if changed { self.identityChanged() }
                self.sink?.send("onSession", [
                    "playerKey": answer.player.device_key,
                    "created": answer.created,
                    "handle": answer.player.handle,
                    "faction": answer.player.faction,
                ])
            } catch is CancellationError {
            } catch {
                guard !Task.isCancelled, let self else { return }
                // Let the next setSession with the same token try again.
                self.sessionToken = nil
                // The game still works on this phone's own identity; the
                // shell decides whether to say anything.
                let code = (error as? GameSSO.Failure)?.code ?? "sso_failed"
                self.sink?.send("onError", ["code": code, "message": error.localizedDescription])
            }
        }
    }

    private func identityChanged() {
        identityTick &+= 1
    }

    // MARK: - From the game to the chat

    /// The point card's "invite to a chat" button.
    func shareToChat(_ point: QuestPoint) {
        let kind: String
        if point.source == "raid" { kind = "raid" }
        else if point.challenge == "duel" { kind = "duel" }
        else { kind = "shrine" }
        sink?.send("onShareToChat", [
            "type": kind,
            "targetId": point.id,
            "place": point.name,
            "lat": point.lat,
            "lng": point.lng,
            // A raid is on now and runs until this (ISO 8601), for the card.
            "endsAt": point.extra?["raid_until"],
        ])
    }

    /// Back to the chat, optionally straight into one conversation.
    func requestChat(_ chatId: String?) {
        sink?.send("onRequestChat", ["chatId": chatId])
    }

    /// A game modal (a fight, an encounter) is covering the shell. Only the
    /// game's own: a React Native modal (the bubble's previews, the share
    /// picker) presented from the app's root view controller also shows up
    /// as `presentedViewController` here, because UIKit answers for the
    /// presenting ancestor, and must not count.
    func isCoveredByGameModal() -> Bool {
        guard let presented = controller?.presentedViewController else { return false }
        // RCTModalHostViewController (Paper) / RCTFabricModalHostViewController.
        return !String(describing: type(of: presented)).contains("ModalHost")
    }
}

// MARK: - The hooks the patched game views use

/// On AppRoot (patches/0001): visibility, identity and URL handling.
struct GameHostHooks: ViewModifier {
    let roam: RoamStore
    /// Back to the world home for an open request, unless a game is live.
    let toHome: () -> Void

    func body(content: Content) -> some View {
        let host = GameHost.shared
        content
            .onAppear {
                host.urlHandler = { url in
                    Task { await CoinsModel.shared.handle(url, store: roam) }
                }
                host.noteReady()
            }
            // A prewarm (or an unpark) shows the world while the page is off
            // screen; AppRoot's own .task starts location then. Stop it again
            // unless the game page is what the person is looking at.
            .task {
                try? await Task.sleep(for: .milliseconds(300))
                if !host.visible { roam.location.stop() }
            }
            .onChange(of: host.visible) { _, visible in
                if visible {
                    // Only what was running before: a player still in
                    // onboarding is asked for location by onboarding itself.
                    if roam.loadedOnce, !roam.needsOnboarding { roam.startLocation() }
                    Task { await roam.refreshPoints() }
                } else {
                    roam.location.stop()
                }
            }
            .onChange(of: host.identityTick) { _, _ in
                Task {
                    await roam.loadBasics()
                    await roam.refreshPoints(force: true)
                }
            }
            .onChange(of: host.openTick) { _, _ in
                if host.pendingOpen != nil { toHome() }
            }
    }
}

/// On the world home (patches/0002): open the point an invite named, now or
/// as soon as the points around the player have loaded.
struct GameHostOpenHook: ViewModifier {
    let store: RoamStore
    @Binding var selected: QuestPoint?
    let banner: GameBannerModel

    func body(content: Content) -> some View {
        content
            .onChange(of: GameHost.shared.openTick, initial: true) { _, _ in
                resolve(announce: true)
            }
            .onChange(of: store.points.count) { _, _ in
                resolve(announce: false)
            }
    }

    private func resolve(announce: Bool) {
        let host = GameHost.shared
        guard let request = host.pendingOpen else { return }
        if request.isExpired {
            host.pendingOpen = nil
            return
        }
        if let id = request.targetId, let point = store.points.first(where: { $0.id == id }) {
            host.pendingOpen = nil
            selected = point
            return
        }
        // Not around the player: say where, and keep it until the points
        // there load (or ten minutes pass).
        if announce {
            let title = request.place.map { "Head to \($0)" } ?? "That spot isn't near you yet"
            banner.show(title, subtitle: request.kind == .place ? nil : "It opens when you're close",
                        color: GamePalette.skyDeep, sound: .whoosh)
        }
        if request.targetId == nil { host.pendingOpen = nil }
    }
}
