import ARKit
import AVFoundation
import CoreLocation
import OSLog
import RealityKit
import UIKit

/// Owns the AR session: how the world is tracked, how well it is tracking, and
/// how hard the phone is being made to work.
///
/// The design turns on one decision. Two players standing in the same field
/// have to see the same lighthouse in the same place, and there are only two
/// honest ways to get that:
///
/// **Geo tracking, where it works.** `ARGeoTrackingConfiguration` localises the
/// device against Apple's imagery, so a latitude and longitude resolve to the
/// same physical spot on every phone with no calibration step at all. That is
/// the whole game for a venue: players arrive at different times, from
/// different gates, and the world is simply there. It needs A12 or better, a
/// supported city, network, and location permission, and it will say so.
///
/// **A shared local origin, where it does not.** Away from geo coverage we fall
/// back to world tracking and place the environment relative to the ground the
/// player is standing on, oriented to true north from the compass. Two phones
/// then agree on heading and scale but not on origin, which is why the fallback
/// is a degraded mode and is labelled as one rather than pretended away.
///
/// The second concern here is heat. A venue session is twenty minutes of camera
/// plus a neural engine plus a 60fps renderer in a pocket, and a phone that
/// throttles mid game does not crash, it just gets slower until the game feels
/// broken. So quality is a ladder that walks down under thermal pressure, and
/// down again, rather than one setting chosen at launch and defended to the
/// death.
@MainActor
@Observable
final class ARSessionController: NSObject {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "ar")

    // MARK: - What the rest of the app watches

    enum Mode: Equatable {
        /// Localised against the world. Everyone shares one origin.
        case geo
        /// World tracking only. Origin is this device's own, heading is shared.
        case local(reason: String)
        case starting
    }

    enum Quality: Equatable, Comparable {
        /// Everything on: scene depth, person occlusion, environment lighting.
        case full
        /// Occlusion dropped. The most expensive per-frame work, and the first
        /// thing to go, because a wrong occlusion edge is less noticeable than
        /// a dropped frame.
        case reduced
        /// Bare tracking and geometry. The game still plays.
        case survival
    }

    private(set) var mode: Mode = .starting
    private(set) var quality: Quality = .full
    /// Plain enough to put on screen. ARKit's own reasons are developer-facing,
    /// so they are translated once, here, rather than at every call site.
    private(set) var coachingText: String?
    private(set) var isReadyToPlace = false
    /// Geo accuracy in the horizontal, when geo tracking is up. Placement is
    /// held back until this is good enough to be worth trusting.
    private(set) var geoAccuracy: ARGeoTrackingStatus.Accuracy?

    /// Where the venue's origin ended up, once anchored. Everything the game
    /// places hangs off this.
    private(set) var venueOrigin: AnchorEntity?

    /// The player said no to the camera. Nothing will ever track, so the
    /// session stops trying and the field says how to fix it.
    private(set) var cameraDenied = false
    /// Set when the session failed in a way retrying will not fix. Plain
    /// player copy, never an ARKit error string.
    private(set) var unrecoverable: String?
    /// True once ARKit has reported any tracking state at all, which is the
    /// cheapest proof that camera frames are arriving.
    private(set) var cameraIsRunning = false
    /// Horizontal planes ARKit has found, by anchor id. Kept so the venue can
    /// be put on the floor ourselves, with a fallback, instead of handing
    /// RealityKit a floor-only plane anchor that waits for ever at a desk.
    private var planes: [UUID: PlaneInfo] = [:]
    struct PlaneInfo {
        let transform: simd_float4x4
        let area: Float
        let isFloor: Bool
        var height: Float { transform.columns.3.y }
    }
    /// Whether the last anchoring used a fallback rather than a real floor.
    private(set) var anchoredByFallback = false

    // MARK: - Shared arena alignment

    /// Whether this phone's arena is placed where everyone else's is.
    enum Alignment: Equatable {
        /// Floor placement around this player. Heading is shared (the world is
        /// north aligned), origin is not.
        case solo
        /// Snapped to the printed venue marker. Every phone that has seen it
        /// shares the origin and the rotation.
        case sharedMarker
        /// Anchored to the venue coordinate through geo tracking.
        case sharedGeo
    }
    private(set) var alignment: Alignment = .solo
    /// How many times the arena has been placed or moved onto the marker, and
    /// when it last happened.
    private(set) var markerFixCount = 0
    private(set) var lastMarkerFix: Date?
    /// The venue pose the marker last implied (world space, yaw only), whether
    /// or not the arena has been moved onto it yet.
    private(set) var markerPose: simd_float4x4?
    /// The ARAnchor `venueOrigin` currently follows, so a retarget can remove
    /// the one it replaced.
    private var venueARAnchor: ARAnchor?
    private var lastAppliedMarkerPose: simd_float4x4?
    private var lastMarkerApply = Date.distantPast
    /// Geo tracking has localised well enough to place on. Geo beats the
    /// marker where it is available.
    private(set) var geoLocalized = false

    static let markerAnchorName = "costquest.venue.marker"

    /// A marker fix the venue can be placed on right now: seen, and not
    /// outranked by a localised geo session.
    var hasUsableMarker: Bool {
        markerPose != nil && !(mode == .geo && geoLocalized)
    }
    private var failureRetries = 0
    private var hasStarted = false

    // MARK: - Machinery

    private weak var view: ARView?
    private var session: ARSession? { view?.session }
    private let locations = CLLocationManager()
    private var thermalObserver: (any NSObjectProtocol)?
    private var isPaused = false

    /// The venue, as the server knows it. Nil means the game has no fixed
    /// place and the local origin is the only option.
    var venue: CLLocationCoordinate2D?

    // MARK: - Starting

    func attach(to view: ARView) {
        self.view = view
        view.session.delegate = self

        // RealityKit will happily light and shade a scene into a thermal
        // shutdown. These are the switches that cost real milliseconds per
        // frame, and they are set from the ladder rather than left at default.
        applyRenderOptions(for: quality)
        view.automaticallyConfigureSession = false
        // The LiDAR mesh (configured in `tune`) does nothing on screen unless
        // RealityKit is told to use it: .occlusion is what hides a crate
        // behind a real bench or wall, Pokemon GO's "reality blending".
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            view.environment.sceneUnderstanding.options = [.occlusion]
        } else {
            view.environment.sceneUnderstanding.options = []
        }

        thermalObserver = NotificationCenter.default.addObserver(
            forName: ProcessInfo.thermalStateDidChangeNotification,
            object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.thermalStateChanged() }
            }

        // Pause and resume from the application itself, not only from the
        // SwiftUI scene phase. The AR view can be hosted where scenePhase
        // never changes (under a UIKit or Unity window), and a session that
        // pauses on the way out and is never told to come back is a frozen
        // camera in the middle of a demo.
        let center = NotificationCenter.default
        lifecycleObservers = [
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification,
                               object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.pause() }
            },
            center.addObserver(forName: UIApplication.didBecomeActiveNotification,
                               object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.resume() }
            },
        ]
    }

    private var lifecycleObservers: [any NSObjectProtocol] = []

    /// Bring the session up, choosing the best world tracking this device and
    /// this place can actually support.
    func start() async {
        guard let view else { return }
        unrecoverable = nil

        // Asked before running, because a denied camera makes ARKit fail the
        // session at once, and restarting on failure would then loop for ever.
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .denied, .restricted:
            cameraDenied = true
            log.error("camera access denied; not starting the session")
            return
        default:
            cameraDenied = false
        }
        hasStarted = true
        isPaused = false
        // A fresh run removes every anchor, so the old origin is dead weight.
        planes.removeAll()
        if let old = venueOrigin {
            view.scene.removeAnchor(old)
            venueOrigin = nil
        }
        anchoredByFallback = false
        venueARAnchor = nil
        markerPose = nil
        lastAppliedMarkerPose = nil
        lastMarkerApply = .distantPast
        geoLocalized = false
        alignment = .solo

        if let venue, await canTrackGeo(at: venue) {
            let config = ARGeoTrackingConfiguration()
            // Planes too, so a venue that will not localise (indoors, under a
            // roof) can still be put on the floor after the timeout.
            config.planeDetection = [.horizontal]
            tune(config)
            view.session.run(config, options: [.resetTracking, .removeExistingAnchors])
            mode = .geo
            log.notice("geo tracking session started")
        } else {
            let config = ARWorldTrackingConfiguration()
            config.planeDetection = [.horizontal]
            tune(config)
            view.session.run(config, options: [.resetTracking, .removeExistingAnchors])
            if case .local = mode {} else {
                mode = .local(reason: "")
            }
            log.notice("world tracking session started")
        }
    }

    func pause() {
        session?.pause()
        isPaused = true
    }

    /// Pick up where `pause` left off, after an app switch or a Control Center
    /// swipe. The same configuration, re-run with no reset options, so ARKit
    /// relocalises into the world it already had: the venue origin and every
    /// placed asset are still where they were.
    ///
    /// Safe to call any number of times. If the session never got as far as
    /// running (paused during the permission prompt, say), it is started.
    func resume() {
        guard isPaused, let view, !cameraDenied else { return }
        isPaused = false
        if let existing = view.session.configuration {
            view.session.run(existing)
        } else if hasStarted {
            Task { await start() }
        }
    }

    // MARK: - Choosing a configuration

    /// Settings shared by both configurations, and the reasoning behind each.
    private func tune(_ config: ARConfiguration) {
        // Frame rate over pixels, always. The camera image is composited behind
        // the game; nobody counts its pixels, everybody feels 30fps. Where the
        // device offers a high frame rate format it is taken, and the lowest
        // resolution at that rate is preferred so the ISP and the neural engine
        // have less to chew per frame.
        // At that rate, the widest 4:3 format up to 1920 px: the lowest
        // resolution made the camera feed visibly soft behind a crisp world,
        // and anything above 1920 costs frames for pixels nobody sees.
        let formats = type(of: config).supportedVideoFormats
        let topRate = formats.map(\.framesPerSecond).max()
        let atRate = formats.filter { $0.framesPerSecond == topRate
            && $0.imageResolution.width <= 1920 }
        if let best = atRate.max(by: { $0.imageResolution.width < $1.imageResolution.width }) {
            config.videoFormat = best
            log.notice("video format \(Int(best.imageResolution.width))x\(Int(best.imageResolution.height)) at \(best.framesPerSecond)fps")
        }

        if let world = config as? ARWorldTrackingConfiguration {
            // Aligned to gravity AND to true north, not just to gravity.
            //
            // This is the single decision that makes the fallback mode worth
            // having. With the default `.gravity` alignment each phone gets an
            // arbitrary heading, so a bearing means something different on
            // every device and the two of us cannot talk about where anything
            // is. With `.gravityAndHeading` the world is the same orientation
            // on every phone in the venue: +X east, -Z north, which is also
            // exactly what geo tracking gives, so the rest of the app has one
            // frame of reference instead of two.
            //
            // It costs a compass fix at startup and is less happy surrounded by
            // metal, which is the trade an outdoor venue game should take.
            world.worldAlignment = .gravityAndHeading
            // LiDAR, where there is one. Scene reconstruction is what lets a
            // token roll behind a real bench instead of through it, and it is
            // the single biggest difference between "an image floating in the
            // camera" and "a thing that is in the room".
            if ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) {
                world.sceneReconstruction = .meshWithClassification
            } else if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
                world.sceneReconstruction = .mesh
            }
            world.environmentTexturing = .automatic
        }

        // Depth and person occlusion are per-frame neural work. They are worth
        // it at full quality because a player walking in front of another
        // player's avatar is the most common thing that happens in this game.
        var semantics: ARConfiguration.FrameSemantics = []
        if quality == .full {
            if type(of: config).supportsFrameSemantics(.personSegmentationWithDepth) {
                semantics.insert(.personSegmentationWithDepth)
            }
            if type(of: config).supportsFrameSemantics(.smoothedSceneDepth) {
                semantics.insert(.smoothedSceneDepth)
            } else if type(of: config).supportsFrameSemantics(.sceneDepth) {
                semantics.insert(.sceneDepth)
            }
        }
        config.frameSemantics = semantics

        // The venue marker, in both configurations. Tracking one image (not
        // just detecting it) is what keeps `isTracked` honest and lets the
        // pose refine while the marker stays in view; one image is cheap.
        let markers: Set<ARReferenceImage> = [VenueMarker.referenceImage()]
        if let world = config as? ARWorldTrackingConfiguration {
            world.detectionImages = markers
            world.maximumNumberOfTrackedImages = 1
        } else if let geo = config as? ARGeoTrackingConfiguration {
            geo.detectionImages = markers
            geo.maximumNumberOfTrackedImages = 1
        }
    }

    /// Whether geo tracking will actually work here, asked properly rather than
    /// assumed from the device model. It can be supported by the chip, refused
    /// by permissions, and unavailable at this coordinate, and all three are
    /// different answers.
    private func canTrackGeo(at coordinate: CLLocationCoordinate2D) async -> Bool {
        guard ARGeoTrackingConfiguration.isSupported else {
            mode = .local(reason: "")
            return false
        }
        guard await hasLocationPermission() else {
            mode = .local(reason: "")
            return false
        }
        // `@Sendable`, and the logger lifted out, for a reason worth spelling
        // out because it cost a day.
        //
        // ARKit answers on `com.apple.arkit.geoTrackingConfiguration.
        // checkAvailabilityQueue`, not on the main queue, and its header
        // declares a plain block rather than a Sendable one. A closure written
        // inside a `@MainActor` type and passed to a non-Sendable parameter
        // INHERITS that isolation, so the compiler plants an isolation assert
        // at the closure's first instruction. ARKit then calls it from its own
        // queue, `dispatch_assert_queue` fails, and the process takes a
        // SIGTRAP with no message at all.
        //
        // This is the first line of work in an AR session, so every attempt to
        // start a game died here. Marking the closure `@Sendable` detaches it
        // from the actor, which is honest: it touches nothing isolated. The
        // logger is its own Sendable value, captured rather than reached for
        // through `self`, because reaching through `self` is what dragged the
        // isolation in.
        let log = self.log
        let available: Bool = await withCheckedContinuation { continuation in
            ARGeoTrackingConfiguration.checkAvailability(at: coordinate) { @Sendable ok, error in
                if let error { log.error("geo availability: \(error.localizedDescription)") }
                continuation.resume(returning: ok)
            }
        }
        if !available {
            mode = .local(reason: "")
        }
        return available
    }

    private func hasLocationPermission() async -> Bool {
        switch locations.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            return true
        case .notDetermined:
            locations.requestWhenInUseAuthorization()
            // Poll briefly rather than wiring a delegate for one question. The
            // dialog is on screen; a player answers it in seconds or not at all.
            for _ in 0..<60 {
                try? await Task.sleep(for: .milliseconds(250))
                if locations.authorizationStatus != .notDetermined { break }
            }
            return locations.authorizationStatus == .authorizedWhenInUse
                || locations.authorizationStatus == .authorizedAlways
        default:
            return false
        }
    }

    // MARK: - The quality ladder

    private func thermalStateChanged() {
        let state = ProcessInfo.processInfo.thermalState
        let wanted: Quality = switch state {
        case .nominal, .fair: .full
        case .serious: .reduced
        case .critical: .survival
        @unknown default: .reduced
        }
        guard wanted != quality else { return }
        log.notice("thermal state \(state.rawValue), quality -> \(String(describing: wanted))")
        quality = wanted
        applyRenderOptions(for: wanted)
        reconfigureForQuality()
    }

    private func applyRenderOptions(for quality: Quality) {
        guard let view else { return }
        var options: ARView.RenderOptions = [
            // Never wanted by this game and on by default: they cost frames and
            // make a hand-authored environment look soft.
            .disableMotionBlur, .disableDepthOfField, .disableFaceMesh,
        ]
        if quality >= .reduced {
            options.insert(.disablePersonOcclusion)
            options.insert(.disableGroundingShadows)
        }
        if quality == .survival {
            options.insert(.disableHDR)
            options.insert(.disableAREnvironmentLighting)
            options.insert(.disableCameraGrain)
        }
        view.renderOptions = options
    }

    /// Re-run the current configuration with the semantics the new quality tier
    /// allows, keeping tracking. `run` without reset options preserves the
    /// world map, so this is not the visible re-localisation hitch that
    /// resetting would be.
    private func reconfigureForQuality() {
        guard let view, let existing = view.session.configuration else { return }
        tune(existing)
        view.session.run(existing)
    }

    // MARK: - Anchoring the venue

    /// Geo tracking did not localise in time (indoors, under a roof). The
    /// field goes down locally instead, and the coaching follows.
    func abandonGeo() {
        if case .geo = mode { mode = .local(reason: "") }
    }

    /// The best floor found so far, or nil.
    ///
    /// A plane ARKit classified as floor wins outright. Without one, the
    /// lowest horizontal plane that sits at least 0.9 m under the camera is
    /// almost certainly the floor too (a desk is rarely that far below a phone
    /// held by someone sitting at it). `anyPlane` relaxes that to the lowest
    /// horizontal plane of all, for the timeout.
    func floorCandidate(anyPlane: Bool) -> simd_float4x4? {
        let usable = planes.values.filter { $0.area >= 0.1 }
        if let floor = usable.filter(\.isFloor).max(by: { $0.area < $1.area }) {
            return floor.transform
        }
        let cameraY = view?.cameraTransform.translation.y ?? 0
        let low = usable.filter { cameraY - $0.height >= 0.9 }.min(by: { $0.height < $1.height })
        if let low { return low.transform }
        if anyPlane, let lowest = usable.min(by: { $0.height < $1.height }),
           cameraY - lowest.height >= 0.5 {
            return lowest.transform
        }
        return nil
    }

    /// A point 1.5 m ahead of the camera at an estimated floor height, level
    /// and facing nowhere in particular (the world is already north aligned).
    /// Used when no plane turns up in time: better a field standing roughly on
    /// the floor than a player staring at an empty room.
    func estimatedFloorAhead() -> simd_float4x4 {
        guard let view else { return matrix_identity_float4x4 }
        let cam = view.cameraTransform
        let forward4 = cam.matrix.columns.2
        var forward = -SIMD3<Float>(forward4.x, 0, forward4.z)
        if simd_length(forward) < 0.01 { forward = [0, 0, -1] }
        forward = simd_normalize(forward)
        var p = cam.translation + forward * 1.5
        // Lowest plane seen, if any is lower than the estimate; otherwise a
        // phone held at chest height is about 1.3 m off the floor.
        let estimate = cam.translation.y - 1.3
        let lowest = planes.values.map(\.height).min() ?? .infinity
        p.y = min(estimate, lowest)
        var m = matrix_identity_float4x4
        m.columns.3 = SIMD4(p.x, p.y, p.z, 1)
        return m
    }

    /// Put the venue's origin into the world and return it.
    ///
    /// In geo mode this is a real coordinate, so it is the same point for
    /// everyone. Otherwise it is the floor under the field, found by
    /// `floorCandidate`, or `fallback` when the caller has waited long enough.
    func anchorVenue(heading: CLLocationDirection?, fallback: simd_float4x4? = nil) -> AnchorEntity? {
        guard let view else { return nil }
        if let existing = venueOrigin { return existing }
        _ = heading

#if targetEnvironment(simulator)
        // RealityKit's ARKit-backed anchors do not exist in the simulator
        // runtime; it gets a fixed origin so the app stays runnable there.
        let anchor = AnchorEntity(world: .zero)
#else
        let anchor: AnchorEntity
        if hasUsableMarker, let pose = markerPose {
            // The printed marker: the same origin and rotation as every other
            // phone that has seen it. Beats the floor and the timeout.
            let arAnchor = ARAnchor(name: Self.markerAnchorName, transform: pose)
            view.session.add(anchor: arAnchor)
            anchor = AnchorEntity(anchor: arAnchor)
            venueARAnchor = arAnchor
            lastAppliedMarkerPose = pose
            lastMarkerApply = Date()
            markerFixCount += 1
            lastMarkerFix = Date()
            alignment = .sharedMarker
            anchoredByFallback = false
        } else if case .geo = mode, fallback == nil, let venue {
            let geo = ARGeoAnchor(coordinate: venue)
            view.session.add(anchor: geo)
            anchor = AnchorEntity(anchor: geo)
            venueARAnchor = geo
            alignment = .sharedGeo
        } else if let transform = fallback ?? floorCandidate(anyPlane: false) {
            // An ARAnchor of our own rather than a RealityKit plane query, so
            // it lands at once, where we decided, and ARKit keeps refining it.
            // Rotation is dropped: the session is `.gravityAndHeading`, so the
            // world's -Z is already true north.
            var m = matrix_identity_float4x4
            m.columns.3 = transform.columns.3
            let arAnchor = ARAnchor(name: "costquest.venue", transform: m)
            view.session.add(anchor: arAnchor)
            anchor = AnchorEntity(anchor: arAnchor)
            venueARAnchor = arAnchor
            alignment = .solo
            anchoredByFallback = fallback != nil
            // An estimated floor can sit a little below the real one, and the
            // LiDAR floor would then hide the whole field. Occlusion only when
            // the field stands on a surface ARKit actually found.
            if anchoredByFallback {
                view.environment.sceneUnderstanding.options.remove(.occlusion)
            }
        } else {
            return nil
        }
#endif
        view.scene.addAnchor(anchor)
        venueOrigin = anchor
        return anchor
    }

    // MARK: - The venue marker

    /// The marker was seen (and is being tracked) at `imageTransform`.
    ///
    /// Works out the venue pose it implies and, when the arena is already
    /// standing, moves the arena onto it. The move is throttled (at most every
    /// 2 s, and only for a real change of more than 5 cm or 3 degrees) so a
    /// marker held in view does not make the field shimmer.
    fileprivate func markerSeen(_ imageTransform: simd_float4x4) {
        let markerY = imageTransform.columns.3.y
        guard let pose = Self.venuePose(marker: imageTransform,
                                        floorY: floorHeight(under: markerY)) else { return }
        markerPose = pose

        // Geo wins where it has localised; and once the arena is on a geo
        // anchor it stays there.
        if (mode == .geo && geoLocalized) || alignment == .sharedGeo { return }
        // Not placed yet: `anchorVenue` picks the marker pose up.
        guard let view, let origin = venueOrigin else { return }
#if !targetEnvironment(simulator)
        let now = Date()
        if alignment == .sharedMarker, let last = lastAppliedMarkerPose {
            guard now.timeIntervalSince(lastMarkerApply) >= 2,
                  Self.moved(from: last, to: pose) else { return }
        }
        // Add the new anchor first, point the entity at it, then drop the old
        // one: RealityKit moves the whole arena with the entity, children and
        // all, and nothing is rebuilt.
        let arAnchor = ARAnchor(name: Self.markerAnchorName, transform: pose)
        view.session.add(anchor: arAnchor)
        origin.anchoring = AnchoringComponent(.anchor(identifier: arAnchor.identifier))
        if let old = venueARAnchor { view.session.remove(anchor: old) }
        venueARAnchor = arAnchor
        lastAppliedMarkerPose = pose
        lastMarkerApply = now
        markerFixCount += 1
        lastMarkerFix = now
        if alignment != .sharedMarker {
            log.notice("arena moved onto the venue marker")
        }
        alignment = .sharedMarker
        anchoredByFallback = false
#endif
    }

    /// The floor under a marker at height `markerY`, when ARKit has found one:
    /// a marker on a table should still stand the arena on the floor. A plane
    /// classified as floor wins; otherwise the lowest sizeable horizontal plane
    /// no higher than the marker. Nil means use the marker's own height.
    private func floorHeight(under markerY: Float) -> Float? {
        let below = planes.values.filter {
            $0.area >= 0.1 && $0.height <= markerY + 0.05 && markerY - $0.height < 2.0
        }
        if let floor = below.filter(\.isFloor).max(by: { $0.area < $1.area }) {
            return floor.height
        }
        return below.min(by: { $0.height < $1.height })?.height
    }

    /// The venue pose a marker at `t` implies: origin at the marker centre
    /// (on the floor below it when there is one), rotated about gravity only
    /// so the layout's north (-Z) runs along the marker's arrow.
    ///
    /// An ARImageAnchor lies in its own XZ plane with +Y out of the image and
    /// the image's top edge towards -Z, so "the direction the arrow points" is
    /// the anchor's -Z. A marker stuck to a wall has a nearly vertical -Z; then
    /// the image normal (the way it faces) is used instead.
    nonisolated static func venuePose(marker t: simd_float4x4, floorY: Float?) -> simd_float4x4? {
        var north = SIMD2<Float>(-t.columns.2.x, -t.columns.2.z)
        if simd_length(north) < 0.3 {
            north = SIMD2<Float>(t.columns.1.x, t.columns.1.z)
        }
        guard simd_length(north) > 0.1 else { return nil }
        north = simd_normalize(north)
        // Rotating (0, 0, -1) by yaw about +Y gives (-sin, 0, -cos).
        let yaw = atan2(-north.x, -north.y)
        var m = simd_float4x4(simd_quatf(angle: yaw, axis: SIMD3<Float>(0, 1, 0)))
        let c = t.columns.3
        m.columns.3 = SIMD4<Float>(c.x, floorY ?? c.y, c.z, 1)
        return m
    }

    /// More than 5 cm or 3 degrees apart.
    nonisolated static func moved(from a: simd_float4x4, to b: simd_float4x4) -> Bool {
        let pa = SIMD3<Float>(a.columns.3.x, a.columns.3.y, a.columns.3.z)
        let pb = SIMD3<Float>(b.columns.3.x, b.columns.3.y, b.columns.3.z)
        if simd_distance(pa, pb) > 0.05 { return true }
        let angle = simd_quatf(a).inverse * simd_quatf(b)
        let degrees = abs(angle.angle) * 180 / .pi
        return min(degrees, 360 - degrees) > 3
    }

    /// The player's real-world coordinate for an event payload, so the server
    /// can apply its geofence. Nil when we have nothing trustworthy to send,
    /// which the server reads as "no position claimed" rather than as a lie.
    func currentCoordinate() async -> CLLocationCoordinate2D? {
        // Same trap as `canTrackGeo`: ARKit calls back off the main queue, so
        // the closure is detached from the actor rather than asserting on it.
        //
        // `session` is also bound rather than optional-chained. `session?.get…`
        // with a nil session would skip the call entirely and leave the
        // continuation un-resumed, which is not a crash but a permanent hang of
        // whatever awaited it, and a hang is the harder of the two to find.
        if case .geo = mode, let session, let frame = session.currentFrame {
            let point = frame.camera.transform.columns.3
            return await withCheckedContinuation { continuation in
                session.getGeoLocation(forPoint: [point.x, point.y, point.z]) { @Sendable coord, _, error in
                    continuation.resume(returning: error == nil ? coord : nil)
                }
            }
        }
        return locations.location?.coordinate
    }
}

// MARK: - Session delegate

/// ARKit calls these on its own queue and the class is `@MainActor`, so each
/// one hops rather than reaching into state from a background thread. Swift 6
/// will not let it be sloppy here, which is the point.
extension ARSessionController: ARSessionDelegate {

    nonisolated func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let state = camera.trackingState
        Task { @MainActor in
            cameraIsRunning = true
            failureRetries = 0
            // In geo mode readiness belongs to the geo status below: normal
            // world tracking is not the same as knowing where the venue is.
            let geo = mode == .geo
            switch state {
            case .normal:
                coachingText = nil
                if !geo { isReadyToPlace = true }
            case .notAvailable:
                coachingText = "Waking up the camera"
                isReadyToPlace = false
            case .limited(let reason):
                isReadyToPlace = false
                coachingText = switch reason {
                case .initializing: "Sweep your phone slowly across the floor"
                case .excessiveMotion: "Easy. Move a little slower"
                case .insufficientFeatures: "Aim at the floor or a textured surface"
                case .relocalizing: "Picking up where you left off"
                @unknown default: "Hold steady for a moment"
                }
            }
        }
    }

    /// After an interruption, let ARKit relocalise against the map it already
    /// has (the coaching overlay shows the "find where you were" prompt)
    /// instead of silently starting a new world with the field in the wrong
    /// place.
    nonisolated func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { true }

    nonisolated func session(_ session: ARSession, didChange geoTrackingStatus: ARGeoTrackingStatus) {
        let state = geoTrackingStatus.state
        let reason = geoTrackingStatus.stateReason
        let accuracy = geoTrackingStatus.accuracy
        Task { @MainActor in
            geoAccuracy = accuracy
            geoLocalized = state == .localized && accuracy != .low
            switch state {
            case .localized:
                // Placing at low accuracy is worse than waiting: the whole
                // promise of geo mode is that your lighthouse is my lighthouse.
                isReadyToPlace = accuracy != .low
                coachingText = accuracy == .low
                    ? "Lining up with the arena" : nil
            case .localizing:
                isReadyToPlace = false
                coachingText = switch reason {
                case .none: "Lining up with the arena"
                case .notAvailableAtLocation: "Head towards the entrance"
                case .needLocationPermissions: "Turn on location to line up the arena"
                case .worldTrackingUnstable: "Move your phone around slowly"
                case .waitingForLocation, .waitingForAvailabilityCheck: "Finding your position"
                case .geoDataNotLoaded: "Loading the area around you"
                case .devicePointedTooLow: "Lift your phone and look ahead"
                case .visualLocalizationFailed: "Aim at buildings or landmarks"
                @unknown default: "Lining up with the arena"
                }
            case .initializing:
                coachingText = "Lining up with the arena"
            case .notAvailable:
                mode = .local(reason: "")
            @unknown default:
                break
            }
        }
    }

    nonisolated func session(_ session: ARSession, didFailWithError error: any Error) {
        let text = error.localizedDescription
        let code = (error as? ARError)?.code
        Task { @MainActor in
            log.error("session failed: \(text)")
            switch code {
            case .cameraUnauthorized?:
                // Retrying this is the infinite loop: ARKit fails at once,
                // every time, until the player changes the setting.
                cameraDenied = true
                isReadyToPlace = false
                return
            case .unsupportedConfiguration?, .sensorUnavailable?:
                unrecoverable = "This phone cannot run the AR camera right now."
                return
            default:
                break
            }
            failureRetries += 1
            guard failureRetries <= 3 else {
                unrecoverable = "The camera keeps stopping. Close other camera apps and try again."
                return
            }
            coachingText = "Reconnecting the camera"
            try? await Task.sleep(for: .seconds(Double(failureRetries)))
            // Re-run what we had without a reset, so a field that is already
            // standing stays where it is. Only a session that never got a
            // configuration is started from scratch.
            if let view, let existing = view.session.configuration, venueOrigin != nil {
                view.session.run(existing)
            } else {
                await start()
            }
        }
    }

    nonisolated func sessionWasInterrupted(_ session: ARSession) {
        Task { @MainActor in
            coachingText = "Paused"
            isReadyToPlace = false
        }
    }

    nonisolated func sessionInterruptionEnded(_ session: ARSession) {
        // Deliberately NOT resetting. The player took a call; the world is
        // still where it was and ARKit will re-localise into it. Resetting
        // would move every asset and lose the venue origin.
        Task { @MainActor in coachingText = "Picking up where you left off" }
    }

    // Planes, reduced to plain values before the hop: ARAnchor is not
    // Sendable and must not cross onto the main actor.
    // The venue marker the same way: only its transform (a plain value)
    // crosses, and only when ARKit says it is tracked right now.
    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        absorb(anchors)
    }

    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        absorb(anchors)
    }

    private nonisolated func absorb(_ anchors: [ARAnchor]) {
        let found = Self.planeInfo(anchors)
        let marker = Self.trackedMarker(anchors)
        guard !found.isEmpty || marker != nil else { return }
        Task { @MainActor in
            for (id, info) in found { planes[id] = info }
            if let marker { markerSeen(marker) }
        }
    }

    private nonisolated static func trackedMarker(_ anchors: [ARAnchor]) -> simd_float4x4? {
        for anchor in anchors {
            guard let image = anchor as? ARImageAnchor,
                  image.referenceImage.name == VenueMarkerArt.imageName,
                  image.isTracked else { continue }
            return image.transform
        }
        return nil
    }

    nonisolated func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        let gone = anchors.compactMap { $0 as? ARPlaneAnchor }.map(\.identifier)
        guard !gone.isEmpty else { return }
        Task { @MainActor in for id in gone { planes[id] = nil } }
    }

    private nonisolated static func planeInfo(_ anchors: [ARAnchor]) -> [(UUID, PlaneInfo)] {
        anchors.compactMap { anchor in
            guard let plane = anchor as? ARPlaneAnchor, plane.alignment == .horizontal else { return nil }
            let extent = plane.planeExtent
            var isFloor = false
            if ARPlaneAnchor.isClassificationSupported, case .floor = plane.classification {
                isFloor = true
            }
            // The plane's centre, not its anchor origin: they differ once it grows.
            var t = plane.transform
            let c = plane.center
            let world = t * SIMD4<Float>(c.x, c.y, c.z, 1)
            t.columns.3 = world
            return (plane.identifier, PlaneInfo(transform: t, area: extent.width * extent.height,
                                                isFloor: isFloor))
        }
    }
}
