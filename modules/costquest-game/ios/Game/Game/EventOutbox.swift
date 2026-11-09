import Foundation
import OSLog

/// The queue every action the player takes goes through on its way to the
/// server, and the reason a dropped connection is not a lost game.
///
/// The problem it solves is specific. A player shoots someone at the far end of
/// a field where the mobile signal is one bar. The shot has to feel instant, it
/// has to be judged by the server and not by the phone, and it must not be
/// judged twice if the reply is lost on the way back. Those three pull against
/// each other, and the settlement is:
///
/// **Recorded before it is sent.** Every event gets a `client_seq` and goes to
/// disk before any network call. A crash mid fight, a force quit, a battery
/// death: the queue is still there on the next launch and drains.
///
/// **Sent self-clocked, not on a timer.** The first event goes immediately, so
/// a single shot has no added latency at all. Anything that happens while that
/// request is in flight rides the next one, so a firefight batches itself
/// without a fixed window that would tax the quiet case to help the busy one.
///
/// **Retried without fear.** `client_seq` makes the server idempotent, so a
/// reply lost in transit costs one repeat of the request and returns the
/// original verdict. That is the property that lets this retry at all rather
/// than having to guess whether a timeout meant the hit landed.
actor EventOutbox {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "outbox")
    private let client: GameClient
    private let gameID: String

    /// Queued and not yet acknowledged. Ordered, because the game engine's
    /// cooldowns are time-ordered and judging a respawn before the hit that
    /// caused it produces a different, wrong answer.
    private var pending: [Queued] = []
    private var nextSeq: Int
    private var draining = false
    /// Set by `stop`, so a queue that is retrying through a dead spot does not
    /// keep doing so after the player has left the game.
    private var stopped = false

    /// How long an action's caller waits for the verdict before being told
    /// the event is queued. The event is NOT dropped at that point: it stays
    /// on disk and drains when the network returns. Only the caller stops
    /// waiting, so a Fire button can never jam on a dead connection.
    static let verdictWait: Duration = .seconds(10)

    /// The reason given to a caller whose event is still queued. GameSession
    /// maps it to player copy.
    static let queuedReason = "queued: waiting for network"

    /// Verdicts, by the sequence number that produced them, so a caller can
    /// await the server's answer to its own action.
    private var waiters: [Int: CheckedContinuation<Verdict, Never>] = [:]

    private struct Queued: Codable {
        let seq: Int
        let kind: String
        let payload: [String: WireValue]
    }

    init(gameID: String, client: GameClient) {
        self.gameID = gameID
        self.client = client
        let state = Self.load(gameID: gameID)
        // A queue left from long ago is not worth replaying: the game it
        // belongs to has almost certainly moved on, and if it has ended the
        // server refuses the lot anyway. Keep the sequence counter either way.
        self.pending = state.age > Self.staleAfter ? [] : state.pending
        // Sequence numbers never reuse across launches. The server's replay
        // check for this device is "nonce greater than the highest client_seq
        // it has seen", so a counter that restarted at zero would make every
        // event look like a replay of an old one.
        self.nextSeq = state.nextSeq
    }

    // MARK: - Submitting

    /// Record an action and return the server's verdict when it arrives.
    ///
    /// The caller can ignore the returned value and the event still goes; the
    /// game does this for movement-ish events where nothing on screen waits on
    /// the answer.
    @discardableResult
    func submit(_ kind: DeviceEvent.Kind, _ payload: [String: WireValue]) async -> Verdict {
        let seq = nextSeq
        nextSeq += 1
        pending.append(Queued(seq: seq, kind: kind.rawValue, payload: payload))
        persist()

        Task { await drain() }
        Task { [weak self] in
            try? await Task.sleep(for: Self.verdictWait)
            await self?.expire(seq)
        }

        return await withCheckedContinuation { continuation in
            waiters[seq] = continuation
        }
    }

    /// Stop the caller waiting, without dropping the event.
    private func expire(_ seq: Int) {
        guard let waiter = waiters.removeValue(forKey: seq) else { return }
        log.notice("outbox: verdict for \(seq) still pending, caller released")
        waiter.resume(returning: Verdict(
            client_seq: seq, ok: false, reason: Self.queuedReason, deltas: nil,
            drained: nil, downed: nil, correct: nil, duplicate: nil))
    }

    /// Leaving the game: stop retrying and release every waiter. Anything
    /// still queued stays on disk for a rejoin.
    func stop() {
        stopped = true
        for seq in Array(waiters.keys) { expire(seq) }
    }

    /// The game is over (finished, settled, cancelled). Nothing queued can
    /// ever be judged now, so it is thrown away rather than left to block a
    /// later session or be refused one by one.
    func discardAll() {
        stopped = true
        if !pending.isEmpty {
            log.notice("outbox: discarding \(self.pending.count) event(s), game over")
        }
        pending.removeAll()
        persist()
        for seq in Array(waiters.keys) {
            waiters.removeValue(forKey: seq)?.resume(returning: Verdict(
                client_seq: seq, ok: false, reason: "game is finished, not live",
                deltas: nil, drained: nil, downed: nil, correct: nil, duplicate: nil))
        }
    }

    /// Joining (or rejoining) turns the queue back on.
    func resume() {
        stopped = false
    }

    /// Fire and forget, for the events nothing is waiting on.
    func post(_ kind: DeviceEvent.Kind, _ payload: [String: WireValue]) {
        let seq = nextSeq
        nextSeq += 1
        pending.append(Queued(seq: seq, kind: kind.rawValue, payload: payload))
        persist()
        Task { await drain() }
    }

    var queueDepth: Int { pending.count }

    // MARK: - Draining

    /// Send everything queued, one request at a time.
    ///
    /// Serialised on purpose. Two concurrent batches from the same device would
    /// race on the server's nonce high-water mark and one would be refused as
    /// stale, and they would also arrive at the engine out of order.
    private func drain() async {
        guard !draining, !stopped, !pending.isEmpty else { return }
        draining = true
        defer { draining = false }

        var backoff = Duration.milliseconds(250)
        while !pending.isEmpty && !stopped {
            let batch = pending
            let events = batch.map {
                DeviceEvent(seq: $0.seq,
                            kind: DeviceEvent.Kind(rawValue: $0.kind) ?? .pickup,
                            payload: $0.payload)
            }
            do {
                let verdicts = try await client.send(gameID: gameID, events: events)
                // Only what was actually sent: anything appended while the
                // request was in flight stays for the next round.
                let acknowledged = Set(batch.map(\.seq))
                pending.removeAll { acknowledged.contains($0.seq) }
                persist()
                for verdict in verdicts {
                    waiters.removeValue(forKey: verdict.client_seq)?.resume(returning: verdict)
                }
                backoff = .milliseconds(250)
            } catch let error as GameClient.ClientError where !error.isRetryable {
                // Refused, not lost. A 4xx (the game is not live, this device
                // has not joined, the request was malformed) will be refused
                // identically on every retry, so holding it would wedge the
                // queue: every later event waits behind it, the caller's
                // continuation never resumes, and because the queue is on disk
                // the wedge survives a relaunch. The batch is dropped and each
                // waiter gets a refusal it can show.
                let refused = Set(batch.map(\.seq))
                pending.removeAll { refused.contains($0.seq) }
                persist()
                let reason: String = switch error {
                case .http(_, let detail): detail
                case .notJoined: "device not joined"
                case .badSignature: "bad signature"
                default: error.localizedDescription
                }
                log.error("outbox: dropped \(batch.count) refused event(s): \(reason)")
                for seq in refused {
                    waiters.removeValue(forKey: seq)?.resume(returning: Verdict(
                        client_seq: seq, ok: false, reason: reason, deltas: nil,
                        drained: nil, downed: nil, correct: nil, duplicate: nil))
                }
                backoff = .milliseconds(250)
            } catch {
                // Kept, not dropped. The player is somewhere with no signal and
                // the events are still true; they will be judged when the phone
                // can reach the server, and the engine judges them against the
                // clock it recorded them at. Only transient failures reach
                // here: the network, a 5xx, a 429, a stale nonce.
                log.notice("outbox: \(self.pending.count) event(s) waiting on the network: \(error.localizedDescription)")
                try? await Task.sleep(for: backoff)
                backoff = min(backoff * 2, .seconds(8))
            }
        }
    }

    /// Called when the connection comes back, so a queue that gave up during a
    /// dead spot starts moving again without waiting for the next action.
    func networkReturned() async {
        await drain()
    }

    // MARK: - Durability

    private static func url(gameID: String) -> URL {
        // Application Support, not Caches: the system may reclaim Caches, and
        // an unsent hit is not reproducible data.
        let base = FileManager.default.urls(for: .applicationSupportDirectory,
                                            in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appending(path: "outbox-\(gameID).json")
    }

    private struct Persisted: Codable {
        var pending: [Queued]
        var nextSeq: Int
    }

    /// Older than this on launch and the queue is dropped, keeping only the
    /// sequence counter.
    static let staleAfter: TimeInterval = 2 * 60 * 60

    private func persist() {
        let snapshot = Persisted(pending: pending, nextSeq: nextSeq)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: Self.url(gameID: gameID), options: .atomic)
    }

    private static func load(gameID: String) -> (pending: [Queued], nextSeq: Int,
                                                 age: TimeInterval) {
        let file = url(gameID: gameID)
        guard let data = try? Data(contentsOf: file),
              let saved = try? JSONDecoder().decode(Persisted.self, from: data) else {
            return ([], 0, 0)
        }
        let modified = (try? FileManager.default.attributesOfItem(atPath: file.path)[
            .modificationDate] as? Date) ?? Date()
        return (saved.pending, saved.nextSeq, Date().timeIntervalSince(modified))
    }
}
