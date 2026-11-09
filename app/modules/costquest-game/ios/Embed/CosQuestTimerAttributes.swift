// The lock-screen / Dynamic Island timer of a Quest Run or a raid (Live Activity).
//
// ONE FILE, TWO TARGETS: the app's module (this pod) starts and updates the
// activity (LiveTimers.swift); the widget extension CosQuestLiveActivity draws
// it (targets/live-activity). plugins/withLiveActivity.js copies this very file
// into the extension at prebuild, so the two can never drift: ActivityKit
// matches them by the type's name and its Codable shape.
//
// No push in v1: the app updates it while it runs, and the clock is the end
// date (Text(timerInterval:)), so it keeps counting down with the app closed.
#if canImport(ActivityKit)
import ActivityKit
import Foundation

public struct CosQuestTimerAttributes: ActivityAttributes, Sendable {
  public struct ContentState: Codable, Hashable, Sendable {
    /// When the clock reaches 0:00.
    public var endsAt: Date
    /// The line under the title: "420 pts · 4 of 10 points", "3 fighting".
    public var line: String
    /// A raid boss's HP left, 0...100; nil when unknown (and for a run).
    public var hpPercent: Int?
    /// Players in the raid this hour; nil when unknown.
    public var fighters: Int?
    /// Over: the clock gives way to `headline`.
    public var finished: Bool
    /// The last word once over: "Run over · 420 pts", "Boss down!".
    public var headline: String?

    public init(endsAt: Date, line: String, hpPercent: Int? = nil, fighters: Int? = nil,
                finished: Bool = false, headline: String? = nil) {
      self.endsAt = endsAt
      self.line = line
      self.hpPercent = hpPercent
      self.fighters = fighters
      self.finished = finished
      self.headline = headline
    }
  }

  /// "run" or "raid": the colour and the symbol.
  public var kind: String
  /// "Quest Run", the boss's name.
  public var title: String
  /// "Daily run", "Boss raid at Trafalgar Square".
  public var subtitle: String
  /// When it began: the minimal view's ring runs from here to endsAt.
  public var startedAt: Date
  /// Where a tap goes (cosquest://play?raid=<point id>).
  public var link: String

  public init(kind: String, title: String, subtitle: String, startedAt: Date, link: String) {
    self.kind = kind
    self.title = title
    self.subtitle = subtitle
    self.startedAt = startedAt
    self.link = link
  }
}
#endif
