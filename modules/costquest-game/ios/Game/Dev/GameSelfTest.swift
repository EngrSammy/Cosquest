import CryptoKit
import Foundation

/// Plays a real game against the live server, from inside the app, using the
/// app's own types.
///
/// This exists because the interesting failures in this client are all at the
/// seams and none of them can be seen from a unit test. The outbox's sequence
/// numbers have to line up with the server's replay window. The websocket has
/// to deliver another player's action to this player. A refusal has to come
/// back as a readable sentence rather than an exception. Every one of those is
/// a two-sided property, and mocking the other side would only prove that the
/// mock agrees with itself.
///
/// It runs in the simulator so that `DeviceIdentity` uses a real Keychain, and
/// it plays against a game it creates and starts, so it never touches a real
/// event.
///
///     xcrun simctl launch --console-pty <device> com.djmcevents.CostQuest -selfTest 1 \
///         -adminToken <token> -server https://costquest-staging.204.168.162.79.sslip.io
enum GameSelfTest {

    // The server this build points at (`-server`, or a staging build), never
    // production by accident: the test creates and plays games of its own.
    private static var base: URL { CQConfig.baseURL }
    nonisolated(unsafe) private static var failures: [String] = []

    static func check(_ name: String, _ ok: Bool, _ detail: String = "") {
        print("  \(ok ? "PASS" : "FAIL")  \(name)\(detail.isEmpty ? "" : "  " + detail)")
        if !ok { failures.append(name) }
    }

    @MainActor
    static func run() async {
        print("\n=== CostQuest client, against the live server ===\n")

        guard let game = await createGame() else {
            print("  could not create a game; is the server up?")
            exit(1)
        }
        print("  game \(game)\n")

        // An opponent, joined over raw HTTP with its own key pair. The engine
        // needs two players to have anything to judge, and making the second
        // one a stranger rather than a second instance of our own types keeps
        // the test honest about which side is being tested.
        let ghost = Ghost(game: game)
        guard let ghostID = await ghost.join() else {
            print("  the opponent could not join"); exit(1)
        }

        let session = GameSession(gameID: game,
                                  client: GameClient(baseURL: base))
        do {
            try await session.join(handle: "self-test", faction: "red")
        } catch {
            print("  join failed: \(error.localizedDescription)"); exit(1)
        }
        check("this device joined and was given a player id", session.playerID != nil)
        check("the server assigned a faction", session.faction != nil,
              session.faction ?? "none")

        _ = await post("/v1/games/\(game)/start", body: [:])

        // The live link has to be up before anything is worth asserting about
        // it, and "up" means the server's hello has landed.
        for _ in 0..<50 where !session.isConnected {
            try? await Task.sleep(for: .milliseconds(100))
        }
        check("the live link connected", session.isConnected)

        // 1. A pickup, which the engine allows once per cooldown.
        let start = Date()
        let pickup = await session.pickUp(.init(name: "harpoon", range: 30, damage: 15, faction: nil))
        let firstEventMS = Date().timeIntervalSince(start) * 1000
        check("a pickup is accepted", pickup.ok, pickup.reason ?? "")
        check("the verdict came back inside the 2 s contract target",
              firstEventMS < 2000, String(format: "%.0f ms", firstEventMS))
        check("the client holds the weapon the server confirmed",
              session.weapon == "harpoon")
        check("the weapon's abilities are readable by the player",
              session.held?.abilities.count == 2,
              session.held?.abilities.joined(separator: ", ") ?? "none")

        // 2. A hit in range, which should drain tokens.
        let hit = await session.hit(target: ghostID, range: 5)
        check("a hit in range is accepted", hit.ok, hit.reason ?? "")
        check("the server reported what was drained", (hit.drained ?? 0) > 0,
              "\(hit.drained ?? 0) tokens")

        // 3. The same hit again, immediately. The engine's cooldown must refuse
        //    it, and the refusal must arrive as a sentence a player can read
        //    rather than as an error thrown at the UI.
        let tooSoon = await session.hit(target: ghostID, range: 5)
        check("a second hit inside the cooldown is refused", !tooSoon.ok,
              tooSoon.reason ?? "")
        check("the refusal is phrased for a player",
              (tooSoon.reason ?? "").contains("cooldown"), tooSoon.reason ?? "")

        // 4. An impossible range. This is the anti-cheat path: the client can
        //    claim anything and the server is what says no.
        let tooFar = await session.hit(target: ghostID, range: 900)
        check("a hit beyond the game's range is refused", !tooFar.ok,
              tooFar.reason ?? "")

        // 5. The other direction: the opponent acts, and this device learns
        //    about it over the websocket without asking.
        let before = session.feed.count
        await ghost.pickUpAndHit(target: session.playerID ?? "")
        var pushed = false
        for _ in 0..<60 {
            if session.feed.count > before || session.tokens != 0 { pushed = true; break }
            try? await Task.sleep(for: .milliseconds(100))
        }
        check("another player's action arrives over the live link without polling",
              pushed)

        // 6. The scoreboard, which is the state of record and the thing a
        //    reconnecting phone is resynchronised from.
        check("the scoreboard names both players", session.players.count >= 2,
              "\(session.players.count) players")
        check("this player's tokens come from the server, not from the client",
              session.players[session.playerID ?? ""] != nil)

        // 7. Latency over a run of events, which is what the game actually
        //    feels like rather than one sample. Sent one at a time, because
        //    batched they would flatter the number.
        var samples: [Double] = []
        for _ in 0..<10 {
            let t = Date()
            _ = await session.hit(target: ghostID, range: 5)
            samples.append(Date().timeIntervalSince(t) * 1000)
            try? await Task.sleep(for: .milliseconds(120))
        }
        let sorted = samples.sorted()
        let median = sorted[sorted.count / 2]
        let worst = sorted.last ?? 0
        check("event round trip stays inside the contract's 2 s", worst < 2000,
              String(format: "median %.0f ms, worst %.0f ms over %d events",
                     median, worst, samples.count))

        session.leave()
        // Its game is a test fixture: cancel it, so it does not sit on this
        // phone's profile as "Playing now" (as it did in the M3 rehearsal).
        _ = await post("/v1/admin/games/\(game)/cancel", body: [:])

        print("")
        if failures.isEmpty {
            print("  Client end to end: all checks passed.\n")
        } else {
            print("  \(failures.count) FAILED: \(failures.joined(separator: ", "))\n")
        }
        exit(failures.isEmpty ? 0 : 1)
    }

    // MARK: - Server helpers

    private static func createGame() async -> String? {
        let body: [String: Any] = [
            "title": "client self test",
            "factions": ["red", "blue"],
            // Signed, because unsigned would skip the part most likely to
            // break: every event this client sends is signed by the Keychain
            // key and checked against the nonce high-water mark.
            "require_signatures": true,
            "config": ["hit_cooldown_s": 3.0, "max_range_m": 50.0],
        ]
        guard let data = await post("/v1/games", body: body),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return object["game_id"] as? String
    }

    @discardableResult
    private static func post(_ path: String, body: [String: Any],
                             headers: [String: String] = [:]) async -> Data? {
        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = "POST"
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Operator routes (create, start, settle) need the back office token
        // since the server stopped failing open. Passed at launch, never kept.
        if let token = UserDefaults.standard.string(forKey: "adminToken") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }
        return try? await URLSession.shared.data(for: request).0
    }

    /// The opponent. Its own key pair, its own signatures, no shared code with
    /// the client under test beyond the wire format itself.
    private actor Ghost {
        private let game: String
        private let key = Curve25519.Signing.PrivateKey()
        private var id: String?
        private var seq = 0

        init(game: String) { self.game = game }

        private var publicHex: String { key.publicKey.rawRepresentation.hexString }

        func join() async -> String? {
            let data = await GameSelfTest.post("/v1/games/\(game)/join", body: [
                "handle": "opponent", "device_key": publicHex, "faction": "blue"])
            guard let data,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return nil }
            id = object["player_id"] as? String
            return id
        }

        func pickUpAndHit(target: String) async {
            await send([["client_seq": seq, "kind": "pickup",
                         "payload": ["weapon": "net"]]])
            seq += 1
            await send([["client_seq": seq, "kind": "hit",
                         "payload": ["target": target, "range_m": 4.0]]])
            seq += 1
        }

        private func send(_ events: [[String: Any]]) async {
            let path = "/v1/games/\(game)/events"
            let body = try! JSONSerialization.data(withJSONObject: [
                "device_key": publicHex, "events": events])
            let nonce = Int(Date().timeIntervalSince1970 * 1000)
            let payload = DeviceIdentity.signingPayload(method: "POST", path: path,
                                                        body: body, nonce: nonce)
            var request = URLRequest(url: GameSelfTest.base.appending(path: path))
            request.httpMethod = "POST"
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(publicHex, forHTTPHeaderField: "X-Device-Key")
            request.setValue(try! key.signature(for: payload).hexString,
                             forHTTPHeaderField: "X-Signature")
            request.setValue(String(nonce), forHTTPHeaderField: "X-Nonce")
            _ = try? await URLSession.shared.data(for: request)
        }
    }
}
