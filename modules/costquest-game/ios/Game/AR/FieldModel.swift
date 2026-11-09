import ARKit
import CoreLocation
import OSLog
import RealityKit
import SwiftUI
import UIKit

/// Everything between "the player opened the game" and "the world is around
/// them", in the order it has to happen.
///
/// The order is the design. A player at a venue is standing outdoors holding a
/// phone, and every second of blank screen is a second they think it is broken,
/// so the work is arranged so that something true is on screen at all times:
/// the camera immediately, coaching while tracking settles, the field filling
/// in nearest-first, and the game only when the world is real. Nothing here
/// waits on anything it does not have to.
@MainActor
@Observable
final class FieldModel {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "field")

    enum Phase: Equatable {
        case idle
        case downloading(PackStore.Progress)
        case tracking
        case placing(done: Int, total: Int)
        case playing
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    let session = ARSessionController()

    private let client: GameClient
    private let packs: PackStore
    private let gameID: String
    private var library: AssetLibrary?
    private var layout: VenueLayout?
    let location = PlayerLocation()
    /// The organiser's authored points. Loaded before the layout is built,
    /// because an anchored asset stands where the anchor says and the scatter
    /// has to work around it.
    private(set) var anchors: [GameAnchor] = []
    private var venue: CLLocationCoordinate2D?
    private weak var view: ARView?
    /// Nearby phones, and the ultra wideband ranging that depends on them.
    /// Nil until the mesh comes up, and stays nil if it cannot: the game plays
    /// without it, more slowly and with GPS-grade ranges.
    private(set) var mesh: MeshCoordinator?
    private let game: GameSession

    /// A live count of what is standing, which the HUD shows and which is the
    /// honest answer to "is it done": an asset the renderer could not build is
    /// missing from the field for everyone, not just for you.
    private(set) var placedCount = 0

    /// Seconds spent looking for the floor, so the loader can change its
    /// advice as time passes instead of repeating one line for ever.
    private(set) var scanSeconds: Double = 0
    /// True when the field was put down by the timeout rather than on a floor
    /// ARKit recognised.
    private(set) var placedByFallback = false
    /// What went wrong, in player words, while `phase` is `.failed`.
    private(set) var failure: Failure?
    /// Bumped on every hit taken. The view flashes a red vignette on change.
    private(set) var hitFlash = 0
    /// True when the field was drawn at room scale.
    var isCompact: Bool { layout?.compact ?? false }

    /// Whether this arena is shared with the other phones at the venue (the
    /// printed marker or geo tracking) or placed around this player alone.
    var alignment: ARSessionController.Alignment { session.alignment }
    /// Times the arena has been placed or moved onto the venue marker.
    var markerFixCount: Int { session.markerFixCount }
    var lastMarkerFix: Date? { session.lastMarkerFix }

    struct Failure: Equatable {
        let title: String
        let message: String
        let symbol: String
        /// The fix is in the Settings app (camera permission).
        let offersSettings: Bool
    }

    init(gameID: String, game: GameSession, client: GameClient = GameClient(),
         venue: CLLocationCoordinate2D? = nil) {
        self.gameID = gameID
        self.game = game
        self.client = client
        self.packs = PackStore(client: client)
        self.venue = venue
        session.venue = venue
    }

    /// Called once the AR view exists. The camera starts first, deliberately
    /// before the download, because tracking needs the player to walk around a
    /// little and they may as well be doing that while the pack arrives.
    func begin(in view: ARView) async {
        self.view = view
        session.attach(to: view)
        await session.start()
        if !isShutDown { location.start() }

        // The mesh comes up before the download, not after, because its whole
        // job is to answer the download. A player arriving at a venue where
        // twenty phones already hold the pack should take it from them.
        if !isShutDown, let key = try? await DeviceIdentity.shared.publicKeyHex(), !isShutDown {
            let mesh = MeshCoordinator(gameID: gameID, deviceKey: key,
                                       packs: packs, game: game)
            self.mesh = mesh
            await mesh.start(arSession: view.session)
        }

        await bringUp(in: view)
    }

    private var isShutDown = false

    /// The field is leaving the screen (left the game, or the game ended).
    /// Stops the peer mesh, ultra wideband ranging and location updates,
    /// which otherwise keep running with nothing on screen, and a second
    /// entry would start another set beside them.
    func shutdown() {
        guard !isShutDown else { return }
        isShutDown = true
        location.onUpdate = nil
        location.stop()
        if let mesh {
            self.mesh = nil
            Task { await mesh.stop() }
        }
    }

    /// Try again after a failure, without redoing the parts that worked: the
    /// view, location and the mesh are already up, so this restarts tracking
    /// and repeats the download (cached files are not fetched twice) and
    /// placement.
    func retry() async {
        guard case .failed = phase, let view else { return }
        failure = nil
        phase = .idle
        await session.start()
        await bringUp(in: view)
    }

    private func bringUp(in view: ARView) async {
        do {
            if session.cameraDenied { throw FieldError.cameraDenied }
            phase = .downloading(.init())
            let pack = try await packs.fetch(gameID: gameID) { [weak self] progress in
                Task { @MainActor in
                    if case .downloading = self?.phase { self?.phase = .downloading(progress) }
                }
            }
            // Authored points, if the organiser placed any. A failure here is
            // not fatal: a game with no anchors is scenery and free-for-all
            // fighting, which is a real way to run one.
            anchors = (try? await client.anchors(gameID: gameID)) ?? []

            let library = AssetLibrary(pack: pack)
            self.library = library
            self.layout = VenueLayout(manifest: pack.manifest, gameID: gameID,
                                      anchors: anchors, venue: venue)

            // Now that the files are on disk, tell the venue what we can
            // serve. A player who arrives after us takes them from here.
            await mesh?.announceWhatWeHold()

            phase = .tracking
            let fallback = try await waitForGround()
            try await place(in: view, fallback: fallback)
            phase = .playing
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch is CancellationError {
            return
        } catch {
            log.error("could not bring up the field: \(error.localizedDescription)")
            let failure = Self.describe(error)
            self.failure = failure
            phase = .failed(failure.message)
        }
    }

    /// Turn any error into something a player can read. Never a type name,
    /// never a server string.
    private static func describe(_ error: any Error) -> Failure {
        if let field = error as? FieldError {
            switch field {
            case .cameraDenied:
                return Failure(title: "Camera access is off",
                               message: "CostQuest shows the arena through your camera. Turn camera access on in Settings, then come back.",
                               symbol: "camera.fill", offersSettings: true)
            case .camera(let why):
                return Failure(title: "The camera stopped", message: why,
                               symbol: "camera.metering.unknown", offersSettings: false)
            case .noPack:
                return Failure(title: "The arena is not ready",
                               message: "This game's arena is still being built. Give it a minute and try again.",
                               symbol: "hammer.fill", offersSettings: false)
            case .noAnchor, .trackingNeverSettled:
                return Failure(title: "Could not find the floor",
                               message: "Stand somewhere with good light and point your phone at the floor, then try again.",
                               symbol: "viewfinder", offersSettings: false)
            }
        }
        if error is URLError || (error as NSError).domain == NSURLErrorDomain {
            return Failure(title: "Can't reach the game",
                           message: "Check your connection and try again.",
                           symbol: "wifi.exclamationmark", offersSettings: false)
        }
        return Failure(title: "The arena didn't load",
                       message: "Something went wrong setting up the game. Try again.",
                       symbol: "exclamationmark.triangle.fill", offersSettings: false)
    }

    /// Hold until there is ground to stand the field on, and never for long.
    ///
    /// Placing before tracking settles produces assets that slide and jump,
    /// so the first choice is to wait for a real floor. But a desk, a dim room
    /// or a venue geo tracking will not localise in must not become ten silent
    /// minutes, so the wait is bounded: after 8 s of good tracking any
    /// horizontal plane will do, and after 20 s the field goes down on the best
    /// guess available. Returns the transform to anchor on when it had to
    /// choose one, nil when the session can anchor properly itself.
    private func waitForGround() async throws -> simd_float4x4? {
        let started = Date()
        scanSeconds = 0
        while true {
            try Task.checkCancellation()
            if session.cameraDenied { throw FieldError.cameraDenied }
            if let why = session.unrecoverable { throw FieldError.camera(why) }
            let elapsed = Date().timeIntervalSince(started)
            scanSeconds = elapsed

            // The venue marker is the best local placement there is: the
            // same origin every other phone that saw it uses. Stop scanning.
            if session.hasUsableMarker { return nil }
            if session.isReadyToPlace {
                if case .geo = session.mode { return nil }
                if session.floorCandidate(anyPlane: false) != nil { return nil }
                if elapsed > 8, let plane = session.floorCandidate(anyPlane: true) {
                    return plane
                }
            }
            if elapsed > 20 {
                if session.cameraIsRunning {
                    placedByFallback = true
                    session.abandonGeo()
                    return session.floorCandidate(anyPlane: true) ?? session.estimatedFloorAhead()
                }
                if elapsed > 45 { throw FieldError.trackingNeverSettled }
            }
            try await Task.sleep(for: .milliseconds(250))
        }
    }

    private func place(in view: ARView, fallback: simd_float4x4?) async throws {
        guard let library, let layout else { throw FieldError.noPack }
        let origin = session.anchorVenue(heading: location.trueNorth, fallback: fallback)
            ?? session.anchorVenue(heading: location.trueNorth,
                                   fallback: session.estimatedFloorAhead())
        guard let origin else { throw FieldError.noAnchor }

        let camera = view.cameraTransform.translation
        phase = .placing(done: 0, total: layout.placements.count)
        await library.populate(origin, with: layout, cameraAt: camera) { [weak self] done, total in
            self?.placedCount = done
            if case .placing = self?.phase { self?.phase = .placing(done: done, total: total) }
        }
    }

    // MARK: - Moments
    //
    // Hooks the game layer can call when the server's verdict lands. The view
    // also calls them when it sees the session change, so they work before
    // anything else is wired to them.

    /// A capture: a column of light and a ring in the faction's colour at the
    /// point, plus a success haptic.
    func celebrateCapture(anchorID: String, color: UIColor = .systemYellow) {
        library?.burst(at: anchorID, color: color, big: true)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    /// A pickup at a point, or at the nearest weapon when the id is unknown.
    func celebratePickup(anchorID: String? = nil, color: UIColor = .systemOrange) {
        let id = anchorID ?? nearestAnchor(kind: "weapon")?.id
        if let id { library?.burst(at: id, color: color, big: false) }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred(intensity: 1)
    }

    /// Damage taken: the view flashes red and the phone thumps.
    func flashHit() {
        hitFlash &+= 1
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred(intensity: 1)
    }

    /// A tap on something in the world, resolved to the organiser's point it
    /// stands at. The HUD acts on it (or says how far to walk), so tapping a
    /// crate and pressing the button under it are the same action.
    struct TapRequest: Equatable {
        let id = UUID()
        let anchor: GameAnchor
        let distance: Float
        static func == (a: TapRequest, b: TapRequest) -> Bool { a.id == b.id }
    }
    private(set) var tapRequest: TapRequest?

    func handleTap(at point: CGPoint) {
        guard case .playing = phase, let view, let layout,
              let origin = session.venueOrigin,
              let hit = view.entity(at: point) else { return }
        // The hit may be a child mesh; its world position is what matters.
        let tapped = origin.convert(position: .zero, from: hit)
        let camera = origin.convert(position: view.cameraTransform.translation, from: nil)
        let actionable = layout.placements.filter {
            $0.anchor.map { ["capture_point", "trivia", "weapon"].contains($0.kind) } ?? false
        }
        guard let nearest = actionable.min(by: {
            simd_distance($0.position, tapped) < simd_distance($1.position, tapped)
        }), simd_distance(nearest.position, tapped) < 2.5, let anchor = nearest.anchor else { return }
        let distance = simd_distance(SIMD3(nearest.position.x, 0, nearest.position.z),
                                     SIMD3(camera.x, 0, camera.z))
        tapRequest = TapRequest(anchor: anchor, distance: distance)
    }

    private func nearestAnchor(kind: String) -> GameAnchor? {
        guard let layout, let view else { return nil }
        let camera = view.cameraTransform.translation
        return layout.placements
            .filter { $0.anchor?.kind == kind }
            .min { simd_distance($0.position, camera) < simd_distance($1.position, camera) }?
            .anchor
    }

    /// Called from the render loop. Cheap by construction: it early-returns on
    /// every asset whose level of detail has not changed.
    func stepLevelsOfDetail(cameraAt camera: SIMD3<Float>) async {
        guard case .playing = phase, let library, let layout,
              let origin = session.venueOrigin else { return }
        await library.refreshLevels(under: origin, layout: layout, cameraAt: camera)
    }

    /// The nearest authored point a player could act on, and how far away it
    /// is. Distance is measured on the ground in the layout's own frame rather
    /// than from raw coordinates, so it is the same number the world is drawn
    /// with and a player standing at a crate is told they are at it.
    func nearestActionable(to camera: SIMD3<Float>) -> (placement: VenueLayout.Placement,
                                                        distance: Float)? {
        guard let layout else { return nil }
        return layout.placements
            .filter { $0.anchor.map { ["capture_point", "trivia", "weapon"].contains($0.kind) } ?? false }
            .map { ($0, simd_distance(SIMD3($0.position.x, 0, $0.position.z),
                                      SIMD3(camera.x, 0, camera.z))) }
            .filter { $0.1 < 6 }            // arm's reach at a venue, not across it
            .min { $0.1 < $1.1 }
    }

    /// Where on screen a player at this bearing and distance appears, or nil
    /// when they are behind the phone.
    ///
    /// Projected through ARKit's own camera rather than estimated from a field
    /// of view. The camera has real intrinsics, they differ between devices and
    /// between video formats, and a reticle placed with an assumed 60 degrees
    /// sits visibly beside the person it is supposed to be on.
    ///
    /// Bearings are compass bearings and the world is aligned to true north in
    /// both tracking modes, so -Z is north and no per-mode correction is
    /// needed here.
    func screenPoint(bearing: Double, distance: Double,
                     elevation: Double) -> CGPoint? {
        guard let view else { return nil }
        let camera = view.cameraTransform.translation
        let radians = Float(bearing * .pi / 180)
        let direction = SIMD3<Float>(sin(radians), 0, -cos(radians))
        var point = camera + direction * Float(distance)
        // Aim at the middle of a person rather than at the ground under them.
        point.y = camera.y + Float(distance * tan(elevation * .pi / 180)) - 0.2
        return view.project(point)
    }

    func handleMemoryPressure() {
        library?.dropCaches()
    }

    enum FieldError: LocalizedError {
        case noPack, noAnchor, trackingNeverSettled, cameraDenied
        case camera(String)

        var errorDescription: String? {
            switch self {
            case .noPack: "This game's arena has not been built yet."
            case .noAnchor: "Point the camera at the floor so the arena has somewhere to stand."
            case .trackingNeverSettled: "The camera could not get its bearings. Try somewhere with more light."
            case .cameraDenied: "Camera access is off."
            case .camera(let why): why
            }
        }
    }
}

/// Where the player is and which way they are facing.
///
/// Three consumers, and they want it for different reasons, which is why it is
/// one object rather than three location managers. The layout needs true north
/// so that two phones without a shared origin at least agree on bearings. The
/// server needs a coordinate on every event so it can apply the venue
/// geofence. And targeting needs a heading, because aiming a phone at a player
/// is an angle, and the map's bearings are geographic ones.
///
/// True heading rather than magnetic: true is the one two phones can agree on,
/// and it is only populated while location updates are running, which is why
/// this starts them rather than only asking for heading.
@MainActor
@Observable
final class PlayerLocation: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    private(set) var trueNorth: CLLocationDirection?
    private(set) var coordinate: CLLocationCoordinate2D?
    private(set) var altitude: Double = 0
    /// Horizontal accuracy in metres, so the UI can say "your position is
    /// rough" instead of quietly placing the player in the wrong field.
    private(set) var accuracy: Double = -1
    /// When the OS took the playable fix above (CLLocation.timestamp), and
    /// whether iOS says software made it up (iOS 15+ isSimulatedBySoftware).
    /// Sent with every venue event as fix_age_s and simulated (FixPolicy).
    private(set) var fixAt: Date?
    private(set) var simulated: Bool?
    /// The playable fix as FixPolicy keeps it, or nil when there is none.
    var fix: FixPolicy.Fix? {
        coordinate == nil ? nil : FixPolicy.Fix(accuracy: accuracy, at: fixAt, simulated: simulated)
    }
    /// Callers of freshFix waiting for the next playable fix.
    private var fixWaiters: [CheckedContinuation<Bool, Never>] = []

    /// Whether the player has said no to location. A location game with no
    /// location has to say so, not spin.
    private(set) var denied = false
    /// The last fix whatever its accuracy, for drawing the map only.
    private(set) var roughCoordinate: CLLocationCoordinate2D?
    private(set) var roughAccuracy: Double = -1

    /// Called on every fix, so the game session can forward the position to
    /// the server at its own throttled rate.
    var onUpdate: (@MainActor () -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        // No distance filter: a player standing still at a capture point or
        // aiming at a rival still needs a fix younger than 30 s on every
        // event (the server's anti-cheat refuses an older one with
        // need_location). With a 5 m filter a still phone got no fixes at
        // all and its first shot after half a minute was refused. The GPS
        // runs at best accuracy either way, so this costs only the delegate
        // calls; the live link throttles what goes on the socket.
        manager.distanceFilter = kCLDistanceFilterNone
    }

    func start() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
        if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
        resolveFixWaiters(false)
    }

    /// A playable fix younger than FixPolicy.fixFreshS, now: true at once when
    /// there is one, else restarts the updates (iOS delivers a new fix on a
    /// restart) and waits for one, `timeout` seconds at most. Never throws.
    @discardableResult
    func freshFix(timeout: Double = 6) async -> Bool {
        if coordinate != nil, FixPolicy.isFresh(fixAt, now: Date()) { return true }
        guard !denied else { return false }
        return await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            fixWaiters.append(c)
            guard fixWaiters.count == 1 else { return }
            manager.stopUpdatingLocation()
            manager.startUpdatingLocation()
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(timeout))
                self?.resolveFixWaiters(false)
            }
        }
    }

    private func resolveFixWaiters(_ value: Bool) {
        let ready = fixWaiters
        fixWaiters = []
        for w in ready { w.resume(returning: value) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            self.denied = status == .denied || status == .restricted
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didUpdateHeading newHeading: CLHeading) {
        // Negative means the reading is invalid, which happens near metal and
        // is common at a venue full of scaffolding. Keeping the last good one
        // is better than swinging the whole field.
        let value = newHeading.trueHeading
        guard value >= 0 else { return }
        Task { @MainActor in
            self.trueNorth = value
            self.onUpdate?()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        let coordinate = last.coordinate
        let altitude = last.altitude
        let accuracy = last.horizontalAccuracy
        let takenAt = last.timestamp
        let simulated = last.sourceInformation?.isSimulatedBySoftware
        Task { @MainActor in
            // A negative accuracy means the fix is invalid, and a fix worse
            // than about fifty metres would put a player on the wrong side of
            // a venue boundary. Dropping it is better than sending it: the
            // server treats an event with no coordinate as making no claim.
            guard accuracy >= 0 else { return }
            // Kept separately: enough to draw the world around a player whose
            // phone has Precise Location off, never enough to play from.
            self.roughCoordinate = coordinate
            self.roughAccuracy = accuracy
            guard accuracy < 50 else { self.onUpdate?(); return }
            self.coordinate = coordinate
            self.altitude = altitude
            self.accuracy = accuracy
            self.fixAt = takenAt
            self.simulated = simulated
            // A restart can hand back the cached fix first; only a fresh one
            // answers freshFix.
            if FixPolicy.isFresh(takenAt, now: Date()) { self.resolveFixWaiters(true) }
            self.onUpdate?()
        }
    }
}
