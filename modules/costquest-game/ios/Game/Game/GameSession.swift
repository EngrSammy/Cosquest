import CoreLocation
import Foundation
import OSLog
import Observation

/// The game, as this player experiences it.
///
/// One rule runs through the whole type and it is worth stating before the
/// code: **nothing here decides an outcome**. Not whether a hit landed, not
/// whether a pickup was on cooldown, not how many tokens anyone has. Those are
/// the server's answers, arrived at from an append-only journal that can be
/// replayed to the same result. This class sends what the player did and shows
/// what came back.
///
/// That is not architectural fussiness. The game pays out real prize money, so
/// a client that computed its own score would be a client that could be made to
/// compute a better one. It also means a phone that has been offline for two
/// minutes in a dead spot rejoins with the true state rather than its own idea
/// of it.
///
/// What this class does own is *feel*. The visible response to an action fires
/// on the action, and the score change lands when the verdict does, typically
/// within a couple of hundred milliseconds. Those are deliberately separated:
/// showing a token count that then has to be taken back is worse than showing
/// it a moment later.
@MainActor
@Observable
final class GameSession {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "game")

    // MARK: - What the game looks like right now

    private(set) var playerID: String?
    private(set) var faction: String?
    private(set) var tokens = 0
    /// What the player is carrying, with the abilities the organiser gave it.
    ///
    /// The server only ever needs the name: the engine's rule is "do you hold
    /// one", and range is checked against the game's own limit, not the
    /// weapon's. The rest is here because M3 acceptance asks that a player
    /// "picks up a faction weapon and can see its abilities", and a player who
    /// cannot see what they are carrying has no reason to prefer one over
    /// another.
    private(set) var held: Weapon?
    var weapon: String? { held?.name }

    struct Weapon: Sendable, Equatable {
        let name: String
        let range: Double?
        let damage: Int?
        let faction: String?

        var abilities: [String] {
            var out: [String] = []
            if let range { out.append(String(format: "reaches %.0f m", range)) }
            if let damage { out.append("takes \(damage) tokens a hit") }
            return out
        }
    }
    /// "active", "respawning", "eliminated". Straight from the server.
    private(set) var state = "active"
    private(set) var factionScores: [Scoreboard.FactionScore] = []
    private(set) var players: [String: Scoreboard.PlayerState] = [:]
    private(set) var captures: [String: String] = [:]
    private(set) var gameStatus = "live"
    private(set) var isConnected = false
    /// Other players, as last reported. The map and the compass read this.
    private(set) var map: [String: LiveLink.MapPlayer] = [:]
    /// Ultra wideband fixes other devices have taken on us, by player. Short
    /// lived on purpose: a bearing three seconds old points at where somebody
    /// was, which is worse than pointing nowhere.
    private(set) var bearings: [String: Bearing] = [:]

    struct Bearing: Sendable {
        let distance: Double
        let azimuth: Double
        let elevation: Double
        let at: Date
        var isFresh: Bool { Date().timeIntervalSince(at) < 2 }
    }

    /// The last few things that happened, newest first, for the HUD ticker.
    private(set) var feed: [FeedEntry] = []

    struct FeedEntry: Identifiable, Sendable {
        let id = UUID()
        let text: String
        let at = Date()
        /// Set when the server refused something, so the HUD can show the
        /// reason in the player's own words rather than swallowing it.
        let isRefusal: Bool
    }

    /// The latest thing worth reacting to, for the HUD's toast and haptic.
    /// Replaced, never queued: a firefight should feel like a firefight, not
    /// like a backlog of notifications.
    private(set) var moment: Moment?

    struct Moment: Identifiable, Equatable, Sendable {
        enum Tone: Sendable { case good, bad }
        let id = UUID()
        let text: String
        let symbol: String
        let tone: Tone
    }

    /// When the server said a respawn becomes possible, if it has said. The
    /// downed screen counts down to this rather than guessing.
    private(set) var respawnAvailableAt: Date?

    /// Whole seconds until a respawn is allowed, for a countdown label. Nil
    /// when the server has not given a time or it has passed. Call it from a
    /// `TimelineView(.periodic(from: .now, by: 1))` so it ticks.
    func respawnSecondsRemaining(now: Date = Date()) -> Int? {
        guard let at = respawnAvailableAt else { return nil }
        let left = Int(at.timeIntervalSince(now).rounded(.up))
        return left > 0 ? left : nil
    }

    /// The most recent change to this player's token count that came from
    /// play (a hit, a capture, capture income, being hit), for the HUD to
    /// animate "+2" or "-20" beside the counter. Server scoreboard
    /// corrections do not set it. A fresh `id` on every change, so
    /// `.onChange(of: session.lastTokenDelta?.id)` fires even for two equal
    /// amounts in a row.
    private(set) var lastTokenDelta: TokenDelta?

    struct TokenDelta: Identifiable, Equatable, Sendable {
        let id = UUID()
        let amount: Int
        /// "hit", "capture", "capture_stream", "trivia", "respawn", "hit_by".
        let reason: String
        let at = Date()
    }

    /// When the last scoreboard landed, so an action's own verdict does not
    /// add a delta the scoreboard already included.
    private var lastBoardAt = Date.distantPast

    /// True once the game has finished, settled or been cancelled. AppRoot
    /// routes to Results on this.
    var isOver: Bool { Self.terminalStatuses.contains(gameStatus) }
    static let terminalStatuses: Set<String> = ["finished", "settled", "cancelled"]

    /// Where the player is, kept current by whoever owns location. Sent with
    /// every event so the server can apply the venue geofence, and omitted
    /// rather than faked when there is no fix.
    var coordinate: CLLocationCoordinate2D?
    var heading: CLLocationDirection = 0
    var altitude: Double = 0
    /// How good and how old that coordinate is, and whether iOS says it is
    /// simulated: sent beside it as accuracy_m, fix_age_s and simulated
    /// (FixPolicy), which the server's anti-cheat reads in a paid venue game.
    var fix: FixPolicy.Fix?
    /// Asks the location for a fix younger than FixPolicy.fixFreshS (and
    /// waits a few seconds for it); set by whoever owns location (ARGameView).
    /// Used before a located action when the last fix is old, and before
    /// resending one the server refused with need_location.
    var refreshFix: (@MainActor () async -> Void)?

    // MARK: - Machinery

    let gameID: String
    private let client: GameClient
    private let outbox: EventOutbox
    private var link: LiveLink?
    private var pump: Task<Void, Never>?

    init(gameID: String, client: GameClient = GameClient()) {
        self.gameID = gameID
        self.client = client
        self.outbox = EventOutbox(gameID: gameID, client: client)
    }

    // MARK: - Joining

    func join(handle: String, faction: String?) async throws {
        // The payout destination the player set on their profile, if any. It
        // lives on the device rather than the profile because the server
        // attaches it to a player row, which only exists once you have joined
        // something. Passing it makes the request signed.
        let payout = await Preferences.shared.payoutDestination
        let result = try await client.join(
            gameID: gameID, handle: handle, faction: faction,
            payoutDestination: payout.isEmpty ? nil : payout)
        playerID = result.player_id
        self.faction = result.faction
        // The server sends `starting_tokens`, which on a rejoin is the
        // player's current balance. Reading only `tokens` showed 0 until the
        // first scoreboard arrived.
        tokens = result.balance ?? tokens
        await outbox.resume()
        // A rejoin: drop any link from the previous attempt first.
        pump?.cancel()
        if let old = link { await old.stop() }

        let key = try await DeviceIdentity.shared.publicKeyHex()
        let link = LiveLink(baseURL: client.baseURL, gameID: gameID, deviceKey: key)
        self.link = link
        pump = Task { [weak self] in
            for await message in await link.messages() {
                // Already on the main actor: the task inherits this class's
                // isolation, so there is nothing to hop to.
                self?.handle(message)
            }
        }
        // Anything left over from a previous session, sent now rather than on
        // the player's next action.
        Task { await outbox.networkReturned() }
    }

    /// Leave the game: close the live link, stop retrying queued events and
    /// release anything waiting on a verdict. Safe to call more than once.
    /// Queued events stay on disk for a rejoin.
    func leave() {
        pump?.cancel()
        pump = nil
        let link = self.link
        self.link = nil
        isConnected = false
        Task { [outbox] in
            await link?.stop()
            await outbox.stop()
        }
    }

    /// The player's own verdict carries the token change; the socket echo of
    /// our own event is ignored, so this is where our balance moves. Skipped
    /// when a scoreboard (which already includes it) landed after sending.
    private func applyOwn(_ verdict: Verdict, sentAt: Date, reason: String) {
        guard verdict.ok, let mine = playerID,
              let delta = verdict.deltas?[mine], delta != 0 else { return }
        lastTokenDelta = TokenDelta(amount: delta, reason: reason)
        guard lastBoardAt < sentAt else { return }
        // A respawn's delta is the fresh balance, not an increment.
        tokens = reason == "respawn" ? delta : max(0, tokens + delta)
    }

    // MARK: - Doing things

    /// Pick up a weapon. Returns the server's answer, which is often a refusal
    /// ("pickup on cooldown") and is shown as such.
    @discardableResult
    func pickUp(_ weapon: Weapon) async -> Verdict {
        let verdict = await send(.pickup, ["weapon": .string(weapon.name)])
        if verdict.ok {
            held = weapon
            celebrate("Picked up the \(weapon.name)", symbol: "bolt.horizontal.fill")
        }
        note(verdict, success: "Picked up the \(weapon.name).")
        return verdict
    }

    /// Pick up whatever the organiser put at this point, with its abilities.
    @discardableResult
    func pickUp(at anchor: GameAnchor) async -> Verdict {
        await pickUp(Weapon(name: anchor.payload.name ?? anchor.asset,
                            range: anchor.payload.range_m,
                            damage: anchor.payload.damage,
                            faction: anchor.faction))
    }

    /// Report a hit on another player.
    ///
    /// `range` is metres, measured by ultra wideband where both phones have the
    /// radio and by the AR camera's own estimate otherwise. The server range
    /// checks it against the game's limit, so a device that inflates it gets
    /// refused rather than rewarded.
    @discardableResult
    func hit(target: String, range: Double) async -> Verdict {
        let sent = Date()
        let verdict = await send(.hit, [
            "target": .string(target), "range_m": .double(range)])
        applyOwn(verdict, sentAt: sent, reason: "hit")
        if let drained = verdict.drained, verdict.ok {
            let who = name(of: target)
            note(verdict, success: "Took \(drained) from \(who).")
            celebrate("Hit \(who), +\(drained)", symbol: "scope")
        } else {
            if verdict.ok { celebrate("Hit", symbol: "scope") }
            note(verdict, success: "Hit.")
        }
        return verdict
    }

    @discardableResult
    func capture(anchor: String) async -> Verdict {
        let sent = Date()
        let verdict = await send(.capture, ["anchor": .string(anchor)])
        applyOwn(verdict, sentAt: sent, reason: "capture")
        if verdict.ok { celebrate("Point captured", symbol: "flag.fill") }
        note(verdict, success: "Captured a point for \(faction ?? "your side").")
        return verdict
    }

    @discardableResult
    func answerTrivia(anchor: String, answer: Int) async -> Verdict {
        let sent = Date()
        let verdict = await send(.trivia, [
            "anchor": .string(anchor), "answer": .int(answer)])
        applyOwn(verdict, sentAt: sent, reason: "trivia")
        if verdict.ok {
            if verdict.correct == true {
                celebrate("Correct", symbol: "checkmark.seal.fill")
            } else {
                moment = Moment(text: "Not that one", symbol: "xmark", tone: .bad)
            }
        }
        note(verdict, success: verdict.correct == true ? "Correct." : "Not that one.")
        return verdict
    }

    /// Ask to come back after being downed. The server holds the timer, so
    /// this is a request and a refusal is normal.
    @discardableResult
    func respawn() async -> Verdict {
        let sent = Date()
        let verdict = await outbox.submit(.respawn, located([:]))
        applyOwn(verdict, sentAt: sent, reason: "respawn")
        if verdict.ok {
            respawnAvailableAt = nil
            state = "active"
            celebrate("Back in", symbol: "arrow.counterclockwise")
        }
        note(verdict, success: "Back in.")
        return verdict
    }

    /// Attach the player's position to an event payload, when there is one to
    /// attach. The server treats a payload with no `lat` as making no claim
    /// about where the player was, which is the honest thing to send from a
    /// basement.
    ///
    /// With the position go how good and how old the fix is and whether iOS
    /// says it is simulated (FixPolicy.fields): a paid venue game refuses a
    /// located action whose fix is older than 30 s.
    private func located(_ payload: [String: WireValue]) -> [String: WireValue] {
        guard let coordinate else { return payload }
        var add: [String: WireValue] = ["lat": .double(coordinate.latitude),
                                        "lng": .double(coordinate.longitude)]
        add.merge(FixPolicy.fields(fix, now: Date())) { a, _ in a }
        return payload.merging(add) { a, _ in a }
    }

    /// A located action, sent with a fresh fix. Nothing the server refused
    /// with need_location was judged or journalled, so the same action is
    /// sent again after a fresh fix, three more times inside 20 s at most
    /// (FixPolicy.nextRetryWait), with "Waiting for your location" on screen
    /// meanwhile. Then the last verdict stands, shown in plain words.
    private func send(_ kind: DeviceEvent.Kind, _ payload: [String: WireValue]) async -> Verdict {
        if coordinate == nil || !FixPolicy.isFresh(fix?.at, now: Date()) {
            await refreshFix?()
        }
        var verdict = await outbox.submit(kind, located(payload))
        guard verdict.needsLocation else { return verdict }
        moment = Moment(text: FixPolicy.waitingForLocation, symbol: "location.circle", tone: .bad)
        let first = Date()
        var attempt = 1
        while verdict.needsLocation,
              let wait = FixPolicy.nextRetryWait(attempt: attempt,
                                                 elapsed: Date().timeIntervalSince(first)) {
            attempt += 1
            try? await Task.sleep(for: .seconds(wait))
            await refreshFix?()
            guard coordinate != nil else { continue }
            verdict = await outbox.submit(kind, located(payload))
        }
        if !verdict.needsLocation, moment?.text == FixPolicy.waitingForLocation { moment = nil }
        return verdict
    }

    // MARK: - Telemetry

    /// Called from the location delegate. The link throttles this to a walking
    /// pace, so it can be called as often as the hardware fires.
    func reportPosition() async {
        guard let coordinate, let link else { return }
        await link.sendPosition(lat: coordinate.latitude, lng: coordinate.longitude,
                                altitude: altitude, heading: heading)
    }

    /// Our ultra wideband fix on a peer, relayed so their screen can point at
    /// us. Not used for judging by either side.
    /// This phone's own ultra wideband fix on a neighbour. Relative to where
    /// the phone points, which is exactly the frame the reticle wants.
    func adoptLocalUWB(player: String, distance: Double, azimuth: Double, elevation: Double) {
        bearings[player] = Bearing(distance: distance, azimuth: azimuth,
                                   elevation: elevation, at: Date())
    }

    func reportUWB(peer: String, distance: Double, azimuth: Double, elevation: Double) async {
        await link?.sendUWB(peer: peer, distance: distance,
                            azimuth: azimuth, elevation: elevation)
    }

    // MARK: - Incoming

    private func handle(_ message: LiveLink.Message) {
        switch message {
        case .connected:
            isConnected = true
            Task { await outbox.networkReturned() }
        case .disconnected:
            isConnected = false

        case .hello(let you, let board):
            if let you { playerID = you }
            apply(board)
        case .scoreboard(let board):
            apply(board)

        case .event(let kind, let actor, let deltas):
            // Somebody else's action. Ours came back as a verdict already, so
            // this is only echoed to the feed when it was not us.
            guard actor != playerID else { return }
            if let mine = playerID, let delta = deltas[mine], delta != 0 {
                tokens = max(0, tokens + delta)
                lastTokenDelta = TokenDelta(amount: delta,
                                            reason: delta < 0 ? "hit_by" : kind)
                // Gains are shown by the counter itself (capture income ticks
                // every few seconds and would drown the feed). Losses are
                // said, because a number going down with no reason reads as
                // a bug.
                if delta < 0 {
                    let who = name(of: actor)
                    add("\(who.capitalizedFirst) took \(-delta) from you.", refusal: true)
                    if kind == "hit" {
                        moment = Moment(text: "Hit by \(who), \(delta)",
                                        symbol: "exclamationmark.triangle.fill", tone: .bad)
                    }
                }
            } else if kind == "capture" {
                if let side = players[actor]?.faction, side != faction {
                    add("\(name(of: actor).capitalizedFirst) took a point for \(side).",
                        refusal: false)
                } else {
                    add("\(name(of: actor).capitalizedFirst) captured a point.",
                        refusal: false)
                }
            }

        case .downed(let player, let by):
            if player == playerID {
                state = "respawning"
                held = nil
                add("You were downed" + (by.map { " by \(name(of: $0))" } ?? "") + ".",
                    refusal: true)
                moment = Moment(text: "You're down", symbol: "heart.slash.fill", tone: .bad)
            } else {
                add("\(name(of: player).capitalizedFirst) went down.", refusal: false)
            }

        case .gameStatus(let status):
            guard !status.isEmpty, status != gameStatus else { return }
            gameStatus = status
            if Self.terminalStatuses.contains(status) {
                // Nothing queued can be judged any more; clear it so it can
                // never block a later session.
                Task { [outbox] in await outbox.discardAll() }
            }
            // "Live" is the normal state and needs no announcement.
            switch status {
            case "live": break
            case "finished", "settled", "cancelled": add("The game has ended.", refusal: true)
            case "paused": add("The game is paused.", refusal: true)
            default: add("The game isn't live right now.", refusal: true)
            }

        case .map(let players):
            map = players

        case .encounter(let a, let b, let distance):
            guard a == playerID || b == playerID else { return }
            let other = a == playerID ? b : a
            add(String(format: "%@ is within %.0f m.", name(of: other).capitalizedFirst, distance),
                refusal: false)

        case .uwb(let from, let distance, let azimuth, let elevation):
            // A relayed fix is measured from the other phone's point of view.
            // Our own radio's fix on the same player is in our frame, so a
            // fresh one of those wins.
            if bearings[from]?.isFresh == true { return }
            bearings[from] = Bearing(distance: distance, azimuth: azimuth,
                                     elevation: elevation, at: Date())
        }
    }

    private func apply(_ board: Scoreboard) {
        lastBoardAt = Date()
        factionScores = board.factions.sorted { $0.tokens > $1.tokens }
        players = board.players
        captures = board.captures ?? [:]
        if let mine = playerID, let me = board.players[mine] {
            // The server's number wins, always, including when it disagrees
            // with the one on screen. That disagreement is the normal result of
            // a verdict we never received, and correcting it silently is the
            // whole point of the scoreboard arriving on every reconnect.
            tokens = me.tokens
            state = me.state
            if me.state == "active" { respawnAvailableAt = nil }
            faction = me.faction ?? faction
        }
    }

    /// Each action's verdict arrives exactly once (the outbox resumes a
    /// waiter once), so a `duplicate` here is our own retry of a request whose
    /// reply was lost, and it is shown like any first answer.
    private func note(_ verdict: Verdict, success: String) {
        if !verdict.ok, let reason = verdict.reason { learnStatus(from: reason) }
        let refusal = FixPolicy.copy(code: verdict.code, distance: verdict.distance_m)
            ?? playerCopy(for: verdict.reason)
        add(verdict.ok ? success : refusal, refusal: !verdict.ok)
    }

    private func celebrate(_ text: String, symbol: String) {
        moment = Moment(text: text, symbol: symbol, tone: .good)
    }

    /// The server's reasons are written for a log ("outside venue geofence",
    /// "respawn locked until 2026-09-23T14:03:11.123456+00:00"). The feed is
    /// read mid-game at a glance, so the known ones become short sentences a
    /// player can act on, and anything unrecognised becomes a neutral line
    /// rather than raw server text.
    private func playerCopy(for reason: String?) -> String {
        let copy = Self.friendly(reason)
        if let until = copy.respawnAt { respawnAvailableAt = until }
        return copy.text
    }

    /// A game entered after it ended (its terms already say finished, settled
    /// or cancelled) goes straight to Results. Without this the player was
    /// dropped into the arena of a game nobody was playing, because the live
    /// link only announces a status CHANGE.
    func adoptEndedStatus(_ status: String) {
        guard Self.terminalStatuses.contains(status) else { return }
        handle(.gameStatus(status))
    }

    /// "game is settled, not live" means the game moved on while the socket
    /// was down and its status broadcast was missed. Adopt it, so the root
    /// routes to Results instead of leaving the player firing into a
    /// finished game.
    private func learnStatus(from reason: String) {
        guard let range = reason.range(of: #"game is (\w+), not live"#,
                                       options: .regularExpression) else { return }
        let status = reason[range].split(separator: " ").dropFirst(2).first
            .map { String($0).trimmingCharacters(in: .punctuationCharacters) } ?? ""
        guard !status.isEmpty, status != gameStatus else { return }
        handle(.gameStatus(status))
    }

    /// Player copy for a raw server reason, for any screen that shows one.
    /// Pure, so it can be tested without a session.
    static func friendlyReason(_ reason: String?, now: Date = Date()) -> String {
        friendly(reason, now: now).text
    }

    static func friendly(_ reason: String?, now: Date = Date())
    -> (text: String, respawnAt: Date?) {
        let raw = (reason ?? "").lowercased()
        func has(_ needle: String) -> Bool { raw.contains(needle) }

        if has("respawn locked") {
            guard let until = parseTimestamp(in: reason ?? "") else {
                return ("You can respawn shortly", nil)
            }
            return ("You can respawn in \(countdown(until.timeIntervalSince(now)))", until)
        }
        if raw.hasPrefix("queued") { return ("No signal. Sent when you're back online", nil) }
        if raw.hasPrefix("waiting for your location") {
            return ("Waiting for your location. Try again in a moment", nil)
        }
        if has("out of range of that point") { return ("Too far from that point. Get closer", nil) }
        if has("geofence") || has("outside venue") || has("outside the venue") {
            return ("You're outside the play area", nil)
        }
        if has("no weapon held") { return ("Pick up a weapon first", nil) }
        if has("no weapon named") { return ("Nothing to pick up there", nil) }
        if has("pickup on cooldown") { return ("That pickup is recharging", nil) }
        if has("hit on cooldown") { return ("Reloading", nil) }
        if has("cooldown") { return ("That's recharging", nil) }
        if has("no respawns left") || raw == "player is eliminated" {
            return ("You're out of respawns", nil)
        }
        if raw == "player is respawning" || raw == "player is downed" {
            return ("You're down. Respawn first", nil)
        }
        if has("not downed") { return ("You're already in play", nil) }
        if has("invalid target") { return ("They're not in play right now", nil) }
        if has("friendly fire") { return ("That's your own side", nil) }
        if has("out of range") { return ("Too far away. Get closer", nil) }
        if has("already answered") { return ("You already answered this one", nil) }
        if has("unknown trivia anchor") || has("no anchor") {
            return ("That point isn't available", nil)
        }
        if has("no faction") { return ("Join a side first", nil) }
        if has("rate limit") { return ("Slow down a moment", nil) }
        if has("signature") { return ("Couldn't verify this phone. Rejoin the game", nil) }
        if has("not joined") || has("unknown player") {
            return ("You're not in this game. Rejoin to play", nil)
        }
        if has("no such game") { return ("That game no longer exists", nil) }
        if has("not live") {
            if has("finished") || has("settled") || has("cancelled") {
                return ("The game has ended", nil)
            }
            if has("paused") { return ("The game is paused", nil) }
            return ("The game hasn't started yet", nil)
        }
        return ("That didn't go through", nil)
    }

    /// "45s", "2 min", "1 min 30s": short enough for a feed line.
    static func countdown(_ interval: TimeInterval) -> String {
        let seconds = max(1, Int(interval.rounded(.up)))
        if seconds < 60 { return "\(seconds)s" }
        let m = seconds / 60, r = seconds % 60
        return r == 0 ? "\(m) min" : "\(m) min \(r)s"
    }

    /// The first ISO 8601 timestamp in a server reason. Fractional seconds are
    /// stripped first: Python sends six digits, which Foundation's parser
    /// does not reliably accept.
    private static func parseTimestamp(in text: String) -> Date? {
        guard let range = text.range(
            of: #"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?"#,
            options: .regularExpression) else { return nil }
        var stamp = String(text[range])
        stamp = stamp.replacingOccurrences(of: #"\.\d+"#, with: "",
                                           options: .regularExpression)
        if !stamp.hasSuffix("Z"), stamp.range(of: #"[+-]\d{2}:?\d{2}$"#,
                                               options: .regularExpression) == nil {
            stamp += "Z"
        }
        return ISO8601DateFormatter().date(from: stamp)
    }

    private func add(_ text: String, refusal: Bool) {
        feed.insert(FeedEntry(text: text, isRefusal: refusal), at: 0)
        if feed.count > 12 { feed.removeLast(feed.count - 12) }
    }

    /// What to call another player: the handle they chose, from the
    /// scoreboard, and never their id. A player without a handle is "a rival".
    func name(of id: String) -> String {
        handle(of: id) ?? "a rival"
    }

    /// Display name for any player id, never an id fragment: their handle,
    /// or "You" for this player, or "a rival". For the HUD and roster.
    func handle(for id: String) -> String {
        if id == playerID { return handle(of: id) ?? "You" }
        return name(of: id)
    }

    /// The player's own handle, when they set one.
    func handle(of id: String) -> String? {
        guard let handle = players[id]?.handle?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !handle.isEmpty else { return nil }
        return handle
    }

    /// A snapshot small enough to hand to a phone standing next to us.
    ///
    /// M3 acceptance asks that "two nearby devices exchange game state directly
    /// over the local mesh". This is that state, and it is deliberately a
    /// snapshot rather than an authority: a neighbour's numbers are shown as a
    /// neighbour's numbers until the server's own arrive. The server judges the
    /// game, and a mesh that could change a score would be a mesh that could be
    /// used to change a score.
    var snapshot: [String: WireValue] {
        var out: [String: WireValue] = [
            "status": .string(gameStatus),
            "at": .double(Date().timeIntervalSince1970),
        ]
        for score in factionScores { out["f:" + score.faction] = .int(score.tokens) }
        if let mine = playerID { out["me"] = .string(mine) }
        return out
    }

    /// Take a neighbour's snapshot. Only used while this device has no live
    /// link of its own: with a socket up, the server's numbers are the ones on
    /// screen and a peer's are at best a moment behind.
    func adopt(snapshot: [String: WireValue], from peer: String) {
        guard !isConnected else { return }
        var scores: [Scoreboard.FactionScore] = []
        for (key, value) in snapshot {
            guard key.hasPrefix("f:"), case .int(let tokens) = value else { continue }
            scores.append(.init(faction: String(key.dropFirst(2)), tokens: tokens))
        }
        guard !scores.isEmpty else { return }
        factionScores = scores.sorted { $0.tokens > $1.tokens }
        add("Scores from a player nearby, while you are off the network.",
            refusal: false)
    }
}

extension String {
    /// "a rival went down" at the start of a sentence reads as a typo.
    var capitalizedFirst: String {
        prefix(1).uppercased() + dropFirst()
    }
}
