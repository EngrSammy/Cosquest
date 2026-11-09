import ExpoModulesCore
import SwiftUI
import UIKit

// The native "islands" the shared React Native game embeds on iOS: the few
// things only the platform can draw. Each is one Expo view or a handful of
// functions on the CostQuestGame module, with the same names as Android where
// Android has the thing (android/.../CostQuestGameModule.kt,
// CostQuestUnityView.kt), and each has a 2D fallback in the RN screen that
// uses it (features/game/config.ts NATIVE_ISLANDS; EXPO_PUBLIC_GAME_2D turns
// an island off):
//
//   CostQuestUnityView + unityStartDuel/unityDemoDuel/unityQuit/unitySend/
//   unityPause + onUnityEvent      Unity's fights (DuelBridge, BattleBridge,
//                                  HubBridge, WorldRoot), over UnityBridge
//   CostQuestModelView             a Forge weapon turning in 3D (RealityKit,
//                                  Game/Net/GLBMesh), the native ForgeModelView
//
// None of this touches the SwiftUI game's state (Game/Roam, RoamStore,
// AppRoot): the islands only reuse its renderers. In the native game
// (EXPO_PUBLIC_GAME_UI=native) the SwiftUI hosts own Unity's callbacks
// instead, and these functions are never called.

// MARK: - Unity

/// The RN game's side of Unity. UnityBridge (Game/Unity) owns the runtime,
/// started once per process; this registers the scenes' C callbacks before
/// the first start and turns them into `onUnityEvent` {scene, kind, json},
/// the event CQUnityEvents.kt sends on Android.
@MainActor
enum UnityIsland {
  static var sink: GameEventSink?

  static var available: Bool { CostQuestGameModule.hasUnity }

  /// The Battle scene is optional in an export: its callback setter is looked
  /// up, not linked (UnityBattleHost.registerOnce), so its absence is "no
  /// battle in this build", not a link error.
  nonisolated static var hasBattleScene: Bool {
    #if NO_UNITY
    return false
    #else
    return dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CQSetBattleEventCallback") != nil
    #endif
  }

  #if !NO_UNITY
  private static var registered = false

  /// Every scene's callback, once, before Unity runs (a `ready` in the first
  /// frames would otherwise go to a NULL pointer and be lost: UnityBridge.start).
  private static func registerOnce() {
    guard !registered else { return }
    registered = true
    CQSetDuelEventCallback { kind, json in
      let k = kind.map { String(cString: $0) } ?? ""
      let j = json.map { String(cString: $0) } ?? ""
      Task { @MainActor in UnityIsland.emit("duel", k, j) }
    }
    CQSetHubEventCallback { kind, json in
      let k = kind.map { String(cString: $0) } ?? ""
      let j = json.map { String(cString: $0) } ?? ""
      Task { @MainActor in UnityIsland.emit("hub", k, j) }
    }
    // The Battle scene is optional in an export: looked up, not linked
    // (UnityBattleHost.registerOnce does the same).
    typealias EventCallback = @convention(c) (UnsafePointer<CChar>?, UnsafePointer<CChar>?) -> Void
    typealias SetCallback = @convention(c) (EventCallback?) -> Void
    if let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "CQSetBattleEventCallback") {
      let set = unsafeBitCast(sym, to: SetCallback.self)
      set { kind, json in
        let k = kind.map { String(cString: $0) } ?? ""
        let j = json.map { String(cString: $0) } ?? ""
        Task { @MainActor in UnityIsland.emit("battle", k, j) }
      }
    }
    // The world's taps arrive through UnityBridge's own callbacks.
    UnityBridge.shared.onAnchorTapped = { id in
      UnityIsland.emit("world", "anchorTapped", #"{"id":"\#(id)"}"#)
    }
    UnityBridge.shared.onCheckpointTapped = { id in
      UnityIsland.emit("world", "checkpointTapped", #"{"id":"\#(id)"}"#)
    }
  }

  static func emit(_ scene: String, _ kind: String, _ json: String) {
    sink?.send("onUnityEvent", ["scene": scene, "kind": kind, "json": json])
  }

  /// Starts Unity if it is not up yet. Throws ERR_UNITY_START with the
  /// player-facing reason when the framework will not load.
  static func boot() throws {
    registerOnce()
    if case .failed(let why) = UnityBridge.shared.start() {
      throw helperError("ERR_UNITY_START", why)
    }
  }

  static func send(_ object: String, _ method: String, _ message: String) {
    UnityBridge.shared.send(object: object, method: method, message: message)
  }

  static func pause(_ paused: Bool) {
    UnityBridge.shared.pause(paused)
  }

  static var view: UIView? { UnityBridge.shared.unityView }

  static func reclaimWindow(_ tag: String) {
    UnityBridge.shared.reclaimWindow(tag: tag)
  }
  #else
  static func boot() throws {
    throw helperError("ERR_NO_UNITY", "This build has no Unity (hasUnity is false).")
  }
  static func send(_ object: String, _ method: String, _ message: String) {}
  static func pause(_ paused: Bool) {}
  static var view: UIView? { nil }
  static func reclaimWindow(_ tag: String) {}
  #endif

  /// The fight's state for the app's lifecycle: Unity stops drawing while
  /// the app is away and picks up where it was (Android does the same in
  /// OnActivityEntersBackground).
  private static var pausedByBackground = false

  static func appWentAway() {
    guard available, view != nil else { return }
    pausedByBackground = true
    pause(true)
  }

  static func appCameBack() {
    guard pausedByBackground else { return }
    pausedByBackground = false
    // Only the view on screen, unpaused by its prop, wants frames again.
    if let host = CostQuestUnityView.showing, !host.paused { pause(false) }
  }
}

/// Unity's view inside the RN game (requireNativeView("CostQuestGame",
/// "CostQuestUnityView")). Thin like CostQuestUnityView.kt: it never owns the
/// runtime. On the window it adopts Unity's root view and resumes it; off the
/// window it lets go and pauses Unity; `paused` pauses and keeps the last
/// frame. The last one attached wins.
public final class CostQuestUnityView: ExpoView {
  static weak var showing: CostQuestUnityView?

  var paused = false {
    didSet { if paused != oldValue { sync() } }
  }

  private var poll: Timer?
  private var pollTries = 0
  private lazy var placeholder: UILabel = {
    let label = UILabel()
    label.text = "Fights need the device build of CosQuest."
    label.textColor = .white
    label.textAlignment = .center
    label.numberOfLines = 0
    label.font = .preferredFont(forTextStyle: .body)
    return label
  }()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = UIColor(red: 0.08, green: 0.02, blue: 0.10, alpha: 1)
    if !UnityIsland.available {
      addSubview(placeholder)
    }
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    sync()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    placeholder.frame = bounds.insetBy(dx: 24, dy: 24)
    if let unity = UnityIsland.view, unity.superview === self {
      unity.frame = bounds
      // Unity makes its own window key asynchronously after it starts:
      // take the screen back on every pass (UnityBridge.reclaimWindow).
      UnityIsland.reclaimWindow("rn view layout")
    }
  }

  private func sync() {
    guard UnityIsland.available else { return }
    if window == nil {
      poll?.invalidate()
      poll = nil
      if let unity = UnityIsland.view, unity.superview === self {
        unity.removeFromSuperview()
        UnityIsland.pause(true)
      }
      if Self.showing === self { Self.showing = nil }
      return
    }
    Self.showing = self
    if paused {
      UnityIsland.pause(true)
      return
    }
    adoptWhenReady()
  }

  /// Unity's root view exists only once unityStartDuel has booted it, which
  /// JS may do just after mounting this view: look again every 100 ms, for 10 s.
  private func adoptWhenReady() {
    if adopt() { return }
    poll?.invalidate()
    pollTries = 0
    poll = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
      // Scheduled on the main run loop, so the timer never leaves the main
      // thread (Swift 6 cannot see that and refuses to send it).
      nonisolated(unsafe) let timer = timer
      MainActor.assumeIsolated {
        guard let self, self.window != nil, self.pollTries < 100 else { timer.invalidate(); return }
        self.pollTries += 1
        if self.adopt() { timer.invalidate() }
      }
    }
  }

  private func adopt() -> Bool {
    guard let unity = UnityIsland.view else { return false }
    if unity.superview !== self {
      unity.removeFromSuperview()
      addSubview(unity)
    }
    unity.frame = bounds
    unity.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    UnityIsland.pause(false)
    UnityIsland.reclaimWindow("rn view attach")
    return true
  }
}

// MARK: - Forge model

/// A Forge weapon on a small stage, turning; drag to spin it. The native
/// game's ForgeModelView (Game/Features/ForgeFeature.swift) in a hosting
/// controller, so the RN Forge Armoury shows the same 3D model. The RN side
/// downloads and checks the file (features/game/forge.ts) and passes its
/// file:// URI. It turns by itself unless Reduce Motion is on.
public final class CostQuestModelView: ExpoView {
  var uri: String? { didSet { if uri != oldValue { rebuild() } } }
  var tint: UIColor = UIColor(red: 1.0, green: 0.78, blue: 0.2, alpha: 1) { didSet { rebuild() } }

  private var host: UIHostingController<AnyView>?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
  }

  private func rebuild() {
    host?.view.removeFromSuperview()
    host = nil
    guard let uri, let url = URL(string: uri), url.isFileURL,
          FileManager.default.fileExists(atPath: url.path) else { return }
    // `.id(uri)`: a new file is a new rig, not the old one re-tinted.
    let made = UIHostingController(rootView: AnyView(
      ForgeModelView(url: url, tint: Color(uiColor: tint)).id(uri)))
    made.view.backgroundColor = .clear
    made.view.frame = bounds
    made.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(made.view)
    host = made
  }

  static func color(_ hex: String?) -> UIColor? {
    guard var s = hex?.trimmingCharacters(in: .whitespaces), s.hasPrefix("#") else { return nil }
    s.removeFirst()
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
    return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                   blue: CGFloat(v & 0xFF) / 255, alpha: 1)
  }
}
