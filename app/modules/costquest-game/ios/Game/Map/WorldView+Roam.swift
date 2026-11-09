import RealityKit
import SwiftUI
import UIKit

/// What Roam adds to the world: Quest Point shrines and the player standing
/// among them.
///
/// Sizes are for the map, not for AR. The camera sits a hundred-odd metres
/// back, so a shrine is building-sized here to read as an object at that
/// distance; the one a player meets through the camera is built separately
/// and is the size of a person.
extension WorldScene {

    /// The entity for one object. Positioned and scaled by the scene.
    /// A public Room: a tall beacon with crossed blades of light and a ring
    /// that keeps pulsing out across the street, so a fight nearby can be
    /// seen from the far end of the map.
    static func roomBeacon(tint: UIColor, id: String) -> Entity {
        let root = Entity()
        let pole = ModelEntity(mesh: .generateCylinder(height: 30, radius: 0.8),
                               materials: [Palette.material(UIColor.white.withAlphaComponent(0.9))])
        pole.position.y = 15
        root.addChild(pole)

        let head = Entity()
        head.position.y = 33
        // A lit orb in the room's colour, with two swords crossed in front
        // of it: white blades, gold guards and grips, so it reads as a fight
        // from across the map rather than as a cross.
        let orb = ModelEntity(mesh: .generateSphere(radius: 6.5), materials: [Palette.material(tint)])
        head.addChild(orb)
        let gold = UIColor(red: 1.0, green: 0.78, blue: 0.18, alpha: 1)
        for angle: Float in [.pi / 4, -.pi / 4] {
            let sword = Entity()
            let blade = ModelEntity(mesh: .generateBox(width: 1.8, height: 15, depth: 0.8, cornerRadius: 0.5),
                                    materials: [Palette.material(UIColor(white: 0.97, alpha: 1))])
            blade.position.y = 3
            sword.addChild(blade)
            let guardBar = ModelEntity(mesh: .generateBox(width: 6, height: 1.4, depth: 1.4, cornerRadius: 0.6),
                                       materials: [Palette.material(gold)])
            guardBar.position.y = -4.8
            sword.addChild(guardBar)
            let grip = ModelEntity(mesh: .generateBox(width: 1.3, height: 4, depth: 1.3, cornerRadius: 0.5),
                                   materials: [Palette.material(gold.scaled(by: 0.75))])
            grip.position.y = -7.3
            sword.addChild(grip)
            let pommel = ModelEntity(mesh: .generateSphere(radius: 1.2), materials: [Palette.material(gold)])
            pommel.position.y = -9.6
            sword.addChild(pommel)
            sword.orientation = simd_quatf(angle: angle, axis: [0, 0, 1])
            sword.position.z = 7
            head.addChild(sword)
        }
        var glow = UnlitMaterial(color: tint.scaled(by: 1.3))
        glow.blending = .transparent(opacity: 0.28)
        let halo = ModelEntity(mesh: .generateSphere(radius: 11), materials: [glow])
        head.addChild(halo)
        head.components.set(InputTargetComponent())
        head.components.set(CollisionComponent(shapes: [.generateSphere(radius: 14)]))
        head.components.set(ObjectID(id: id))
        root.addChild(head)

        let beat = FromToByAnimation<Transform>(
            from: Transform(scale: [1, 1, 1], translation: head.position),
            to: Transform(scale: [1.25, 1.25, 1.25], translation: head.position),
            duration: 0.6, timing: .easeInOut, bindTarget: .transform, repeatMode: .autoReverse)
        if let r = try? AnimationResource.generate(with: beat) { head.playAnimation(r) }

        var ringMat = UnlitMaterial(color: tint)
        ringMat.blending = .transparent(opacity: 0.35)
        let ring = ModelEntity(mesh: .generateCylinder(height: 0.4, radius: 6), materials: [ringMat])
        ring.position.y = 0.5
        root.addChild(ring)
        let spread = FromToByAnimation<Transform>(
            from: Transform(scale: [1, 1, 1], translation: ring.position),
            to: Transform(scale: [4, 1, 4], translation: ring.position),
            duration: 1.6, timing: .easeOut, bindTarget: .transform, repeatMode: .repeat)
        if let r = try? AnimationResource.generate(with: spread) { ring.playAnimation(r) }
        return root
    }

    static func marker(for object: SceneObject) -> Entity {
        let marker = Entity()
        marker.name = "object-\(object.id)"
        marker.components.set(ObjectID(id: object.id))

        // The area a game claims, laid on the ground in its own colour.
        if object.groundRadiusM > 1 {
            var zoneM = UnlitMaterial(color: object.tint)
            zoneM.blending = .transparent(opacity: 0.22)
            let zone = ModelEntity(mesh: .generateCylinder(height: 0.2, radius: object.groundRadiusM),
                                   materials: [zoneM])
            zone.position.y = 0.6
            marker.addChild(zone)
            var edgeM = UnlitMaterial(color: object.tint)
            edgeM.blending = .transparent(opacity: 0.7)
            let edge = ModelEntity(
                mesh: annulus(inner: object.groundRadiusM - 0.6, outer: object.groundRadiusM + 0.6),
                materials: [edgeM])
            edge.position.y = 0.75
            marker.addChild(edge)
        }

        if case .shrine(let dim) = object.style {
            marker.addChild(shrine(tint: object.tint, dim: dim, id: object.id))
            return marker
        }
        if object.style == .room {
            marker.addChild(roomBeacon(tint: object.tint, id: object.id))
            return marker
        }

        // A pole, so the object reads as standing ON a patch of ground rather
        // than hovering over it.
        let pole = ModelEntity(mesh: .generateCylinder(height: 26, radius: 0.7),
                               materials: [Palette.material(UIColor.white.withAlphaComponent(0.85))])
        pole.position.y = 13
        marker.addChild(pole)
        let head = ModelEntity(mesh: .generateSphere(radius: 7),
                               materials: [Palette.material(object.tint)])
        head.name = "crystal"
        head.position.y = 30
        head.components.set(ObjectID(id: object.id))
        marker.addChild(head)
        if object.isLive {
            var glow = UnlitMaterial(color: object.tint)
            glow.blending = .transparent(opacity: 0.22)
            let halo = ModelEntity(mesh: .generateSphere(radius: 12), materials: [glow])
            halo.position.y = 30
            marker.addChild(halo)
        }
        return marker
    }

    static func shrine(tint: UIColor, dim: Bool, id: String) -> Entity {
        let root = Entity()
        let colour = dim ? UIColor(white: 0.66, alpha: 1) : tint

        // A soft contact shadow, so the point stands ON the street.
        if let tex = softDisc {
            var m = UnlitMaterial(color: .black)
            m.blending = .transparent(opacity: .init(scale: 0.32, texture: .init(tex)))
            m.writesDepth = false
            let shadow = ModelEntity(mesh: .generatePlane(width: 16, depth: 16), materials: [m])
            shadow.position.y = 0.62
            root.addChild(shadow)
        }
        // The plinth: a low disc in the point's colour, lightened.
        let plinth = ModelEntity(
            mesh: .generateCylinder(height: 1.0, radius: 5),
            materials: [Palette.material(colour.scaled(by: dim ? 1.0 : 1.18))])
        plinth.position.y = 0.5
        root.addChild(plinth)

        let stem = ModelEntity(mesh: .generateCylinder(height: 12, radius: 0.8),
                               materials: [Palette.material(UIColor(white: 0.97, alpha: 1))])
        stem.position.y = 6.5
        root.addChild(stem)

        // The crystal: a cube stood on its corner, with a soft glow around it.
        let crystal = Entity()
        crystal.name = "crystal"
        crystal.position.y = 19
        // A little light of its own, so the crystal stays saturated at night
        // and in shade: the playable things are the brightest on the map.
        var shellM = PhysicallyBasedMaterial()
        shellM.baseColor = .init(tint: colour)
        shellM.roughness = 0.45
        shellM.metallic = 0.0
        shellM.emissiveColor = .init(color: colour)
        // After dark the crystal is a lamp: the brightest thing on the map.
        shellM.emissiveIntensity = dim ? 0.05 : 0.35 + (WorldScene.nightGlow - 1) * 0.7
        let shell = ModelEntity(mesh: .generateBox(size: 8, cornerRadius: 1.2),
                                materials: [shellM])
        shell.orientation = simd_quatf(angle: .pi / 4, axis: [0, 0, 1])
            * simd_quatf(angle: .pi / 4, axis: [1, 0, 0])
        crystal.addChild(shell)
        if !dim {
            var glow = UnlitMaterial(color: colour.scaled(by: 1.25))
            // A lighter halo at night: a dense one veiled the crystal itself.
            glow.blending = .transparent(opacity: .init(floatLiteral: WorldScene.nightGlow > 1 ? 0.18 : 0.3))
            glow.writesDepth = false
            crystal.addChild(ModelEntity(mesh: .generateSphere(radius: 7.5), materials: [glow]))
        }
        crystal.components.set(ObjectID(id: id))
        root.addChild(crystal)

        // A thin column of light above a live point, like Wizards Unite's: a
        // silhouette you can find from across the district, above the haze.
        if !dim {
            var beam = UnlitMaterial(color: colour.scaled(by: 1.3))
            beam.blending = .transparent(opacity: .init(floatLiteral: min(0.5, 0.2 * WorldScene.nightGlow)))
            beam.writesDepth = false
            let column = ModelEntity(mesh: .generateCylinder(height: 46, radius: 0.75),
                                     materials: [beam])
            column.position.y = 24 + 23
            root.addChild(column)
        }

        // A slow turn: alive, not busy. One animation per crystal, run by
        // RealityKit, so it costs nothing on the main thread.
        if !dim {
            let spin = FromToByAnimation<Transform>(
                from: Transform(rotation: simd_quatf(angle: 0, axis: [0, 1, 0]),
                                translation: crystal.position),
                to: Transform(rotation: simd_quatf(angle: .pi, axis: [0, 1, 0]),
                              translation: crystal.position),
                duration: 3.5, timing: .linear, bindTarget: .transform,
                repeatMode: .repeat)
            if let resource = try? AnimationResource.generate(with: spin) {
                crystal.playAnimation(resource)
            }
        }
        return root
    }
}

/// The player: a figure, its shadow, the way it faces, and its reach.
@MainActor
final class PawnRig {
    let root = Entity()
    let look: PlayerPawn
    private let figure = Entity()
    private let arrow: ModelEntity
    private let pulse: ModelEntity
    private var pulseOpacity = OpacityComponent(opacity: 0)

    init(_ p: PlayerPawn) {
        look = p
        root.name = "player"

        // Contact shadow: the thing that makes a figure stand rather than
        // float, and it costs one transparent quad.
        if let tex = WorldScene.softDisc {
            var m = UnlitMaterial(color: .black)
            m.blending = .transparent(opacity: .init(scale: 0.42, texture: .init(tex)))
            m.writesDepth = false
            let shadow = ModelEntity(mesh: .generatePlane(width: 15, depth: 15), materials: [m])
            shadow.position.y = 0.72
            figure.addChild(shadow)
        }
        // A white foot ring: the player's spot on the board.
        var foot = UnlitMaterial(color: .white)
        foot.blending = .transparent(opacity: 0.9)
        let ring = ModelEntity(mesh: WorldScene.annulus(inner: 4.6, outer: 5.9, segments: 48),
                               materials: [foot])
        ring.position.y = 0.78
        figure.addChild(ring)

        let bodyMesh = MeshResource.generateCone(height: 11, radius: 4.2)
        let headMesh = MeshResource.generateSphere(radius: 3.7)
        // After dark the figure lights itself, like the shrines: the player
        // is never a dim shape on a dark board.
        var bodyM = PhysicallyBasedMaterial()
        bodyM.baseColor = .init(tint: p.tint)
        bodyM.roughness = 0.6
        bodyM.emissiveColor = .init(color: p.tint)
        bodyM.emissiveIntensity = (WorldScene.nightGlow - 1) * 0.7
        let body = ModelEntity(mesh: bodyMesh, materials: [bodyM])
        body.position.y = 5.5
        body.components.set(GroundingShadowComponent(castsShadow: true))
        let head = ModelEntity(mesh: headMesh,
                               materials: [Palette.material(UIColor(white: 0.98, alpha: 1))])
        head.position.y = 13.4
        head.components.set(GroundingShadowComponent(castsShadow: true))
        figure.addChild(body)
        figure.addChild(head)

        // An x-ray ghost of the figure, drawn over everything, so a player
        // standing behind a building still sees where they are.
        var ghost = UnlitMaterial(color: p.tint.scaled(by: 1.15))
        // Strong enough to find at a glance: at 0.32 a player standing in a
        // building's footprint was a faint smudge on the pale day board.
        ghost.blending = .transparent(opacity: 0.5)
        ghost.readsDepth = false
        ghost.writesDepth = false
        let gBody = ModelEntity(mesh: bodyMesh, materials: [ghost])
        gBody.position.y = body.position.y
        let gHead = ModelEntity(mesh: headMesh, materials: [ghost])
        gHead.position.y = head.position.y
        figure.addChild(gBody)
        figure.addChild(gHead)
        root.addChild(figure)

        // Which way they face: a chevron on the ground in front.
        var arrowM = UnlitMaterial(color: p.tint.scaled(by: 1.1))
        arrowM.faceCulling = .none
        arrow = ModelEntity(mesh: PawnRig.chevron(), materials: [arrowM])
        arrow.position.y = 0.85
        root.addChild(arrow)

        // Reach: a hairline ring, never a filled disc (a disc reads as a grey
        // ellipse and vanishes over pale ground), and a pulse running out to
        // it every couple of seconds.
        var rimM = UnlitMaterial(color: .white)
        rimM.blending = .transparent(opacity: .init(floatLiteral: min(0.95, 0.75 * WorldScene.nightGlow)))
        let rim = ModelEntity(mesh: WorldScene.annulus(inner: p.reachM - 0.55, outer: p.reachM + 0.55),
                              materials: [rimM])
        rim.position.y = 0.7
        root.addChild(rim)
        let lift = WorldScene.nightGlow
        var tintRim = UnlitMaterial(color: p.tint.scaled(by: CGFloat(1 + (lift - 1) * 0.25)))
        tintRim.blending = .transparent(opacity: .init(floatLiteral: min(0.85, 0.55 * lift)))
        let inner = ModelEntity(mesh: WorldScene.annulus(inner: p.reachM - 2.2, outer: p.reachM - 0.55),
                                materials: [tintRim])
        inner.position.y = 0.7
        root.addChild(inner)

        var pulseM = UnlitMaterial(color: p.tint.scaled(by: 1.25))
        pulseM.blending = .transparent(opacity: 0.8)
        pulse = ModelEntity(mesh: WorldScene.annulus(inner: 0.975, outer: 1.0), materials: [pulseM])
        pulse.position.y = 0.68
        pulse.components.set(OpacityComponent(opacity: 0))
        root.addChild(pulse)
    }

    func update(at pos: SIMD2<Float>, facing: SIMD2<Float>, time: Double, dt: Double,
                dolly: Float) {
        root.position = SIMD3(pos.x, 0, pos.y)
        // Roughly constant on screen, so the player is findable at any zoom.
        let s = max(0.9, min(1.9, dolly / 150))
        figure.scale = SIMD3(repeating: s)
        // An idle bob: alive, not busy.
        figure.position.y = Float(sin(time * 2.2)) * 0.3 * s
        // Local -z onto the facing direction.
        arrow.orientation = simd_quatf(angle: atan2(-facing.x, -facing.y), axis: [0, 1, 0])
        arrow.scale = SIMD3(repeating: s)

        let period = 2.6
        let phase = Float(time.truncatingRemainder(dividingBy: period) / period)
        let eased = 1 - (1 - phase) * (1 - phase)
        let r = max(0.5, look.reachM * eased)
        pulse.scale = SIMD3(r, 1, r)
        pulseOpacity.opacity = 0.7 * (1 - phase) * min(1, phase * 6)
        pulse.components.set(pulseOpacity)
    }

    /// A flat arrowhead ahead of the figure, pointing along local -z.
    static func chevron() -> MeshResource {
        let p: [SIMD3<Float>] = [
            SIMD3(0, 0, -13.5), SIMD3(-3.4, 0, -8.2), SIMD3(0, 0, -9.6), SIMD3(3.4, 0, -8.2),
        ]
        var d = MeshDescriptor(name: "chevron")
        d.positions = MeshBuffers.Positions(p)
        d.normals = MeshBuffers.Normals(p.map { _ in SIMD3<Float>(0, 1, 0) })
        d.primitives = .triangles([0, 1, 2, 0, 2, 3])
        return (try? MeshResource.generate(from: [d])) ?? .generatePlane(width: 2, depth: 2)
    }
}
