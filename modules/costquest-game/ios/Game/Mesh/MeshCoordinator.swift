import ARKit
import Foundation
import OSLog

/// Ties the three things that only work together.
///
/// The mesh moves bytes. The pack store owns and verifies those bytes. Ultra
/// wideband needs the mesh to exchange tokens before it can range at all, and
/// needs the AR session before it can give a direction worth pointing at. None
/// of them is useful alone, and wiring them to each other from inside any one
/// of them would make that one know about the other two. So the wiring lives
/// here and the three stay ignorant of each other.
///
/// Everything here degrades rather than fails. No mesh, and the pack comes from
/// the server. No ultra wideband radio, and range falls back to GPS. No AR
/// session, and ranging still gives distance without direction. A venue will
/// contain phones of every generation and the game has to be playable on all
/// of them.
@MainActor
final class MeshCoordinator {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "mesh")

    private let mesh: PeerMesh
    private let ranging = UWBRanging()
    private let packs: PackStore
    private weak var game: GameSession?

    private(set) var peerCount = 0
    private var gossip: Task<Void, Never>?

    init(gameID: String, deviceKey: String, packs: PackStore, game: GameSession) {
        self.mesh = PeerMesh(gameID: gameID, deviceKey: deviceKey)
        self.packs = packs
        self.game = game
    }

    func start(arSession: ARSession?) async {
        if let arSession { ranging.attach(arSession: arSession) }
        await packs.use(peers: mesh)

        // A neighbour wants files. Served from the store, which verifies before
        // handing anything over, so a corrupted file on this phone is not
        // passed around the venue.
        await mesh.setOnWant { [packs, mesh] peer, digests in
            for digest in digests {
                guard let bytes = await packs.data(forDigest: digest) else { continue }
                await mesh.serve(digest: digest, bytes: bytes, to: peer)
            }
        }

        // A neighbour sent us a file. The digest is checked inside the store;
        // bytes that do not match are dropped and the server is asked instead.
        await mesh.setOnTile { [packs] digest, bytes in
            let kept = await packs.accept(peerBytes: bytes, forDigest: digest)
            if !kept {
                await MainActor.run {
                    Logger(subsystem: "com.djmcevents.costquest", category: "mesh")
                        .error("a peer sent bytes that did not match \(digest.prefix(8))")
                }
            }
        }

        // A neighbour's ultra wideband token. This is the handshake
        // NearbyInteraction will not do for itself.
        // A new session answers directly with its own token; see
        // `UWBRanging.receive` for why this converges rather than ping-pongs.
        await mesh.setOnDiscoveryToken { [weak self, mesh] connection, key, token, direct in
            let reply = await MainActor.run {
                self?.ranging.receive(token: token, from: key, direct: direct)
            }
            if let reply { await mesh.share(discoveryToken: reply, to: connection) }
        }
        // A session the system ended was rebuilt with a new token, which the
        // peer must hear about or it ranges against nothing.
        ranging.onTokenForPeer = { [mesh] key, token in
            Task {
                guard let connection = await mesh.connection(forKey: key) else { return }
                await mesh.share(discoveryToken: token, to: connection)
            }
        }

        // A fix on a neighbour, relayed through the server to that one player
        // so their screen can point back at us. Never broadcast: a range and
        // bearing to an opponent sent to the venue would be a free radar.
        // The fix arrives keyed by the neighbour's device key; the game and
        // the server both know players by player id, which the neighbour sent
        // in its hello. It goes on our own reticle straight away and is
        // relayed so theirs can point back.
        await mesh.setPlayerID(game?.playerID)
        ranging.onFix = { [weak self, mesh] key, distance, azimuth, elevation in
            Task { @MainActor in
                guard let player = await mesh.player(forKey: key) else { return }
                self?.game?.adoptLocalUWB(player: player, distance: distance,
                                          azimuth: azimuth, elevation: elevation)
                await self?.game?.reportUWB(peer: player, distance: distance,
                                            azimuth: azimuth, elevation: elevation)
            }
        }

        // A neighbour's view of the game, taken only while this phone has no
        // socket of its own. With a live link the server's numbers are on
        // screen and a peer's are at best a moment behind.
        await mesh.setOnState { [weak self] peer, snapshot in
            await MainActor.run { self?.game?.adopt(snapshot: snapshot, from: peer) }
        }

        await mesh.start()

        // Game state goes round the venue on a slow loop. Slow on purpose:
        // this is a safety net for a phone that has lost the network, not a
        // second copy of the live link, and a venue of two hundred phones
        // gossiping every second would be its own denial of service.
        gossip = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard let self, let game = self.game else { return }
                await self.mesh.share(state: game.snapshot)
                self.peerCount = await self.mesh.peerCount
                // Re-offered on the same slow loop so a phone that arrives
                // late can still start ranging. Peers already ranging with us
                // ignore a broadcast token, so this never disturbs a lock.
                if self.peerCount > 0, let token = self.ranging.discoveryToken() {
                    await self.mesh.share(discoveryToken: token)
                }
            }
        }

        // Told once at the start and again whenever the pack changes, so a
        // player who arrives late finds neighbours already advertising the
        // files they need.
        await announceWhatWeHold()
        if let token = ranging.discoveryToken() {
            await mesh.share(discoveryToken: token)
        }
    }

    /// Tell the venue what this phone can serve. Also reported to the server,
    /// which uses it to answer "who near you has this" for phones that have not
    /// met on the mesh yet.
    func announceWhatWeHold() async {
        let digests = await packs.servableDigests()
        guard !digests.isEmpty else { return }
        await mesh.announce(holding: digests)
        peerCount = await mesh.peerCount
        log.notice("advertising \(digests.count) file(s) to \(self.peerCount) peer(s)")
    }

    func stop() async {
        gossip?.cancel()
        ranging.stopAll()
        await mesh.stop()
    }

    /// What the phone can do, for the parts of the UI that have to say so.
    var rangingSummary: String {
        guard UWBRanging.isSupported else { return "This phone has no ultra wideband radio." }
        if UWBRanging.supportsCameraAssistance { return "Precision finding" }
        if UWBRanging.supportsDirection { return "Distance and direction" }
        return "Distance only"
    }

    var convergenceHint: String? { ranging.convergenceHint }

    /// True while the radio has reported a fix in the last few seconds.
    var isRangingLive: Bool {
        guard let at = ranging.lastFixAt else { return false }
        return Date().timeIntervalSince(at) < 3
    }
}
