import ExpoModulesCore
import UIKit
import os

// The React Native face of the game (modules/costquest-game/src/index.ts).
// Every call lands on the main thread and goes straight to GameHost.

struct GameOpenTargetRecord: Record {
  @Field var shrineId: String? = nil
  @Field var raidId: String? = nil
  @Field var duelId: String? = nil
  @Field var lat: Double? = nil
  @Field var lng: Double? = nil
  @Field var place: String? = nil
}

struct GameChatPreviewRecord: Record {
  @Field var chatId: String = ""
  @Field var title: String = ""
  @Field var text: String = ""
}

struct GameCallPillRecord: Record {
  @Field var title: String = "Call"
  @Field var video: Bool = false
  /// Epoch milliseconds the call was answered; absent while ringing.
  @Field var answeredAt: Double? = nil
}

public final class CostQuestGameModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CostQuestGame")

    Events(
      // The game API (the native SwiftUI game).
      "onReady", "onSession", "onShareToChat", "onRequestChat", "onError",
      // Platform helpers for the shared RN game (GameHelpers.swift), the
      // same events as the Android module.
      "onNfcTag", "onNfcEnd", "onSpeechResult", "onSpeechError",
      // Unity's scenes, as CQUnityEvents.kt sends them (NativeIslands.swift).
      "onUnityEvent",
      // The native venue Events closed (VenueEventsIsland.swift).
      "onVenueEventsClosed",
      // "Hold phones together" (FriendBeaconIsland.swift).
      "onFriendBeacon"
    )

    Constants {
      [
        // False in the simulator build, where Unity is left out (NO_UNITY):
        // the world home, points and quizzes work; event maps and fights
        // say they need a device.
        "available": true,
        "hasUnity": Self.hasUnity,
        // For the shell's prewarm policy (features/world/prewarm.ts).
        "physicalMemory": Double(ProcessInfo.processInfo.physicalMemory),
        "upstream": "costquest-ios",
        // Platform helpers (GameHelpers.swift), as on Android.
        "nfcAvailable": NfcHelper.available,
        "uwbAvailable": UwbHelper.available,
        "pedometerAvailable": PedometerHelper.available,
        "stepCounterAvailable": false,
        // The Forge model view (NativeIslands.swift CostQuestModelView).
        "modelViewAvailable": true,
        // Venue Events, native (ARKit): VenueEventsIsland.swift.
        "venueEventsAvailable": true,
        // The fantasy battle scene is in this Unity export (BattleBridge,
        // CQSetBattleEventCallback): the RN fight asks the server for it.
        "hasBattleScene": UnityIsland.hasBattleScene,
        // "Hold phones together" (FriendBeaconIsland.swift): iPhone to iPhone.
        "friendBeaconAvailable": true,
        "friendBeaconUWB": FriendBeaconIsland.usesUWB,
        // The shrine on the native stage (ShrineIsland.swift), and whether
        // this phone can put it in the room through the camera.
        "shrineViewAvailable": true,
        "shrineARSupported": CostQuestShrineView.arSupported,
        // "See it here": a Forge model in the room (SummonIsland.swift).
        "summonViewAvailable": true,
        "summonARSupported": CostQuestSummonView.arSupported,
        "summonLiDAR": CostQuestSummonView.lidar,
      ]
    }

    OnCreate {
      let sink = GameEventSink(module: self)
      // Read by the helpers at send time, so an event in the module's first
      // tick (before the main-queue hop below) is not dropped.
      GameEventSink.current = sink
      DispatchQueue.main.async {
        MainActor.assumeIsolated {
          GameHost.shared.sink = sink
          GameHelpers.shared.sink = sink
          UnityIsland.sink = sink
          VenueEventsIsland.sink = sink
          FriendBeaconIsland.sink = sink
        }
      }
    }

    // Unity stops drawing while the app is away (Android: OnActivityEntersBackground).
    OnAppEntersBackground {
      DispatchQueue.main.async { MainActor.assumeIsolated { UnityIsland.appWentAway() } }
    }

    OnAppEntersForeground {
      DispatchQueue.main.async { MainActor.assumeIsolated { UnityIsland.appCameBack() } }
    }

    // No OnDestroy: the sink holds the module weakly, and clearing it here
    // could land after a reloaded module's OnCreate and drop its events.

    AsyncFunction("prewarm") {
      MainActor.assumeIsolated { GameHost.shared.prewarm() }
    }.runOnQueue(.main)

    AsyncFunction("pause") {
      MainActor.assumeIsolated { GameHost.shared.setVisible(false) }
    }.runOnQueue(.main)

    AsyncFunction("resume") {
      MainActor.assumeIsolated { GameHost.shared.setVisible(true) }
    }.runOnQueue(.main)

    AsyncFunction("open") { (target: GameOpenTargetRecord) in
      let request = Self.request(from: target)
      MainActor.assumeIsolated { GameHost.shared.open(request) }
    }.runOnQueue(.main)

    AsyncFunction("setSession") { (token: String?) in
      MainActor.assumeIsolated { GameHost.shared.setSession(token) }
    }.runOnQueue(.main)

    AsyncFunction("setUnread") { (count: Int, previews: [GameChatPreviewRecord]) in
      let items = previews.map { GameChatPreview(chatId: $0.chatId, title: $0.title, text: $0.text) }
      MainActor.assumeIsolated { GameHost.shared.setUnread(count, previews: items) }
    }.runOnQueue(.main)

    AsyncFunction("setCallPill") { (pill: GameCallPillRecord?) in
      let value = pill.map { GameCallPill(title: $0.title, video: $0.video, answeredAtMs: $0.answeredAt) }
      MainActor.assumeIsolated { GameHost.shared.setCallPill(value) }
    }.runOnQueue(.main)

    AsyncFunction("handleURL") { (url: URL) in
      MainActor.assumeIsolated { GameHost.shared.handleURL(url) }
    }.runOnQueue(.main)

    AsyncFunction("reset") {
      MainActor.assumeIsolated { GameHost.shared.reset() }
    }.runOnQueue(.main)

    // For measuring the prewarm on a phone (docs/merged-app-ux.md): what this
    // process uses now and what iOS would still let it have, in bytes.
    Function("memoryReport") { () -> [String: Double] in
      [
        "physical": Double(ProcessInfo.processInfo.physicalMemory),
        "footprint": Double(cq_phys_footprint()),
        "available": Double(os_proc_available_memory()),
      ]
    }

    // MARK: Platform helpers for the shared RN game (GameHelpers.swift).
    // Same names, arguments, events and error codes as Android.

    /// Resolves { onDevice } once listening has started; results come as events.
    AsyncFunction("startListening") { (options: ListenOptionsRecord?) async throws -> [String: Bool] in
      let request = ListenRequest(options)
      let onDevice = try await GameHelpers.shared.startListening(request)
      return ["onDevice": onDevice]
    }

    AsyncFunction("stopListening") {
      MainActor.assumeIsolated { GameHelpers.shared.speechIfMade?.stop() }
    }.runOnQueue(.main)

    /// Stops and drops the utterance: no result or error event follows.
    AsyncFunction("cancelListening") {
      MainActor.assumeIsolated { GameHelpers.shared.speechIfMade?.cancel() }
    }.runOnQueue(.main)

    /// Walking distance between two times ({ fromMs, toMs?, ask }):
    /// { status: ok|unavailable|denied|notDetermined|error, meters, steps }.
    AsyncFunction("queryPedometer") { (query: PedometerQueryRecord) async -> [String: Any] in
      let window = PedometerWindow(query)
      return await GameHelpers.shared.queryPedometer(window).dictionary
    }

    AsyncFunction("startNfcScan") {
      try MainActor.assumeIsolated { try GameHelpers.shared.nfc.start() }
    }.runOnQueue(.main)

    AsyncFunction("stopNfcScan") {
      MainActor.assumeIsolated { GameHelpers.shared.nfc.stop() }
    }.runOnQueue(.main)

    /// As on Android: UWB needs the peer mesh to swap session tokens first,
    /// and the shared game has no mesh. `uwbAvailable` says whether the chip is there.
    AsyncFunction("startUwbRanging") { (_: [String: Any]?) throws in
      throw helperError("ERR_UWB_NO_MESH", "UWB ranging needs the peer mesh to exchange session tokens; the shared game has no mesh yet.")
    }

    // MARK: The native game's key, for players moving to the RN game.

    /// The SwiftUI game's anonymous Ed25519 seed (hex) from the Keychain, or
    /// null. features/game/store.ts adopts it once, so a player who never
    /// signed in keeps their progress when iOS switches games.
    AsyncFunction("readLegacyDeviceKey") { () -> String? in
      LegacyDeviceKey.read()
    }

    /// iOS 15+ CLLocationSourceInformation.isSimulatedBySoftware for the
    /// current fix (GameHelpers.swift LocationSourceProbe), or null when
    /// unknown. Sent to the game server as `simulated`: evidence, never a refusal.
    AsyncFunction("locationSimulated") { () async -> Bool? in
      await LocationSourceProbe.shared.simulated(maxAgeS: 30)
    }

    // MARK: Unity (NativeIslands.swift), the Android names.

    /// DuelBridge.StartDuel(setupJson): boots Unity if needed, then starts the fight.
    AsyncFunction("unityStartDuel") { (setupJson: String) in
      try MainActor.assumeIsolated {
        try UnityIsland.boot()
        UnityIsland.send("DuelBridge", "StartDuel", setupJson)
      }
    }.runOnQueue(.main)

    /// DuelBridge.DemoDuel: an offline practice fight.
    AsyncFunction("unityDemoDuel") {
      try MainActor.assumeIsolated {
        try UnityIsland.boot()
        UnityIsland.send("DuelBridge", "DemoDuel", "")
      }
    }.runOnQueue(.main)

    /// BattleBridge.StartBattle(setupJson): the fantasy action fight, for a
    /// setup of kind "battle" (UnityBattleHost.begin). Quit, pause and resume
    /// go through unitySend("BattleBridge", "Quit" | "SetPaused", ...).
    AsyncFunction("unityStartBattle") { (setupJson: String) in
      try MainActor.assumeIsolated {
        guard UnityIsland.hasBattleScene else {
          throw helperError("ERR_NO_BATTLE", "This Unity build has no Battle scene.")
        }
        try UnityIsland.boot()
        UnityIsland.send("BattleBridge", "StartBattle", setupJson)
      }
    }.runOnQueue(.main)

    /// DuelBridge.Quit. Unity stays loaded (it cannot be restarted).
    AsyncFunction("unityQuit") {
      MainActor.assumeIsolated { UnityIsland.send("DuelBridge", "Quit", "") }
    }.runOnQueue(.main)

    /// Any other bridge message (WorldRoot, HubBridge, BattleBridge; FRAMEWORK_PIN.md).
    AsyncFunction("unitySend") { (gameObject: String, method: String, message: String?) in
      try MainActor.assumeIsolated {
        guard UnityIsland.available else {
          throw helperError("ERR_NO_UNITY", "This build has no Unity (hasUnity is false).")
        }
        UnityIsland.send(gameObject, method, message ?? "")
      }
    }.runOnQueue(.main)

    AsyncFunction("unityPause") { (paused: Bool) in
      MainActor.assumeIsolated { UnityIsland.pause(paused) }
    }.runOnQueue(.main)

    // MARK: Hold phones together (FriendBeaconIsland.swift).

    /// Advertises this player (their game key and name) to iPhones on the
    /// Friends screen nearby; `onFriendBeacon` reports who is there.
    AsyncFunction("startFriendBeacon") { (key: String, handle: String) async in
      await FriendBeaconIsland.start(key: key, handle: handle)
    }

    AsyncFunction("stopFriendBeacon") {
      MainActor.assumeIsolated { FriendBeaconIsland.stop() }
    }.runOnQueue(.main)

    // MARK: Run and raid clocks on the lock screen (LiveTimers.swift, ActivityKit).

    Function("liveTimerSupported") { () -> Bool in
      LiveTimers.supported
    }

    AsyncFunction("liveTimerStart") { (kind: String, title: String, subtitle: String, link: String, endsAtMs: Double, state: LiveTimerStateRecord?) async -> String? in
      await LiveTimers.start(kind: kind, title: title, subtitle: subtitle, link: link,
                             endsAtMs: endsAtMs, state: LiveTimerState(state))
    }

    AsyncFunction("liveTimerUpdate") { (id: String, state: LiveTimerStateRecord?, endsAtMs: Double?) async -> Bool in
      await LiveTimers.update(id, endsAtMs: endsAtMs, state: LiveTimerState(state))
    }

    AsyncFunction("liveTimerEnd") { (id: String, final: LiveTimerStateRecord?) async in
      await LiveTimers.end(id, final: final.map { LiveTimerState($0) })
    }

    // MARK: Venue Events (VenueEventsIsland.swift): native, over the RN game.

    /// Presents the native Events flow full screen; `onVenueEventsClosed` follows.
    /// Call setSession(chat token) first so the native client signs as the same player.
    AsyncFunction("openVenueEvents") { (options: VenueEventsOptionsRecord?) in
      let opts = VenueEventsOptions(options ?? VenueEventsOptionsRecord())
      try MainActor.assumeIsolated { try VenueEventsIsland.open(opts) }
    }.runOnQueue(.main)

    AsyncFunction("closeVenueEvents") {
      MainActor.assumeIsolated { VenueEventsIsland.close() }
    }.runOnQueue(.main)

    // MARK: Views. The first is the module's default view.

    View(CostQuestGameView.self) {
      Prop("parked") { (view: CostQuestGameView, parked: Bool?) in
        view.parked = parked ?? false
      }

      // Only for tests and screen readers: the game draws everything else.
      Prop("accessibilityLabel") { (view: CostQuestGameView, label: String?) in
        view.accessibilityLabel = label
      }
    }

    // requireNativeView("CostQuestGame", "CostQuestUnityView")
    View(CostQuestUnityView.self) {
      Prop("paused") { (view: CostQuestUnityView, paused: Bool?) in
        view.paused = paused ?? false
      }
      Prop("accessibilityLabel") { (view: CostQuestUnityView, label: String?) in
        view.accessibilityLabel = label
      }
    }

    // requireNativeView("CostQuestGame", "CostQuestShrineView")
    View(CostQuestShrineView.self) {
      Events("onPlaced")
      Prop("tint") { (view: CostQuestShrineView, tint: String?) in
        if let colour = CostQuestModelView.color(tint) { view.tint = colour }
      }
      Prop("wardenTint") { (view: CostQuestShrineView, tint: String?) in
        view.wardenTint = CostQuestModelView.color(tint)
      }
      Prop("useAR") { (view: CostQuestShrineView, on: Bool?) in
        view.useAR = on ?? false
      }
      OnViewDidUpdateProps { (view: CostQuestShrineView) in
        view.propsDone()
      }
      AsyncFunction("pulse") { (view: CostQuestShrineView, i: Int) async in
        await view.pulse(i)
      }
      AsyncFunction("resolve") { (view: CostQuestShrineView, correct: Bool) async in
        await view.resolve(correct)
      }
      AsyncFunction("reset") { (view: CostQuestShrineView) async in
        await view.reset()
      }
      AsyncFunction("photo") { (view: CostQuestShrineView) async -> String? in
        await view.photo()
      }
    }

    // requireNativeView("CostQuestGame", "CostQuestSummonView")
    View(CostQuestSummonView.self) {
      Events("onSummonState", "onSummonTap")
      Prop("uri") { (view: CostQuestSummonView, uri: String?) in view.uri = uri }
      Prop("reveal") { (view: CostQuestSummonView, on: Bool?) in view.reveal = on ?? false }
      Prop("kind") { (view: CostQuestSummonView, kind: String?) in view.kind = kind ?? "character" }
      Prop("name") { (view: CostQuestSummonView, name: String?) in view.name = name ?? "" }
      Prop("heightM") { (view: CostQuestSummonView, h: Double?) in view.heightM = Float(h ?? 0) }
      Prop("minScale") { (view: CostQuestSummonView, v: Double?) in view.minScale = Float(v ?? 0.1) }
      Prop("maxScale") { (view: CostQuestSummonView, v: Double?) in view.maxScale = Float(v ?? 1.5) }
      Prop("tint") { (view: CostQuestSummonView, tint: String?) in
        if let colour = CostQuestModelView.color(tint) { view.tint = colour }
      }
      OnViewDidUpdateProps { (view: CostQuestSummonView) in
        view.propsDone()
      }
      AsyncFunction("photo") { (view: CostQuestSummonView) async -> String? in
        await view.photo()
      }
      // "recording", or null when it can't (a String? like photo: a Bool
      // result picks an overload that needs the view's conformance off the main actor).
      AsyncFunction("startVideo") { (view: CostQuestSummonView) async -> String? in
        await view.startVideo() ? "recording" : nil
      }
      AsyncFunction("stopVideo") { (view: CostQuestSummonView) async -> String? in
        await view.stopVideo()
      }
      AsyncFunction("celebrate") { (view: CostQuestSummonView) async in
        await view.celebrate()
      }
      AsyncFunction("recenter") { (view: CostQuestSummonView) async in
        await view.recenter()
      }
      AsyncFunction("hold") { (view: CostQuestSummonView) async in
        await view.hold()
      }
    }

    // requireNativeView("CostQuestGame", "CostQuestModelView")
    View(CostQuestModelView.self) {
      Prop("uri") { (view: CostQuestModelView, uri: String?) in
        view.uri = uri
      }
      Prop("tint") { (view: CostQuestModelView, tint: String?) in
        if let colour = CostQuestModelView.color(tint) { view.tint = colour }
      }
      // The model turns unless Reduce Motion is on (ForgeModelView reads it);
      // accepted for the JS interface's sake.
      Prop("spin") { (_: CostQuestModelView, _: Bool?) in }
      Prop("accessibilityLabel") { (view: CostQuestModelView, label: String?) in
        view.isAccessibilityElement = label != nil
        view.accessibilityLabel = label
      }
    }
  }

  static var hasUnity: Bool {
    #if NO_UNITY
    return false
    #else
    return true
    #endif
  }

  private static func request(from target: GameOpenTargetRecord) -> GameOpenRequest {
    let kind: GameOpenRequest.Kind
    let id: String?
    if let raid = target.raidId { kind = .raid; id = raid }
    else if let duel = target.duelId { kind = .duel; id = duel }
    else if let shrine = target.shrineId { kind = .shrine; id = shrine }
    else { kind = .place; id = nil }
    return GameOpenRequest(kind: kind, targetId: id, lat: target.lat, lng: target.lng,
                           place: target.place, madeAt: Date())
  }
}
