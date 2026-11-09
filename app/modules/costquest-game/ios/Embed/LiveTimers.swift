// Quest Run and raid clocks on the lock screen and in the Dynamic Island
// (ActivityKit). The widget extension (targets/live-activity) draws them; this
// starts, updates and ends them for features/game/liveTimer.ts. Local updates
// only (no APNs push in v1): the countdown runs off the end date on its own.
//
// One activity per kind: starting a run timer ends any older run timer first,
// so a relaunch mid-run, or a run the app lost track of, never stacks two.
import ExpoModulesCore
import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

struct LiveTimerStateRecord: Record {
  @Field var line: String = ""
  @Field var hpPercent: Int? = nil
  @Field var fighters: Int? = nil
  @Field var finished: Bool = false
  @Field var headline: String? = nil
}

/// The record as a plain value (records are not Sendable).
struct LiveTimerState: Sendable {
  var line: String
  var hpPercent: Int?
  var fighters: Int?
  var finished: Bool
  var headline: String?

  init(_ r: LiveTimerStateRecord?) {
    line = r?.line ?? ""
    hpPercent = r?.hpPercent.map { max(0, min(100, $0)) }
    fighters = r?.fighters.map { max(0, $0) }
    finished = r?.finished ?? false
    headline = r?.headline
  }
}

enum LiveTimers {
  /// The phone can show Live Activities and the player has not turned them off for the app.
  static var supported: Bool {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
    #endif
    return false
  }

  #if canImport(ActivityKit)
  @available(iOS 16.2, *)
  private static func content(_ s: LiveTimerState, endsAt: Date) -> ActivityContent<CosQuestTimerAttributes.ContentState> {
    let state = CosQuestTimerAttributes.ContentState(
      endsAt: endsAt, line: s.line, hpPercent: s.hpPercent, fighters: s.fighters,
      finished: s.finished, headline: s.headline)
    // Stale a minute after the clock runs out: iOS dims it if the app never said it ended.
    return ActivityContent(state: state, staleDate: s.finished ? nil : endsAt.addingTimeInterval(60))
  }

  @available(iOS 16.2, *)
  private static func find(_ idOrKind: String) -> [Activity<CosQuestTimerAttributes>] {
    let all = Activity<CosQuestTimerAttributes>.activities
    if idOrKind == "all" { return all }
    return all.filter { $0.id == idOrKind || $0.attributes.kind == idOrKind }
  }
  #endif

  /// The new activity's id, or nil when the phone can't show one.
  static func start(kind: String, title: String, subtitle: String, link: String,
                    endsAtMs: Double, state: LiveTimerState) async -> String? {
    #if canImport(ActivityKit)
    guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
    let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
    for old in find(kind) {
      await old.end(nil, dismissalPolicy: .immediate)
    }
    let attrs = CosQuestTimerAttributes(kind: kind, title: title, subtitle: subtitle,
                                        startedAt: Date(), link: link)
    do {
      let a = try Activity.request(attributes: attrs, content: content(state, endsAt: endsAt), pushType: nil)
      return a.id
    } catch {
      NSLog("[LiveTimers] start failed: %@", String(describing: error))
      return nil
    }
    #else
    return nil
    #endif
  }

  /// Updates by id or kind; false when there was nothing to update.
  static func update(_ idOrKind: String, endsAtMs: Double?, state: LiveTimerState) async -> Bool {
    #if canImport(ActivityKit)
    guard #available(iOS 16.2, *) else { return false }
    let found = find(idOrKind)
    for a in found {
      let endsAt = endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) } ?? a.content.state.endsAt
      await a.update(content(state, endsAt: endsAt))
    }
    return !found.isEmpty
    #else
    return false
    #endif
  }

  /// Ends by id, kind or "all". With a final state it stays on the lock screen
  /// a couple of minutes showing it; without, it goes at once.
  static func end(_ idOrKind: String, final: LiveTimerState?) async {
    #if canImport(ActivityKit)
    guard #available(iOS 16.2, *) else { return }
    for a in find(idOrKind) {
      if let final {
        let done = LiveTimerState(finished: true, from: final)
        await a.end(content(done, endsAt: a.content.state.endsAt),
                    dismissalPolicy: .after(Date().addingTimeInterval(120)))
      } else {
        await a.end(nil, dismissalPolicy: .immediate)
      }
    }
    #endif
  }
}

extension LiveTimerState {
  init(finished: Bool, from s: LiveTimerState) {
    self = s
    self.finished = finished
  }
}
