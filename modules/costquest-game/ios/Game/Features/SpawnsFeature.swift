import SwiftUI
import UIKit

// FEATURE: spawns. Wandering challenges appear as points with source "wander" (from the server); this adds the radar strip and their expiry line.
//
// This file is the whole iOS side of the feature. The views below are
// already placed in the app (RoamHomeView, PointCard, DailiesSheet...), so
// the feature only fills them in here. Keep every name and signature that is
// used elsewhere; add anything else you need in THIS file (more types, views,
// calls via `store.api.roamGet/roamPost`). Stay stateless where you can and
// hold state in an @Observable you create here.

/// A strip above the Nearby tray naming what is close and what is about to
/// appear or vanish.
struct NearbyRadar: View {
    let store: RoamStore
    @State private var model = SpawnRadarModel()

    var body: some View {
        // Redrawn every 20 s so "next in 4 min" and the wandering count
        // (which drops as challenges leave) stay true between point refreshes.
        TimelineView(.periodic(from: .now, by: 20)) { context in
            let now = context.date
            let reach = store.points.filter { store.inReach($0) && !Spawns.isGone($0, now: now) }.count
            let wandering = store.points.filter { Spawns.isWander($0) && !Spawns.isGone($0, now: now) }.count
            let parts = Spawns.radarParts(reach: reach, wandering: wandering,
                                          next: model.nextAt, now: now)
            if store.coordinate != nil, !parts.isEmpty {
                GameHUDPanel(padding: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: wandering > 0 ? "wind" : "dot.radiowaves.left.and.right")
                            .font(.system(size: 16, weight: .heavy))
                            .foregroundStyle(GamePalette.sun)
                        Text(parts.joined(separator: " · "))
                            .font(GameFont.body(14, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Spacer(minLength: 0)
                    }
                }
                .padding(.horizontal, 14)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(parts.joined(separator: ", "))
                .transition(.opacity)
            }
        }
        .task {
            // Poll once a minute while the strip is on screen. The server
            // derives wandering challenges from place and time, so this is a
            // cheap, public read; a failure just hides the "next" part.
            while !Task.isCancelled {
                await model.refresh(store: store)
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }
}

/// A line on the point card for a wandering challenge (e.g. "Gone in 12 min").
struct SpawnLine: View {
    let point: QuestPoint

    var body: some View {
        if let until = Spawns.expiry(point) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let left = until.timeIntervalSince(context.date)
                HStack(spacing: 8) {
                    Image(systemName: "wind")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(left > 0 ? GamePalette.skyDeep : GamePalette.berry)
                    Text(left > 0 ? "Wandering · gone in \(Spawns.span(left))"
                                  : "Wandered off. Look for the next one")
                        .font(GameFont.body(15, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.8))
                        .monospacedDigit()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Capsule().fill(GamePalette.sky.opacity(0.16)))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(left > 0 ? "Wandering challenge, gone in \(Spawns.span(left))"
                                             : "This wandering challenge has gone")
            }
        } else {
            EmptyView()
        }
    }
}

// MARK: - Model and helpers

/// GET v1/roam/spawns/next: when the next wandering challenge appears nearby.
struct SpawnNext: Decodable, Sendable {
    let next_at: String?
    let in_s: Int?
    let alive: Int
}

@MainActor
@Observable
final class SpawnRadarModel {
    /// When the next one appears, on this phone's clock. Built from the
    /// server's "in N seconds" rather than its timestamp, so a phone clock a
    /// few minutes off still counts down correctly.
    private(set) var nextAt: Date?

    func refresh(store: RoamStore) async {
        guard let here = store.coordinate else { nextAt = nil; return }
        do {
            let r = try await store.api.roamGet(
                "v1/roam/spawns/next",
                query: [URLQueryItem(name: "lat", value: String(here.latitude)),
                        URLQueryItem(name: "lng", value: String(here.longitude))],
                as: SpawnNext.self)
            nextAt = r.in_s.map { Date().addingTimeInterval(TimeInterval($0)) }
        } catch {
            nextAt = nil
        }
    }
}

enum Spawns {
    static func isWander(_ p: QuestPoint) -> Bool {
        p.source == "wander" || p.extra?["wander"] == "1"
    }

    static func expiry(_ p: QuestPoint) -> Date? {
        guard let raw = p.extra?["expires_at"] else { return nil }
        return parseISO(raw)
    }

    /// A wandering challenge whose time is up, before the next points
    /// refresh removes it. Everything else is never "gone".
    static func isGone(_ p: QuestPoint, now: Date) -> Bool {
        guard let until = expiry(p) else { return false }
        return until <= now
    }

    static func parseISO(_ s: String) -> Date? {
        // Python's isoformat() adds fractional seconds only when there are
        // some, so try both shapes. Made per call: the formatter is not
        // Sendable, and this runs a few times a minute.
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)
    }

    /// "12 min", or seconds in the last minute, where every second counts.
    static func span(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds.rounded(.up)))
        if s < 60 { return "\(s) s" }
        return "\((s + 59) / 60) min"
    }

    static func radarParts(reach: Int, wandering: Int, next: Date?, now: Date) -> [String] {
        var parts: [String] = []
        if reach > 0 { parts.append("\(reach) in reach") }
        if wandering > 0 { parts.append("\(wandering) wandering") }
        if let next {
            let left = next.timeIntervalSince(now)
            if left > 0 { parts.append("next in \(span(left))") }
        }
        return parts
    }
}
