import SwiftUI

/// Today's three quests. They reset at midnight UTC and are the same three all
/// day, so a player can plan a walk around them.
struct DailiesSheet: View {
    let store: RoamStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "Daily quests") { dismiss() }
                    if let me = store.me {
                        streak(me.streak)
                        StampCard(store: store)
                        ForEach(me.dailies) { d in DailyRow(daily: d) }
                        if store.unlocked(.walking) { StepsCard(store: store) }
                        Text("New quests every day at \(resetTime).")
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(.horizontal, 4)
                    } else {
                        ProgressView().tint(.white)
                    }
                }
                .padding(18)
            }
        }
        .gameType()
        .presentationDragIndicator(.visible)
        .task { await store.refreshMe() }
    }

    private var resetTime: String {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        let midnight = utc.startOfDay(for: Date().addingTimeInterval(86_400))
        return midnight.formatted(date: .omitted, time: .shortened)
    }

    private func streak(_ s: RoamMe.Streak) -> some View {
        GamePanel {
            HStack(spacing: 14) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundStyle(s.days > 0 ? GamePalette.sunDeep : Color(white: 0.6))
                VStack(alignment: .leading, spacing: 2) {
                    Text(s.days == 0 ? "Start a streak" : s.days == 1 ? "1 day streak" : "\(s.days) day streak")
                        .font(GameFont.display(24))
                    Text(s.played_today ? "Played today. Come back tomorrow to keep it going."
                                        : s.days == 0 ? "Play any point today to start one."
                                        : "Play any point today to keep it going.")
                        .font(GameFont.body(14, weight: .medium))
                        .foregroundStyle(GamePalette.ink.opacity(0.7))
                }
                Spacer()
                if s.best > s.days {
                    VStack(spacing: 0) {
                        Text("\(s.best)").font(GameFont.display(20))
                        Text("best").font(GameFont.body(12, weight: .semibold))
                    }
                    .foregroundStyle(GamePalette.ink.opacity(0.6))
                }
            }
        }
    }
}

struct DailyRow: View {
    let daily: RoamDaily

    var body: some View {
        GamePanel(face: daily.done ? Color(red: 0.86, green: 0.97, blue: 0.9) : GamePalette.cream) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: daily.done ? "checkmark.seal.fill" : "scope")
                        .font(.system(size: 24, weight: .heavy))
                        .foregroundStyle(daily.done ? GamePalette.mint : GamePalette.skyDeep)
                    Text(daily.title).font(GameFont.display(20))
                    Spacer()
                    Text("+\(daily.reward.xp) XP")
                        .font(GameFont.display(16))
                        .foregroundStyle(GamePalette.skyDeep)
                }
                XPBar(progress: Double(daily.progress) / Double(max(1, daily.target)))
                Text(daily.done ? "Done" : "\(daily.progress) of \(daily.target)")
                    .font(GameFont.body(14, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.65))
            }
        }
    }
}

/// This week's war in this city, and who is carrying it.
struct WarSheet: View {
    let store: RoamStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "Faction war") { dismiss() }
                    if let war = store.war {
                        GamePanel {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Text(regionName(war.region)).font(GameFont.display(24))
                                    Spacer()
                                    Text(endsIn(war.ends_at))
                                        .font(GameFont.body(14, weight: .semibold))
                                        .foregroundStyle(GamePalette.ink.opacity(0.65))
                                }
                                ForEach(war.standings) { s in
                                    WarBar(standing: s, top: war.standings.first?.points ?? 0,
                                           mine: s.faction == store.me?.faction)
                                }
                                Text(war.total == 0
                                     ? "No points yet this week. Every point you play counts for your side."
                                     : "\(war.players) \(war.players == 1 ? "player" : "players") this week. Every point you play counts for your side.")
                                    .font(GameFont.body(14, weight: .medium))
                                    .foregroundStyle(GamePalette.ink.opacity(0.7))
                            }
                        }
                    }
                    if let leaders = store.leaders, !leaders.leaders.isEmpty {
                        GamePanel {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Top players this week").font(GameFont.display(22))
                                ForEach(leaders.leaders.prefix(10)) { l in
                                    HStack(spacing: 10) {
                                        Text("\(l.place)")
                                            .font(GameFont.display(18))
                                            .frame(width: 28)
                                            .foregroundStyle(l.place <= 3 ? GamePalette.sunDeep
                                                             : GamePalette.ink.opacity(0.5))
                                        Circle().fill(RoamStyle.realmColor(l.faction))
                                            .frame(width: 12, height: 12)
                                        Text(l.handle).font(GameFont.body(16, weight: .semibold))
                                        Text("Lv \(l.level)")
                                            .font(GameFont.body(13, weight: .semibold))
                                            .foregroundStyle(GamePalette.ink.opacity(0.5))
                                        Spacer()
                                        Text("\(l.week_xp) XP").font(GameFont.display(16))
                                    }
                                    .padding(.vertical, 2)
                                    .background(l.you ? GamePalette.sun.opacity(0.18) : .clear)
                                }
                            }
                        }
                    }
                    if store.war == nil { ProgressView().tint(.white) }
                }
                .padding(18)
            }
        }
        .gameType()
        .presentationDragIndicator(.visible)
        .task { await store.refreshWar() }
    }

    private func regionName(_ r: String) -> String {
        r == "world" ? "Your area" : r.capitalized
    }

    private func endsIn(_ iso: String) -> String {
        guard let end = RoamDates.parse(iso) else { return "" }
        let days = Int(end.timeIntervalSinceNow / 86_400)
        if days >= 1 { return "Ends in \(days) \(days == 1 ? "day" : "days")" }
        let hours = max(1, Int(end.timeIntervalSinceNow / 3600))
        return "Ends in \(hours)h"
    }
}

struct WarBar: View {
    let standing: FactionWar.Standing
    let top: Int
    let mine: Bool

    var body: some View {
        let colour = RoamStyle.realmColor(standing.faction)
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: RoamStyle.realmSymbol(standing.faction))
                    .foregroundStyle(colour)
                Text(standing.name).font(GameFont.display(17))
                if mine { GameChip(text: "You", color: colour) }
                Spacer()
                Text("\(standing.points)").font(GameFont.display(17).monospacedDigit())
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(GamePalette.ink.opacity(0.1))
                    Capsule().fill(colour)
                        .frame(width: top > 0 ? max(10, g.size.width * Double(standing.points) / Double(top)) : 10)
                }
            }
            .frame(height: 12)
        }
    }
}

struct SheetHeader: View {
    let title: String
    var onClose: () -> Void

    var body: some View {
        HStack {
            GameHeading(title, size: 34)
            Spacer()
            Button(action: onClose) { Image(systemName: "xmark") }
                .buttonStyle(.gameIcon(GamePalette.berry, diameter: 42))
                .accessibilityLabel("Close")
        }
        .padding(.top, 8)
    }
}
