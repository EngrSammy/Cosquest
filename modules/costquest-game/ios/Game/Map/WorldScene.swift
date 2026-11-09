import CoreLocation
import Metal
import RealityKit
import SwiftUI
import UIKit
import simd

/// Everything RealityKit in the Roam world, held by reference.
///
/// RealityView hands its closures a copy of the view struct, so anything they
/// capture is frozen when the closure is made. The scene, the camera rig and
/// the per-frame loop live here instead, where a gesture, a network answer
/// and the frame clock all see the same values.
///
/// SCENE FRAME. RealityKit is right-handed with y up, so for the map to read
/// the right way round (east on the right when looking north) +z must point
/// SOUTH. Server and caller offsets are (east, north); they are converted at
/// the edge, here and in `WorldBuilder`, and nowhere else. The first version
/// put north on +z and drew every city as its mirror image.
///
/// Only built-in materials. Custom surface shaders draw nothing in the iOS
/// Simulator, so a look that depended on them could not be checked before it
/// reached a phone; colour comes from a per-build atlas texture instead, and
/// fog from translucent shells (see `fogShells`).
@MainActor
final class WorldScene {

    // MARK: Entities (built lazily: SwiftUI can make this object many times
    // and keep only the first, so the initialiser must be free)

    private(set) var root: Entity?
    private var holder = Entity()
    private var world: Entity?
    private var water: ModelEntity?
    private var waterMaterial: PhysicallyBasedMaterial?
    private var sky: ModelEntity?
    private var fog: [ModelEntity] = []
    private(set) var camera: PerspectiveCamera?
    private var sun: DirectionalLight?
    private var fillLight: DirectionalLight?
    private(set) var objects = Entity()
    private var pawn: PawnRig?
    private var subscription: EventSubscription?
    private var hour: TimeOfDay = .day
    private var palette: Palette = .meadow

    // MARK: What is drawn

    /// The response the current world was built from, so an identical
    /// refetch is not rebuilt and the world can be re-based when the centre
    /// moves before new ground arrives.
    private(set) var shownOrigin: CLLocationCoordinate2D?
    private(set) var shownData: Data?
    var hasWorld: Bool { world != nil }
    private(set) var styleKey = ""

    // MARK: The rig. Targets are written by gestures and the view; the shown
    // values chase them each frame.

    private(set) var centre: CLLocationCoordinate2D?
    var yawDegrees: Double = 0
    var dollyTarget: Double = 130
    private var dolly: Double = 130
    var travelTarget: SIMD2<Float> = .zero
    private var travel: SIMD2<Float> = .zero
    var zoomTilt = false
    var rise: Float = 0.5
    var dollyRange: ClosedRange<Double> = 60...600
    /// Where the player is, scene frame.
    var pawnTarget: SIMD2<Float> = .zero
    private var pawnShown: SIMD2<Float>?
    private var lastPawnMove = SIMD2<Float>(0, -1)
    /// Compass heading, degrees clockwise from north, when the phone has one.
    var facing: Double?

    private var time: Double = 0
    private var lastWaterStep: Double = 0
    private var markers: [String: Marker] = [:]
    private var installs = 0

    init() {}

    /// How much the game's own objects glow for this hour: 1 by day, more
    /// after dark, so shrines, beacons and the player stay the brightest
    /// things on the map. Read when an object is built.
    static private(set) var nightGlow: Float = 1

    private static func setGlow(_ hour: TimeOfDay) {
        nightGlow = hour == .night ? 2.2 : (hour == .dusk ? 1.5 : 1)
    }

    /// The hour's light levels were set for the old flat-coloured world; lit
    /// PBR over the pale board clipped roofs, roads and ground to white at
    /// those levels. `-mapExposure` overrides it for tuning.
    static var exposure: Float {
        UserDefaults.standard.string(forKey: "mapExposure").flatMap(Float.init) ?? 0.5
    }

    // MARK: - Setup

    /// Builds the scene the first time and adds it to a RealityView. Safe to
    /// call again with a new content (the view can be re-created), which moves
    /// the same root across.
    func attach(to content: some RealityViewContentProtocol,
                palette: Palette, hour: TimeOfDay) {
        if root == nil { prepare(palette: palette, hour: hour) }
        guard let root else { return }
        content.add(root)
        subscription?.cancel()
        // Delivered on the main thread by RealityKit's own loop; the check is
        // there so that if that ever changes, this hops rather than traps.
        // (@Sendable and nonisolated: a main-actor closure called off the main
        // thread is the SIGTRAP this codebase has met before.)
        subscription = content.subscribe(to: SceneEvents.Update.self) { @Sendable [weak self] event in
            let dt = event.deltaTime
            if Thread.isMainThread {
                MainActor.assumeIsolated { self?.tick(dt) }
            } else {
                DispatchQueue.main.async { self?.tick(dt) }
            }
        }
    }

    private func prepare(palette: Palette, hour: TimeOfDay) {
        let root = Entity()
        root.name = "world-root"
        holder.name = "ground-holder"
        root.addChild(holder)
        objects.name = "objects"
        root.addChild(objects)
        self.palette = palette
        self.hour = hour
        WorldScene.setGlow(hour)
        styleKey = "\(palette.name)-\(hour.rawValue)"

        let sky = ModelEntity(mesh: WorldScene.skyDome(),
                              materials: [WorldScene.skyMaterial(hour)])
        sky.name = "sky"
        root.addChild(sky)
        self.sky = sky

        fog = WorldScene.fogShells(hour)
        for shell in fog { root.addChild(shell) }

        let sun = DirectionalLight()
        sun.light.intensity = hour.sunIntensity * WorldScene.exposure
        sun.light.color = hour.sunColor
        // Shadows are the strongest depth cue there is. Kept to the distance
        // the camera actually looks over: one shadow map stretched over 900 m
        // was soft, aliased and an extra full pass for nothing.
        sun.shadow = DirectionalLightComponent.Shadow(maximumDistance: 520, depthBias: 1.6)
        sun.look(at: .zero, from: hour.sunDirection, relativeTo: nil)
        root.addChild(sun)
        self.sun = sun

        // A second, weaker light from the opposite side, so faces turned away
        // from the sun are shaded rather than black.
        let fill = DirectionalLight()
        fill.light.intensity = hour.fillIntensity * WorldScene.exposure
        fill.light.color = hour.fillColor
        fill.look(at: .zero, from: [110, 90, 120], relativeTo: nil)
        root.addChild(fill)
        fillLight = fill

        let camera = PerspectiveCamera()
        camera.name = "camera"
        // A near plane a metre out instead of a centimetre: the layers of the
        // ground are centimetres apart and the default wasted the depth
        // buffer on the first metre in front of a camera 130 m up.
        camera.camera.near = 1
        camera.camera.far = 6_000
        camera.camera.fieldOfViewInDegrees = 58
        root.addChild(camera)
        self.camera = camera
        self.root = root
        placeCamera()
        light(root, hour: hour)
    }

    /// The world's ambient light: the hour's own sky, so dusk is warm and
    /// night is dark. RealityKit's default environment is a bright neutral
    /// studio that outshone the sun and made midnight look like noon.
    private func light(_ root: Entity, hour: TimeOfDay) {
        Task { @MainActor in
            guard let image = WorldScene.environmentImage(hour),
                  let env = try? await EnvironmentResource(equirectangular: image, withName: nil)
            else { return }
            root.components.set(ImageBasedLightComponent(
                source: .single(env), intensityExponent: hour.ambientExponent + WorldScene.ambientBias))
            root.components.set(ImageBasedLightReceiverComponent(imageBasedLight: root))
        }
    }

    /// `-mapAmbient` shifts the ambient exponent, for tuning.
    static var ambientBias: Float {
        UserDefaults.standard.string(forKey: "mapAmbient").flatMap(Float.init) ?? 0
    }

    /// Sky above, horizon at the middle, a warm ground bounce below.
    static func environmentImage(_ hour: TimeOfDay) -> CGImage? {
        let w = 64, h = 32
        var px = [UInt32](repeating: 0, count: w * h)
        let ground = hour.horizon.mixed(RGB(hex: 0xC9C29E), 0.5).scaled(0.8)
        for y in 0..<h {
            let t = Float(y) / Float(h - 1)        // 0 top, 1 bottom
            let c: RGB = t < 0.5
                ? hour.zenith.mixed(hour.horizon, powf(t / 0.5, 1.6))
                : hour.horizon.mixed(ground, min(1, (t - 0.5) / 0.15))
            let v = c.packed() | 0xFF00_0000
            for x in 0..<w { px[y * w + x] = v }
        }
        let data = px.withUnsafeBufferPointer { Data(buffer: $0) }
        guard let provider = CGDataProvider(data: data as CFData) else { return nil }
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32,
                       bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true,
                       intent: .defaultIntent)
    }

    /// The style changed (palette or hour).
    func restyle(palette: Palette, hour: TimeOfDay) {
        let key = "\(palette.name)-\(hour.rawValue)"
        guard root != nil, key != styleKey else { return }
        styleKey = key
        self.palette = palette
        self.hour = hour
        WorldScene.setGlow(hour)
        sky?.model?.materials = [WorldScene.skyMaterial(hour)]
        for shell in fog { shell.removeFromParent() }
        fog = WorldScene.fogShells(hour)
        for shell in fog { root?.addChild(shell) }
        sun?.light.intensity = hour.sunIntensity * WorldScene.exposure
        sun?.light.color = hour.sunColor
        sun?.look(at: .zero, from: hour.sunDirection, relativeTo: nil)
        fillLight?.light.intensity = hour.fillIntensity * WorldScene.exposure
        fillLight?.light.color = hour.fillColor
        if let root { light(root, hour: hour) }
        // The ground's colours are in its atlas; the caller rebuilds it
        // (`shownData` is cleared so the next load does).
        shownData = nil
    }

    // MARK: - The centre

    /// The point every offset is measured from. When it moves (the player
    /// walked 300 m), the drawn ground is re-based at once so it stays under
    /// the player while the new ground loads, and the smoothed pawn moves
    /// with it rather than gliding 300 m across the map.
    func setCentre(_ c: CLLocationCoordinate2D) {
        if let old = centre, old.latitude != c.latitude || old.longitude != c.longitude {
            let shift = WorldScene.scene(WorldScene.metres(of: old, from: c))
            if let p = pawnShown { pawnShown = p + shift }
        }
        centre = c
        positionHolder()
    }

    private func positionHolder() {
        guard let centre, let origin = shownOrigin else { return }
        let o = WorldScene.scene(WorldScene.metres(of: origin, from: centre))
        holder.position = SIMD3(o.x, 0, o.y)
    }

    // MARK: - Ground

    /// Swaps in a newly built world. The meshes were triangulated off the
    /// main actor; this is the copy into GPU buffers, one small texture and
    /// one `addChild`.
    func install(_ blobs: WorldBlobs, origin: CLLocationCoordinate2D, data: Data?,
                 animated: Bool) async {
        guard root != nil else { return }
        installs += 1
        let generation = installs
        let t0 = Date()
        let looks = WorldLooks(atlas: blobs.atlas, palette: palette, hour: hour)
        let next = Entity()
        next.name = "ground"
        var waterEntity: ModelEntity?
        // One layer at a time, with a frame between: the GPU upload of a
        // 130k-vertex layer is the only real cost left here, and spreading
        // four of them keeps every frame short. The new world is attached
        // only when complete, so nothing is ever half-drawn.
        for (blob, name, material, casts) in [
            (blobs.ground, "ground", looks.ground as RealityKit.Material, false),
            (blobs.roads, "roads", looks.roads, false),
            (blobs.water, "water", looks.water, false),
            (blobs.buildings, "buildings", looks.buildings, true),
            (blobs.trees, "trees", looks.trees as RealityKit.Material, true),
            (blobs.lights, "lights", looks.lights, false),
        ] {
            guard !blob.isEmpty else { continue }
            do {
                let mesh = try await WorldScene.mesh(blob)
                let e = ModelEntity(mesh: mesh, materials: [material])
                e.name = name
                e.components.set(GroundingShadowComponent(castsShadow: casts, receivesShadow: true))
                next.addChild(e)
                if name == "water" { waterEntity = e }
            } catch {
                MapLog.note("mesh \(name) failed: \(error)")
            }
            await Task.yield()
        }
        // A newer answer started installing while this one was uploading:
        // it wins, whichever finishes first.
        guard generation == installs else { return }

        let old = world
        world = next
        water = waterEntity
        waterMaterial = looks.water
        shownOrigin = origin
        shownData = data
        positionHolder()
        holder.addChild(next)
        old?.removeFromParent()
        MapLog.note("installed over \(Int(Date().timeIntervalSince(t0) * 1000)) ms")

        if animated {
            // The city rises out of the ground rather than popping in.
            next.scale = SIMD3(1, 0.02, 1)
            var t = Transform.identity
            t.scale = .one
            next.move(to: t, relativeTo: holder, duration: 0.6, timingFunction: .easeOut)
        }
    }

    // MARK: - The frame

    func tick(_ dt: Double) {
        guard root != nil else { return }
        let dt = min(max(dt, 0), 0.1)
        time += dt
        let a = Float(1 - exp(-dt * 12))

        // The pawn walks to the fix rather than teleporting: GPS moves in
        // 3-10 m steps. A jump too big to be a walk (first fix, a re-base
        // that raced) is taken at once.
        if let shown = pawnShown {
            let gap = pawnTarget - shown
            let d = simd_length(gap)
            if d > 250 {
                pawnShown = pawnTarget
            } else if d > 0.01 {
                let k = Float(1 - exp(-dt * 3.2))
                var step = gap * k
                let maxStep = Float(dt) * 28
                if simd_length(step) > maxStep { step = simd_normalize(step) * maxStep }
                pawnShown = shown + step
                if d > 0.4 { lastPawnMove = simd_normalize(gap) }
            }
        } else {
            pawnShown = pawnTarget
        }
        travel += (travelTarget - travel) * a
        dolly += (dollyTarget - dolly) * Double(a)

        placeCamera()
        pawn?.update(at: pawnShown ?? .zero, facing: facingVector, time: time,
                     dt: dt, dolly: Float(dolly))
        updateMarkers(dt: dt)

        // The river drifts: the ripple texture slides, ~20 times a second.
        if time - lastWaterStep > 0.05, let water, var m = waterMaterial {
            lastWaterStep = time
            let t = Float(time)
            m.textureCoordinateTransform = .init(
                offset: SIMD2(t * 0.013, t * 0.007), scale: .one, rotation: 0)
            waterMaterial = m
            water.model?.materials = [m]
        }
    }

    private var facingVector: SIMD2<Float> {
        if let facing {
            let h = Float(facing * .pi / 180)
            return SIMD2(sin(h), -cos(h))
        }
        return lastPawnMove
    }

    var focus: SIMD2<Float> { (pawnShown ?? pawnTarget) + travel }

    /// Behind and above the focus, looking down the way the rig faces.
    ///
    /// With `zoomTilt` the pitch follows the zoom, as in Pokémon GO and
    /// Pikmin Bloom: close in, you look out toward the horizon; pulled back,
    /// the view tips toward a plan.
    func placeCamera() {
        guard let camera else { return }
        let f = focus
        let yaw = Float(yawDegrees * .pi / 180)
        let back: Float, up: Float, pitch: Float
        if zoomTilt {
            let lo = dollyRange.lowerBound, hi = dollyRange.upperBound
            let t = Float(max(0, min(1, (dolly - lo) / max(1, hi - lo))))
            // 24 degrees below the horizon close in (the sky shows above the
            // haze), 58 pulled right back (nearly a plan).
            let deg = 24 + 34 * powf(t, 0.85)
            pitch = deg * .pi / 180
            back = Float(dolly) * cos(pitch)
            up = Float(dolly) * sin(pitch)
        } else {
            back = Float(dolly)
            up = Float(dolly) * rise
            pitch = atan2(up, back)
        }
        // A RealityKit camera looks down its own -Z, so "behind" is +Z (south)
        // rotated by the yaw.
        let eye = SIMD3<Float>(f.x + sin(yaw) * back, up, f.y + cos(yaw) * back)
        camera.transform = Transform(
            scale: .one,
            rotation: simd_quatf(angle: yaw, axis: [0, 1, 0])
                * simd_quatf(angle: -pitch, axis: [1, 0, 0]),
            translation: eye)
        sky?.position = SIMD3(f.x, 0, f.y)

        // Fog shells ride with the focus and widen as the camera pulls back,
        // so a wider view still ends in haze rather than at the data's edge.
        // Tall enough to cover every ray that reaches the ground; above the
        // camera they fade out, so the sky stays clear.
        let start = Float(190 + dolly * 0.7)
        let span = Float(230 + dolly * 0.45)
        let height = up * 1.3 + 40
        for (i, shell) in fog.enumerated() {
            let r = i == fog.count - 1
                ? start + span + 80
                : start + span * Float(i) / Float(max(1, fog.count - 2))
            shell.position = SIMD3(f.x, -2, f.y)
            shell.scale = SIMD3(r, height, r)
        }
    }

    // MARK: - The player

    func setPlayer(_ p: PlayerPawn?) {
        guard let root else { return }
        guard let p else {
            pawn?.root.removeFromParent()
            pawn = nil
            return
        }
        if let pawn, pawn.look == p { return }
        pawn?.root.removeFromParent()
        let rig = PawnRig(p)
        root.addChild(rig.root)
        pawn = rig
    }

    // MARK: - Objects

    private struct Marker {
        let entity: Entity
        let base: SIMD2<Float>
        let headHeight: Float
        var appear: Float = 0
        var shownPush = SIMD2<Float>.zero
    }

    /// Adds, removes and replaces objects by id. Only what changed is
    /// rebuilt: a whole-set rebuild every time one point started recharging
    /// made every crystal on the map blink.
    func sync(_ list: [SceneObject]) {
        guard root != nil else { return }
        var seen = Set<String>()
        for object in list {
            seen.insert(object.id)
            let sig = object.signature
            if let m = markers[object.id],
               m.entity.components[ObjectSignature.self]?.value == sig { continue }
            let wasShown = markers[object.id] != nil
            let push = markers[object.id]?.shownPush ?? .zero
            markers[object.id]?.entity.removeFromParent()
            let entity = WorldScene.marker(for: object)
            entity.components.set(ObjectSignature(value: sig))
            let base = WorldScene.scene(object.offset)
            entity.position = SIMD3(base.x, 0, base.y)
            entity.scale = wasShown ? .one : SIMD3(repeating: 0.001)
            objects.addChild(entity)
            markers[object.id] = Marker(entity: entity, base: base,
                                        headHeight: object.headHeight,
                                        appear: wasShown ? 1 : 0, shownPush: push)
        }
        for (id, m) in markers where !seen.contains(id) {
            m.entity.removeFromParent()
            markers[id] = nil
        }
    }

    /// Per frame: pop-in, the reach state, a constant-ish size on screen, and
    /// pushing a crystal that stands on the player out of their way.
    private func updateMarkers(dt: Double) {
        let p = pawnShown ?? pawnTarget
        let reach = pawn?.look.reachM ?? 0
        let zoom = Float(max(0.8, min(1.45, dolly / 165)))
        // Shrines standing on the player fan out SIDEWAYS on screen, left and
        // right in turn, so neither they nor the player hide one another.
        // (Pushed straight away from the player, a crystal behind them still
        // stacked above their head from the camera's point of view.)
        let yaw = Float(yawDegrees * .pi / 180)
        let right = SIMD2<Float>(cos(yaw), -sin(yaw))
        let clear: Float = 17
        var crowd = markers.filter { simd_distance($0.value.base, p) < clear && pawn != nil }
            .map(\.key).sorted()
        crowd.sort { a, b in
            simd_dot(markers[a]!.base - p, right) < simd_dot(markers[b]!.base - p, right)
        }
        var slot: [String: SIMD2<Float>] = [:]
        // Middle of the sorted list goes nearest, the ends furthest out.
        let mid = Float(crowd.count - 1) / 2
        for (k, id) in crowd.enumerated() {
            let offset = Float(k) - mid
            let side: Float = offset == 0 ? (k % 2 == 0 ? 1 : -1) : (offset > 0 ? 1 : -1)
            let dist = clear + abs(offset) * 13
            slot[id] = p + right * side * dist
        }
        for (id, var m) in markers {
            if m.appear < 1 { m.appear = min(1, m.appear + Float(dt) / 0.35) }
            // Scale 0 -> 1.15 -> 1: a small overshoot reads as arrival.
            let t = m.appear
            let pop: Float = t < 0.7 ? t / 0.7 * 1.15 : 1.15 - (t - 0.7) / 0.3 * 0.15
            let d = simd_distance(m.base, p)
            let push = slot[id].map { $0 - m.base } ?? .zero
            m.shownPush += (push - m.shownPush) * Float(1 - exp(-dt * 6))
            let pos = m.base + m.shownPush
            m.entity.position = SIMD3(pos.x, 0, pos.y)
            let inReach = reach <= 0 || d <= reach
            let size = (inReach ? 1.0 : 0.8) * zoom * max(0.001, pop)
            m.entity.scale = SIMD3(repeating: size)
            markers[id] = m
        }
    }

    // MARK: - Picking

    /// Which object a tap landed on, using the real camera.
    ///
    /// The old guess projected with made-up constants and ignored where the
    /// view had been panned to, so after a pan it picked the wrong shrine.
    /// This projects each object's pole, foot to head, through the camera's
    /// actual transform and field of view, and takes the nearest within a
    /// thumb.
    func pick(at point: CGPoint, in size: CGSize) -> String? {
        guard let camera, size.width > 0, size.height > 0 else { return nil }
        let view = camera.transform.matrix.inverse
        let f = 1 / tan(camera.camera.fieldOfViewInDegrees * .pi / 360)
        let halfH = Float(size.height) / 2, halfW = Float(size.width) / 2
        func project(_ w: SIMD3<Float>) -> SIMD2<Float>? {
            let v = view * SIMD4(w, 1)
            guard v.z < -1 else { return nil }
            let x = v.x / -v.z * f * halfH
            let y = v.y / -v.z * f * halfH
            return SIMD2(halfW + x, halfH - y)
        }
        let tap = SIMD2(Float(point.x), Float(point.y))
        var best: (id: String, score: Float)?
        for (id, m) in markers {
            let s = m.entity.scale.x
            let pos = m.entity.position
            guard let head = project(SIMD3(pos.x, m.headHeight * s, pos.z)) else { continue }
            var d = simd_distance(tap, head)
            if let foot = project(SIMD3(pos.x, 0, pos.z)) {
                let seg = head - foot
                let l2 = simd_length_squared(seg)
                let t = l2 > 0 ? max(0, min(1, simd_dot(tap - foot, seg) / l2)) : 0
                // The pole counts, at a discount: the head is what a player
                // aims at.
                d = min(d, simd_distance(tap, foot + seg * t) * 1.4)
            }
            guard d < 48 else { continue }
            // Nearest on screen wins; a near tie goes to the one in front.
            let depth = simd_distance(camera.position, pos)
            let score = d + depth * 0.02
            if best == nil || score < best!.score { best = (id, score) }
        }
        return best?.id
    }

    /// QA: where each object's head projects to, in points. `-mapProbe 1`
    /// logs it a few seconds in, to check picking against a screenshot.
    func probe(size: CGSize) {
        guard let camera else { return }
        let view = camera.transform.matrix.inverse
        let f = 1 / tan(camera.camera.fieldOfViewInDegrees * .pi / 360)
        for (id, m) in markers.prefix(6) {
            let pos = m.entity.position
            let v = view * SIMD4(pos.x, m.headHeight * m.entity.scale.x, pos.z, 1)
            guard v.z < -1 else { continue }
            let x = Float(size.width) / 2 + v.x / -v.z * f * Float(size.height) / 2
            let y = Float(size.height) / 2 - v.y / -v.z * f * Float(size.height) / 2
            MapLog.note("probe \(id) at \(Int(x)),\(Int(y)) pick=\(pick(at: CGPoint(x: CGFloat(x), y: CGFloat(y)), in: size) ?? "nil")")
        }
    }

    // MARK: - Frame conversions

    /// (east, north) to the scene's (x, z).
    static func scene(_ en: SIMD2<Float>) -> SIMD2<Float> { SIMD2(en.x, -en.y) }

    /// (east, north) metres of `c` from `o`.
    static func metres(of c: CLLocationCoordinate2D, from o: CLLocationCoordinate2D) -> SIMD2<Float> {
        let x = (c.longitude - o.longitude) * 111_320 * cos(o.latitude * .pi / 180)
        let z = (c.latitude - o.latitude) * 111_320
        return SIMD2(Float(x), Float(z))
    }
}

// MARK: - Meshes

extension WorldScene {
    /// The same, with the resource made by RealityKit's async initialiser.
    static func mesh(_ blob: MeshBlob) async throws -> MeshResource {
        try await MeshResource(from: lowLevel(blob))
    }

    /// A blob into GPU buffers: two copies. `LowLevelMesh` takes our vertex
    /// layout as it is.
    static func mesh(_ blob: MeshBlob) throws -> MeshResource {
        try MeshResource(from: lowLevel(blob))
    }

    static func lowLevel(_ blob: MeshBlob) throws -> LowLevelMesh {
        var d = LowLevelMesh.Descriptor()
        d.vertexAttributes = [
            .init(semantic: .position, format: .float3, offset: 0),
            .init(semantic: .normal, format: .float3, offset: 12),
            .init(semantic: .uv0, format: .float2, offset: 24),
        ]
        d.vertexLayouts = [.init(bufferIndex: 0, bufferStride: MemoryLayout<WorldVertex>.stride)]
        d.vertexCapacity = blob.vertices.count
        d.indexCapacity = blob.indices.count
        d.indexType = .uint32
        let mesh = try LowLevelMesh(descriptor: d)
        mesh.withUnsafeMutableBytes(bufferIndex: 0) { dst in
            blob.vertices.withUnsafeBytes { dst.copyMemory(from: $0) }
        }
        mesh.withUnsafeMutableIndices { dst in
            blob.indices.withUnsafeBytes { dst.copyMemory(from: $0) }
        }
        mesh.parts.replaceAll([
            LowLevelMesh.Part(indexOffset: 0, indexCount: blob.indices.count,
                              topology: .triangle, materialIndex: 0,
                              bounds: BoundingBox(min: blob.lo, max: blob.hi)),
        ])
        return mesh
    }

    /// An inverted dome whose texture coordinate runs up it: horizon colour
    /// at and below the horizon, zenith overhead. It rides with the focus.
    static func skyDome() -> MeshResource {
        var blob = MeshBlob()
        let radius: Float = 2_600
        let seg = 36
        let rows: [Float] = [-50, -4, 0, 4, 9, 16, 26, 40, 58, 90]
        var ringStart: [UInt32] = []
        for el in rows {
            let e = el * .pi / 180
            ringStart.append(UInt32(blob.vertices.count))
            for k in 0...seg {
                let a = Float(k) / Float(seg) * 2 * .pi
                let p = SIMD3<Float>(cos(a) * cos(e) * radius, sin(e) * radius,
                                     sin(a) * cos(e) * radius)
                let i = blob.vertex(p, -simd_normalize(p), 0)
                blob.vertices[Int(i)].u = 0.5
                blob.vertices[Int(i)].v = max(0.01, min(0.99, el / 90))
            }
        }
        for r in 0..<(rows.count - 1) {
            let a = ringStart[r], b = ringStart[r + 1]
            for k in 0..<UInt32(seg) {
                blob.triangle(a + k, b + k, a + k + 1)
                blob.triangle(a + k + 1, b + k, b + k + 1)
            }
        }
        do { return try mesh(blob) } catch {
            MapLog.note("sky mesh failed: \(error)")
            return .generateSphere(radius: radius)
        }
    }

    static func skyMaterial(_ hour: TimeOfDay) -> RealityKit.Material {
        var m = UnlitMaterial()
        m.faceCulling = .none
        let n = 128
        // Row 0 is the top of the image, which is v = 1: the zenith.
        let px: [UInt32] = (0..<n).map { row in
            let v = 1 - (Float(row) + 0.5) / Float(n)     // 0 at horizon, 1 overhead
            let t = min(1, max(0, (v - 0.01) / 0.72))
            return hour.horizon.mixed(hour.zenith, powf(t, 0.65)).packed() | 0xFF00_0000
        }
        if let tex = texture(pixels: px, width: 1, height: n, mipmaps: false) {
            m.color = .init(tint: .white, texture: .init(tex, sampler: linearClamp))
        } else {
            m.color = .init(tint: hour.horizon.uiColor)
        }
        return m
    }

    /// Fog, without a fog shader.
    ///
    /// Nested open cylinders around the focus in the horizon colour, each a
    /// little translucent and fading out with height. A point on the ground
    /// beyond radius r is seen through every shell inside r, so haze builds
    /// with distance from the focus exactly like distance fog, and the last
    /// shell is nearly opaque: past it there is only the horizon colour, which
    /// is also the sky's. Every shell is the same colour, so the order they
    /// blend in cannot change the result, and none writes depth.
    static func fogShells(_ hour: TimeOfDay) -> [ModelEntity] {
        let mesh = openCylinder()
        let fade = fogFade()
        let alphas: [Float] = [0.12, 0.16, 0.2, 0.24, 0.28, 0.34, 0.92]
        return alphas.enumerated().map { i, alpha in
            var m = UnlitMaterial(color: hour.horizon.uiColor)
            if let fade {
                m.blending = .transparent(opacity: .init(scale: alpha, texture: .init(fade, sampler: linearClamp)))
            } else {
                m.blending = .transparent(opacity: .init(floatLiteral: alpha * 0.6))
            }
            m.writesDepth = false
            m.faceCulling = .none
            let e = ModelEntity(mesh: mesh, materials: [m])
            e.name = "fog-\(i)"
            return e
        }
    }

    /// Radius 1, height 1 (y 0...1), v up the side.
    static func openCylinder(segments: Int = 72) -> MeshResource {
        var blob = MeshBlob()
        for k in 0...segments {
            let a = Float(k) / Float(segments) * 2 * .pi
            let n = SIMD3<Float>(-cos(a), 0, -sin(a))
            let lo = blob.vertex(SIMD3(cos(a), 0, sin(a)), n, 0)
            let hi = blob.vertex(SIMD3(cos(a), 1, sin(a)), n, 0)
            blob.vertices[Int(lo)].u = Float(k) / Float(segments)
            blob.vertices[Int(lo)].v = 0.005
            blob.vertices[Int(hi)].u = Float(k) / Float(segments)
            blob.vertices[Int(hi)].v = 0.995
        }
        for k in 0..<UInt32(segments) {
            let i = k * 2
            blob.triangle(i, i + 1, i + 2)
            blob.triangle(i + 2, i + 1, i + 3)
        }
        return (try? mesh(blob)) ?? .generateCylinder(height: 1, radius: 1)
    }

    /// Opacity up a fog shell: full at the ground, gone at the top.
    static func fogFade() -> TextureResource? {
        let n = 128
        let px: [UInt32] = (0..<n).map { row in
            let v = 1 - (Float(row) + 0.5) / Float(n)
            let a = powf(max(0, 1 - v), 1.6)
            let g = UInt32(max(0, min(255, a * 255)))
            return g | g << 8 | g << 16 | 0xFF00_0000
        }
        return texture(pixels: px, width: 1, height: n, mipmaps: false, semantic: .raw)
    }

    /// A flat ring on the ground.
    static func annulus(inner: Float, outer: Float, segments: Int = 96) -> MeshResource {
        var positions: [SIMD3<Float>] = []
        var indices: [UInt32] = []
        for k in 0...segments {
            let a = Float(k) / Float(segments) * 2 * .pi
            positions.append(SIMD3(cos(a) * inner, 0, sin(a) * inner))
            positions.append(SIMD3(cos(a) * outer, 0, sin(a) * outer))
        }
        // Wound to face up in the scene frame (the other order faced down and
        // every ring was culled away).
        for k in 0..<UInt32(segments) {
            let i = k * 2
            indices += [i, i + 2, i + 1, i + 2, i + 3, i + 1]
        }
        var d = MeshDescriptor(name: "annulus")
        d.positions = MeshBuffers.Positions(positions)
        d.normals = MeshBuffers.Normals(positions.map { _ in SIMD3<Float>(0, 1, 0) })
        d.primitives = .triangles(indices)
        return (try? MeshResource.generate(from: [d])) ?? .generatePlane(width: 1, depth: 1)
    }

    /// A soft round shadow, as an opacity texture.
    static let softDisc: TextureResource? = {
        let n = 64
        var px = [UInt32](repeating: 0, count: n * n)
        for y in 0..<n {
            for x in 0..<n {
                let dx = (Float(x) + 0.5) / Float(n) * 2 - 1
                let dy = (Float(y) + 0.5) / Float(n) * 2 - 1
                let r = min(1, sqrtf(dx * dx + dy * dy))
                let a = powf(1 - r, 1.4)
                let g = UInt32(max(0, min(255, a * 255)))
                px[y * n + x] = g | g << 8 | g << 16 | 0xFF00_0000
            }
        }
        return texture(pixels: px, width: n, height: n, mipmaps: true, semantic: .raw)
    }()

    /// Tiled ripples for the water: pale crests on white, which the water
    /// colour tints. Tileable, because the frequencies are whole turns.
    static let ripples: TextureResource? = {
        let n = 128
        var px = [UInt32](repeating: 0, count: n * n)
        for y in 0..<n {
            for x in 0..<n {
                let u = Float(x) / Float(n) * 2 * .pi
                let v = Float(y) / Float(n) * 2 * .pi
                let w = sin(u * 3 + sin(v * 2) * 1.2) * 0.5 + sin(v * 5 + u * 2) * 0.35
                    + sin((u - v) * 4) * 0.15
                let crest = max(0, w - 0.45) * 1.6
                let l = 0.96 + 0.035 * w + 0.12 * crest
                let b = UInt32(max(0, min(255, l * 232)))
                px[y * n + x] = b | b << 8 | min(255, b + 8) << 16 | 0xFF00_0000
            }
        }
        return texture(pixels: px, width: n, height: n, mipmaps: true)
    }()

    static let linearClamp: MaterialParameters.Texture.Sampler = {
        let d = MTLSamplerDescriptor()
        d.minFilter = .linear
        d.magFilter = .linear
        d.mipFilter = .notMipmapped
        d.sAddressMode = .clampToEdge
        d.tAddressMode = .clampToEdge
        return .init(d)
    }()

    static let linearRepeat: MaterialParameters.Texture.Sampler = {
        let d = MTLSamplerDescriptor()
        d.minFilter = .linear
        d.magFilter = .linear
        d.mipFilter = .linear
        d.sAddressMode = .repeat
        d.tAddressMode = .repeat
        d.maxAnisotropy = 4
        return .init(d)
    }()

    /// RGBA8 pixels (R in the lowest byte, row 0 at the top) as a texture.
    static func texture(pixels: [UInt32], width: Int, height: Int, mipmaps: Bool,
                        semantic: TextureResource.Semantic = .color) -> TextureResource? {
        let data = pixels.withUnsafeBufferPointer { Data(buffer: $0) }
        guard let provider = CGDataProvider(data: data as CFData),
              let image = CGImage(width: width, height: height, bitsPerComponent: 8,
                                  bitsPerPixel: 32, bytesPerRow: width * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                                  provider: provider, decode: nil, shouldInterpolate: true,
                                  intent: .defaultIntent)
        else { return nil }
        return try? TextureResource(image: image, options: .init(
            semantic: semantic, mipmapsMode: mipmaps ? .allocateAndGenerateAll : .none))
    }
}

// MARK: - Materials

/// The materials for one build: standard lit materials over its colour
/// atlas, one per layer, so each layer is a single draw however many kinds
/// of road or building it holds.
@MainActor
struct WorldLooks {
    let ground: PhysicallyBasedMaterial
    let roads: PhysicallyBasedMaterial
    let buildings: PhysicallyBasedMaterial
    let trees: PhysicallyBasedMaterial
    let water: PhysicallyBasedMaterial
    let lights: RealityKit.Material

    init(atlas: ColourAtlas, palette: Palette, hour: TimeOfDay) {
        let n = ColourAtlas.size
        let base = WorldScene.texture(pixels: atlas.pixels, width: n, height: n, mipmaps: false)
        let grade = hour.grade.uiColor

        func lit(roughness: Float, culling: MaterialParameterTypes.FaceCulling) -> PhysicallyBasedMaterial {
            var m = PhysicallyBasedMaterial()
            if let base {
                m.baseColor = .init(tint: grade, texture: .init(base, sampler: WorldScene.linearClamp))
            } else {
                m.baseColor = .init(tint: grade)
            }
            m.roughness = .init(floatLiteral: roughness)
            m.metallic = 0.0
            m.specular = 0.2
            m.faceCulling = culling
            return m
        }
        ground = lit(roughness: 0.92, culling: .none)
        var r = lit(roughness: 0.85, culling: .none)
        if hour.glow > 0 {
            // Lamp-lit streets: a constant warm emission on the street layer
            // alone. Contrast goes UP after dark, which is the point.
            r.emissiveColor = .init(color: UIColor(red: 1, green: 0.84, blue: 0.56, alpha: 1))
            r.emissiveIntensity = hour.glow
        }
        roads = r
        buildings = lit(roughness: 0.72, culling: .back)
        trees = lit(roughness: 0.9, culling: .none)
        // Windows: unlit, so the night's light never dims them.
        var l = UnlitMaterial()
        if let base { l.color = .init(tint: .white, texture: .init(base, sampler: WorldScene.linearClamp)) }
        l.faceCulling = .back
        lights = l

        var w = PhysicallyBasedMaterial()
        let style = palette.worldStyle(buildingScale: 1)
        let tint = style.water.uiColor.withGrade(hour.grade)
        if let rip = WorldScene.ripples {
            w.baseColor = .init(tint: tint, texture: .init(rip, sampler: WorldScene.linearRepeat))
        } else {
            w.baseColor = .init(tint: tint)
        }
        // Matte-ish: a glossy surface mirrored RealityKit's dim default
        // environment and turned the river navy.
        w.roughness = 0.55
        w.metallic = 0.0
        w.specular = 0.25
        w.faceCulling = .none
        water = w
    }
}

extension RGB {
    var uiColor: UIColor { UIColor(red: CGFloat(r), green: CGFloat(g), blue: CGFloat(b), alpha: 1) }
}

extension UIColor {
    func withGrade(_ g: RGB) -> UIColor {
        var r: CGFloat = 0, gg: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &gg, blue: &b, alpha: &a)
        return UIColor(red: r * CGFloat(g.r), green: gg * CGFloat(g.g), blue: b * CGFloat(g.b), alpha: a)
    }
}
