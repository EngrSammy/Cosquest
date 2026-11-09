import ARKit
import AVFoundation
import RealityKit
import SwiftUI
import UIKit

/// The shrine a player meets at a Quest Point, and the stage it stands on.
///
/// On a phone the stage is the camera: the shrine is placed on the floor about
/// a metre and a half ahead, person-sized, so the moment of arriving at a
/// point is a thing in the room rather than a card on a screen. In the
/// simulator, which has no camera, the same shrine stands on a rendered stage,
/// so the whole flow can still be built and checked on a Mac.
///
/// World tracking only, never geo anchoring. Apple's geo tracking needs street
/// imagery a car can drive past and fails indoors, and a Quest Point is
/// often exactly where it does not work. The shrine does not need to be at a
/// surveyed coordinate; it needs to be in front of the player.
@MainActor
final class ShrineScene {
    let root = Entity()
    /// The camera view, when there is one, for a photo of the moment.
    weak var arView: ARView?
    private let crystal = Entity()
    private let shell: ModelEntity
    private let tint: UIColor

    /// The Warden wears the player's faction colour; the shrine its tier's.
    private let wardenTint: UIColor

    init(tint: UIColor, wardenTint: UIColor? = nil) {
        self.tint = tint
        self.wardenTint = wardenTint ?? tint

        let plinth = ModelEntity(
            mesh: .generateCylinder(height: 0.08, radius: 0.32),
            materials: [Self.lit(UIColor(white: 0.95, alpha: 1))])
        plinth.position.y = 0.04
        root.addChild(plinth)
        var ring = UnlitMaterial(color: tint)
        ring.blending = .transparent(opacity: 0.5)
        let glowRing = ModelEntity(mesh: .generateCylinder(height: 0.01, radius: 0.55),
                                   materials: [ring])
        glowRing.position.y = 0.005
        root.addChild(glowRing)

        let stem = ModelEntity(mesh: .generateCylinder(height: 0.6, radius: 0.035),
                               materials: [Self.lit(UIColor(white: 0.97, alpha: 1))])
        stem.position.y = 0.38
        root.addChild(stem)

        shell = ModelEntity(mesh: .generateBox(size: 0.26, cornerRadius: 0.03),
                            materials: [Self.lit(tint, metallic: true)])
        shell.orientation = simd_quatf(angle: .pi / 4, axis: [0, 0, 1])
            * simd_quatf(angle: .pi / 4, axis: [1, 0, 0])
        crystal.addChild(shell)
        var glow = UnlitMaterial(color: tint)
        glow.blending = .transparent(opacity: 0.28)
        crystal.addChild(ModelEntity(mesh: .generateSphere(radius: 0.24), materials: [glow]))
        crystal.position.y = 0.98
        root.addChild(crystal)

        // Motes drifting up around the crystal: the thing that says "alive".
        var motes = ParticleEmitterComponent.Presets.magic
        motes.mainEmitter.color = .constant(.single(tint))
        motes.emitterShapeSize = [0.3, 0.3, 0.3]
        motes.mainEmitter.birthRate = 60
        let emitter = Entity()
        emitter.components.set(motes)
        emitter.position.y = 0.9
        root.addChild(emitter)

        spin()
        buildWarden()
    }

    // MARK: - The Warden, standing beside its shrine

    private let warden = Entity()
    private var wardenHead: ModelEntity?
    private var wardenMouth: ModelEntity?

    /// A hooded spirit, a little taller than the shrine and to its left,
    /// turned toward the player. Drawn from primitives in the shrine's colour
    /// so it needs no asset and reads at any distance.
    private func buildWarden() {
        warden.position = [-0.58, 0, -0.08]
        warden.scale = [0.72, 0.72, 0.72]
        let c = wardenTint
        let robe = ModelEntity(mesh: .generateCone(height: 0.95, radius: 0.24),
                               materials: [Self.lit(c.scaled(by: 0.75))])
        robe.position.y = 0.55
        warden.addChild(robe)
        // Hood: a sphere, with the face set into its front.
        let hood = ModelEntity(mesh: .generateSphere(radius: 0.18),
                               materials: [Self.lit(c.scaled(by: 0.9))])
        hood.position.y = 1.12
        warden.addChild(hood)
        let face = ModelEntity(mesh: .generateBox(width: 0.2, height: 0.17, depth: 0.02,
                                                  cornerRadius: 0.08),
                               materials: [UnlitMaterial(color: UIColor(red: 0.05, green: 0.07,
                                                                        blue: 0.16, alpha: 1))])
        face.position = [0, 1.11, 0.165]
        warden.addChild(face)
        // Eyes that glow in the faction's colour, brightened.
        for x: Float in [-0.045, 0.045] {
            let eye = ModelEntity(mesh: .generateBox(width: 0.034, height: 0.06, depth: 0.012,
                                                     cornerRadius: 0.016),
                                  materials: [UnlitMaterial(color: c.scaled(by: 1.6))])
            eye.position = [x, 1.13, 0.178]
            warden.addChild(eye)
        }
        let mouth = ModelEntity(mesh: .generateBox(width: 0.05, height: 0.012, depth: 0.01,
                                                   cornerRadius: 0.006),
                                materials: [UnlitMaterial(color: .white)])
        mouth.position = [0, 1.07, 0.178]
        warden.addChild(mouth)
        wardenMouth = mouth
        wardenHead = hood
        // Turned a little toward the player and the shrine both.
        warden.orientation = simd_quatf(angle: 0.35, axis: [0, 1, 0])
        var up = warden.transform
        up.translation.y += 0.05
        let bob = FromToByAnimation<Transform>(from: warden.transform, to: up, duration: 1.4,
                                               timing: .easeInOut, bindTarget: .transform,
                                               repeatMode: .autoReverse)
        if let res = try? AnimationResource.generate(with: bob) { warden.playAnimation(res) }
        root.addChild(warden)
    }

    /// Talk: the mouth opens and glows with each word.
    func setSpeaking(_ level: Double) {
        let l = Float(max(0, min(1, level)))
        wardenMouth?.scale = [1 + l * 0.8, 1 + l * 3.5, 1]
    }

    private static func lit(_ c: UIColor, metallic: Bool = false) -> RealityKit.Material {
        var m = SimpleMaterial(color: c, isMetallic: metallic)
        m.roughness = metallic ? 0.25 : 0.6
        return m
    }

    private func spin() {
        let base = crystal.transform
        var up = base
        up.translation.y += 0.06
        up.rotation = simd_quatf(angle: .pi, axis: [0, 1, 0])
        let turn = FromToByAnimation<Transform>(
            from: base, to: up, duration: 1.8, timing: .easeInOut,
            bindTarget: .transform, repeatMode: .autoReverse)
        if let res = try? AnimationResource.generate(with: turn) {
            crystal.playAnimation(res)
        }
    }

    /// One beat of the Strike: the crystal swells and flashes.
    func pulse(_ i: Int) {
        var up = crystal.transform
        let k: Float = 1.12 + Float(i) * 0.06
        up.scale = [k, k, k]
        crystal.move(to: up, relativeTo: crystal.parent, duration: 0.12, timingFunction: .easeOut)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(140))
            var back = self.crystal.transform
            back.scale = [1, 1, 1]
            self.crystal.move(to: back, relativeTo: self.crystal.parent, duration: 0.18,
                              timingFunction: .easeIn)
        }
    }

    /// Whole again, for a second chance.
    func reset() {
        var t = crystal.transform
        t.scale = [1, 1, 1]
        crystal.move(to: t, relativeTo: crystal.parent, duration: 0.3, timingFunction: .easeOut)
        spin()
    }

    /// A photo of the shrine and the Warden standing in the player's world.
    func photo() async -> UIImage? {
        guard let arView else { return nil }
        return await withCheckedContinuation { c in
            arView.snapshot(saveToHDR: false) { @Sendable image in c.resume(returning: image) }
        }
    }

    /// The crystal breaks open: a burst for a win, a fizzle for a miss.
    func resolve(correct: Bool) {
        var burst = ParticleEmitterComponent.Presets.sparks
        burst.mainEmitter.color = .constant(.single(correct ? tint : UIColor(white: 0.7, alpha: 1)))
        burst.burstCount = correct ? 900 : 150
        burst.emitterShape = .sphere
        burst.emitterShapeSize = [0.2, 0.2, 0.2]
        burst.isEmitting = false
        burst.speed = correct ? 1.6 : 0.5
        let e = Entity()
        e.components.set(burst)
        e.position = crystal.position
        root.addChild(e)
        if var c = e.components[ParticleEmitterComponent.self] {
            c.burst()
            e.components.set(c)
        }
        crystal.stopAllAnimations()
        var t = crystal.transform
        t.scale = correct ? [0.01, 0.01, 0.01] : [0.7, 0.7, 0.7]
        crystal.move(to: t, relativeTo: crystal.parent, duration: 0.45, timingFunction: .easeIn)
    }
}

/// The camera (or the rendered stage), with the shrine in it.
struct ShrineStage: View {
    let scene: ShrineScene
    /// Off: the shrine on a rendered stage even on a phone that can do AR.
    var useAR = true
    /// Set once the shrine is standing, so the interface can say "tap it".
    var onPlaced: () -> Void = {}

    var body: some View {
        #if targetEnvironment(simulator)
        SimulatedStage(scene: scene, onPlaced: onPlaced)
        #else
        // Without the camera the shrine still has to stand somewhere, or the
        // point can never be played on this phone at all.
        let camera = AVCaptureDevice.authorizationStatus(for: .video)
        if useAR, ARWorldTrackingConfiguration.isSupported, camera != .denied, camera != .restricted {
            ShrineARView(scene: scene, onPlaced: onPlaced).ignoresSafeArea()
        } else {
            SimulatedStage(scene: scene, onPlaced: onPlaced)
        }
        #endif
    }
}

/// No camera: the shrine on a lit stage under the game's sky.
private struct SimulatedStage: View {
    let scene: ShrineScene
    var onPlaced: () -> Void

    var body: some View {
        ZStack {
            GameBackdrop()
            RealityView { content in
                content.camera = .virtual
                let holder = Entity()
                holder.addChild(scene.root)
                scene.root.position = [0, -0.7, -2.3]
                let sun = DirectionalLight()
                sun.light.intensity = 3200
                sun.look(at: [0, 0, -2], from: [1.5, 3, 1], relativeTo: nil)
                holder.addChild(sun)
                let camera = PerspectiveCamera()
                camera.position = [0, 0.1, 0.4]
                holder.addChild(camera)
                content.add(holder)
            }
            .ignoresSafeArea()
        }
        .task {
            try? await Task.sleep(for: .milliseconds(500))
            onPlaced()
        }
    }
}

/// The real thing: world tracking, a floor, the shrine on it.
private struct ShrineARView: UIViewRepresentable {
    let scene: ShrineScene
    var onPlaced: () -> Void

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal]
        config.environmentTexturing = .automatic
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth) {
            config.frameSemantics.insert(.personSegmentationWithDepth)
        }
        // Real occlusion needs the scene mesh, which needs LiDAR: without it
        // the occlusion flag hides nothing. Pro phones get the real thing.
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
            view.environment.sceneUnderstanding.options.insert(.occlusion)
        }
        view.renderOptions.insert(.disableMotionBlur)
        view.session.run(config)
        scene.arView = view
        context.coordinator.start(view: view)
        return view
    }

    func updateUIView(_ view: ARView, context: Context) {}

    static func dismantleUIView(_ view: ARView, coordinator: Coordinator) {
        coordinator.stop()
        view.session.pause()
    }

    func makeCoordinator() -> Coordinator { Coordinator(scene: scene, onPlaced: onPlaced) }

    @MainActor
    final class Coordinator {
        let scene: ShrineScene
        let onPlaced: () -> Void
        private var task: Task<Void, Never>?

        init(scene: ShrineScene, onPlaced: @escaping () -> Void) {
            self.scene = scene
            self.onPlaced = onPlaced
        }

        /// Look for the floor ahead for a few seconds; if none turns up, stand
        /// the shrine where a floor would be. A player at a point should never
        /// be left waiting on plane detection with nothing on screen.
        func start(view: ARView) {
            task = Task { @MainActor [weak view] in
                try? await Task.sleep(for: .milliseconds(700))
                // Wait for the camera itself (a permission prompt, a slow
                // start) before the placement clock starts; placing against a
                // session with no frames placed nothing and said "tap it".
                for _ in 0..<120 {
                    guard let view, !Task.isCancelled else { return }
                    if view.session.currentFrame != nil { break }
                    try? await Task.sleep(for: .milliseconds(250))
                }
                for attempt in 0..<16 {
                    guard let view, !Task.isCancelled else { return }
                    let centre = CGPoint(x: view.bounds.midX, y: view.bounds.midY * 1.25)
                    if let hit = view.raycast(from: centre, allowing: .estimatedPlane,
                                              alignment: .horizontal).first,
                       let cam = view.session.currentFrame?.camera.transform {
                        let p = hit.worldTransform.columns.3
                        let c = cam.columns.3
                        let d = simd_distance(SIMD2(p.x, p.z), SIMD2(c.x, c.z))
                        if d > 0.6 && d < 4 {
                            place(in: view, at: SIMD3(p.x, p.y, p.z), facing: SIMD3(c.x, c.y, c.z))
                            return
                        }
                    }
                    if attempt == 15 { break }
                    try? await Task.sleep(for: .milliseconds(350))
                }
                guard let view, let cam = view.session.currentFrame?.camera.transform else {
                    // No frame at all: the session never started. Say the
                    // shrine is placed anyway so the challenge can still run.
                    onPlaced()
                    return
                }
                // No floor found: 1.5 m ahead, 1.2 m below the phone.
                let fwd = -SIMD3(cam.columns.2.x, 0, cam.columns.2.z)
                let dir = simd_length(fwd) > 0.01 ? simd_normalize(fwd) : SIMD3<Float>(0, 0, -1)
                let c = SIMD3(cam.columns.3.x, cam.columns.3.y, cam.columns.3.z)
                place(in: view, at: c + dir * 1.5 + SIMD3(0, -1.2, 0), facing: c)
            }
        }

        private func place(in view: ARView, at p: SIMD3<Float>, facing eye: SIMD3<Float>) {
            let anchor = AnchorEntity(world: p)
            anchor.addChild(scene.root)
            // Turn to face the player, on the vertical axis only.
            let toEye = SIMD2(eye.x - p.x, eye.z - p.z)
            scene.root.orientation = simd_quatf(angle: atan2(toEye.x, toEye.y), axis: [0, 1, 0])
            view.scene.addAnchor(anchor)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            onPlaced()
        }

        func stop() { task?.cancel() }
    }
}
