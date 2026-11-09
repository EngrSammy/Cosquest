import Foundation
import SwiftUI

/// What the game shows a player, and when: features open as a player levels,
/// each introduced once, and the Warden's best next move.
///
/// Fifteen features arriving at once is a home screen nobody can read. Pokémon
/// GO opens gyms at level 5 for the same reason: a new player learns one thing
/// at a time, and each unlock is a small event rather than clutter.
enum RoamUnlock: String, CaseIterable {
    case codex, relics, war, battle, walking, friends, raids

    var level: Int {
        switch self {
        case .codex: return 2
        case .relics: return 2
        case .walking: return 2
        case .war: return 3
        case .battle: return 3
        case .friends: return 4
        case .raids: return 5
        }
    }

    var title: String {
        switch self {
        case .codex: return "The Codex is open"
        case .relics: return "Relics are waking"
        case .war: return "Your faction needs you"
        case .battle: return "Battle anyone, anywhere"
        case .walking: return "Every kilometre counts"
        case .friends: return "Friends unlocked"
        case .raids: return "Bosses walk the city"
        }
    }

    var line: String {
        switch self {
        case .codex: return "Every point you play leaves a card behind. Collect them all, finish the sets."
        case .relics: return "Right answers can drop Relics: faction weapons that power your sieges. Your first one is waiting."
        case .war: return "Take points for your side, defend them, and win your city this week."
        case .battle: return "Start a Room where you stand and fight whoever's around in AR. Grab a weapon and go."
        case .walking: return "Walk and earn XP and items: 5, 25 and 50 km a week."
        case .friends: return "Hold two phones together to add a friend. No chat, and nobody sees where you are."
        case .raids: return "Every hour a boss appears near you for half an hour. Bring a crew and bring it down."
        }
    }

    var symbol: String {
        switch self {
        case .codex: return "rectangle.stack.fill"
        case .relics: return "diamond.fill"
        case .war: return "flag.2.crossed.fill"
        case .battle: return "figure.fencing"
        case .walking: return "figure.walk"
        case .friends: return "person.2.fill"
        case .raids: return "crown.fill"
        }
    }

    func open(at level: Int) -> Bool { level >= self.level }

    private static let key = "cq.unlocks.introduced"

    static var introduced: Set<String> {
        get { Set(UserDefaults.standard.stringArray(forKey: key) ?? []) }
        set { UserDefaults.standard.set(Array(newValue), forKey: key) }
    }

    /// The next unlock to introduce at this level, if any.
    static func pending(at level: Int) -> RoamUnlock? {
        allCases.first { $0.open(at: level) && !introduced.contains($0.rawValue) }
    }

    static func markIntroduced(_ u: RoamUnlock) {
        var s = introduced
        s.insert(u.rawValue)
        introduced = s
    }
}

extension RoamStore {
    var level: Int { me?.standing.level ?? 1 }

    func unlocked(_ u: RoamUnlock) -> Bool { u.open(at: level) }

    /// Points a player at this level can see: bosses wait for level 5.
    var visiblePoints: [QuestPoint] {
        unlocked(.raids) ? points : points.filter { $0.source != "raid" }
    }

    /// The Warden's best next move: one point, and why.
    ///
    /// Plain scoring, not the model: which point is worth walking to is a
    /// sum with a right answer. The model's job is to say it well.
    func bestNext() -> (point: QuestPoint, reason: String?)? {
        let dailies = (me?.dailies ?? []).filter { !$0.done }
        let wants = Set(dailies.map(\.id))
        var best: (QuestPoint, Double, String?)?
        for p in visiblePoints where !p.isCooling && p.source != "starter" {
            guard let d = distance(to: p), d < 900 else { continue }
            var score = 0.0
            var why: String?
            switch p.tier {
            case "epic": score += 3
            case "rare": score += 2
            default: score += 1
            }
            if wants.contains("rare"), p.tier != "common" { score += 2; why = dailies.first { $0.id == "rare" }?.title }
            if wants.contains("blitz"), p.challenge == "blitz" { score += 2; why = dailies.first { $0.id == "blitz" }?.title }
            if wants.contains("sequence"), p.challenge == "sequence" { score += 2; why = dailies.first { $0.id == "sequence" }?.title }
            if p.extra?["codex"] != "owned", unlocked(.codex) { score += 0.8 }
            if unlocked(.war), let holder = p.extra?["holder"], holder != me?.faction { score += 1 }
            if unlocked(.war), p.extra?["holder"] == nil, me?.faction != nil { score += 0.5 }
            if p.source == "wander", let e = p.extra?["expires_at"], let t = RoamDates.parse(e),
               t.timeIntervalSinceNow < 900 { score += 1.2 }
            if p.source == "raid" { score += 3 }
            score -= d / 250
            if best == nil || score > best!.1 { best = (p, score, why) }
        }
        return best.map { ($0.0, $0.2) }
    }
}

/// Where each rail button sits, for a coach mark to point at. Read with
/// `.overlayPreferenceValue(RailAnchorKey.self)`; keys are "dailies",
/// "codex", "relics", "war", "battle", "recap", "events".
struct RailAnchorKey: PreferenceKey {
    static let defaultValue: [String: Anchor<CGRect>] = [:]
    static func reduce(value: inout [String: Anchor<CGRect>], nextValue: () -> [String: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

extension View {
    /// Marks a rail button for coach marks and UI tests ("rail.<id>").
    func railAnchor(_ id: String) -> some View {
        anchorPreference(key: RailAnchorKey.self, value: .bounds) { [id: $0] }
            .accessibilityIdentifier("rail.\(id)")
    }

    /// One button standing in for several (More, for everything moved off
    /// the rail), so a coach mark aimed at any of them lights it.
    func railAnchors(_ ids: [String]) -> some View {
        anchorPreference(key: RailAnchorKey.self, value: .bounds) { a in
            Dictionary(uniqueKeysWithValues: ids.map { ($0, a) })
        }
        .accessibilityIdentifier("rail.\(ids.first ?? "more")")
    }
}
