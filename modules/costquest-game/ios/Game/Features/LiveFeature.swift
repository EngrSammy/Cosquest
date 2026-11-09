import SwiftUI
import UIKit
import CoreLocation

// FEATURE: live. The events calendar, Quest Hour / Landmark Day, the stamp streak.
//
// This file is the whole iOS side of the feature. The views below are
// already placed in the app (RoamHomeView, PointCard, DailiesSheet...), so
// the feature only fills them in here. Keep every name and signature that is
// used elsewhere; add anything else you need in THIS file (more types, views,
// calls via `store.api.roamGet/roamPost`). Stay stateless where you can and
// hold state in an @Observable you create here.
//
// The server owns the calendar and pays the multiplier on the answer; the
// phone only reads GET v1/roam/live/calendar and counts down to what it says.

// MARK: - Wire

struct LiveEvent: Decodable, Sendable, Equatable, Identifiable {
    let key: String
    let title: String
    let multiplier: Double
    let starts_at: String
    let ends_at: String

    var id: String { "\(key)@\(starts_at)" }
    var start: Date? { LiveDates.parse(starts_at) }
    var end: Date? { LiveDates.parse(ends_at) }

    /// "2×", "1.5×": multipliers are whole numbers nearly always.
    var times: String {
        multiplier.rounded() == multiplier ? "\(Int(multiplier))×" : "\(multiplier)×"
    }

    func isLive(at now: Date) -> Bool {
        guard let start, let end else { return false }
        return start <= now && now < end
    }
}

struct LiveCalendar: Decodable, Sendable, Equatable {
    let region: String
    let now: LiveEvent?
    let next: [LiveEvent]

    /// What is on at `now` by the phone's clock. The server's "now" is only as
    /// fresh as the last fetch; an upcoming event that has started since then
    /// is live too, so the banner flips on the minute without a refetch.
    func live(at date: Date) -> LiveEvent? {
        if let e = now, e.isLive(at: date) { return e }
        return next.first { $0.isLive(at: date) }
    }

    func upcoming(after date: Date) -> [LiveEvent] {
        next.filter { ($0.start ?? .distantPast) > date }
    }
}

/// GET v1/roam/me, only the part this feature reads. Kept local so the shared
/// RoamMe wire type stays untouched.
struct LiveMeEnvelope: Decodable, Sendable {
    struct Features: Decodable, Sendable { let live: LiveStamps? }
    let features: Features?
}

struct LiveStamps: Decodable, Sendable, Equatable {
    let stamps: Int
    let cards_done: Int
    let card_size: Int?

    var size: Int { max(1, card_size ?? 7) }
}

enum LiveDates {
    // Python's isoformat() gives "+00:00" and sometimes fractional seconds;
    // try both shapes rather than fail the banner on a microsecond.
    static func parse(_ s: String) -> Date? {
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let d = plain.date(from: s) { return d }
        let frac = ISO8601DateFormatter()
        frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return frac.date(from: s)
    }

    static func left(until end: Date, from now: Date) -> String {
        let mins = Int((end.timeIntervalSince(now) / 60).rounded(.up))
        if mins <= 1 { return "1 min left" }
        if mins < 60 { return "\(mins) min left" }
        let h = mins / 60, m = mins % 60
        return m == 0 ? "\(h) h left" : "\(h) h \(m) min left"
    }

    static func when(_ event: LiveEvent) -> String {
        guard let start = event.start else { return "" }
        let day = start.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
        let from = start.formatted(date: .omitted, time: .shortened)
        let to = event.end?.formatted(date: .omitted, time: .shortened) ?? ""
        return to.isEmpty ? "\(day) · \(from)" : "\(day) · \(from)–\(to)"
    }
}

// MARK: - State

@MainActor @Observable
final class LiveCalendarModel {
    private(set) var calendar: LiveCalendar?
    private(set) var failed = false
    private(set) var loading = false

    func load(_ store: RoamStore) async {
        guard let c = store.coordinate else { return }
        loading = true
        defer { loading = false }
        do {
            calendar = try await store.api.roamGet(
                "v1/roam/live/calendar",
                query: [URLQueryItem(name: "lat", value: String(c.latitude)),
                        URLQueryItem(name: "lng", value: String(c.longitude))],
                as: LiveCalendar.self)
            failed = false
        } catch {
            // Keep the last good calendar: a dropped request should not hide
            // a Quest Hour that is still on.
            failed = true
        }
    }

    /// Fetch now and every 5 minutes; wait for a location fix first, since
    /// the calendar is in the local clock of wherever the player is.
    func run(_ store: RoamStore) async {
        while !Task.isCancelled {
            if store.coordinate == nil {
                try? await Task.sleep(for: .seconds(5))
                continue
            }
            await load(store)
            try? await Task.sleep(for: .seconds(300))
        }
    }
}

@MainActor @Observable
final class LiveStampModel {
    private(set) var stamps: LiveStamps?
    private(set) var failed = false

    func load(_ store: RoamStore) async {
        do {
            let key = try await store.api.deviceKey()
            let me = try await store.api.roamGet(
                "v1/roam/me", query: [URLQueryItem(name: "device_key", value: key)],
                as: LiveMeEnvelope.self)
            stamps = me.features?.live ?? LiveStamps(stamps: 0, cards_done: 0, card_size: 7)
            failed = false
        } catch {
            failed = stamps == nil
        }
    }
}

// MARK: - Banner

/// A banner under the top bar when something is on (Quest Hour now, or next).
struct LiveBanner: View {
    let store: RoamStore
    @State private var model = LiveCalendarModel()
    @State private var showCalendar = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { ctx in
            content(at: ctx.date)
        }
        .task { await model.run(store) }
        .sheet(isPresented: $showCalendar) {
            LiveCalendarSheet(model: model, store: store)
        }
    }

    @ViewBuilder
    private func content(at now: Date) -> some View {
        if let cal = model.calendar {
            if let live = cal.live(at: now), let end = live.end {
                Button { open() } label: {
                    LiveNowBanner(event: live, left: LiveDates.left(until: end, from: now))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(live.title), \(live.times) XP, \(LiveDates.left(until: end, from: now))")
                .accessibilityHint("Opens the events calendar")
            } else if let soon = cal.upcoming(after: now).first,
                      let start = soon.start, start.timeIntervalSince(now) < 86_400 {
                Button { open() } label: { LiveSoonPill(event: soon, start: start) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the events calendar")
            }
        }
    }

    private func open() {
        GameSound.shared.play(.tap)
        showCalendar = true
    }
}

/// One flat card for "on now" and "starting soon", drawn like the nearby
/// cards: a hard navy edge, a sun tile, the name, and when (no pulse, no glow).
private struct LiveCard: View {
    let title: String
    let detail: String
    let multiplier: String
    let isLive: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: isLive ? "bolt.fill" : "clock.fill")
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(isLive ? .white : GamePalette.sunDeep)
                .frame(width: 42, height: 42)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isLive ? GamePalette.sun : GamePalette.sun.opacity(0.22)))
            VStack(alignment: .leading, spacing: 1) {
                Text(title.uppercased())
                    .font(GameFont.display(16, relativeTo: .headline)).tracking(0.6)
                    .foregroundStyle(GamePalette.ink)
                    .lineLimit(1)
                Text(detail)
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(GamePalette.mist)
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            Text("\(multiplier) XP")
                .font(GameFont.display(15))
                .foregroundStyle(GamePalette.sunDeep)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(Capsule().fill(GamePalette.sun.opacity(0.2)))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(GamePalette.cream)
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isLive ? GamePalette.sun : GamePalette.navy.opacity(0.18), lineWidth: 2))
                .shadow(color: .black.opacity(0.18), radius: 0, x: 0, y: 3)
        }
        .padding(.bottom, 3)
    }
}

private struct LiveNowBanner: View {
    let event: LiveEvent
    let left: String

    var body: some View {
        LiveCard(title: event.title, detail: "On now · \(left)", multiplier: event.times, isLive: true)
    }
}

private struct LiveSoonPill: View {
    let event: LiveEvent
    let start: Date

    var body: some View {
        LiveCard(title: event.title, detail: when, multiplier: event.times, isLive: false)
    }

    private var when: String {
        let time = start.formatted(date: .omitted, time: .shortened)
        return (Calendar.current.isDateInToday(start) ? "Today at " : "Tomorrow at ") + time
    }
}

// MARK: - Calendar sheet

private struct LiveCalendarSheet: View {
    let model: LiveCalendarModel
    let store: RoamStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(title: "Events") { dismiss() }
                    TimelineView(.periodic(from: .now, by: 30)) { ctx in
                        list(at: ctx.date)
                    }
                }
                .padding(18)
            }
        }
        .gameType()
        .presentationDragIndicator(.visible)
        .task { await model.load(store) }
    }

    @ViewBuilder
    private func list(at now: Date) -> some View {
        if let cal = model.calendar {
            if let live = cal.live(at: now) {
                GamePanel(face: GamePalette.sun) {
                    row(live, badge: "Live now", color: GamePalette.berry)
                }
            }
            let next = cal.upcoming(after: now)
            if next.isEmpty && cal.live(at: now) == nil {
                note("Nothing on the calendar for the next 30 days. Check back soon.")
            }
            ForEach(next) { e in
                GamePanel { row(e, badge: e.times + " XP", color: color(for: e)) }
            }
            note("Every Wednesday evening is Quest Hour (2× XP). The first Saturday afternoon of each month is Landmark Day (3× XP). Times are local.")
        } else if model.failed {
            note("Couldn't load events. Check your connection.")
            Button("Try again") { Task { await model.load(store) } }
                .buttonStyle(.game(GamePalette.sky, size: .medium))
        } else if store.coordinate == nil {
            note("Waiting for your location: events run on local time.")
        } else {
            ProgressView().tint(.white).frame(maxWidth: .infinity)
        }
    }

    private func row(_ e: LiveEvent, badge: String, color: Color) -> some View {
        HStack(spacing: 12) {
            Image(systemName: e.key == "landmark_day" ? "building.columns.fill" : "bolt.fill")
                .font(.system(size: 22, weight: .heavy))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(color))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(e.title).font(GameFont.display(21))
                Text(LiveDates.when(e))
                    .font(GameFont.body(14, weight: .medium))
                    .foregroundStyle(GamePalette.ink.opacity(0.7))
            }
            Spacer(minLength: 4)
            GameChip(text: badge, color: color)
        }
        .accessibilityElement(children: .combine)
    }

    private func color(for e: LiveEvent) -> Color {
        e.key == "landmark_day" ? GamePalette.berry : GamePalette.skyDeep
    }

    private func note(_ s: String) -> some View {
        Text(s)
            .font(GameFont.body(14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.92))
            .padding(.horizontal, 4)
    }
}

// MARK: - Stamp card

/// The stamp card, shown in the Daily quests sheet.
struct StampCard: View {
    let store: RoamStore
    @State private var model = LiveStampModel()

    var body: some View {
        GamePanel {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Stamp card").font(GameFont.display(24))
                    Spacer()
                    if let s = model.stamps, s.cards_done > 0 {
                        GameChip(text: s.cards_done == 1 ? "1 card done" : "\(s.cards_done) cards done",
                                 color: GamePalette.mint)
                    }
                }
                if model.failed {
                    HStack {
                        Text("Couldn't load your stamps.")
                            .font(GameFont.body(14, weight: .medium))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                        Spacer()
                        Button("Retry") { Task { await model.load(store) } }
                            .buttonStyle(.game(GamePalette.sky, size: .small, fullWidth: false))
                    }
                } else {
                    stampRow(model.stamps)
                }
                Text("Play any day to stamp it. 7 stamps = 300 XP")
                    .font(GameFont.body(14, weight: .medium))
                    .foregroundStyle(GamePalette.ink.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        // Refetch when the player's XP moves: that is an answer paid, and the
        // first answer of a day is what lays a stamp.
        .task(id: store.me?.standing.xp) { await model.load(store) }
    }

    private func stampRow(_ s: LiveStamps?) -> some View {
        let size = s?.size ?? 7
        let have = min(s?.stamps ?? 0, size)
        return HStack(spacing: 6) {
            ForEach(0..<size, id: \.self) { i in
                LiveStamp(filled: i < have, number: i + 1)
            }
        }
        .redacted(reason: s == nil ? .placeholder : [])
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(s == nil ? "Loading stamps" : "\(have) of \(size) stamps collected")
    }
}

private struct LiveStamp: View {
    let filled: Bool
    let number: Int

    var body: some View {
        ZStack {
            if filled {
                Circle().fill(GamePalette.sunDeep).offset(y: 3)
                Circle().fill(GamePalette.sun)
                    .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: 2))
                Image(systemName: "seal.fill")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(GamePalette.sunDeep)
            } else {
                Circle()
                    .strokeBorder(GamePalette.ink.opacity(0.25),
                                  style: StrokeStyle(lineWidth: 2.5, dash: [5, 4]))
                Text("\(number)")
                    .font(GameFont.display(16))
                    .foregroundStyle(GamePalette.ink.opacity(0.35))
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 44)
        .frame(maxWidth: .infinity)
    }
}
