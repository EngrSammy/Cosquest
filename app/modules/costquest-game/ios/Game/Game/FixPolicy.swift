import Foundation

/// What a venue game event tells the server about the phone's fix, beside its
/// lat/lng, and what the phone does when the server says it has no usable fix.
/// The Swift twin of the RN game's features/game/fixInfo.ts (server branch
/// anticheat-location, app/anticheat.py), with the same numbers and the same
/// test vectors (linux-check/main.swift against __tests__/fixInfo.test.ts):
///
///   accuracy_m   the fix's horizontal accuracy, metres (0 to 5000)
///   fix_age_s    how old the fix was when the action was taken, seconds
///   simulated    iOS 15+ CLLocationSourceInformation.isSimulatedBySoftware
///
/// `simulated` is evidence only: the server records it and never refuses for
/// it, so a developer phone whose location Xcode simulates still plays.
/// `fix_age_s` matters: a located action in a paid venue game whose fix is
/// older than 30 s (or that has no position) comes back
/// `{code: "need_location", retry: true}`, not judged and not journalled, and
/// the session gets a fresh fix and sends the same action again
/// (`nextRetryWait`). Pure, no CoreLocation, so it runs on Linux.
enum FixPolicy {

    /// A fix as the session keeps it: how good, when the OS took it, and
    /// whether iOS says software made it up.
    struct Fix: Equatable, Sendable {
        var accuracy: Double
        /// When the OS took the fix (CLLocation.timestamp).
        var at: Date?
        var simulated: Bool?
    }

    /// The server refuses a located venue action whose fix is older than this
    /// (anticheat KNOBS fix_max_age_s).
    static let serverFixMaxAgeS: Double = 30
    /// Before a located action, a fix older than this is refreshed first: well
    /// inside the server's 30 s.
    static let fixFreshS: Double = 15
    /// The server's own words for a refusal for want of a fix (anticheat.NEED_LOCATION).
    static let needLocationText = "Waiting for your location. Try again in a moment."
    /// Shown while the session waits for a fix to send an action again.
    static let waitingForLocation = "Waiting for your location…"

    /// Three more sends inside 20 s, waiting 1.5, 3 and 5 s before each.
    struct RetryPolicy: Sendable {
        var tries: Int
        var budget: Double
        var waits: [Double]
    }
    static let retry = RetryPolicy(tries: 3, budget: 20, waits: [1.5, 3, 5])

    /// Seconds since the fix, to 0.1 s; never negative (a phone clock a little
    /// behind the fix's). Nil when unknown.
    static func ageS(_ at: Date?, now: Date) -> Double? {
        guard let at, at.timeIntervalSince1970 > 0 else { return nil }
        let ms = max(0, now.timeIntervalSince(at) * 1000)
        return (ms / 100).rounded() / 10
    }

    /// accuracy_m, fix_age_s and simulated for a fix, now: only what is known.
    static func fields(_ fix: Fix?, now: Date) -> [String: WireValue] {
        guard let fix else { return [:] }
        var out: [String: WireValue] = [:]
        if fix.accuracy.isFinite, fix.accuracy >= 0 {
            out["accuracy_m"] = .double(min(5000, fix.accuracy))
        }
        if let age = ageS(fix.at, now: now) { out["fix_age_s"] = .double(age) }
        if let simulated = fix.simulated { out["simulated"] = .bool(simulated) }
        return out
    }

    /// True when the fix is younger than `maxS` seconds.
    static func isFresh(_ at: Date?, now: Date, maxS: Double = fixFreshS) -> Bool {
        guard let age = ageS(at, now: now) else { return false }
        return age <= maxS
    }

    /// A verdict that refused the action for want of a usable fix, and may be
    /// sent again: `code: "need_location"` (unless `retry: false`), or the
    /// server's own sentence from a server that sends no code.
    static func isNeedLocation(ok: Bool, code: String?, retry: Bool?, reason: String?) -> Bool {
        if ok { return false }
        if code == "need_location" { return retry != false }
        return reason == needLocationText
    }

    /// Wait this long (seconds) for a fresh fix before send number `attempt`
    /// (1 = the first resend), or nil to stop and show the server's reason.
    /// `elapsed` is the time since the first refusal.
    static func nextRetryWait(attempt: Int, elapsed: Double,
                              policy: RetryPolicy = retry) -> Double? {
        guard attempt >= 1, attempt <= policy.tries, !policy.waits.isEmpty else { return nil }
        let wait = policy.waits[min(attempt, policy.waits.count) - 1]
        guard elapsed.isFinite, elapsed >= 0, elapsed + wait <= policy.budget else { return nil }
        return wait
    }

    /// Player copy for a refusal the server gave a code (anticheat.judge_action
    /// and judge_hit), or nil to fall back to the reason text. Short, for a
    /// feed line read mid-game.
    static func copy(code: String?, distance: Double?) -> String? {
        switch code {
        case "need_location":
            return "Waiting for your location. Try again in a moment"
        case "too_far":
            if let distance, distance.isFinite, distance > 0 {
                return "Too far from that point (\(Int(distance.rounded())) m). Get closer"
            }
            return "Too far from that point. Get closer"
        case "hit_gps":
            return "They're too far away. Get closer"
        default:
            return nil
        }
    }
}
