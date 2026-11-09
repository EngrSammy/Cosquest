import Foundation

// The shapes the server sends and expects. Field names match the wire format
// exactly, snake_case included, so that a rename on either side fails to
// compile here rather than decoding to nil at a venue.

// MARK: - Joining

struct JoinRequest: Encodable {
    let handle: String
    let device_key: String
    let faction: String?
    let payout_destination: String?
}

struct JoinResult: Decodable {
    let player_id: String
    let faction: String?
    let tokens: Int?
    /// What the server actually sends, on a fresh join and on a rejoin. On a
    /// rejoin it is the player's CURRENT balance, not the game's starting one.
    let starting_tokens: Int?
    /// True when this device was already in the game and got its row back.
    let resumed: Bool?

    /// The balance to show straight after joining. Reading only `tokens`
    /// flashed 0 on every join, because the server never sends that key.
    var balance: Int? { tokens ?? starting_tokens }
}

// MARK: - The terms of a game

/// What a player is told before they join, and the source for the Rules screen.
///
/// Every figure here is read from the server rather than held in the app.
/// Guideline 5.3.2 requires the official rules to be presented in the app for a
/// game that pays cash, and rules that are accurate for one game and stale for
/// the next are worse than none.
struct GameTerms: Decodable, Sendable {
    let game_id: String
    let title: String
    let status: String
    let mode: String
    let entry_fee_cents: Int
    let currency: String?
    let platform_cut_bps: Int
    let winner_split_bps: [Int]
    /// The server's own sentence describing the pool, so the phrasing is the
    /// same in the app, the back office and any printed material.
    let prize_pool_note: String
    let sponsored: Bool
    let sponsor: String?
    let venue: Venue?
    let starts_at: String?
    let ends_at: String?
    let require_signatures: Bool
    let environment_ready: Bool
    let factions: [Faction]
    let players_joined: Int
    let players_paid: Int
    /// What is actually in the pot right now, from the server's ledger. M3
    /// acceptance asks that a player "pays to join and sees the kitty", and
    /// this is the kitty rather than a number the app worked out.
    let pot_cents: Int
    let prize_pool_cents: Int
    /// Reported separately from the pot on purpose. Settlement computes the
    /// kitty from entry fees only, so sponsor money is recorded against the
    /// game and never paid to a winner. Showing it as prize money would be a
    /// promise the server does not keep.
    let sponsor_cents: Int
    /// An event entered with CosCoins instead of money. Its rewards are
    /// in-game only (the server refuses a coin fee on anything with a prize
    /// of value), and they arrive as ready-to-show lines.
    let entry_coins: Int?
    let coin_rewards: [String]?

    struct Venue: Decodable, Sendable {
        let lat: Double
        let lng: Double
        let radius_m: Int
    }

    struct Faction: Decodable, Sendable {
        let name: String
        /// Hex, authored by the organiser. The app tints itself with this
        /// rather than picking its own colours, so a venue's branding carries
        /// through to the players' screens.
        let color: String
        let players: Int
    }

    var isFree: Bool { entry_fee_cents == 0 }
    var isCoinEntry: Bool { (entry_coins ?? 0) > 0 }

    var entryFee: String {
        isFree ? "Free to enter"
               : Money.text(entry_fee_cents, currency)
    }

    var pot: String { Money.text(pot_cents, currency) }
    var prizePool: String {
        Money.text(prize_pool_cents, currency)
    }

    /// "70%, 20% and 10% of the pool", for the rules screen. Basis points are
    /// the server's unit and mean nothing to a player.
    var splitDescription: String {
        let parts = winner_split_bps.map { "\($0 / 100)%" }
        guard parts.count > 1 else { return parts.first ?? "the whole pool" }
        return parts.dropLast().joined(separator: ", ") + " and " + parts[parts.count - 1]
    }
}

/// A point the organiser placed on the field, as a player may see it.
///
/// The trivia answer is not in here and never arrives: the server judges the
/// answer index against its own copy. `payload` carries the question and its
/// four choices and nothing else.
struct GameAnchor: Decodable, Sendable, Identifiable {
    let id: String
    /// Which asset in the pack stands at this point. This is what ties an
    /// authored coordinate to a mesh the phone has already downloaded.
    let asset: String
    /// "capture_point", "weapon", "totem", "trivia", "decoration".
    let kind: String
    let lat: Double
    let lng: Double
    let alt_m: Double
    let faction: String?
    let payload: Payload

    struct Payload: Decodable, Sendable {
        let q: String?
        let choices: [String]?
        let name: String?
        let range_m: Double?
        let damage: Int?
        let label: String?
    }
}

/// This device's own row in a game. The only thing on it that the app cannot
/// work out for itself is `paid`, and that is the whole reason it exists: after
/// a card payment completes in Safari the phone has to be able to ask.
struct PlayerStatus: Decodable, Sendable {
    let player_id: String
    let handle: String
    let paid: Bool
    let tokens: Int
    let faction: String?
    let faction_color: String?
}

/// A player across games, and everything that has landed on their wall.
struct Profile: Decodable, Sendable {
    let device_key: String
    let handle: String?
    let avatar: Avatar
    let since: String?
    let games_played: Int
    let games_won: Int
    let tokens_total: Int
    let prizes_cents: Int
    let wall: [Result]
    let in_progress: [InProgress]

    /// A handful of choices the client draws, not an image it uploads. No
    /// storage, nothing to moderate, and no way for one player to put
    /// something on another player's screen.
    struct Avatar: Codable, Sendable, Equatable {
        var face: Int = 0
        var mark: Int = 0
        var tint: String = "#E8B33A"
    }

    struct Result: Decodable, Sendable, Identifiable {
        let game_id: String
        let title: String
        let faction: String?
        let tokens: Int
        /// 1-based, or nil when the player finished outside the payout slots.
        let placing: Int?
        let prize_cents: Int
        let currency: String?
        let at: String

        var id: String { game_id }
        var prize: String? {
            prize_cents > 0
                ? Money.text(prize_cents, currency) : nil
        }
    }

    struct InProgress: Decodable, Sendable, Identifiable {
        let game_id: String
        let title: String
        let tokens: Int
        let status: String
        var id: String { game_id }
    }

    var prizes: String {
        Money.text(prizes_cents, nil)
    }
}

struct ProfileUpsert: Encodable {
    let device_key: String
    let handle: String
    let avatar: Profile.Avatar
}

/// Where the on-device model lives and what it must hash to.
struct ModelManifest: Decodable, Sendable {
    let version: String
    let label: String
    let model: File
    let tokenizer: File
    /// Below this much physical memory the phone runs the game without the
    /// assistant rather than risking a low-memory kill beside the renderer.
    let min_ram_bytes: Int64
    /// Every model published, best first, each with the memory it needs.
    /// Optional because a server older than this field still answers with a
    /// single model at the top level.
    let variants: [Variant]?

    struct File: Decodable, Sendable {
        let file: String
        let url: String
        let bytes: Int64
        let sha256: String
    }

    struct Variant: Decodable, Sendable {
        let label: String
        let model: File
        let tokenizer: File
        let min_ram_bytes: Int64
    }

    /// The best model this phone can actually hold.
    ///
    /// The server prefers the 1.7B for correctness: the 0.5B is faster to the
    /// first word but writes confidently wrong sentences about the rules, and
    /// in a game paying cash a fluent wrong paraphrase beside the correct rule
    /// is a dispute. It is also three times the weights, running beside ARKit,
    /// a pack of meshes, camera passthrough and a peer mesh, so a phone that
    /// cannot hold it needs the smaller one rather than no assistant at all.
    func bestFitting(physicalMemory: UInt64) -> Variant? {
        let rungs = variants ?? [Variant(label: label, model: model,
                                         tokenizer: tokenizer,
                                         min_ram_bytes: min_ram_bytes)]
        return rungs
            .sorted { $0.min_ram_bytes > $1.min_ram_bytes }
            .first { physicalMemory >= UInt64($0.min_ram_bytes) }
    }
}

// MARK: - Events

/// One thing the player did. `clientSeq` is the device's own counter and is
/// what makes a retry safe: the server recognises a repeat and returns the
/// original verdict rather than applying it twice.
struct DeviceEvent: Encodable {
    let client_seq: Int
    let kind: String
    let payload: [String: WireValue]

    init(seq: Int, kind: Kind, payload: [String: WireValue]) {
        self.client_seq = seq
        self.kind = kind.rawValue
        self.payload = payload
    }

    enum Kind: String {
        case pickup, hit, capture, respawn
        case trivia = "trivia_answer"
    }
}

struct EventBatch: Encodable {
    let device_key: String
    let events: [DeviceEvent]
}

struct EventResults: Decodable {
    let results: [Verdict]
}

/// What the server decided. `ok == false` is a normal answer and `reason` is
/// written to be shown to the player: "hit on cooldown", "friendly fire",
/// "out of range (14.2m)", "outside venue geofence".
struct Verdict: Decodable {
    let client_seq: Int
    let ok: Bool
    let reason: String?
    let deltas: [String: Int]?
    let drained: Int?
    let downed: String?
    let correct: Bool?
    let duplicate: Bool?
    /// A located refusal's kind (server app/anticheat.py): "need_location"
    /// (no usable fix: nothing judged, send again with a fresh one),
    /// "too_far" (out of reach of that point), "hit_gps" (too far apart by GPS).
    let code: String?
    /// False only when a need_location refusal must not be sent again.
    let retry: Bool?
    /// too_far: how far the player was from the point, metres.
    let distance_m: Double?

    var wasApplied: Bool { ok && duplicate != true }

    /// Refused for want of a usable fix, and worth sending again (FixPolicy).
    var needsLocation: Bool {
        FixPolicy.isNeedLocation(ok: ok, code: code, retry: retry, reason: reason)
    }

    init(client_seq: Int, ok: Bool, reason: String?, deltas: [String: Int]?,
         drained: Int?, downed: String?, correct: Bool?, duplicate: Bool?,
         code: String? = nil, retry: Bool? = nil, distance_m: Double? = nil) {
        self.client_seq = client_seq
        self.ok = ok
        self.reason = reason
        self.deltas = deltas
        self.drained = drained
        self.downed = downed
        self.correct = correct
        self.duplicate = duplicate
        self.code = code
        self.retry = retry
        self.distance_m = distance_m
    }

    private enum CodingKeys: String, CodingKey {
        case client_seq, ok, reason, deltas, drained, downed, correct, duplicate, result
        case code, retry, distance_m
    }

    /// A replayed event comes back as `{client_seq, duplicate: true, result:
    /// {ok, reason, ...}}`, with the original verdict nested and no top level
    /// `ok`. Decoding that as a flat verdict failed the WHOLE batch, which is
    /// exactly the case (a reply lost in transit, then a retry) that
    /// idempotency exists to make safe.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        client_seq = try c.decode(Int.self, forKey: .client_seq)
        duplicate = try c.decodeIfPresent(Bool.self, forKey: .duplicate)
        let r = (try? c.nestedContainer(keyedBy: CodingKeys.self, forKey: .result)) ?? c
        ok = (try? r.decodeIfPresent(Bool.self, forKey: .ok)) ?? false
        reason = try? r.decodeIfPresent(String.self, forKey: .reason)
        deltas = try? r.decodeIfPresent([String: Int].self, forKey: .deltas)
        drained = try? r.decodeIfPresent(Int.self, forKey: .drained)
        downed = try? r.decodeIfPresent(String.self, forKey: .downed)
        correct = try? r.decodeIfPresent(Bool.self, forKey: .correct)
        code = try? r.decodeIfPresent(String.self, forKey: .code)
        retry = try? r.decodeIfPresent(Bool.self, forKey: .retry)
        distance_m = try? r.decodeIfPresent(Double.self, forKey: .distance_m)
    }
}

// MARK: - Scoreboard

struct Scoreboard: Decodable {
    let factions: [FactionScore]
    let players: [String: PlayerState]
    let captures: [String: String]?

    struct FactionScore: Decodable {
        let faction: String
        let tokens: Int
    }

    struct PlayerState: Decodable {
        let tokens: Int
        let state: String
        let faction: String?
        /// What this player calls themselves. Nil when they never set one, in
        /// which case the roster shows a placeholder: the server does not
        /// invent a name and neither should this.
        let handle: String?
    }
}

// MARK: - Environment packs

struct PackManifest: Decodable {
    let pack_id: String
    let version: String
    let theme: String
    let palette: String
    let assets: [Asset]
    let total_bytes: Int
    /// Assets the renderer could not build. Non-empty is normal and the client
    /// must place what is there rather than treating the pack as broken.
    let failed_assets: [FailedAsset]?
    let requested_assets: Int?

    struct Asset: Decodable {
        let name: String
        let cls: String
        let bounds_m: [[Double]]
        /// Which index of `bounds_m` is vertical. The meshes are glTF, so this
        /// is 1 (Y). It is read rather than assumed because assuming it is
        /// exactly the bug that shipped every asset at the wrong size.
        let up_axis: Int?
        let height_m: Double?
        let usdz_pending: Bool
        let files: [File]

        /// The best USDZ at or below a level of detail, falling back to glTF.
        ///
        /// Walking down to lod0 rather than demanding an exact match, because
        /// not every pack has three levels. A kit of low-poly models has one
        /// mesh per object and needs no decimation: asking it for lod2 used to
        /// return nil, and a nil file is an asset that silently never appears
        /// once the player is more than twenty-five metres from it.
        func file(lod: Int) -> File? {
            for level in stride(from: lod, through: 0, by: -1) {
                if let usdz = files.first(where: {
                    $0.lod == level && $0.file.hasSuffix(".usdz")
                }) { return usdz }
                if let any = files.first(where: { $0.lod == level }) { return any }
            }
            return nil
        }

        var upAxis: Int { up_axis ?? 1 }

        /// Real-world height in metres, as built.
        var height: Double {
            if let height_m { return height_m }
            guard bounds_m.count == 2 else { return 1 }
            return bounds_m[1][upAxis] - bounds_m[0][upAxis]
        }
    }

    struct File: Decodable {
        let file: String
        let lod: Int
        let bytes: Int
        /// The contract for peer-supplied bytes. Every file is checked against
        /// this, however it arrived.
        let sha256: String
    }

    struct FailedAsset: Decodable {
        let name: String
        let stage: String
    }
}

// MARK: - Tiles

struct TileAnnounce: Encodable {
    let device_key: String
    let sha256: [String]
    let dropped: [String]
}

struct TileReceived: Encodable {
    let device_key: String
    let count: Int
}

struct TileSources: Decodable {
    /// digest -> the player ids near you that hold it.
    let sources: [String: [String]]
    /// False when the server could not screen the list, because it had no
    /// fresh position for this device. The client should treat an unscreened
    /// list as a weaker hint.
    let proximity_filtered: Bool
    let radius_m: Double?
}

// MARK: - Money

struct CheckoutRequest: Encodable {
    let device_key: String
}

struct Checkout: Decodable {
    let paid: Bool?
    let checkout_url: String?
    let note: String?
}

// MARK: - Health

struct Health: Decodable {
    let status: String
    let db: String
    let envgen: String
    /// "stripe" or "dev (ledger-only)". The client must read this rather than
    /// assume money is live.
    let payments: String

    var paymentsAreLive: Bool { payments.hasPrefix("stripe") }
}

// MARK: - A JSON value

/// Event payloads are open-ended on the wire, so this carries the handful of
/// types the game actually sends without dragging in a full JSON type.
enum WireValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)

    /// Decodable as well as Encodable because the outbox writes queued events
    /// to disk and reads them back after a crash. Int is tried before Double
    /// so a token count comes back an Int: the server takes `range_m` as a
    /// float and `answer` as an integer, and a payload that turned 3 into 3.0
    /// across a relaunch would change what the engine judges.
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Int.self) { self = .int(v) }
        else if let v = try? c.decode(Double.self) { self = .double(v) }
        else { self = .string(try c.decode(String.self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        }
    }
}

extension WireValue: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral,
                     ExpressibleByFloatLiteral, ExpressibleByBooleanLiteral {
    init(stringLiteral value: String) { self = .string(value) }
    init(integerLiteral value: Int) { self = .int(value) }
    init(floatLiteral value: Double) { self = .double(value) }
    init(booleanLiteral value: Bool) { self = .bool(value) }
}

// MARK: - Discovery

/// One game as it appears on the map, before a player has joined anything.
///
/// Deliberately fatter than a pin needs. The list route folds in the factions,
/// the pot and the join count so that drawing a map of ten venues is one
/// request rather than eleven: a phone at a venue on a bad connection should
/// not be making a round trip per pin.
struct GameSummary: Decodable, Sendable, Identifiable {
    let game_id: String
    let title: String
    let status: String
    let mode: String
    let entry_fee_cents: Int
    /// ISO 4217, from the server. The game's currency, not the reader's: a
    /// venue in Lagos is priced in naira whoever is looking at it, and showing
    /// that figure with a pound sign is not conversion, it is a false price.
    let currency: String?
    let sponsored: Bool
    let sponsor: String?
    let venue: Venue
    let starts_at: String?
    let ends_at: String?
    let environment_ready: Bool
    let players_joined: Int
    let players_paid: Int
    let pot_cents: Int
    /// Metres from where the player asked. Null when they did not say where
    /// they are, which is why this is not a Double.
    let distance_m: Int?
    let factions: [FactionSummary]

    var id: String { game_id }

    /// How long until it opens, short enough to wear on a map object.
    ///
    /// A scheduled game with no time is not a countdown, it is a plan, so this
    /// is nil rather than "soon": an object claiming to start shortly when
    /// nobody has said when is worse than one saying nothing.
    var startsIn: String? {
        guard status == "scheduled", let starts_at,
              let at = ISO8601DateFormatter().date(from: starts_at)
        else { return nil }
        let secs = at.timeIntervalSinceNow
        guard secs > 0 else { return nil }
        if secs < 3600 { return "\(Int(secs / 60))m" }
        if secs < 86_400 { return "\(Int(secs / 3600))h" }
        return "\(Int(secs / 86_400))d"
    }

    struct Venue: Decodable, Sendable {
        let lat: Double
        let lng: Double
        let radius_m: Int
    }

    struct FactionSummary: Decodable, Sendable {
        let name: String
        let color: String
        let players: Int
    }
}

struct GamesNearby: Decodable, Sendable {
    let games: [GameSummary]
    let count: Int
}


/// Money, in the currency the SERVER named for that game.
///
/// Three formatters disagreed before this existed: the entry screen printed
/// dollars, the map printed pounds, and the games were in Lagos. The amount is
/// minor units, as the server stores it.
enum Money {
    static func text(_ minorUnits: Int, _ currency: String?) -> String {
        (Decimal(minorUnits) / 100)
            .formatted(.currency(code: currency ?? fallback))
    }

    /// Only reached when the server did not say, which means a deployment
    /// older than the currency column. The agreement is written in dollars.
    private static let fallback = "USD"
}


// MARK: - Presence

struct PresenceBeat: Encodable {
    let device_key: String
    let status: String
    let game_id: String?
}

struct PresenceHere: Decodable { let here: Int }

struct PresenceRoster: Decodable {
    let here: Int
    let people: [PresencePerson]
}

/// One person in the outpost.
///
/// Note what is NOT here: no coordinates, no bearing, no distance. The server
/// does not send them and this cannot accidentally start showing them. Where a
/// figure stands in the outpost is decided by the client and means only
/// "somewhere near the fire".
struct PresencePerson: Decodable, Identifiable, Sendable {
    let handle: String?
    /// idle | heading | playing
    let status: String
    let game_id: String?
    let seen_s: Int

    /// Nothing unique comes back, deliberately: device keys are not published.
    /// Identity here is only for SwiftUI's list diffing.
    var id: String { "\(handle ?? "?")-\(status)-\(seen_s)" }
}
