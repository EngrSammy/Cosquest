import Foundation

/// Talks to the CostQuest game server.
///
/// Two rules shape this whole file, both from the server's contract:
///
/// **The server judges.** Nothing here computes an outcome. Events are sent and
/// verdicts come back; a verdict of `ok: false` is a normal answer, not an
/// error, and the UI shows the reason the server gave.
///
/// **Retries are safe and expected.** Every event carries a `client_seq` and
/// the server is idempotent on it, so a batch replayed after a dropped
/// connection is acknowledged with its original verdicts rather than applied
/// twice. A player in a venue on mobile data will lose the connection, so this
/// retries rather than surfacing a failure the player cannot act on.
actor GameClient {

    let baseURL: URL
    private let session: URLSession
    /// Pack files only: large, so they get a longer overall budget.
    private let bulk: URLSession

    init(baseURL: URL = CQConfig.baseURL) {
        self.baseURL = baseURL
        // Fail fast and retry, rather than wait. `waitsForConnectivity` with a
        // five minute resource budget left screens spinning for five minutes
        // with nothing to say why. Game events have their own durable retry
        // (EventOutbox), and screens can offer "try again", so a request that
        // cannot get through in 15 s is better reported than held.
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 45
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: config)

        let bulkConfig = URLSessionConfiguration.default
        bulkConfig.waitsForConnectivity = false
        bulkConfig.timeoutIntervalForRequest = 20
        bulkConfig.timeoutIntervalForResource = 180
        bulkConfig.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.bulk = URLSession(configuration: bulkConfig)
    }

    // MARK: - Errors

    enum ClientError: Error, LocalizedError {
        case http(status: Int, detail: String)
        case notJoined
        case staleNonce
        case badSignature
        case decoding(String)

        var errorDescription: String? {
            switch self {
            case .http(let status, let detail):
                return detail.isEmpty ? "The server returned \(status)." : detail
            case .notJoined:
                return "You have not joined this game."
            case .staleNonce:
                return "That request was out of order. Trying again."
            case .badSignature:
                return "This device could not prove who it is."
            case .decoding(let what):
                return "The server sent something unexpected: \(what)"
            }
        }

        /// Whether trying the same thing again could plausibly work. A stale
        /// nonce is the one 401 that is worth retrying, because the next
        /// attempt carries a higher one.
        var isRetryable: Bool {
            switch self {
            case .staleNonce: return true
            case .http(let status, _): return status >= 500 || status == 429
            default: return false
            }
        }
    }

    // MARK: - Request plumbing

    private func request(_ method: String, _ path: String,
                         body: Encodable? = nil, signed: Bool,
                         bulk useBulk: Bool = false) async throws -> Data {
        var url = baseURL
        url.append(path: path)
        var req = URLRequest(url: url)
        req.httpMethod = method

        var bodyData = Data()
        if let body {
            bodyData = try JSONEncoder().encode(AnyEncodable(body))
            req.httpBody = bodyData
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if signed {
            // The signature covers the path only, never the query string.
            let headers = try await DeviceIdentity.shared.signedHeaders(
                method: method, path: "/" + path, body: bodyData)
            for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        }

        let (data, response) = try await (useBulk ? bulk : session).data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.decoding("no HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw Self.error(status: http.statusCode, body: data)
        }
        return data
    }

    /// A GET whose query string is outside the signature, matching the server:
    /// the signature covers the path only, so a device key or a list of digests
    /// in the query does not change what was signed.
    private func requestWithQuery(_ method: String, _ path: String,
                                  query: [URLQueryItem], signed: Bool) async throws -> Data {
        var components = URLComponents(url: baseURL.appending(path: path),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = query
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        if signed {
            let headers = try await DeviceIdentity.shared.signedHeaders(
                method: method, path: "/" + path, body: Data())
            for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw ClientError.decoding("no HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw Self.error(status: http.statusCode, body: data)
        }
        return data
    }

    /// Turn the server's error shape into something the UI can act on. The
    /// server puts a human sentence in `detail`; it is written to be shown.
    private static func error(status: Int, body: Data) -> ClientError {
        // Roam refusals carry a reason object, not a string, because they
        // have more to say ("recharging until", "this far away"). The reason
        // is the sentence a player reads.
        let detail = (try? JSONDecoder().decode(ServerError.self, from: body))?.detail
            ?? (try? JSONDecoder().decode(ServerReason.self, from: body))?.detail.reason
            ?? String(data: body, encoding: .utf8) ?? ""
        if status == 401 {
            if detail.contains("stale nonce") { return .staleNonce }
            if detail.contains("signature") { return .badSignature }
        }
        if status == 404 && detail.contains("not joined") { return .notJoined }
        return .http(status: status, detail: detail)
    }

    private struct ServerError: Decodable { let detail: String }
    private struct ServerReason: Decodable {
        struct Reason: Decodable { let reason: String }
        let detail: Reason
    }

    /// One retry for the errors where a retry is meaningful, with a short
    /// backoff. Deliberately not a general retry loop: replaying a batch is
    /// safe because of `client_seq`, but hammering a struggling server is not.
    private func retrying<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch let error as ClientError where error.isRetryable {
            try? await Task.sleep(for: .milliseconds(400))
            return try await work()
        } catch let error as URLError where Self.isTransient(error) {
            try? await Task.sleep(for: .milliseconds(600))
            return try await work()
        }
    }

    /// Network failures worth one more attempt: a timeout or a dropped
    /// connection, not a bad URL or a cancelled task.
    nonisolated static func isTransient(_ error: URLError) -> Bool {
        switch error.code {
        case .timedOut, .networkConnectionLost, .notConnectedToInternet,
             .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed,
             .secureConnectionFailed:
            return true
        default:
            return false
        }
    }

    // MARK: - Joining and playing

    func join(gameID: String, handle: String, faction: String?,
              payoutDestination: String? = nil) async throws -> JoinResult {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        // Naming a payout destination makes this SIGNED, because the server
        // requires proof of the private half before it will record where money
        // goes. A device key is the whole identity here, so without that
        // anyone who learned one could point someone else's winnings at
        // themselves. Joining without one stays unsigned, which keeps the
        // common path working while signatures are still landing on this side.
        let wantsPayout = !(payoutDestination ?? "").isEmpty
        let data = try await request("POST", "v1/games/\(gameID)/join", body: JoinRequest(
            handle: handle, device_key: key, faction: faction,
            payout_destination: wantsPayout ? payoutDestination : nil),
            signed: wantsPayout)
        return try decode(JoinResult.self, from: data)
    }

    /// Send a batch of things the player did. Returns one verdict per event,
    /// in order.
    func send(gameID: String, events: [DeviceEvent]) async throws -> [Verdict] {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let payload = EventBatch(device_key: key, events: events)
        let data = try await retrying {
            try await request("POST", "v1/games/\(gameID)/events",
                              body: payload, signed: true)
        }
        return try decode(EventResults.self, from: data).results
    }

    func state(gameID: String) async throws -> Scoreboard {
        let data = try await request("GET", "v1/games/\(gameID)/state", signed: false)
        return try decode(Scoreboard.self, from: data)
    }

    /// The terms of a game: fee, prize split, sponsor, factions, venue.
    /// Unsigned and public, because a player has to be able to read what they
    /// are joining before they have joined it.
    func terms(gameID: String) async throws -> GameTerms {
        try decode(GameTerms.self,
                   from: try await request("GET", "v1/games/\(gameID)", signed: false))
    }

    /// The organiser's authored points on the field. Redacted server-side: a
    /// trivia anchor arrives with its question and choices and without the
    /// answer, which is the only reason it is safe to hold these on a phone.
    func anchors(gameID: String) async throws -> [GameAnchor] {
        try decode([GameAnchor].self,
                   from: try await request("GET", "v1/games/\(gameID)/anchors", signed: false))
    }

    /// This device's own row, including whether its entry payment landed.
    /// Signed, because on a game that requires signatures the server will only
    /// answer for the device that can prove it is asking about itself.
    func me(gameID: String) async throws -> PlayerStatus {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await retrying {
            try await requestWithQuery("GET", "v1/games/\(gameID)/me",
                                       query: [URLQueryItem(name: "device_key", value: key)],
                                       signed: true)
        }
        return try decode(PlayerStatus.self, from: data)
    }

    // MARK: - Profile

    /// A player's identity across games. Unsigned: it carries nothing private,
    /// and requiring a signature would stop one player looking at another's
    /// wall, which is the point of having one.
    func profile(deviceKey: String) async throws -> Profile {
        try decode(Profile.self,
                   from: try await request("GET", "v1/profile/\(deviceKey)", signed: false))
    }

    func myProfile() async throws -> Profile {
        try await profile(deviceKey: try await DeviceIdentity.shared.publicKeyHex())
    }

    @discardableResult
    func saveProfile(handle: String, avatar: Profile.Avatar) async throws -> Data {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        // Signed. The device key is the only identity in this system and
        // GET /v1/profile/{device_key} publishes every key, so an unsigned
        // write let anyone rename anyone and put an avatar on their wall.
        return try await request("PUT", "v1/profile",
                                 body: ProfileUpsert(device_key: key, handle: handle,
                                                     avatar: avatar), signed: true)
    }

    /// The games a player can find. Unsigned and public: a phone has not
    /// joined anything yet and has nothing to prove, and asking for a
    /// signature before a player can even see what is on would mean a device
    /// key is needed to look at a poster.
    // MARK: - Presence

    /// Say you are about, and what you are doing.
    ///
    /// Signed, because presence is a claim about a person: unsigned, anyone
    /// could fill the outpost with invented players or announce that a real
    /// one is somewhere they are not. The handle and avatar are read from the
    /// stored profile server-side rather than sent, so a device cannot present
    /// itself under someone else's name.
    @discardableResult
    func presenceBeat(status: String, gameID: String? = nil) async throws -> Int {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await request("POST", "v1/presence", body: PresenceBeat(
            device_key: key, status: status, game_id: gameID), signed: true)
        return (try? decode(PresenceHere.self, from: data).here) ?? 0
    }

    /// Who else is about. Carries no location of any kind, by design.
    func presenceRoster() async throws -> [PresencePerson] {
        let key = try? await DeviceIdentity.shared.publicKeyHex()
        var q: [URLQueryItem] = []
        if let key { q.append(URLQueryItem(name: "device_key", value: key)) }
        let data = try await requestWithQuery("GET", "v1/presence", query: q, signed: false)
        return try decode(PresenceRoster.self, from: data).people
    }

    func gamesNearby(lat: Double?, lng: Double?,
                     radiusM: Int = 50_000) async throws -> [GameSummary] {
        var q = [URLQueryItem(name: "radius_m", value: String(radiusM))]
        if let lat, let lng {
            q.append(URLQueryItem(name: "lat", value: String(lat)))
            q.append(URLQueryItem(name: "lng", value: String(lng)))
        }
        let data = try await requestWithQuery("GET", "v1/games", query: q,
                                              signed: false)
        return try decode(GamesNearby.self, from: data).games
    }

    /// The shape of a venue: roads, water, green space and building
    /// footprints, in metres on a local plane. Unsigned and public for the
    /// same reason as the model manifest: it is the ground, not the game.
    func ground(lat: Double, lng: Double, radiusM: Double) async throws
    -> GroundGeometry {
        let data = try await requestWithQuery("GET", "v1/map/ground", query: [
            URLQueryItem(name: "lat", value: String(lat)),
            URLQueryItem(name: "lng", value: String(lng)),
            URLQueryItem(name: "radius_m", value: String(Int(radiusM))),
        ], signed: false)
        return try decode(GroundGeometry.self, from: data)
    }

    /// The same, with the bytes it came in, so the map can keep the last
    /// answer on disk and draw it at the next launch before the network has
    /// said anything. Decoded here, off the main actor.
    func groundWithData(lat: Double, lng: Double, radiusM: Double) async throws
    -> (GroundGeometry, Data) {
        let data = try await requestWithQuery("GET", "v1/map/ground", query: [
            URLQueryItem(name: "lat", value: String(lat)),
            URLQueryItem(name: "lng", value: String(lng)),
            URLQueryItem(name: "radius_m", value: String(Int(radiusM))),
        ], signed: false)
        return (try decode(GroundGeometry.self, from: data), data)
    }

    /// Where the on-device model lives. Unsigned and public: it names files
    /// that anyone can download, and gating it would mean a phone could not
    /// prepare the assistant before joining anything.
    func modelManifest() async throws -> ModelManifest {
        try decode(ModelManifest.self,
                   from: try await request("GET", "v1/model", signed: false))
    }

    // MARK: - Environment

    func packManifest(gameID: String) async throws -> PackManifest {
        let data = try await retrying {
            try await request("GET", "v1/games/\(gameID)/pack", signed: true)
        }
        return try decode(PackManifest.self, from: data)
    }

    /// One asset file. Returns the raw bytes; verifying them against the
    /// manifest digest is the caller's job and is not optional.
    func packFile(gameID: String, version: String, filename: String) async throws -> Data {
        let encoded = filename.addingPercentEncoding(
            withAllowedCharacters: .urlPathAllowed) ?? filename
        return try await retrying {
            try await request("GET", "v1/games/\(gameID)/pack/\(version)/\(encoded)",
                              signed: true, bulk: true)
        }
    }

    // MARK: - Tiles

    func announceTiles(gameID: String, holding: [String], dropped: [String] = []) async throws {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        _ = try await request("POST", "v1/games/\(gameID)/tiles/announce",
                              body: TileAnnounce(device_key: key, sha256: holding,
                                                 dropped: dropped), signed: true)
    }

    /// Which nearby players hold each digest. Returns player ids, never device
    /// keys: the server will not hand those out and the mesh does not need them.
    func tileSources(gameID: String, digests: [String]) async throws -> TileSources {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        var items = digests.map { URLQueryItem(name: "sha", value: $0) }
        items.append(URLQueryItem(name: "device_key", value: key))
        var comps = URLComponents(url: baseURL.appending(path: "v1/games/\(gameID)/tiles/sources"),
                                  resolvingAgainstBaseURL: false)!
        comps.queryItems = items

        var req = URLRequest(url: comps.url!)
        req.httpMethod = "GET"
        // Signed over the path only — the digests live in the query string and
        // are deliberately outside the signature, matching the server.
        let headers = try await DeviceIdentity.shared.signedHeaders(
            method: "GET", path: "/v1/games/\(gameID)/tiles/sources", body: Data())
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw Self.error(status: (response as? HTTPURLResponse)?.statusCode ?? 0,
                             body: data)
        }
        return try decode(TileSources.self, from: data)
    }

    func reportPeerTiles(gameID: String, count: Int) async throws {
        guard count > 0 else { return }
        let key = try await DeviceIdentity.shared.publicKeyHex()
        _ = try await request("POST", "v1/games/\(gameID)/tiles/received",
                              body: TileReceived(device_key: key, count: count),
                              signed: false)
    }

    // MARK: - Money

    func checkout(gameID: String) async throws -> Checkout {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await request("POST", "v1/games/\(gameID)/checkout",
                                     body: CheckoutRequest(device_key: key), signed: false)
        return try decode(Checkout.self, from: data)
    }

    // MARK: - Roam

    func roamConfig() async throws -> RoamConfig {
        try decode(RoamConfig.self,
                   from: try await request("GET", "v1/roam/config", signed: false))
    }

    func questPoints(lat: Double, lng: Double, radiusM: Int = 600) async throws -> QuestPoints {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await retrying {
            try await requestWithQuery("GET", "v1/roam/points", query: [
                URLQueryItem(name: "lat", value: String(lat)),
                URLQueryItem(name: "lng", value: String(lng)),
                URLQueryItem(name: "radius_m", value: String(radiusM)),
                URLQueryItem(name: "device_key", value: key),
            ], signed: true)
        }
        return try decode(QuestPoints.self, from: data)
    }

    func roamMe() async throws -> RoamMe {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await retrying {
            try await requestWithQuery("GET", "v1/roam/me", query: [
                URLQueryItem(name: "device_key", value: key)], signed: false)
        }
        return try decode(RoamMe.self, from: data)
    }

    func chooseFaction(_ faction: String) async throws -> RoamMe {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await request("PUT", "v1/roam/faction",
                                     body: RoamFactionBody(device_key: key, faction: faction),
                                     signed: true)
        return try decode(RoamMe.self, from: data)
    }

    func starter(lat: Double, lng: Double, accuracy: Double) async throws -> RoamStarter {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await retrying {
            try await request("POST", "v1/roam/starter", body: RoamWhere(
                device_key: key, lat: lat, lng: lng, accuracy_m: max(0, accuracy)),
                signed: true)
        }
        return try decode(RoamStarter.self, from: data)
    }

    /// Start the challenge at a point. Not retried on a refusal: "get
    /// closer" and "recharging" are answers, and the player should read them.
    func openPoint(_ id: String, lat: Double, lng: Double,
                   accuracy: Double) async throws -> RoamAttempt {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await retrying {
            try await request("POST", "v1/roam/open", body: RoamOpen(
                device_key: key, point_id: id, lat: lat, lng: lng,
                accuracy_m: max(0, accuracy)), signed: true)
        }
        return try decode(RoamAttempt.self, from: data)
    }

    /// Safe to repeat: the server answers a second ask with the first
    /// verdict and pays once, so a lost reply is simply asked for again.
    func answer(attempt: String, answers: [RoamAnswer]) async throws -> RoamVerdict {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let body = RoamAnswerBody(device_key: key, attempt_id: attempt, answers: answers)
        let data = try await retrying {
            try await request("POST", "v1/roam/answer", body: body, signed: true)
        }
        return try decode(RoamVerdict.self, from: data)
    }

    func hint(attempt: String, kind: String, question: Int) async throws -> RoamHint {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        let data = try await request("POST", "v1/roam/hint", body: RoamHintBody(
            device_key: key, attempt_id: attempt, kind: kind, question: question),
            signed: true)
        return try decode(RoamHint.self, from: data)
    }

    // Generic Roam calls, for feature files (CostQuest/Features/*) that add
    // their own routes under /v1/roam/<feature>. Paths have no leading slash.

    /// GET with a query string; `signed` signs the path (not the query).
    func roamGet<T: Decodable>(_ path: String, query: [URLQueryItem] = [],
                               signed: Bool = false, as type: T.Type) async throws -> T {
        let data = try await retrying {
            try await requestWithQuery("GET", path, query: query, signed: signed)
        }
        return try decode(T.self, from: data)
    }

    /// POST a body, always signed. The body must carry `device_key`.
    func roamPost<T: Decodable>(_ path: String, body: some Encodable & Sendable,
                                as type: T.Type) async throws -> T {
        let data = try await request("POST", path, body: body, signed: true)
        return try decode(T.self, from: data)
    }

    /// PUT a body, always signed, for the few routes that set a value.
    func roamPut<T: Decodable>(_ path: String, body: some Encodable & Sendable,
                               as type: T.Type) async throws -> T {
        let data = try await request("PUT", path, body: body, signed: true)
        return try decode(T.self, from: data)
    }

    func deviceKey() async throws -> String { try await DeviceIdentity.shared.publicKeyHex() }

    func bag() async throws -> RoamBag {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        return try await roamGet("v1/roam/items/bag",
                                 query: [URLQueryItem(name: "device_key", value: key)],
                                 as: RoamBag.self)
    }

    func spin(_ point: String, lat: Double, lng: Double, accuracy: Double) async throws -> RoamSpin {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        return try await roamPost("v1/roam/items/spin", body: RoamSpinBody(
            device_key: key, point_id: point, lat: lat, lng: lng, accuracy_m: max(0, accuracy)),
            as: RoamSpin.self)
    }

    func retry(attempt: String, lat: Double, lng: Double, accuracy: Double) async throws -> RoamAttempt {
        let key = try await DeviceIdentity.shared.publicKeyHex()
        return try await roamPost("v1/roam/retry", body: RoamRetryBody(
            device_key: key, attempt_id: attempt, lat: lat, lng: lng, accuracy_m: max(0, accuracy)),
            as: RoamAttempt.self)
    }

    func factionWar(lat: Double, lng: Double) async throws -> FactionWar {
        let data = try await requestWithQuery("GET", "v1/roam/war", query: [
            URLQueryItem(name: "lat", value: String(lat)),
            URLQueryItem(name: "lng", value: String(lng))], signed: false)
        return try decode(FactionWar.self, from: data)
    }

    func roamLeaders(lat: Double, lng: Double) async throws -> RoamLeaders {
        let key = try? await DeviceIdentity.shared.publicKeyHex()
        var q = [URLQueryItem(name: "lat", value: String(lat)),
                 URLQueryItem(name: "lng", value: String(lng))]
        if let key { q.append(URLQueryItem(name: "device_key", value: key)) }
        let data = try await requestWithQuery("GET", "v1/roam/leaders", query: q, signed: false)
        return try decode(RoamLeaders.self, from: data)
    }

    // MARK: - Health

    func health() async throws -> Health {
        try decode(Health.self, from: try await request("GET", "health", signed: false))
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw ClientError.decoding("\(type)")
        }
    }
}

/// Lets a heterogeneous `Encodable` go through `JSONEncoder`.
private struct AnyEncodable: Encodable {
    private let encodeIt: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeIt = wrapped.encode(to:) }
    func encode(to encoder: Encoder) throws { try encodeIt(encoder) }
}
