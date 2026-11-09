import CoreLocation
import Foundation

// What the Roam routes send, in the shapes the server writes them. See
// costquest-backend/app/roam.py. Field names match the JSON exactly, like the
// rest of Wire.swift, so there is no mapping layer to drift.

struct RoamConfig: Decodable, Sendable {
    struct Faction: Decodable, Sendable, Identifiable, Hashable {
        let id: String
        let name: String
    }
    let factions: [Faction]
    let ranks: [String]
    let max_level: Int
    let open_radius_m: Double
    let cooldown_s: Double
    struct Hints: Decodable, Sendable { let fifty: Int; let time: Int; let time_s: Int }
    let hints: Hints?
}

struct RoamHint: Decodable, Sendable {
    let removed: [Int]?
    let coins: Int
    let deadline: String
    let remaining_s: Double?
    var paid_with: String?
    var bag: [String: Int]?
}

struct RoamHintBody: Encodable, Sendable {
    let device_key: String
    let attempt_id: String
    let kind: String
    let question: Int
}

struct QuestPoint: Decodable, Sendable, Identifiable, Equatable {
    let id: String
    let name: String
    let lat: Double
    let lng: Double
    /// landmark | signal | starter
    let source: String
    let place_kind: String
    /// common | rare | epic
    let tier: String
    let realm: String
    /// trivia | sequence | blitz
    let challenge: String
    let distance_m: Double?
    let cooling_until: String?
    /// Short display facts added by features (holder faction, expiry,
    /// raid time, spin rest...). Keys are each feature's own.
    var extra: [String: String]? = nil

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    enum CodingKeys: String, CodingKey {
        case id, name, lat, lng, source, place_kind, tier, realm, challenge, distance_m, cooling_until, extra
    }

    var isCooling: Bool {
        guard let cooling_until, let until = RoamDates.parse(cooling_until) else { return false }
        return until > Date()
    }
}

extension QuestPoint {
    /// `extra` is a flat map of strings, but a feature may send a number or a
    /// small object (the siege's Guardian). Anything else is flattened into
    /// "siege.guardian_hp" style keys rather than failing the whole map.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        lat = try c.decode(Double.self, forKey: .lat)
        lng = try c.decode(Double.self, forKey: .lng)
        source = try c.decode(String.self, forKey: .source)
        place_kind = try c.decode(String.self, forKey: .place_kind)
        tier = try c.decode(String.self, forKey: .tier)
        realm = try c.decode(String.self, forKey: .realm)
        challenge = try c.decode(String.self, forKey: .challenge)
        distance_m = try c.decodeIfPresent(Double.self, forKey: .distance_m)
        cooling_until = try c.decodeIfPresent(String.self, forKey: .cooling_until)
        if let raw = try? c.decodeIfPresent([String: LooseValue].self, forKey: .extra) {
            var flat: [String: String] = [:]
            for (k, v) in raw { v.flatten(into: &flat, key: k) }
            extra = flat
        } else {
            extra = nil
        }
    }
}

/// Any JSON value, for flattening feature extras.
indirect enum LooseValue: Decodable, Sendable {
    case string(String), number(Double), bool(Bool), object([String: LooseValue]), array([LooseValue]), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let d = try? c.decode(Double.self) { self = .number(d) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let o = try? c.decode([String: LooseValue].self) { self = .object(o) }
        else if let a = try? c.decode([LooseValue].self) { self = .array(a) }
        else { self = .null }
    }

    func flatten(into out: inout [String: String], key: String) {
        switch self {
        case .string(let s): out[key] = s
        case .number(let d): out[key] = d == d.rounded() && abs(d) < 1e15 ? String(Int(d)) : String(d)
        case .bool(let b): out[key] = b ? "true" : "false"
        case .object(let o):
            out[key] = "object"
            for (k, v) in o { v.flatten(into: &out, key: key + "." + k) }
        case .array, .null: break
        }
    }
}

struct QuestPoints: Decodable, Sendable {
    let region: String
    let day: String
    let points: [QuestPoint]
    let attribution: String
}

struct RoamStanding: Decodable, Sendable, Equatable {
    let level: Int
    let rank: String
    let xp: Int
    let level_floor_xp: Int
    let next_level_xp: Int
    let into_level: Int
    let level_span: Int
    let max_level: Bool

    var progress: Double { Double(into_level) / Double(max(1, level_span)) }
}

struct RoamDaily: Decodable, Sendable, Identifiable, Equatable {
    struct Reward: Decodable, Sendable, Equatable { let xp: Int; let coins: Int }
    let id: String
    let title: String
    let progress: Int
    let target: Int
    let done: Bool
    let reward: Reward
}

struct RoamMe: Decodable, Sendable, Equatable {
    struct Streak: Decodable, Sendable, Equatable {
        let days: Int
        let best: Int
        let played_today: Bool
    }
    let device_key: String
    let handle: String?
    let faction: String?
    let faction_name: String?
    let faction_change_at: String?
    let standing: RoamStanding
    var coins: Int
    let faction_points: Int
    let streak: Streak
    let tutorial_done: Bool
    let dailies: [RoamDaily]
    let day: String
    struct Today: Decodable, Sendable, Equatable {
        let points_played: Int
        let correct: Int
        let xp: Int
        let best_place: String?
    }
    let today: Today?
    /// What each switched-on feature adds to `me`, under its own name.
    var features: Features?
    struct Features: Decodable, Sendable, Equatable {
        struct Relics: Decodable, Sendable, Equatable {
            var equipped: Relic?
            var owned_count: Int?
        }
        struct Siege: Decodable, Sendable, Equatable {
            struct Active: Decodable, Sendable, Equatable {
                let siege_id: String
                let point_id: String
                var point_name: String?
                /// quiz | duel
                var kind: String?
            }
            var active: Active?
            var holds_lost: [HoldLost]?
        }
        var relics: Relics?
        var siege: Siege?
        /// Guardian Duel: stance, fighter, siege mode, trials. Nil while the
        /// feature is switched off on the server.
        var duel: DuelMe?

        init(from decoder: Decoder) throws {
            // One feature's odd shape must never cost the player their `me`.
            let c = try decoder.container(keyedBy: Keys.self)
            relics = try? c.decodeIfPresent(Relics.self, forKey: .relics)
            siege = try? c.decodeIfPresent(Siege.self, forKey: .siege)
            duel = try? c.decodeIfPresent(DuelMe.self, forKey: .duel)
        }
        enum Keys: String, CodingKey { case relics, siege, duel }
    }
    /// A point this player took that a rival has since taken back.
    struct HoldLost: Decodable, Sendable, Equatable, Hashable {
        let point_id: String
        var point_name: String?
        var by_faction: String?
        var by_faction_name: String?
        var at: String?
    }
    var holds_lost: [HoldLost] { features?.siege?.holds_lost ?? [] }
}

/// A challenge handed out at a point. Everything a phone may see and nothing
/// it may not: no answer key, and sequence beats under ids that mean nothing.
struct RoamAttempt: Decodable, Sendable, Identifiable, Equatable {
    struct Question: Decodable, Sendable, Equatable, Identifiable {
        let id: String
        let q: String
        let choices: [String]
        let difficulty: Int
        /// An emoji rebus: the picture IS the question.
        var clue: String?
    }
    struct Beat: Decodable, Sendable, Equatable, Identifiable, Hashable {
        let id: String
        let text: String
    }
    struct Challenge: Decodable, Sendable, Equatable {
        var questions: [Question]?
        var prompt: String?
        var beats: [Beat]?
    }
    let attempt_id: String
    let point: QuestPoint
    let kind: String
    let realm: String
    let realm_name: String
    let tier: String
    let issued_at: String
    let deadline: String
    let seconds: Int
    let challenge: Challenge
    let resumed: Bool
    /// Seconds left by the server's clock when it answered.
    let remaining_s: Double?

    var id: String { attempt_id }
}

/// Either kind of answer, encoded as the bare JSON value the server expects:
/// an index for a question, a beat id for a sequence.
enum RoamAnswer: Encodable, Sendable {
    case index(Int)
    case beat(String)

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .index(let i): try c.encode(i)
        case .beat(let b): try c.encode(b)
        }
    }
}

struct RoamVerdict: Decodable, Sendable, Equatable {
    struct Reveal: Decodable, Sendable, Equatable {
        var correct: [Int]?
        var marks: [Bool]?
        var correct_order: [String]?
        var correct_text: [String]?
        var positions_right: Int?
    }
    struct Line: Decodable, Sendable, Equatable, Hashable {
        let label: String
        let xp: Int
        let coins: Int
        let faction_points: Int
    }
    struct Reward: Decodable, Sendable, Equatable {
        let xp: Int
        let coins: Int
        let faction_points: Int
        let lines: [Line]
    }
    let attempt_id: String
    let point_id: String
    let point_name: String
    let kind: String
    let tier: String
    let late: Bool
    let correct: Int
    let total: Int
    let reveal: Reveal
    let reward: Reward
    let before: RoamStanding
    let after: RoamStanding
    let leveled_up: Bool
    let rank_up: Bool
    let answer_run: Int
    let streak: Int
    let dailies_completed: [String]
    let cooling_until: String
    let me: RoamMe?
    /// Sharp / Brilliant / Flawless, for a right answer given fast.
    var grade: String?
    var elapsed_s: Double?
    /// What features added to this moment (a new card, a hold taken...).
    var extras: [RoamExtra]?
    /// A miss that can be tried again with a Second chance item.
    var can_retry: Bool?
}

struct RoamExtra: Decodable, Sendable, Equatable, Hashable {
    let kind: String
    let title: String
    var subtitle: String?
    var icon: String?
    /// kind "relic": what dropped, whether it is new, and the shards a
    /// duplicate broke into.
    var relic: Relic?
    var new: Bool?
    var shards: Int?

    enum CodingKeys: String, CodingKey { case kind, title, subtitle, icon, relic, new, shards }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(String.self, forKey: .kind)
        relic = try? c.decodeIfPresent(Relic.self, forKey: .relic)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? relic?.name ?? ""
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        icon = try c.decodeIfPresent(String.self, forKey: .icon)
        new = try? c.decodeIfPresent(Bool.self, forKey: .new)
        shards = try? c.decodeIfPresent(Int.self, forKey: .shards)
    }
}

struct RoamBag: Decodable, Sendable, Equatable {
    let bag: [String: Int]
    let names: [String: String]
}

struct RoamSpin: Decodable, Sendable, Equatable {
    let point_id: String
    let items: [String: Int]
    let xp: Int
    let streak_bonus: Bool
    let spins_in_window: Int
    let bag: [String: Int]
    let names: [String: String]
    let spin_ready_at: String
}

struct RoamSpinBody: Encodable, Sendable {
    let device_key: String
    let point_id: String
    let lat: Double
    let lng: Double
    let accuracy_m: Double
}

struct RoamRetryBody: Encodable, Sendable {
    let device_key: String
    let attempt_id: String
    let lat: Double
    let lng: Double
    let accuracy_m: Double
}

struct FactionWar: Decodable, Sendable, Equatable {
    struct Standing: Decodable, Sendable, Equatable, Identifiable {
        let faction: String
        let name: String
        let points: Int
        let share: Double
        var id: String { faction }
    }
    let region: String
    let week_start: String
    let ends_at: String
    let players: Int
    let total: Int
    let standings: [Standing]
}

struct RoamLeaders: Decodable, Sendable, Equatable {
    struct Leader: Decodable, Sendable, Equatable, Identifiable {
        let place: Int
        let you: Bool
        let handle: String
        let faction: String?
        let week_xp: Int
        let level: Int
        var id: Int { place }
    }
    let region: String
    let leaders: [Leader]
}

struct RoamStarter: Decodable, Sendable {
    let starter: QuestPoint?
    let tutorial_done: Bool
}

// Request bodies. Each carries device_key, because the server checks it is the
// key that signed the request.
struct RoamWhere: Encodable, Sendable {
    let device_key: String
    let lat: Double
    let lng: Double
    let accuracy_m: Double
}

struct RoamOpen: Encodable, Sendable {
    let device_key: String
    let point_id: String
    let lat: Double
    let lng: Double
    let accuracy_m: Double
}

struct RoamAnswerBody: Encodable, Sendable {
    let device_key: String
    let attempt_id: String
    let answers: [RoamAnswer]
}

struct RoamFactionBody: Encodable, Sendable {
    let device_key: String
    let faction: String
}

enum RoamDates {
    nonisolated(unsafe) private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    /// Python's isoformat writes microseconds when it has them and nothing
    /// when it does not, so both shapes arrive.
    static func parse(_ s: String) -> Date? {
        withFraction.date(from: s) ?? plain.date(from: s)
    }
}
