import ARKit
import NearbyInteraction
import OSLog
import simd

/// Ultra wideband ranging: how far away another player is, and in which
/// direction, measured by the radios rather than guessed from two GPS fixes.
///
/// This is the feature that makes the game feel like a game rather than a map.
/// GPS at a venue is good to about five metres, which is the difference between
/// "behind that crate" and "on the other side of it". The U1 and U2 radios are
/// good to about ten centimetres and, with camera assistance, give a direction
/// precise enough to put a reticle on someone.
///
/// Three constraints from Apple's documentation shape it:
///
/// **Tokens have to be exchanged out of band.** `NearbyInteraction` will not do
/// it. `PeerMesh` is that channel, which is why these two features are one
/// subsystem: no mesh, no ranging.
///
/// **Direction is iOS only and foreground only.** So ranging follows the scene
/// phase, and a backgrounded app stops rather than quietly reporting stale
/// bearings.
///
/// **Camera assistance wants the AR session.** `setARSession(_:)` hands
/// ARKit's spatial tracking to the radio, which is what lifts direction from
/// "roughly over there" to precision finding. It also means the two subsystems
/// share one ARSession rather than fighting over the camera.
///
/// Nothing measured here is trusted by the rules engine. The range travels with
/// a hit as the device's claim and the server checks it against the game's
/// limit, so a phone that lies about ultra wideband gets a wrong arrow on its
/// own screen and nothing else.
@MainActor
final class UWBRanging: NSObject {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "uwb")

    /// One session per peer: `NINearbyPeerConfiguration` ranges against a
    /// single token, so a venue of players is a set of sessions rather than one
    /// session with many peers. Keyed by the peer's device key.
    private var sessions: [String: NISession] = [:]
    private var peerForSession: [ObjectIdentifier: String] = [:]
    /// The token each peer gave us, kept so a session the system invalidates
    /// can be rebuilt without waiting for the peer to say it again.
    private var peerTokens: [String: NIDiscoveryToken] = [:]
    private var restarts: [String: Int] = [:]
    /// A session not yet assigned to anyone. Its token is the one broadcast to
    /// the venue; the first peer that answers it gets this session, so the
    /// token they hold is the one we actually range with.
    private var pool: NISession?
    private weak var arSession: ARSession?

    /// A fix on a peer. Reported upward so the game session can relay it to
    /// that player, whose screen then knows where we are.
    var onFix: ((_ peer: String, _ distance: Double,
                 _ azimuth: Double, _ elevation: Double) -> Void)?
    /// A session was rebuilt and has a new token that this peer must be sent
    /// directly, or it keeps ranging against a session that no longer exists.
    var onTokenForPeer: ((_ peer: String, _ token: Data) -> Void)?
    /// What the player needs to do for direction to converge, in their words.
    /// Camera assistance needs the phone moved around a little and needs light;
    /// without this the arrow simply never appears and nobody knows why.
    private(set) var convergenceHint: String?
    /// When the last fix arrived from anyone, so the UI can say ranging is live.
    private(set) var lastFixAt: Date?

    /// What this device can actually do, asked rather than assumed from the
    /// model name. Every entry point checks this first, so a phone without the
    /// radio never creates a session at all.
    static var isSupported: Bool {
        NISession.deviceCapabilities.supportsPreciseDistanceMeasurement
    }
    static var supportsDirection: Bool {
        NISession.deviceCapabilities.supportsDirectionMeasurement
    }
    static var supportsCameraAssistance: Bool {
        NISession.deviceCapabilities.supportsCameraAssistance
    }

    /// Our broadcast token, to be handed to the venue over the mesh. Encoded
    /// with `NSKeyedArchiver` because `NIDiscoveryToken` is a secure-coding
    /// object and Apple does not document its wire format.
    func discoveryToken() -> Data? {
        guard Self.isSupported else { return nil }
        if pool == nil {
            let session = NISession()
            session.delegate = self
            pool = session
        }
        return pool?.discoveryToken.flatMap(Self.encode)
    }

    func attach(arSession: ARSession) {
        self.arSession = arSession
    }

    /// A peer's token arrived over the mesh.
    ///
    /// The handshake, which converges without ping-pong: a broadcast token is
    /// ignored from anyone we already range; a direct token re-runs the
    /// existing session in place (its own token does not change, so nothing
    /// needs to be sent back). Only a brand new session answers, directly,
    /// with its token. Returns that answer, if there is one.
    func receive(token data: Data, from peer: String, direct: Bool) -> Data? {
        guard Self.isSupported else { return nil }
        guard let token = try? NSKeyedUnarchiver.unarchivedObject(
            ofClass: NIDiscoveryToken.self, from: data) else {
            log.error("a peer sent a discovery token we could not read")
            return nil
        }
        if let existing = sessions[peer] {
            guard direct, peerTokens[peer] != token else { return nil }
            peerTokens[peer] = token
            run(existing, against: token)
            return nil
        }
        peerTokens[peer] = token
        restarts[peer] = 0
        let session: NISession
        if let pooled = pool {
            pool = nil
            session = pooled
        } else {
            session = NISession()
            session.delegate = self
        }
        sessions[peer] = session
        peerForSession[ObjectIdentifier(session)] = peer
        run(session, against: token)
        return session.discoveryToken.flatMap(Self.encode)
    }

    private func run(_ session: NISession, against token: NIDiscoveryToken) {
        let configuration = NINearbyPeerConfiguration(peerToken: token)
        if Self.supportsCameraAssistance, let arSession {
            // The order matters: the AR session has to be handed over before
            // the configuration is run, or the first frames range without it.
            session.setARSession(arSession)
            configuration.isCameraAssistanceEnabled = true
        }
        session.run(configuration)
        log.notice("ranging, camera assistance \(configuration.isCameraAssistanceEnabled)")
    }

    /// The system ended a session (another app took the radio, a resource
    /// limit, the peer's token went stale). Rebuild it a few times with the
    /// token we already hold and hand the peer our new one.
    private func restart(peer: String) {
        guard Self.isSupported, let token = peerTokens[peer] else { return }
        let attempts = restarts[peer, default: 0]
        guard attempts < 3 else {
            log.error("giving up ranging a peer after \(attempts) restarts")
            return
        }
        restarts[peer] = attempts + 1
        let session = NISession()
        session.delegate = self
        sessions[peer] = session
        peerForSession[ObjectIdentifier(session)] = peer
        run(session, against: token)
        if let data = session.discoveryToken.flatMap(Self.encode) {
            onTokenForPeer?(peer, data)
        }
    }

    func stop(peer: String) {
        if let session = sessions.removeValue(forKey: peer) {
            peerForSession.removeValue(forKey: ObjectIdentifier(session))
            session.invalidate()
        }
        peerTokens.removeValue(forKey: peer)
    }

    func stopAll() {
        for session in sessions.values { session.invalidate() }
        pool?.invalidate()
        pool = nil
        sessions.removeAll()
        peerForSession.removeAll()
        peerTokens.removeAll()
    }

    private static func encode(_ token: NIDiscoveryToken) -> Data? {
        try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    }

    fileprivate func sessionEnded(_ id: ObjectIdentifier, reason: String) {
        log.error("ranging session ended: \(reason)")
        if let pool, ObjectIdentifier(pool) == id {
            self.pool = nil
            return
        }
        guard let peer = peerForSession.removeValue(forKey: id) else { return }
        if let current = sessions[peer], ObjectIdentifier(current) == id {
            sessions.removeValue(forKey: peer)
            restart(peer: peer)
        }
    }

    fileprivate func recordFix() { lastFixAt = Date() }
}

extension UWBRanging: NISessionDelegate {

    nonisolated func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        let id = ObjectIdentifier(session)
        let fixes = nearbyObjects.map { ($0.distance, $0.direction) }
        Task { @MainActor in
            guard let peer = peerForSession[id] else { return }
            for (distance, direction) in fixes {
                guard let distance else { continue }
                // Direction arrives as a unit vector in the session's frame,
                // which camera assistance aligns with the AR world. Azimuth is
                // the bearing a reticle needs; elevation is what tells a player
                // someone is on the gantry above them rather than in front.
                let azimuth = direction.map { Double(atan2($0.x, -$0.z)) * 180 / .pi } ?? 0
                let elevation = direction.map { Double(asin(min(max($0.y, -1), 1))) * 180 / .pi } ?? 0
                recordFix()
                onFix?(peer, Double(distance), azimuth, elevation)
            }
        }
    }

    nonisolated func session(_ session: NISession,
                             didUpdateAlgorithmConvergence convergence: NIAlgorithmConvergence,
                             for object: NINearbyObject?) {
        // Turned into a sentence here, on ARKit's queue, rather than carried
        // across the hop: the status type is not Sendable, and a String is.
        let hint: String?
        switch convergence.status {
        case .converged:
            hint = nil
        case .notConverged(let reasons):
            // Written for a player standing in a field, not for a log.
            hint = reasons.compactMap { reason -> String? in
                switch reason {
                case .insufficientHorizontalSweep: "Sweep the phone left and right."
                case .insufficientVerticalSweep: "Tilt the phone up and down."
                case .insufficientMovement: "Take a few steps."
                case .insufficientLighting: "It is too dark to point accurately."
                // The SDK carries reasons a player cannot act on, so anything
                // unrecognised produces no coaching rather than a sentence
                // nobody can do anything about.
                default: nil
                }
            }.first
        default:
            // NIAlgorithmConvergenceStatus is not frozen, so a future SDK can
            // add a case; anything unrecognised produces no coaching rather
            // than a sentence a player cannot act on.
            hint = nil
        }
        Task { @MainActor in convergenceHint = hint }
    }

    nonisolated func session(_ session: NISession, didRemove nearbyObjects: [NINearbyObject],
                             reason: NINearbyObject.RemovalReason) {
        let id = ObjectIdentifier(session)
        Task { @MainActor in
            guard let peer = peerForSession[id] else { return }
            if reason == .peerEnded { stop(peer: peer) }
            // `.timeout` is left alone on purpose: the peer walked behind a
            // wall, and the radio recovers on its own when they come back.
        }
    }

    nonisolated func sessionWasSuspended(_ session: NISession) {
        Task { @MainActor in convergenceHint = "Ranging paused." }
    }

    nonisolated func sessionSuspensionEnded(_ session: NISession) {
        // Apple's guidance: re-run the same configuration after a suspension.
        // Done here on the delegate's own queue rather than hopped to the main
        // actor, because neither the session nor its configuration is Sendable
        // and re-running immediately is also what keeps the gap short.
        if let configuration = session.configuration { session.run(configuration) }
        Task { @MainActor in convergenceHint = nil }
    }

    nonisolated func session(_ session: NISession, didInvalidateWith error: any Error) {
        // Only Sendable values cross to the main actor: the id and a string.
        let text = error.localizedDescription
        let id = ObjectIdentifier(session)
        Task { @MainActor in sessionEnded(id, reason: text) }
    }
}
