// The Quest Run / raid clock on the lock screen and in the Dynamic Island.
// The widget extension CosQuestLiveActivity, added at prebuild by
// plugins/withLiveActivity.js; the app starts and updates the activity
// (modules/costquest-game/ios/Embed/LiveTimers.swift). The attributes type is
// that module's CosQuestTimerAttributes.swift, copied in by the plugin.
//
// The look is the game's (components/game/theme.ts GP, RUN_GOLD, RAID_COLOR):
// a navy card, gold for a run, raid purple for a boss, Lilita One for the
// title and the clock.
import ActivityKit
import SwiftUI
import WidgetKit

@main
struct CosQuestLiveActivityBundle: WidgetBundle {
  var body: some Widget {
    CosQuestTimerLiveActivity()
  }
}

enum CQ {
  static let navy = Color(red: 0x1F / 255, green: 0x3B / 255, blue: 0x4D / 255)
  static let navyEdge = Color(red: 0x12 / 255, green: 0x26 / 255, blue: 0x33 / 255)
  static let gold = Color(red: 0xFA / 255, green: 0xBD / 255, blue: 0x29 / 255)
  static let raid = Color(red: 0xC2 / 255, green: 0x21 / 255, blue: 0xD6 / 255)
  static let berry = Color(red: 0xD9 / 255, green: 0x38 / 255, blue: 0x40 / 255)
  static let mint = Color(red: 0x3D / 255, green: 0xBF / 255, blue: 0x8A / 255)
  static let soft = Color.white.opacity(0.72)

  static func accent(_ kind: String) -> Color { kind == "raid" ? raid : gold }
  static func symbol(_ kind: String) -> String { kind == "raid" ? "flame.fill" : "figure.run" }
  /// Lilita One when the font made it into the extension, else the rounded system face.
  static func display(_ size: CGFloat) -> Font {
    UIFont(name: "LilitaOne", size: size) != nil
      ? .custom("LilitaOne", size: size)
      : .system(size: size, weight: .heavy, design: .rounded)
  }
  static func hpColor(_ p: Int) -> Color { p <= 25 ? berry : p <= 60 ? gold : mint }
}

typealias TimerContext = ActivityViewContext<CosQuestTimerAttributes>

/// The countdown, ticking on its own; never a backwards range.
struct Clock: View {
  let endsAt: Date
  var size: CGFloat = 28
  var body: some View {
    Text(timerInterval: Date()...max(Date(), endsAt), countsDown: true, showsHours: false)
      .font(CQ.display(size))
      .monospacedDigit()
      .multilineTextAlignment(.trailing)
  }
}

struct Badge: View {
  let kind: String
  var size: CGFloat = 36
  var body: some View {
    ZStack {
      Circle().fill(CQ.accent(kind))
      Image(systemName: CQ.symbol(kind))
        .font(.system(size: size * 0.48, weight: .bold))
        .foregroundStyle(kind == "raid" ? Color.white : CQ.navyEdge)
    }
    .frame(width: size, height: size)
  }
}

struct HPBar: View {
  let percent: Int
  var body: some View {
    GeometryReader { g in
      ZStack(alignment: .leading) {
        Capsule().fill(Color.white.opacity(0.16))
        Capsule().fill(CQ.hpColor(percent))
          .frame(width: max(6, g.size.width * CGFloat(percent) / 100))
      }
    }
    .frame(height: 7)
    .accessibilityLabel("Boss health \(percent) percent")
  }
}

/// "Boss 62% · 4 fighting" or the run's score line.
func detailLine(_ s: CosQuestTimerAttributes.ContentState) -> String {
  var parts: [String] = []
  if !s.line.isEmpty { parts.append(s.line) }
  if let f = s.fighters, f > 0 { parts.append(f == 1 ? "1 fighting" : "\(f) fighting") }
  return parts.joined(separator: " · ")
}

struct LockScreenView: View {
  let context: TimerContext
  var body: some View {
    let a = context.attributes, s = context.state
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 12) {
        Badge(kind: a.kind, size: 40)
        VStack(alignment: .leading, spacing: 1) {
          Text(a.title).font(CQ.display(19)).foregroundStyle(.white).lineLimit(1)
          Text(a.subtitle).font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(CQ.soft).lineLimit(1)
        }
        Spacer(minLength: 8)
        if s.finished {
          Text(s.headline ?? "Over").font(CQ.display(17)).foregroundStyle(CQ.accent(a.kind))
            .lineLimit(2).multilineTextAlignment(.trailing)
        } else {
          Clock(endsAt: s.endsAt, size: 30).foregroundStyle(CQ.accent(a.kind)).frame(maxWidth: 96, alignment: .trailing)
        }
      }
      if let hp = s.hpPercent, a.kind == "raid" {
        HPBar(percent: hp)
      }
      let line = detailLine(s)
      if !line.isEmpty {
        Text(line).font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(CQ.soft).lineLimit(1)
      }
    }
    .padding(16)
  }
}

struct CosQuestTimerLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: CosQuestTimerAttributes.self) { context in
      LockScreenView(context: context)
        .activityBackgroundTint(CQ.navy)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(URL(string: context.attributes.link))
    } dynamicIsland: { context in
      let a = context.attributes, s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Badge(kind: a.kind, size: 34).padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if s.finished {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 26)).foregroundStyle(CQ.accent(a.kind))
          } else {
            Clock(endsAt: s.endsAt, size: 26).foregroundStyle(CQ.accent(a.kind)).frame(maxWidth: 84, alignment: .trailing)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 0) {
            Text(a.title).font(CQ.display(17)).foregroundStyle(.white).lineLimit(1)
            Text(s.finished ? (s.headline ?? "Over") : a.subtitle)
              .font(.system(size: 12, weight: .semibold, design: .rounded))
              .foregroundStyle(CQ.soft).lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            if let hp = s.hpPercent, a.kind == "raid" { HPBar(percent: hp) }
            let line = detailLine(s)
            if !line.isEmpty {
              Text(line).font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(CQ.soft).lineLimit(1)
            }
          }
          .padding(.horizontal, 6)
        }
      } compactLeading: {
        Image(systemName: CQ.symbol(a.kind)).font(.system(size: 14, weight: .bold)).foregroundStyle(CQ.accent(a.kind))
      } compactTrailing: {
        if s.finished {
          Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(CQ.accent(a.kind))
        } else {
          Clock(endsAt: s.endsAt, size: 15).foregroundStyle(CQ.accent(a.kind)).frame(maxWidth: 46)
        }
      } minimal: {
        if s.finished {
          Image(systemName: "checkmark").foregroundStyle(CQ.accent(a.kind))
        } else {
          ProgressView(timerInterval: min(a.startedAt, s.endsAt)...s.endsAt, countsDown: true) {
            EmptyView()
          } currentValueLabel: {
            Image(systemName: CQ.symbol(a.kind)).font(.system(size: 10, weight: .bold))
          }
          .progressViewStyle(.circular)
          .tint(CQ.accent(a.kind))
        }
      }
      .widgetURL(URL(string: a.link))
      .keylineTint(CQ.accent(a.kind))
    }
  }
}
