import ARKit
import Foundation
import OSLog
import RealityKit
import UIKit

/// Turns the files on disk into things standing in the field, and keeps the
/// frame rate while doing it.
///
/// Loading fifteen USDZ files is nearly thirty megabytes of geometry and
/// texture through the USD parser. Done naively on the main thread at the
/// moment the player looks up, that is a visible freeze in an AR view, which is
/// the one place a freeze is unforgivable: the camera keeps moving, the world
/// does not, and the illusion is gone. So three things happen here.
///
/// **Loaded once, cloned after.** A pack has repeats, and `clone(recursive:)`
/// shares the underlying mesh and material resources rather than re-parsing the
/// file. Fifteen assets is fifteen parses no matter how many end up on the
/// field.
///
/// **Loaded in the background, attached on the main actor.** RealityKit's async
/// initialiser does its parsing off the main thread; only the attach is a main
/// actor hop, and it is a pointer assignment.
///
/// **Loaded nearest first.** A player facing the lighthouse gets the lighthouse
/// before the bottle behind them, because a field that fills in from where you
/// are looking reads as loading, and one that fills in in manifest order reads
/// as broken.
@MainActor
final class AssetLibrary {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "assets")
    private let pack: ReadyPack

    /// One parsed entity per (asset, level of detail). The prototype is never
    /// put in the scene; every placement gets a clone.
    private var prototypes: [String: Entity] = [:]
    private var inFlight: [String: Task<Entity?, Never>] = [:]

    /// The container standing at each authored point, by anchor id, so a
    /// capture or pickup can be celebrated where it happened.
    private var interactables: [String: Entity] = [:]

    init(pack: ReadyPack) {
        self.pack = pack
        FieldFX.registerOnce()
    }

    /// The level of detail to use at a distance.
    ///
    /// The numbers come from what the decimator actually produced: lod0 is the
    /// full mesh, lod1 roughly a third of it, lod2 a silhouette. A metre-tall
    /// crate at thirty metres is about twelve pixels tall on the screen, which
    /// is why the far tier can be that aggressive without anyone seeing it.
    static func level(forDistance metres: Float) -> Int {
        switch metres {
        case ..<8: 0
        case ..<25: 1
        default: 2
        }
    }

    /// A ready-to-place copy of an asset at a level of detail, or nil if that
    /// file did not make it onto the device.
    func instance(of asset: PackManifest.Asset, lod: Int) async -> Entity? {
        let key = "\(asset.name)#\(lod)"
        if let prototype = prototypes[key] { return prototype.clone(recursive: true) }

        // Two placements of the same asset must not both parse it. The second
        // waits on the first task rather than starting its own.
        let task = inFlight[key] ?? {
            let task = Task<Entity?, Never> { [pack, log] in
                guard let url = pack.url(for: asset, lod: lod) else { return nil }
                do {
                    return try await Entity(contentsOf: url)
                } catch {
                    log.error("could not load \(asset.name) lod\(lod): \(error.localizedDescription)")
                    return nil
                }
            }
            inFlight[key] = task
            return task
        }()

        let loaded = await task.value
        inFlight[key] = nil
        guard let loaded else { return nil }
        prototypes[key] = loaded
        return loaded.clone(recursive: true)
    }

    /// Build the whole field under an origin, nearest first.
    ///
    /// `onPlaced` fires per asset so the loading state can retire the moment
    /// something real is on screen instead of waiting for the last bottle.
    func populate(_ origin: Entity, with layout: VenueLayout,
                  cameraAt camera: SIMD3<Float>,
                  onPlaced: @MainActor (Int, Int) -> Void = { _, _ in }) async {

        let ordered = layout.placements.sorted {
            simd_distance($0.position, camera) < simd_distance($1.position, camera)
        }
        var done = 0
        for placement in ordered {
            let distance = simd_distance(placement.position, camera)
            let lod = Self.level(forDistance: distance)
            guard let entity = await instance(of: placement.asset, lod: lod) else {
                done += 1
                onPlaced(done, ordered.count)
                continue
            }

            FieldFX.ground(entity)
            let placed: Entity
            if let anchor = placement.anchor {
                // Something a player can act on: lifted, bobbing, ringed and
                // lit so it reads as a thing to walk to, not as scenery.
                placed = FieldFX.decorate(entity, placement: placement, anchor: anchor)
                interactables[anchor.id] = placed
            } else {
                entity.name = placement.asset.name
                entity.position = placement.position
                entity.orientation = simd_quatf(angle: placement.yaw, axis: [0, 1, 0])
                entity.scale = SIMD3(repeating: placement.scale)
                placed = entity
            }

            // Collision from the model's own bounds, so a player can be told
            // they are behind cover and so a tap can pick a thing up. Generated
            // rather than authored because the renderer ships no collision
            // geometry and a box around the visual bounds is what the game
            // actually needs.
            // An asset with no visible mesh has empty bounds (infinite or
            // negative extents), and a box built from those is invalid.
            let bounds = placed.visualBounds(relativeTo: placed)
            let extents = bounds.extents
            if !bounds.isEmpty, extents.x.isFinite, extents.y.isFinite, extents.z.isFinite,
               extents.x > 0, extents.y > 0, extents.z > 0 {
                placed.components.set(CollisionComponent(
                    shapes: [.generateBox(size: extents).offsetBy(translation: bounds.center)],
                    mode: .trigger, filter: .init(group: .default, mask: .all)))
                placed.components.set(InputTargetComponent())
            }

            // Grow in rather than pop in.
            let finalScale = placed.scale
            placed.scale = finalScale * 0.01
            origin.addChild(placed)
            var grown = placed.transform
            grown.scale = finalScale
            placed.move(to: grown, relativeTo: placed.parent, duration: 0.45, timingFunction: .easeOut)
            done += 1
            onPlaced(done, ordered.count)
        }
        log.notice("field populated: \(done) of \(ordered.count) placements")
    }

    /// Swap levels of detail as the player moves.
    ///
    /// Called from the render loop, so it does the cheap thing: it compares the
    /// tier an entity is showing against the tier it should show and only then
    /// does any work. The hysteresis matters more than it looks. Without it an
    /// asset sitting exactly on a boundary swaps every frame as the player
    /// breathes, and each swap is a mesh change.
    func refreshLevels(under origin: Entity, layout: VenueLayout,
                       cameraAt camera: SIMD3<Float>) async {
        // Authored points keep the detail they were placed with: they are
        // near by construction, and they carry decoration a swap would lose.
        for placement in layout.placements where placement.anchor == nil {
            guard let current = origin.findEntity(named: placement.asset.name) else { continue }
            let distance = simd_distance(placement.position, camera)
            let showing = shown[placement.asset.name] ?? Self.level(forDistance: distance)
            let wanted = Self.level(forDistance: distance)
            guard wanted != showing else { continue }
            // One metre of dead band around each boundary.
            let boundary: Float = wanted > showing ? (showing == 0 ? 8 : 25)
                                                   : (wanted == 0 ? 8 : 25)
            guard abs(distance - boundary) > 1 else { continue }

            guard let replacement = await instance(of: placement.asset, lod: wanted) else { continue }
            replacement.name = placement.asset.name
            replacement.position = current.position
            replacement.orientation = current.orientation
            replacement.scale = SIMD3(repeating: placement.scale)
            FieldFX.ground(replacement)
            if let collision = current.components[CollisionComponent.self] {
                replacement.components.set(collision)
                replacement.components.set(InputTargetComponent())
            }
            origin.addChild(replacement)
            current.removeFromParent()
            shown[placement.asset.name] = wanted
        }
    }

    private var shown: [String: Int] = [:]

    /// Drop everything that is not currently on the field. Called when memory
    /// gets tight, which on an older phone running a camera, a neural engine
    /// and a renderer is a matter of when.
    /// A celebration at an authored point: an expanding ring on the ground, a
    /// rising column of particles, and the model itself popping.
    func burst(at anchorID: String, color: UIColor, big: Bool) {
        guard let target = interactables[anchorID], let parent = target.parent else { return }
        FieldFX.burst(under: parent, at: target.position, color: color, big: big)
        var pop = target.transform
        let base = pop.scale
        pop.scale = base * 1.25
        target.move(to: pop, relativeTo: parent, duration: 0.12, timingFunction: .easeOut)
        Task { @MainActor [weak target] in
            try? await Task.sleep(for: .milliseconds(140))
            guard let target, let parent = target.parent else { return }
            var back = target.transform
            back.scale = base
            target.move(to: back, relativeTo: parent, duration: 0.3, timingFunction: .easeInOut)
        }
    }

    func dropCaches() {
        prototypes.removeAll(keepingCapacity: false)
        log.notice("asset prototypes dropped under memory pressure")
    }
}


// MARK: - Procedural effects

/// Per-entity animation state for the field's own motion: things that bob,
/// rings that breathe, bursts that grow and fade. One component and one system
/// rather than a RealityKit animation per entity, so there is nothing to
/// restart after a swap and nothing to leak.
struct FieldFXComponent: Component {
    enum Kind {
        /// Bob about a base height, optionally turning slowly.
        case float(baseY: Float, phase: Float, spin: Bool)
        /// Breathe in scale and opacity, for rings under interactables.
        case pulse(phase: Float, opacity: Float)
        /// Grow and fade, then remove itself.
        case burst(age: Float, life: Float, grow: Float, opacity: Float)
        /// Remove after a while (particle emitters).
        case expire(age: Float, life: Float)
    }
    var kind: Kind
}

struct FieldFXSystem: System {
    static let query = EntityQuery(where: .has(FieldFXComponent.self))
    private var time: Double = 0

    init(scene: RealityKit.Scene) {}

    mutating func update(context: SceneUpdateContext) {
        let dt = Float(context.deltaTime)
        time += context.deltaTime
        let t = Float(time)
        // Finished effects are removed after the walk, never during it:
        // mutating the scene graph while the query is being iterated is not
        // something RealityKit promises to tolerate.
        var finished: [Entity] = []
        defer { for entity in finished { entity.removeFromParent() } }
        for entity in context.entities(matching: Self.query, updatingSystemWhen: .rendering) {
            guard var fx = entity.components[FieldFXComponent.self] else { continue }
            switch fx.kind {
            case let .float(baseY, phase, spin):
                entity.position.y = baseY + 0.05 * sin(t * 2.1 + phase)
                if spin {
                    entity.orientation = simd_quatf(angle: t * 0.9 + phase, axis: [0, 1, 0])
                }
            case let .pulse(phase, opacity):
                let k = 0.5 + 0.5 * sin(t * 3 + phase)
                let s = 1 + 0.12 * k
                entity.scale = [s, 1, s]
                entity.components.set(OpacityComponent(opacity: opacity * (0.55 + 0.45 * k)))
            case let .burst(age, life, grow, opacity):
                let now = age + dt
                let k = min(now / life, 1)
                let eased = 1 - (1 - k) * (1 - k)
                let s = 1 + grow * eased
                entity.scale = [s, 1, s]
                entity.components.set(OpacityComponent(opacity: opacity * (1 - k)))
                if now >= life { finished.append(entity); continue }
                fx.kind = .burst(age: now, life: life, grow: grow, opacity: opacity)
                entity.components.set(fx)
            case let .expire(age, life):
                let now = age + dt
                if now >= life { finished.append(entity); continue }
                fx.kind = .expire(age: now, life: life)
                entity.components.set(fx)
            }
        }
    }
}

@MainActor
enum FieldFX {
    private static var registered = false

    static func registerOnce() {
        guard !registered else { return }
        registered = true
        FieldFXComponent.registerComponent()
        FieldFXSystem.registerSystem()
    }

    /// Grounding shadows on every mesh under an entity, so models sit on the
    /// floor instead of floating over the camera image.
    static func ground(_ entity: Entity) {
        if entity.components.has(ModelComponent.self) {
            entity.components.set(GroundingShadowComponent(castsShadow: true))
        }
        for child in entity.children { ground(child) }
    }

    static func tint(for kind: String) -> UIColor {
        switch kind {
        case "weapon": UIColor(red: 1.0, green: 0.62, blue: 0.18, alpha: 1)
        case "trivia": UIColor(red: 0.30, green: 0.85, blue: 1.0, alpha: 1)
        case "capture_point": UIColor(red: 1.0, green: 0.86, blue: 0.35, alpha: 1)
        default: UIColor(white: 1, alpha: 1)
        }
    }

    static func glowMaterial(_ color: UIColor, opacity: Float) -> UnlitMaterial {
        var m = UnlitMaterial(color: color)
        m.blending = .transparent(opacity: .init(floatLiteral: opacity))
        return m
    }

    /// Wrap an interactable model: container (named, positioned, collided)
    /// holding a bobbing pivot with the model, a breathing ring on the floor,
    /// and for capture points a faint beacon of light, Pokemon GO style.
    static func decorate(_ model: Entity, placement: VenueLayout.Placement,
                         anchor: GameAnchor) -> Entity {
        let container = Entity()
        container.name = placement.asset.name
        container.position = placement.position

        let tint = tint(for: anchor.kind)
        let seed = Float(abs(anchor.id.hashValue % 628)) / 100

        let pivot = Entity()
        model.orientation = simd_quatf(angle: placement.yaw, axis: [0, 1, 0])
        model.scale = SIMD3(repeating: placement.scale)
        pivot.addChild(model)
        container.addChild(pivot)

        let bobs = anchor.kind != "capture_point"
        if bobs {
            let lift: Float = 0.12
            pivot.position.y = lift
            pivot.components.set(FieldFXComponent(kind: .float(baseY: lift, phase: seed,
                                                                spin: anchor.kind == "weapon")))
        }

        // Ring sized to the model's footprint, within reason.
        let bounds = model.visualBounds(relativeTo: container)
        let footprint = max(bounds.extents.x, bounds.extents.z) * 0.5
        let radius = min(max(footprint * 1.2, 0.35), 1.4)
        let ring = ModelEntity(mesh: .generateCylinder(height: 0.004, radius: radius),
                               materials: [glowMaterial(tint, opacity: 0.45)])
        ring.position.y = 0.01
        ring.components.set(FieldFXComponent(kind: .pulse(phase: seed, opacity: 0.6)))
        container.addChild(ring)

        let core = ModelEntity(mesh: .generateCylinder(height: 0.005, radius: radius * 0.55),
                               materials: [glowMaterial(tint, opacity: 0.35)])
        core.position.y = 0.012
        container.addChild(core)

        if anchor.kind == "capture_point" {
            let beacon = ModelEntity(mesh: .generateCylinder(height: 2.4, radius: 0.05),
                                     materials: [glowMaterial(tint, opacity: 0.22)])
            beacon.position.y = 1.2
            container.addChild(beacon)
        }
        return container
    }

    /// An expanding ring and a rising column of sparks at a point.
    static func burst(under parent: Entity, at position: SIMD3<Float>,
                      color: UIColor, big: Bool) {
        let ring = ModelEntity(mesh: .generateCylinder(height: 0.006, radius: big ? 0.5 : 0.3),
                               materials: [glowMaterial(color, opacity: 0.9)])
        ring.position = SIMD3(position.x, position.y + 0.02, position.z)
        ring.components.set(FieldFXComponent(kind: .burst(age: 0, life: big ? 1.1 : 0.7,
                                                          grow: big ? 5 : 3, opacity: 0.9)))
        parent.addChild(ring)

        if big {
            let column = ModelEntity(mesh: .generateCylinder(height: 3, radius: 0.18),
                                     materials: [glowMaterial(color, opacity: 0.5)])
            column.position = SIMD3(position.x, position.y + 1.5, position.z)
            column.components.set(FieldFXComponent(kind: .burst(age: 0, life: 1.4,
                                                                grow: 0.6, opacity: 0.55)))
            parent.addChild(column)
        }

        let sparks = Entity()
        sparks.position = position
        var emitter = ParticleEmitterComponent()
        emitter.emitterShape = .cylinder
        emitter.birthLocation = .surface
        emitter.emitterShapeSize = big ? [0.5, 0.05, 0.5] : [0.25, 0.05, 0.25]
        emitter.emissionDirection = [0, 1, 0]
        emitter.speed = big ? 1.6 : 1.0
        emitter.speedVariation = 0.4
        emitter.timing = .once(warmUp: nil, emit: .init(duration: big ? 0.7 : 0.35))
        emitter.mainEmitter.birthRate = big ? 500 : 250
        emitter.mainEmitter.lifeSpan = big ? 1.4 : 0.8
        emitter.mainEmitter.size = big ? 0.03 : 0.02
        emitter.mainEmitter.color = .constant(.single(color))
        emitter.mainEmitter.blendMode = .additive
        emitter.mainEmitter.acceleration = [0, big ? 0.6 : -0.8, 0]
        sparks.components.set(emitter)
        sparks.components.set(FieldFXComponent(kind: .expire(age: 0, life: 2.5)))
        parent.addChild(sparks)
    }
}
