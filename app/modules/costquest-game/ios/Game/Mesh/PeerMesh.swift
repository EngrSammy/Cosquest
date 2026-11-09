import CryptoKit
import Foundation
import Network
import OSLog

/// Phones talking to each other directly, without the venue's network.
///
/// Two things need this and they are not the same thing.
///
/// **The environment.** A field of two hundred players all pulling the same
/// twenty-eight megabyte pack through one cell tower is the load pattern that
/// ruins an event, and it is entirely avoidable: the player next to you already
/// has the file. Every file is content-addressed by sha256 and verified on
/// arrival, so bytes from a stranger's phone are exactly as trustworthy as
/// bytes from the server, and a peer that lies fails the digest and costs
/// nothing but a moment.
///
/// **Ultra wideband.** Two devices cannot range each other until they have
/// swapped `NIDiscoveryToken`s, and NearbyInteraction deliberately does not
/// provide a channel for that. This is that channel.
///
/// Built on the Network framework rather than MultipeerConnectivity, which
/// Apple deprecates: discovery over Bonjour, transport over TLS with a
/// pre-shared key derived from the game id, and `includePeerToPeer` so the
/// radios can form a link where there is no infrastructure at all. The
/// pre-shared key is what makes the mesh a game's mesh rather than an open
/// port: a phone at the next event, or a stranger in the car park, does not
/// have the game id and cannot complete the handshake.
actor PeerMesh {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "mesh")

    /// Must match `NSBonjourServices` in Info.plist or discovery silently finds
    /// nothing, which is the single most common way this is broken.
    private static let serviceType = "_costquest._tcp"

    private let gameID: String
    private let deviceKey: String

    private var listener: NWListener?
    private var browser: NWBrowser?
    private var peers: [String: Peer] = [:]

    /// This phone's player id in the game, sent in the hello so a neighbour
    /// can file an ultra wideband fix under the player it measured. The
    /// device key alone cannot be matched against the scoreboard.
    private var playerID: String?
    /// Neighbours' player ids by device key, from their hellos.
    private var playerForKey: [String: String] = [:]

    func setPlayerID(_ id: String?) { playerID = id }
    func player(forKey key: String) -> String? { playerForKey[key] }

    /// Bytes that arrived from a phone nearby, before they have been checked.
    /// The digest is checked by whoever asked for them, never here: this type
    /// moves bytes and has no opinion about whether they are good.
    var onTile: (@Sendable (String, Data) async -> Void)?
    /// Another player's ultra wideband token, ready to range against. Called
    /// with the connection id (to answer on), the peer's device key when known
    /// (stable across reconnects, so ranging is keyed by it), the token, and
    /// whether it was sent to us directly rather than broadcast.
    var onDiscoveryToken: (@Sendable (_ connection: String, _ key: String,
                                      _ token: Data, _ direct: Bool) async -> Void)?
    /// What a peer says it holds, so we know who to ask.
    var onInventory: (@Sendable (String, [String]) async -> Void)?

    init(gameID: String, deviceKey: String) {
        self.gameID = gameID
        self.deviceKey = deviceKey
    }

    // MARK: - Coming up

    // Every handler below is `@Sendable`. Network framework calls them on the
    // queue the listener, browser or connection was started with, and a closure
    // written inside an actor otherwise inherits that actor's isolation along
    // with a runtime assert that it is running on it. The assert would fail on
    // the first callback and trap the process. Detaching them is also true to
    // what they do: each one only opens a `Task` back onto the actor.
    func start() {
        do {
            let parameters = Self.parameters(gameID: gameID)
            let listener = try NWListener(using: parameters)
            // The player id would be friendlier, but it is assigned by the
            // server and the mesh has to work before, and without, a server.
            // The device key is already this device's identity everywhere else.
            listener.service = NWListener.Service(
                name: String(deviceKey.prefix(16)),
                type: Self.serviceType,
                txtRecord: NWTXTRecord(["key": deviceKey, "game": gameID]))

            listener.newConnectionHandler = { @Sendable [weak self] connection in
                Task { await self?.adopt(connection, key: nil, outbound: false) }
            }
            listener.stateUpdateHandler = { @Sendable [weak self] state in
                if case .failed(let error) = state {
                    Task { await self?.listenerFailed(error) }
                }
            }
            listener.start(queue: .global(qos: .userInitiated))
            self.listener = listener
        } catch {
            log.error("could not listen: \(error.localizedDescription)")
        }

        let browser = NWBrowser(
            for: .bonjourWithTXTRecord(type: Self.serviceType, domain: nil),
            using: Self.parameters(gameID: gameID))
        browser.browseResultsChangedHandler = { @Sendable [weak self] results, _ in
            Task { await self?.found(results) }
        }
        browser.start(queue: .global(qos: .userInitiated))
        self.browser = browser
        log.notice("mesh up for game \(self.gameID.prefix(8))")
    }

    func stop() {
        listener?.cancel()
        browser?.cancel()
        for peer in peers.values { peer.connection.cancel() }
        peers.removeAll()
    }

    /// TLS over TCP with a pre-shared key, and peer-to-peer Wi-Fi allowed.
    ///
    /// Not QUIC, though it would multiplex more neatly: the combination that is
    /// documented to work over Apple's peer-to-peer link is TLS with a
    /// pre-shared key, and a venue with no infrastructure is exactly where this
    /// has to work. Head-of-line blocking is handled instead by capping a frame
    /// at 32 KB, so a control message waits behind at most a millisecond of
    /// file transfer on any usable link.
    private static func parameters(gameID: String) -> NWParameters {
        let tls = NWProtocolTLS.Options()

        // The game id never leaves the venue in the clear: the key is its
        // hash, so a listener that does not know the id cannot complete a
        // handshake, and one that does cannot recover the id from the wire.
        let secret = Data(SHA256.hash(data: Data("costquest/\(gameID)".utf8)))
        let identity = Data("costquest".utf8)
        secret.withUnsafeBytes { secretBytes in
            identity.withUnsafeBytes { identityBytes in
                sec_protocol_options_add_pre_shared_key(
                    tls.securityProtocolOptions,
                    DispatchData(bytes: secretBytes) as __DispatchData,
                    DispatchData(bytes: identityBytes) as __DispatchData)
            }
        }
        sec_protocol_options_append_tls_ciphersuite(
            tls.securityProtocolOptions, tls_ciphersuite_t.AES_128_GCM_SHA256)

        let tcp = NWProtocolTCP.Options()
        // The mesh carries game messages as well as file chunks, and Nagle
        // would hold a small "I have this" behind an ack for no benefit.
        tcp.noDelay = true

        let parameters = NWParameters(tls: tls, tcp: tcp)
        // Off by default, and the reason the mesh works in a field with no
        // Wi-Fi at all. It costs performance for everything else on the
        // network, which is why it is switched on here and nowhere else.
        parameters.includePeerToPeer = true
        return parameters
    }

    // MARK: - Peers

    private struct Peer {
        let connection: NWConnection
        /// Which side dialled. Needed to settle the case where two phones
        /// discover each other at the same moment and both dial.
        let isOutbound: Bool
        /// The peer's device key, known from the TXT record when we dialled
        /// and from its hello when it dialled us.
        var key: String?
        var holds: Set<String> = []
    }

    /// Keyed by a local id that never changes for the life of a connection.
    ///
    /// It used to be keyed by the peer's device key, re-filed when the hello
    /// arrived. That looked tidier and was wrong: the receive loop and every
    /// handler had already captured the old id, so after the re-file they were
    /// writing to and reading from an entry that no longer existed. Discovery
    /// and inventory still worked, which is what made it hard to see; files
    /// simply never moved, silently, for ever.
    private func found(_ results: Set<NWBrowser.Result>) {
        for result in results {
            guard case .bonjour(let record) = result.metadata,
                  let key = record.dictionary["key"],
                  record.dictionary["game"] == gameID else { continue }
            // Never dial ourselves, and never dial a phone we already have.
            guard key != deviceKey,
                  !peers.values.contains(where: { $0.key == key }) else { continue }

            let connection = NWConnection(to: result.endpoint,
                                          using: Self.parameters(gameID: gameID))
            adopt(connection, key: key, outbound: true)
        }
    }

    private func adopt(_ connection: NWConnection, key: String?, outbound: Bool) {
        let id = UUID().uuidString
        peers[id] = Peer(connection: connection, isOutbound: outbound, key: key)
        connection.stateUpdateHandler = { @Sendable [weak self] state in
            switch state {
            case .ready:
                Task { await self?.introduce(to: id) }
            case .failed(let error):
                Task { await self?.note("connection failed: \(error)"); await self?.drop(id) }
            case .cancelled:
                Task { await self?.drop(id) }
            case .waiting(let error):
                Task { await self?.note("connection waiting: \(error)") }
            default:
                break
            }
        }
        connection.start(queue: .global(qos: .userInitiated))
        receive(on: connection, from: id)
    }

    private func drop(_ id: String) {
        let key = peers[id]?.key ?? "unknown"
        let outbound = peers[id]?.isOutbound ?? false
        peers[id]?.connection.cancel()
        peers.removeValue(forKey: id)
        log.notice("dropped \(outbound ? "outbound" : "inbound") peer \(key.prefix(8)); \(self.peers.count) left")
    }

    private func listenerFailed(_ error: NWError) {
        log.error("mesh listener failed: \(error.localizedDescription)")
        listener?.cancel()
        listener = nil
        // A listener that failed usually means the local network permission
        // was refused or the interface went away. Both are recoverable and
        // neither should take the game down, so it is simply retried.
        Task {
            try? await Task.sleep(for: .seconds(5))
            start()
        }
    }

    /// Two phones that discover each other at the same moment both dial, and
    /// end up with two connections carrying the same conversation. Settled
    /// without any negotiation by comparing the two device keys: the phone with
    /// the smaller key keeps the connection it dialled, the other keeps the one
    /// it answered. Both sides reach the same conclusion from the same two
    /// strings, so neither has to tell the other anything.
    func note(_ text: String) {
        log.notice("\(text)")
    }

    private func dropDuplicate(of key: String, keeping id: String) {
        let matching = peers.filter { $0.value.key == key }
        log.notice("hello from \(key.prefix(8)); \(matching.count) connection(s) to it")
        guard matching.count > 1 else { return }
        let weKeepOutbound = deviceKey < key
        for (otherID, peer) in matching where peer.isOutbound != weKeepOutbound {
            peers[otherID]?.connection.cancel()
            peers.removeValue(forKey: otherID)
        }
        // If that left nothing (both sides agreed to drop the same one, which
        // can happen when a hello races a cancel), keep the one we were told
        // about rather than ending up with no connection at all.
        if peers.values.first(where: { $0.key == key }) == nil, let peer = matching[id] {
            peers[id] = peer
        }
    }

    private func introduce(to id: String) async {
        await send(.hello(key: deviceKey, player: playerID), to: id)
    }

    // MARK: - Talking

    /// What the mesh can say. Deliberately small: everything here is either
    /// content-addressed or a token, so none of it is worth lying about and
    /// none of it changes the game's state. The server judges the game; this
    /// only moves bytes.
    enum Message {
        case hello(key: String, player: String?)
        /// The digests this phone holds and can serve.
        case inventory([String])
        /// Asking for these digests.
        case want([String])
        /// One file, with its digest so the receiver can check it.
        case tile(digest: String, bytes: Data)
        /// An ultra wideband discovery token, which NearbyInteraction cannot
        /// exchange for itself.
        case discoveryToken(Data, direct: Bool)
        /// A snapshot of the game as this phone last saw it, for a neighbour
        /// who has lost the network. Never authoritative: the server judges
        /// the game, and a mesh that could change a score would be a mesh that
        /// could be used to change one.
        case state([String: WireValue])
    }

    func broadcast(_ message: Message) async {
        for id in peers.keys { await send(message, to: id) }
    }

    /// Ask everyone who has said they hold something for it, one peer per
    /// digest so two phones do not both send the same three megabytes.
    func request(_ digests: [String]) async {
        var assignments: [String: [String]] = [:]
        for digest in digests {
            guard let holder = peers.first(where: { $0.value.holds.contains(digest) })?.key
            else { continue }
            assignments[holder, default: []].append(digest)
        }
        for (peer, wanted) in assignments {
            await send(.want(wanted), to: peer)
        }
    }

    /// Whether anyone nearby can serve this, so the caller can decide between
    /// waiting for a neighbour and paying for the cell.
    func holders(of digest: String) -> Int {
        peers.values.count { $0.holds.contains(digest) }
    }

    private func send(_ message: Message, to id: String) async {
        guard let connection = peers[id]?.connection else { return }
        for frame in Self.encode(message) {
            await withCheckedContinuation { continuation in
                connection.send(content: frame, completion: .contentProcessed { @Sendable _ in
                    continuation.resume()
                })
            }
        }
    }

    // MARK: - Framing
    //
    // Four bytes of big-endian length, then the frame. A file larger than the
    // 32 KB cap is split across frames and reassembled by digest, which keeps
    // a small message from waiting behind a whole mesh at once.

    private static let maxChunk = 32 * 1024

    private static func encode(_ message: Message) -> [Data] {
        switch message {
        case .hello(let key, let player):
            var body: [String: Any] = ["t": "hello", "key": key]
            if let player { body["player"] = player }
            return [frame(body)]
        case .inventory(let digests):
            return [frame(["t": "have", "sha": digests])]
        case .want(let digests):
            return [frame(["t": "want", "sha": digests])]
        case .discoveryToken(let token, let direct):
            return [frame(["t": "uwb", "token": token.base64EncodedString(), "d": direct])]
        case .state(let snapshot):
            let encoded = (try? JSONEncoder().encode(snapshot))
                .flatMap { try? JSONSerialization.jsonObject(with: $0) } ?? [:]
            return [frame(["t": "state", "s": encoded])]
        case .tile(let digest, let bytes):
            var frames: [Data] = []
            var offset = 0
            var index = 0
            let total = (bytes.count + maxChunk - 1) / maxChunk
            while offset < bytes.count {
                let end = min(offset + maxChunk, bytes.count)
                frames.append(frame(["t": "tile", "sha": digest,
                                     "i": index, "n": total,
                                     "b": bytes[offset..<end].base64EncodedString()]))
                offset = end
                index += 1
            }
            return frames
        }
    }

    private static func frame(_ object: [String: Any]) -> Data {
        let body = (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
        var length = UInt32(body.count).bigEndian
        var out = Data(bytes: &length, count: 4)
        out.append(body)
        return out
    }

    private func receive(on connection: NWConnection, from id: String) {
        // Read the length first, then exactly that many bytes. Reading
        // opportunistically and scanning for a delimiter is how a mesh ends up
        // reassembling two files into one.
        connection.receive(minimumIncompleteLength: 4, maximumLength: 4) {
            @Sendable [weak self] header, _, _, error in
            guard let self, let header, header.count == 4, error == nil else {
                Task { await self?.drop(id) }
                return
            }
            let length = Int(header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self).bigEndian })
            guard length > 0, length < 1_000_000 else {
                Task { await self.drop(id) }
                return
            }
            connection.receive(minimumIncompleteLength: length, maximumLength: length) {
                @Sendable body, _, _, error in
                guard let body, error == nil else {
                    Task { await self.drop(id) }
                    return
                }
                Task {
                    await self.handle(body, from: id)
                    await self.receive(on: connection, from: id)
                }
            }
        }
    }

    /// Partially received files, by digest.
    private var assembling: [String: (chunks: [Int: Data], total: Int)] = [:]

    private func handle(_ body: Data, from id: String) async {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let type = object["t"] as? String else { return }

        switch type {
        case "hello":
            guard let key = object["key"] as? String else { return }
            peers[id]?.key = key
            if let player = object["player"] as? String { playerForKey[key] = player }
            dropDuplicate(of: key, keeping: id)

        case "have":
            guard let digests = object["sha"] as? [String] else { return }
            peers[id]?.holds = Set(digests)
            await onInventory?(id, digests)

        case "want":
            guard let digests = object["sha"] as? [String] else { return }
            // Answered by whoever owns the files. The mesh does not read the
            // cache itself, because the store is the only thing that knows
            // which bytes have actually been verified.
            await onWant?(id, digests)

        case "state":
            guard let payload = object["s"],
                  let data = try? JSONSerialization.data(withJSONObject: payload),
                  let snapshot = try? JSONDecoder().decode([String: WireValue].self,
                                                           from: data) else { return }
            await onState?(id, snapshot)

        case "uwb":
            guard let encoded = object["token"] as? String,
                  let token = Data(base64Encoded: encoded) else { return }
            let direct = object["d"] as? Bool ?? false
            await onDiscoveryToken?(id, peers[id]?.key ?? id, token, direct)

        case "tile":
            guard let digest = object["sha"] as? String,
                  let index = object["i"] as? Int,
                  let total = object["n"] as? Int,
                  let encoded = object["b"] as? String,
                  let chunk = Data(base64Encoded: encoded) else { return }
            var state = assembling[digest] ?? (chunks: [:], total: total)
            state.chunks[index] = chunk
            if state.chunks.count == total {
                assembling.removeValue(forKey: digest)
                let bytes = (0..<total).compactMap { state.chunks[$0] }
                    .reduce(into: Data()) { $0.append($1) }
                await onTile?(digest, bytes)
            } else {
                assembling[digest] = state
            }

        default:
            break                       // a newer app may say things we do not know
        }
    }

    /// Asked when a peer wants files, answered by the pack store.
    var onWant: (@Sendable (String, [String]) async -> Void)?
    /// A neighbour's view of the game.
    var onState: (@Sendable (String, [String: WireValue]) async -> Void)?

    /// Hand a file to one peer.
    func serve(digest: String, bytes: Data, to peer: String) async {
        await send(.tile(digest: digest, bytes: bytes), to: peer)
    }

    func announce(holding digests: [String]) async {
        await broadcast(.inventory(digests))
    }

    func share(discoveryToken: Data) async {
        await broadcast(.discoveryToken(discoveryToken, direct: false))
    }

    /// A token meant for one peer: the answer half of the ranging handshake.
    func share(discoveryToken: Data, to connection: String) async {
        await send(.discoveryToken(discoveryToken, direct: true), to: connection)
    }

    /// The connection currently open to a device key, for answering a peer
    /// that is known by key.
    func connection(forKey key: String) -> String? {
        peers.first { $0.value.key == key }?.key ?? (peers[key] != nil ? key : nil)
    }

    var peerCount: Int { peers.count }

    // Setters rather than public vars: an actor's stored properties cannot be
    // assigned from outside, and these are all set once at startup.

    func setOnTile(_ handler: @escaping @Sendable (String, Data) async -> Void) {
        onTile = handler
    }

    func setOnWant(_ handler: @escaping @Sendable (String, [String]) async -> Void) {
        onWant = handler
    }

    func setOnDiscoveryToken(_ handler: @escaping @Sendable (String, String, Data, Bool) async -> Void) {
        onDiscoveryToken = handler
    }

    func setOnInventory(_ handler: @escaping @Sendable (String, [String]) async -> Void) {
        onInventory = handler
    }

    func setOnState(_ handler: @escaping @Sendable (String, [String: WireValue]) async -> Void) {
        onState = handler
    }

    func share(state: [String: WireValue]) async {
        await broadcast(.state(state))
    }
}
