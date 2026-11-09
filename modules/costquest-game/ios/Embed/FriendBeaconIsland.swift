import ExpoModulesCore
import Foundation
import NearbyInteraction

// "Hold phones together" for the shared React Native game's Friends sheet on
// iOS: only the transport is native. The native game's own FriendBeacon (a
// Bonjour/AWDL link with TLS-PSK on `_costquest._tcp`) and FriendRanger
// (Nearby Interaction, one session per peer), from
// Game/Features/FriendsFeature.swift, unchanged; the ultra wideband token
// swap between them stays here too, since tokens never need to reach JS.
// Everything the player sees and every server call (POST
// v1/roam/social/nearby) is TypeScript: features/game/friendsNearby.ts and
// components/game/HoldPhonesCard.tsx.
//
// JS: startFriendBeacon(key, handle) / stopFriendBeacon(), event
// onFriendBeacon {kind: seen|hello|lost|distance|denied, ...}. Android has
// no way to reach an iPhone like this, so it leaves friendBeaconAvailable out
// and the card is not shown there.

@MainActor
enum FriendBeaconIsland {
  static var sink: GameEventSink?

  private static var beacon: FriendBeacon?
  private static var ranger: FriendRanger?
  /// Bumped by every start and stop: a late event from an earlier beacon is dropped.
  private static var generation = 0

  /// The phone can measure the distance to another iPhone (U1/U2 chip).
  nonisolated static var usesUWB: Bool {
    NISession.deviceCapabilities.supportsPreciseDistanceMeasurement
  }

  static func start(key: String, handle: String) async {
    stop()
    let gen = generation
    if FriendRanger.isSupported {
      let r = FriendRanger()
      r.onDistance = { peer, metres in
        FriendBeaconIsland.emit(gen, ["kind": "distance", "key": peer, "metres": metres])
      }
      ranger = r
    }
    let made = FriendBeacon(key: key, handle: String(handle.prefix(40))) { @Sendable event in
      Task { @MainActor in FriendBeaconIsland.handle(event, gen) }
    }
    beacon = made
    await made.start()
  }

  static func stop() {
    generation += 1
    if let beacon { Task { await beacon.stop() } }
    beacon = nil
    ranger?.stopAll()
    ranger = nil
  }

  /// NearbyFriendModel.handle: the token swap happens here, the rest goes to JS.
  private static func handle(_ event: FriendBeacon.Event, _ gen: Int) {
    guard gen == generation else { return }
    switch event {
    case .seen(let map):
      let peers = map.keys.sorted().map { ["key": $0, "handle": map[$0] ?? "Player"] }
      emit(gen, ["kind": "seen", "peers": peers])
    case .hello(let key, let handle):
      emit(gen, ["kind": "hello", "key": key, "handle": handle])
      if let ranger, let token = ranger.token(for: key), let beacon {
        Task { await beacon.send(token: token, to: key) }
      }
    case .token(let key, let data):
      if let answer = ranger?.accept(data, from: key), let beacon {
        Task { await beacon.send(token: answer, to: key) }
      }
    case .linkLost(let key):
      emit(gen, ["kind": "lost", "key": key])
    case .denied:
      emit(gen, ["kind": "denied"])
    }
  }

  private static func emit(_ gen: Int, _ body: [String: Any?]) {
    guard gen == generation else { return }
    (sink ?? GameEventSink.current)?.send("onFriendBeacon", body)
  }
}
