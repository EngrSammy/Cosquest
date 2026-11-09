import Foundation
import OSLog

/// The live connection to the game: the scoreboard, who just went down, and
/// where everyone is.
///
/// A websocket rather than polling, for one reason that shows up on the field.
/// When a player is downed they need to know inside a heartbeat, because the
/// next thing they do depends on it. Polling at a rate that felt live would be
/// a request per second per player per venue, and polling at a rate that did
/// not would make the game feel like it was arguing with itself.
///
/// The socket carries telemetry the other way too: position at a walking pace,
/// and ultra wideband fixes on nearby players. Neither is trusted by the rules
/// engine; both are what makes the map and the arrows work.
///
/// Reconnection is assumed, not exceptional. A phone at a venue moves between
/// cells, loses the network in a doorway, and is backgrounded when someone
/// takes a call. So the link reconnects on its own with a backoff, and the
/// server's `hello` carries the whole scoreboard, which means a reconnect
/// resynchronises rather than leaving the player looking at stale numbers.
actor LiveLink {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "live")
    private let baseURL: URL
    private let gameID: String
    private let deviceKey: String
    private let session: URLSession

    private var task: URLSessionWebSocketTask?
    private var continuation: AsyncStream<Message>.Continuation?
    private var wantsConnection = false
    private var lastPositionSent = Date.distantPast

    init(baseURL: URL, gameID: String, deviceKey: String) {
        self.baseURL = baseURL
        self.gameID = gameID
        self.deviceKey = deviceKey
        let config = URLSessionConfiguration.default
        // Fail and reconnect with backoff rather than wait silently: a socket
        // parked in "waiting for connectivity" looks connected to nobody and
        // disconnected to nobody.
        config.waitsForConnectivity = false
        // Long enough to survive a tunnel, short enough that a truly dead
        // socket is noticed rather than held open for ever.
        config.timeoutIntervalForRequest = 60
        self.session = URLSession(configuration: config)
    }

    // MARK: - What comes down the wire

    /// The server's message types, as `docs/API.md` defines them. Anything
    /// unrecognised is dropped rather than treated as an error: the server is
    /// allowed to grow new message types without every phone in the field
    /// having to be updated first.
    enum Message: Sendable {
        case hello(you: String?, board: Scoreboard)
        case scoreboard(Scoreboard)
        case event(kind: String, actor: String, deltas: [String: Int])
        case downed(player: String, by: String?)
        case gameStatus(String)
        case map([String: MapPlayer])
        case encounter(a: String, b: String, distance: Double)
        /// Another device's ultra wideband fix on us. Relayed only to the one
        /// player it concerns.
        case uwb(from: String, distance: Double, azimuth: Double, elevation: Double)
        case disconnected
        case connected
    }

    struct MapPlayer: Decodable, Sendable {
        let lat: Double
        let lng: Double
        let alt: Double?
        let heading: Double?
        let faction: String?
        let state: String?
    }

    /// Start the link and receive everything it produces. Ends when `stop` is
    /// called; until then it reconnects on its own.
    func messages() -> AsyncStream<Message> {
        wantsConnection = true
        return AsyncStream { continuation in
            self.continuation = continuation
            Task { await self.runLoop() }
            continuation.onTermination = { _ in
                Task { await self.stop() }
            }
        }
    }

    func stop() {
        wantsConnection = false
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        continuation?.finish()
        continuation = nil
    }

    // MARK: - Connection

    private func runLoop() async {
        var backoff = Duration.milliseconds(500)
        while wantsConnection {
            var components = URLComponents(
                url: baseURL.appending(path: "v1/games/\(gameID)/ws"),
                resolvingAgainstBaseURL: false)!
            components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
            // Binding the socket to the device key is what makes the server
            // accept position and ultra wideband from it. A socket without one
            // is a spectator, and the server ignores anything it sends, which
            // is the right posture: an unbound socket must never be able to
            // paint a player onto the map.
            components.queryItems = [URLQueryItem(name: "device_key", value: deviceKey)]

            let socket = session.webSocketTask(with: components.url!)
            task = socket
            socket.resume()
            // Not "connected" yet. A resumed task is only a request; the link
            // is up when the server's hello arrives, which receiveUntilClosed
            // reports. Saying connected here showed a green dot for a socket
            // the server had not accepted.
            let greeted = await receiveUntilClosed(socket)
            if greeted { backoff = .milliseconds(500) }

            guard wantsConnection else { return }
            if greeted { continuation?.yield(.disconnected) }
            log.notice("live link dropped, reconnecting in \(backoff.components.seconds)s")
            try? await Task.sleep(for: backoff)
            backoff = min(backoff * 2, .seconds(10))
        }
    }

    /// Read frames until the socket closes. Returns whether the server's
    /// hello arrived, which is the moment the link counts as connected.
    private func receiveUntilClosed(_ socket: URLSessionWebSocketTask) async -> Bool {
        var greeted = false
        while wantsConnection {
            do {
                let frame = try await socket.receive()
                let text: String?
                switch frame {
                case .string(let s): text = s
                case .data(let data): text = String(data: data, encoding: .utf8)
                @unknown default: text = nil
                }
                guard let text, let message = decode(text) else { continue }
                if !greeted {
                    // Anything decodable proves the server accepted us; hello
                    // is normally first, but a scoreboard counts as well.
                    greeted = true
                    continuation?.yield(.connected)
                }
                continuation?.yield(message)
            } catch {
                if !greeted { log.notice("live link failed before hello: \(error.localizedDescription)") }
                return greeted
            }
        }
        return greeted
    }

    // MARK: - Sending telemetry

    /// The player's position, at a walking pace.
    ///
    /// Rate limited to once a second here rather than at the call site, because
    /// the caller is a location delegate that fires as often as the hardware
    /// feels like it, and a venue of two hundred phones each sending ten a
    /// second is a load pattern the server should never have to see.
    func sendPosition(lat: Double, lng: Double, altitude: Double, heading: Double) async {
        guard Date().timeIntervalSince(lastPositionSent) >= 1 else { return }
        lastPositionSent = Date()
        await send(["t": "pos", "lat": lat, "lng": lng,
                    "alt": altitude, "heading": heading])
    }

    /// Our ultra wideband fix on another player, relayed to them so their
    /// screen can point at us.
    func sendUWB(peer: String, distance: Double, azimuth: Double, elevation: Double) async {
        await send(["t": "uwb", "peer": peer, "distance_m": distance,
                    "azimuth_deg": azimuth, "elevation_deg": elevation])
    }

    private func send(_ object: [String: Any]) async {
        guard let task, let data = try? JSONSerialization.data(withJSONObject: object),
              let text = String(data: data, encoding: .utf8) else { return }
        // Telemetry, so a failure is dropped rather than retried. The next
        // one is a second away and more accurate than this one.
        try? await task.send(.string(text))
    }

    // MARK: - Decoding

    private func decode(_ text: String) -> Message? {
        guard let data = text.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["t"] as? String else { return nil }

        switch type {
        case "hello":
            guard let board = try? JSONDecoder().decode(Scoreboard.self, from: data) else { return nil }
            return .hello(you: object["you"] as? String, board: board)
        case "scoreboard":
            guard let board = try? JSONDecoder().decode(Scoreboard.self, from: data) else { return nil }
            return .scoreboard(board)
        case "event":
            return .event(kind: object["kind"] as? String ?? "",
                          actor: object["actor"] as? String ?? "",
                          deltas: object["deltas"] as? [String: Int] ?? [:])
        case "downed":
            return .downed(player: object["player"] as? String ?? "",
                           by: object["by"] as? String)
        case "game":
            return .gameStatus(object["status"] as? String ?? "")
        case "map":
            guard let players = object["players"],
                  let raw = try? JSONSerialization.data(withJSONObject: players),
                  let decoded = try? JSONDecoder().decode([String: MapPlayer].self, from: raw)
            else { return nil }
            return .map(decoded)
        case "encounter":
            return .encounter(a: object["a"] as? String ?? "",
                              b: object["b"] as? String ?? "",
                              distance: object["distance_m"] as? Double ?? 0)
        case "uwb":
            return .uwb(from: object["from"] as? String ?? "",
                        distance: object["distance_m"] as? Double ?? 0,
                        azimuth: object["azimuth_deg"] as? Double ?? 0,
                        elevation: object["elevation_deg"] as? Double ?? 0)
        default:
            return nil
        }
    }
}
