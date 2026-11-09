import ARKit
import AVFoundation
import Combine
import CoreImage
import ExpoModulesCore
import ImageIO
import Metal
import RealityKit
import UIKit
import UniformTypeIdentifiers

// "See it here": a Forge character or weapon standing in the player's room,
// through the camera (phone-hardware design 2.3 and 2.4, Phase 2 step 1). The
// RN screen (components/game/SummonAR.tsx) draws the chrome; this view is the
// camera, the model and the captures.
//
// - ARKit world tracking, horizontal planes, Apple's coaching overlay until a
//   floor is found; the model drops onto it at true scale (a character ~1.8 m)
//   facing the player, with a little landing dust. No floor in ten seconds:
//   it stands on the floor where one would be, like the shrine (ShrineStage).
// - Drag moves it along the floor, a twist turns it, a pinch scales it between
//   minScale and maxScale (tabletop to a bit over life size); a tap on the
//   floor walks it there; a double tap celebrates.
// - Environment texturing (reflections), people occlusion where the phone can
//   (A12+), LiDAR scene reconstruction and occlusion on Pro phones, grounding
//   shadow plus a soft contact shadow. Serious thermal state drops the
//   occlusion work, as ARSessionController's ladder does.
// - The model's own idle clip when the USDZ carries one (the 1 Nov 2026
//   staging USDZs do not: game3d/tools/look/usdz.py exported with
//   export_animation=False), otherwise a gentle procedural sway. Reduce
//   Motion: still.
// - photo(): the AR render only (no buttons), with a small CosQuest mark, as a
//   JPEG with no metadata at all (no GPS). startVideo()/stopVideo(): an H.264
//   MP4 of the AR render from ARView's post-process hook, no audio, no
//   metadata, at most ~10.5 s.
//
// requireNativeView("CostQuestGame", "CostQuestSummonView"): props uri (a
// downloaded .usdz, file://), kind, name, heightM, minScale, maxScale, tint,
// reveal; events onSummonState, onSummonTap; view functions photo,
// startVideo, stopVideo, celebrate, recenter, hold.
//
// reveal (the Guardian reveal before a fight, phone-hardware design 2.5,
// Phase 2 step 2; components/game/FightReveal.tsx): the same camera, model,
// occlusion and photo, staged as a short moment instead of a toy. No coaching
// overlay and no gestures; the Guardian stands ~3 m ahead (a floor found in
// ~3.5 s, else where one would be), rises out of the ground through an
// occluder with dust and a ring of sparks, then sways. A tap on it is
// onSummonTap (the screen's Fight). No haptic here: the screen buzzes on
// "placed" through the player's haptics setting. hold() pauses the session
// (the last camera frame stays) while the fight takes over.

public final class CostQuestSummonView: ExpoView {
  let onSummonState = EventDispatcher()
  let onSummonTap = EventDispatcher()

  var uri: String? { didSet { if uri != oldValue { dirty = true } } }
  var kind = "character" { didSet { if kind != oldValue { dirty = true } } }
  var name = ""
  /// The height to stand at in metres (the catalogue's bounds); 0: the model's own.
  var heightM: Float = 0 { didSet { if heightM != oldValue { dirty = true } } }
  var minScale: Float = 0.1
  var maxScale: Float = 1.5
  var tint = UIColor(red: 1.0, green: 0.78, blue: 0.2, alpha: 1)
  /// The Guardian reveal before a fight (see the header): staged, no gestures.
  var reveal = false { didSet { if reveal != oldValue { dirty = true } } }

  private var dirty = true
  private var asking = false
  private var arView: ARView?
  private var coaching: ARCoachingOverlayView?
  private var subscriptions: [Cancellable] = []
  private var thermalObserver: NSObjectProtocol?
  private var loadTask: Task<Void, Never>?
  private var placeTask: Task<Void, Never>?
  private let recorder = SummonRecorder()

  // anchor -> body (gestures, contact shadow) -> lift (drop, hop) -> sway (idle) -> model
  private var anchor: AnchorEntity?
  private var body: ModelEntity?
  private var lift = Entity()
  private var sway = Entity()
  private var gesturesOn = false
  private var model: Entity?
  private var idleClip: AnimationResource?
  private var celebrateClip: AnimationResource?
  private var placed = false
  private var richSession = true
  private var clock: Double = 0
  private var dropFrom: (start: Double, height: Float)?
  private var hopStart: Double?
  private var hoverY: Float = 0
  private var modelHeight: Float = 1.8
  /// The reveal's rise out of the ground (clock time it began), and what hides the part still below.
  private var riseStart: Double?
  private var occluder: ModelEntity?
  private static let riseSeconds = 1.1

  private var isWeapon: Bool { kind == "weapon" }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    arView?.frame = bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      teardown()
      dirty = true
    } else {
      propsDone()
    }
  }

  /// After a batch of props, and when the view reaches a window.
  func propsDone() {
    // Nothing until it is on screen and has its file (props can trail the window).
    guard dirty, window != nil, uri != nil else { return }
    #if targetEnvironment(simulator)
    dirty = false
    send("failed", reason: "simulator")
    #else
    guard ARWorldTrackingConfiguration.isSupported else {
      dirty = false
      send("failed", reason: "unsupported")
      return
    }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .notDetermined:
      guard !asking else { return }
      asking = true
      AVCaptureDevice.requestAccess(for: .video) { _ in
        DispatchQueue.main.async {
          MainActor.assumeIsolated {
            self.asking = false
            self.propsDone()
          }
        }
      }
      return
    case .denied, .restricted:
      dirty = false
      send("denied")
      return
    default:
      break
    }
    dirty = false
    start()
    #endif
  }

  nonisolated static var arSupported: Bool { ARWorldTrackingConfiguration.isSupported }
  nonisolated static var lidar: Bool { ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) }

  // MARK: - Session

  private func start() {
    teardown()
    guard let uri, let url = URL(string: uri), url.isFileURL,
          FileManager.default.fileExists(atPath: url.path) else {
      send("failed", reason: "nofile")
      return
    }
    let view = ARView(frame: bounds, cameraMode: .ar, automaticallyConfigureSession: false)
    view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.renderOptions = [.disableMotionBlur, .disableDepthOfField, .disableFaceMesh]
    insertSubview(view, at: 0)
    arView = view
    richSession = ProcessInfo.processInfo.thermalState.rawValue < ProcessInfo.ThermalState.serious.rawValue
    runSession()

    // Apple's coaching overlay: players have seen it in every AR app, and it
    // knows each tracking problem's animation. Only until the model stands.
    // The reveal is a few seconds long: no lesson, the Guardian just comes.
    if !reveal {
      let coach = ARCoachingOverlayView()
      coach.sessionProvider = view
      coach.goal = .horizontalPlane
      coach.activatesAutomatically = true
      coach.frame = view.bounds
      coach.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      view.addSubview(coach)
      coaching = coach
    }

    let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
    if !reveal {
      let double = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
      double.numberOfTapsRequired = 2
      view.addGestureRecognizer(double)
      tap.require(toFail: double)
    }
    view.addGestureRecognizer(tap)

    subscriptions.append(view.scene.subscribe(to: SceneEvents.Update.self) { @Sendable [weak self] event in
      let dt = event.deltaTime
      if Thread.isMainThread {
        MainActor.assumeIsolated { self?.tick(dt) }
      } else {
        DispatchQueue.main.async { self?.tick(dt) }
      }
    })
    thermalObserver = NotificationCenter.default.addObserver(
      forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.thermalChanged() }
    }
    send("looking")

    loadTask = Task { @MainActor [weak self] in
      guard let entity = try? await Entity(contentsOf: url) else {
        self?.send("failed", reason: "load")
        return
      }
      guard let self, !Task.isCancelled else { return }
      self.prepare(entity)
      self.findFloor()
    }
  }

  private func runSession() {
    guard let view = arView else { return }
    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal]
    config.environmentTexturing = .automatic
    if richSession, ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth) {
      config.frameSemantics.insert(.personSegmentationWithDepth)
    }
    // The LiDAR mesh hides the model behind a real sofa or doorframe; it does
    // nothing on screen unless RealityKit is told to use it for occlusion.
    if richSession, Self.lidar {
      config.sceneReconstruction = .mesh
      view.environment.sceneUnderstanding.options = [.occlusion]
    } else {
      view.environment.sceneUnderstanding.options = []
    }
    view.session.run(config)
  }

  private func thermalChanged() {
    let rich = ProcessInfo.processInfo.thermalState.rawValue < ProcessInfo.ThermalState.serious.rawValue
    guard rich != richSession else { return }
    richSession = rich
    runSession()
    send(placed ? "placed" : "looking")
  }

  private func teardown() {
    loadTask?.cancel()
    placeTask?.cancel()
    loadTask = nil
    placeTask = nil
    subscriptions.forEach { $0.cancel() }
    subscriptions.removeAll()
    if let thermalObserver { NotificationCenter.default.removeObserver(thermalObserver) }
    thermalObserver = nil
    recorder.cancel()
    if let arView {
      arView.renderCallbacks.postProcess = nil
      arView.session.pause()
      arView.removeFromSuperview()
    }
    arView = nil
    coaching = nil
    anchor = nil
    body = nil
    model = nil
    idleClip = nil
    celebrateClip = nil
    placed = false
    dropFrom = nil
    hopStart = nil
    riseStart = nil
    occluder = nil
    gesturesOn = false
    lift = Entity()
    sway = Entity()
  }

  // MARK: - The model

  private func prepare(_ entity: Entity) {
    let raw = entity.visualBounds(relativeTo: nil)
    let ext = raw.extents
    var scale: Float = 1
    if isWeapon {
      // A weapon at its own size when that is believable, else about a metre.
      let longest = max(ext.x, ext.y, ext.z)
      if longest > 0, longest < 0.2 || longest > 2.5 { scale = 1.0 / longest }
    } else if ext.y > 0 {
      // A character at the catalogue's height (true scale); a model whose own
      // units are off stands at 1.8 m.
      let own = ext.y
      let want: Float = heightM > 0.3 && heightM < 4 ? heightM : (own > 0.5 && own < 3 ? own : 1.8)
      scale = want / own
    }
    entity.scale = SIMD3(repeating: scale)
    // Feet on the floor, centred on the pivot.
    entity.position = SIMD3(-raw.center.x * scale, -raw.min.y * scale, -raw.center.z * scale)
    modelHeight = ext.y * scale
    Self.castShadows(entity)

    let clips = entity.availableAnimations
    idleClip = clips.first { ($0.name ?? "").lowercased().contains("idle") } ?? clips.first
    celebrateClip = clips.first { ($0.name ?? "").lowercased().contains("celebrate") }

    let body = ModelEntity()
    let footprint = isWeapon ? max(ext.x, ext.z) * scale * 0.7 : max(ext.x, ext.z) * scale * 0.55
    body.addChild(Self.contactShadow(diameter: max(0.25, footprint)))
    hoverY = isWeapon ? 0.9 : 0
    lift.position.y = hoverY
    sway.addChild(entity)
    lift.addChild(sway)
    body.addChild(lift)
    // Gestures need a collision shape: the model's box, standing on the floor.
    let size = SIMD3<Float>(max(ext.x * scale, 0.3), max(ext.y * scale, 0.3), max(ext.z * scale, 0.3))
    body.collision = CollisionComponent(shapes: [
      ShapeResource.generateBox(size: size).offsetBy(translation: [0, hoverY + size.y / 2, 0]),
    ])
    if reveal && !isWeapon {
      // The rise out of the ground: an invisible box under the floor hides
      // the part of the Guardian still below it (the camera image shows through).
      let w = min(2.0, max(0.8, max(ext.x, ext.z) * scale * 1.6))
      let h = ext.y * scale + 0.3
      let box = ModelEntity(mesh: .generateBox(width: w, height: h, depth: w), materials: [OcclusionMaterial()])
      box.position.y = -h / 2 - 0.002
      box.isEnabled = false
      body.addChild(box)
      occluder = box
    }
    self.body = body
    model = entity
    if let idleClip, !UIAccessibility.isReduceMotionEnabled {
      entity.playAnimation(idleClip.repeat(), transitionDuration: 0.25, startsPaused: false)
    }
  }

  private static func castShadows(_ e: Entity) {
    if e.components.has(ModelComponent.self) {
      e.components.set(GroundingShadowComponent(castsShadow: true))
    }
    for child in e.children { castShadows(child) }
  }

  /// A soft dark disc under the feet: contact, wherever the real floor is.
  private static func contactShadow(diameter: Float) -> ModelEntity {
    let plane = ModelEntity(mesh: .generatePlane(width: diameter, depth: diameter))
    plane.position.y = 0.003
    let px = 128
    let image = UIGraphicsImageRenderer(size: CGSize(width: px, height: px)).image { ctx in
      let colours = [UIColor(white: 0, alpha: 0.55).cgColor, UIColor(white: 0, alpha: 0).cgColor] as CFArray
      if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colours, locations: [0, 1]) {
        let c = CGPoint(x: px / 2, y: px / 2)
        ctx.cgContext.drawRadialGradient(gradient, startCenter: c, startRadius: 0, endCenter: c,
                                         endRadius: CGFloat(px) / 2, options: [])
      }
    }
    if let cg = image.cgImage,
       let texture = try? TextureResource(image: cg, options: .init(semantic: .color)) {
      var m = UnlitMaterial()
      m.color = .init(tint: .white, texture: .init(texture))
      m.blending = .transparent(opacity: .init(floatLiteral: 1))
      plane.model?.materials = [m]
    } else {
      plane.isEnabled = false
    }
    return plane
  }

  // MARK: - Placing

  /// Look for the floor ahead; stand the model on it facing the player. No
  /// floor in ten seconds: the floor where one would be.
  private func findFloor() {
    placeTask?.cancel()
    placeTask = Task { @MainActor [weak self] in
      for _ in 0..<120 {
        guard let self, let view = self.arView, !Task.isCancelled else { return }
        if view.session.currentFrame != nil { break }
        try? await Task.sleep(for: .milliseconds(250))
      }
      for _ in 0..<(self?.reveal == true ? 12 : 34) {
        guard let self, let view = self.arView, !Task.isCancelled, !self.placed else { return }
        let centre = CGPoint(x: view.bounds.midX, y: view.bounds.midY * 1.2)
        if let hit = view.raycast(from: centre, allowing: .estimatedPlane, alignment: .horizontal).first,
           self.placeOnFloor(hit.worldTransform.columns.3) {
          return
        }
        try? await Task.sleep(for: .milliseconds(300))
      }
      guard let self, let view = self.arView, !Task.isCancelled, !self.placed,
            let cam = view.session.currentFrame?.camera.transform else { return }
      let fwd = -SIMD3(cam.columns.2.x, 0, cam.columns.2.z)
      let dir = simd_length(fwd) > 0.01 ? simd_normalize(fwd) : SIMD3<Float>(0, 0, -1)
      let c = SIMD3(cam.columns.3.x, cam.columns.3.y, cam.columns.3.z)
      self.place(at: c + dir * self.standOff + SIMD3(0, -1.3, 0), facing: c)
    }
  }

  /// How far ahead the model stands: a whole character in the frame.
  private var standOff: Float { isWeapon ? 1.2 : (reveal ? 3.0 : 2.2) }

  /// A floor point from a raycast: placed (pushed back so a character fits the frame) unless absurd.
  private func placeOnFloor(_ p4: SIMD4<Float>) -> Bool {
    guard let cam = arView?.session.currentFrame?.camera.transform else { return false }
    let p = SIMD3(p4.x, p4.y, p4.z)
    let c = SIMD3(cam.columns.3.x, cam.columns.3.y, cam.columns.3.z)
    let flat = SIMD2(p.x - c.x, p.z - c.z)
    let d = simd_length(flat)
    guard d > 0.3, d < 6, c.y - p.y > 0.2 else { return false }
    let dir = flat / d
    let far = max(d, standOff)
    place(at: SIMD3(c.x + dir.x * far, p.y, c.z + dir.y * far), facing: c)
    return true
  }

  private func place(at p: SIMD3<Float>, facing eye: SIMD3<Float>) {
    guard let view = arView, let body else { return }
    let anchor = AnchorEntity(world: p)
    anchor.addChild(body)
    let toEye = SIMD2(eye.x - p.x, eye.z - p.z)
    body.orientation = simd_quatf(angle: atan2(toEye.x, toEye.y), axis: [0, 1, 0])
    body.scale = SIMD3(repeating: 1)
    view.scene.addAnchor(anchor)
    self.anchor = anchor
    placed = true
    coaching?.activatesAutomatically = false
    coaching?.setActive(false, animated: true)
    // Drag, twist, pinch: RealityKit's own gestures on the body (not in the reveal).
    if !gesturesOn && !reveal {
      gesturesOn = true
      for g in view.installGestures([.translation, .rotation, .scale], for: body) {
        if let pinch = g as? EntityScaleGestureRecognizer {
          pinch.addTarget(self, action: #selector(pinched(_:)))
        }
      }
    }
    // It drops in from a little above and lands with dust; in the reveal it
    // rises out of the ground instead.
    if reveal {
      if UIAccessibility.isReduceMotionEnabled {
        lift.position.y = hoverY
      } else {
        riseStart = clock
        lift.position.y = hoverY - modelHeight
        occluder?.isEnabled = true
        groundBurst()
      }
    } else if UIAccessibility.isReduceMotionEnabled {
      landed()
    } else {
      dropFrom = (clock, 0.45)
      lift.position.y = hoverY + 0.45
    }
    send("placed")
  }

  private func landed() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    guard let body, !isWeapon else { return }
    var dust = ParticleEmitterComponent.Presets.impact
    dust.mainEmitter.color = .constant(.single(UIColor(white: 0.85, alpha: 0.7)))
    dust.emitterShape = .torus
    dust.emitterShapeSize = [0.35, 0.02, 0.35]
    dust.burstCount = 120
    dust.speed = 0.25
    dust.isEmitting = false
    let e = Entity()
    e.components.set(dust)
    e.position.y = 0.02
    body.addChild(e)
    if var c = e.components[ParticleEmitterComponent.self] {
      c.burst()
      e.components.set(c)
    }
    Task { @MainActor [weak e] in
      try? await Task.sleep(for: .seconds(3))
      e?.removeFromParent()
    }
  }

  /// The reveal's appearance: dust breaking out of the ground and a ring of
  /// sparks in the realm's colour rising with the Guardian.
  private func groundBurst() {
    guard let body else { return }
    var dust = ParticleEmitterComponent.Presets.impact
    dust.mainEmitter.color = .constant(.single(UIColor(white: 0.8, alpha: 0.75)))
    dust.emitterShape = .torus
    dust.emitterShapeSize = [0.45, 0.02, 0.45]
    dust.burstCount = 180
    dust.speed = 0.35
    dust.isEmitting = false
    var ring = ParticleEmitterComponent.Presets.sparks
    ring.mainEmitter.color = .constant(.single(tint))
    ring.emitterShape = .torus
    ring.emitterShapeSize = [0.5, 0.02, 0.5]
    ring.burstCount = 220
    ring.speed = 0.7
    ring.isEmitting = false
    for preset in [dust, ring] {
      let e = Entity()
      e.components.set(preset)
      e.position.y = 0.02
      body.addChild(e)
      if var c = e.components[ParticleEmitterComponent.self] {
        c.burst()
        e.components.set(c)
      }
      Task { @MainActor [weak e] in
        try? await Task.sleep(for: .seconds(3))
        e?.removeFromParent()
      }
    }
  }

  /// The fight is taking over: stop the camera (the last frame stays on screen).
  func hold() {
    recorder.cancel()
    arView?.session.pause()
  }

  // MARK: - Gestures

  @objc private func pinched(_ g: EntityScaleGestureRecognizer) {
    guard let body else { return }
    let s = body.scale.x
    let clamped = min(max(s, minScale), maxScale)
    if clamped != s { body.scale = SIMD3(repeating: clamped) }
  }

  @objc private func tapped(_ g: UITapGestureRecognizer) {
    guard let view = arView else { return }
    let at = g.location(in: view)
    if reveal {
      // The reveal: a tap on the Guardian is the screen's Fight.
      if placed, view.entity(at: at) != nil { onSummonTap([:]) }
      return
    }
    guard let hit = view.raycast(from: at, allowing: .estimatedPlane, alignment: .horizontal).first else { return }
    let p = hit.worldTransform.columns.3
    if !placed {
      _ = placeOnFloor(p)
      return
    }
    // Walk it to the tapped spot on the floor (unless the tap was on it).
    if let body, let anchor, view.entity(at: at) == nil {
      var t = body.transform
      let local = anchor.convert(position: SIMD3(p.x, p.y, p.z), from: nil)
      t.translation = SIMD3(local.x, local.y, local.z)
      body.move(to: t, relativeTo: anchor, duration: 0.45, timingFunction: .easeInOut)
      UISelectionFeedbackGenerator().selectionChanged()
    }
  }

  @objc private func doubleTapped(_ g: UITapGestureRecognizer) { celebrate() }

  func celebrate() {
    guard placed, let model else { return }
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    if let celebrateClip, !UIAccessibility.isReduceMotionEnabled {
      model.playAnimation(celebrateClip, transitionDuration: 0.2, startsPaused: false)
      let back = celebrateClip.definition.duration
      Task { @MainActor [weak self] in
        try? await Task.sleep(for: .seconds(max(0.5, back)))
        guard let self, let idle = self.idleClip, self.model === model else { return }
        model.playAnimation(idle.repeat(), transitionDuration: 0.3, startsPaused: false)
      }
    } else if !UIAccessibility.isReduceMotionEnabled {
      hopStart = clock
    }
    sparkle()
  }

  private func sparkle() {
    guard let body else { return }
    var burst = ParticleEmitterComponent.Presets.sparks
    burst.mainEmitter.color = .constant(.single(tint))
    burst.burstCount = 260
    burst.emitterShape = .sphere
    burst.emitterShapeSize = [0.25, 0.25, 0.25]
    burst.speed = 0.9
    burst.isEmitting = false
    let e = Entity()
    e.components.set(burst)
    e.position.y = hoverY + modelHeight * 0.6
    body.addChild(e)
    if var c = e.components[ParticleEmitterComponent.self] {
      c.burst()
      e.components.set(c)
    }
    Task { @MainActor [weak e] in
      try? await Task.sleep(for: .seconds(3))
      e?.removeFromParent()
    }
  }

  /// Put it in front of the player again (lost it behind the sofa, walked away).
  func recenter() {
    guard arView != nil, body != nil else { return }
    anchor?.removeFromParent()
    anchor = nil
    placed = false
    coaching?.activatesAutomatically = true
    findFloor()
    send("looking")
  }

  // MARK: - Every frame

  private func tick(_ dt: Double) {
    clock += dt
    let still = UIAccessibility.isReduceMotionEnabled
    // The landing.
    if let drop = dropFrom {
      let p = Float(min(1, (clock - drop.start) / 0.38))
      lift.position.y = hoverY + drop.height * (1 - p * p)
      if p >= 1 {
        dropFrom = nil
        lift.position.y = hoverY
        landed()
      }
    }
    // The reveal's rise out of the ground (ease out), then the occluder goes.
    if let rise = riseStart {
      let p = Float(min(1, (clock - rise) / Self.riseSeconds))
      let ease = 1 - pow(1 - p, 3)
      lift.position.y = hoverY - modelHeight * (1 - ease)
      if p >= 1 {
        riseStart = nil
        lift.position.y = hoverY
        occluder?.removeFromParent()
        occluder = nil
      }
    }
    // A celebrate with no clip: a hop and a full turn.
    if let hop = hopStart {
      let p = Float(min(1, (clock - hop) / 0.75))
      let h = max(0.12, modelHeight * 0.12)
      lift.position.y = hoverY + sin(.pi * p) * h
      let ease = p < 0.5 ? 2 * p * p : 1 - pow(-2 * p + 2, 2) / 2
      lift.orientation = simd_quatf(angle: 2 * .pi * ease, axis: [0, 1, 0])
      if p >= 1 {
        hopStart = nil
        lift.position.y = hoverY
        lift.orientation = simd_quatf(angle: 0, axis: [0, 1, 0])
      }
    }
    guard !still else { return }
    let t = Float(clock)
    if isWeapon {
      // A weapon hovers at chest height and turns slowly.
      sway.orientation = simd_quatf(angle: t * 0.6, axis: [0, 1, 0])
      sway.position.y = 0.03 * sin(t * 1.6)
    } else if idleClip == nil {
      // No clip in the file: a gentle procedural idle (weight shift and breath).
      let w = 2 * Float.pi / 3.4
      sway.orientation = simd_quatf(angle: 0.04 * sin(t * w), axis: [0, 1, 0])
        * simd_quatf(angle: 0.012 * sin(t * w + 1.1), axis: [0, 0, 1])
      sway.scale = SIMD3(1, 1 + 0.007 * sin(t * 2 * .pi / 2.6), 1)
    }
  }

  // MARK: - Captures

  /// The AR render (no buttons) with a small CosQuest mark, as a JPEG with no
  /// metadata (no location) in the caches folder; null without a camera.
  func photo() async -> String? {
    guard let view = arView else { return nil }
    let shot: UIImage? = await withCheckedContinuation { c in
      view.snapshot(saveToHDR: false) { @Sendable image in c.resume(returning: image) }
    }
    guard let shot else { return nil }
    let marked = Self.watermark(shot, name: name)
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    return Self.writeCleanJPEG(marked)
  }

  static func watermark(_ image: UIImage, name: String) -> UIImage {
    let size = image.size
    return UIGraphicsImageRenderer(size: size, format: {
      let f = UIGraphicsImageRendererFormat()
      f.scale = image.scale
      return f
    }()).image { _ in
      image.draw(at: .zero)
      let text = name.isEmpty ? "CosQuest" : "\(name)  ·  CosQuest"
      let fontSize = max(12, size.width * 0.032)
      let attrs: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: fontSize, weight: .bold),
        .foregroundColor: UIColor.white,
      ]
      let label = NSAttributedString(string: text, attributes: attrs)
      let bounds = label.size()
      let pad = fontSize * 0.55
      let box = CGRect(x: fontSize, y: size.height - bounds.height - pad * 2 - fontSize * 1.4,
                       width: bounds.width + pad * 2, height: bounds.height + pad)
      UIColor(white: 0, alpha: 0.38).setFill()
      UIBezierPath(roundedRect: box, cornerRadius: box.height / 2).fill()
      label.draw(at: CGPoint(x: box.minX + pad, y: box.minY + pad / 2))
    }
  }

  /// JPEG bytes with no EXIF, GPS or TIFF dictionaries: only the pixels.
  static func writeCleanJPEG(_ image: UIImage) -> String? {
    guard let cg = image.cgImage else { return nil }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("cosquest-summon-\(UUID().uuidString).jpg")
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
      return nil
    }
    CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { return nil }
    return url.absoluteString
  }

  /// Starts a clip of the AR render; false when there is no camera view.
  func startVideo() -> Bool {
    guard let view = arView, placed else { return false }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("cosquest-summon-\(UUID().uuidString).mp4")
    guard recorder.begin(url: url) else { return false }
    view.renderCallbacks.postProcess = Self.postProcess(recorder)
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    return true
  }

  /// Ends the clip: its file:// URI, or null when nothing was written.
  func stopVideo() async -> String? {
    let url = await recorder.finish()
    arView?.renderCallbacks.postProcess = nil
    if url != nil { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    return url?.absoluteString
  }

  /// Made outside the main actor on purpose: RealityKit calls it from its
  /// render loop, and a main-actor closure called off the main thread traps.
  nonisolated private static func postProcess(_ r: SummonRecorder) -> (ARView.PostProcessContext) -> Void {
    return { context in r.frame(context) }
  }

  // MARK: - Events

  private func send(_ phase: String, reason: String? = nil) {
    var e: [String: Any] = [
      "phase": phase,
      "ar": arView != nil,
      "animated": idleClip != nil,
      "lidar": Self.lidar && richSession,
      "people": richSession && ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth),
    ]
    if let reason { e["reason"] = reason }
    onSummonState(e)
  }
}

/// A clip of the AR render: every frame RealityKit draws is shown (copied to
/// the target as the post-process must) and, while recording, scaled into an
/// H.264 MP4 through AVAssetWriter. No audio track (no microphone prompt) and
/// no metadata (no location). Render-thread and writer-queue state behind one
/// lock; the writer itself is only touched on its serial queue.
final class SummonRecorder: @unchecked Sendable {
  /// The longest clip, a hair over the 10 s the screen asks for.
  static let maxSeconds = 10.5
  /// The long side of the video, in pixels.
  static let maxSide: CGFloat = 1920

  private let lock = NSLock()
  private let queue = DispatchQueue(label: "cosquest.summon.recorder")
  private var url: URL?
  private var on = false
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var started: CFTimeInterval?
  private var frames = 0
  private var finished = false
  /// One per clip: a late frame of an old clip never lands in a new one.
  private var clip = 0
  private var cache: CVMetalTextureCache?
  private var ci: CIContext?
  private var size = CGSize.zero

  func begin(url: URL) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard !on else { return false }
    self.url = url
    on = true
    writer = nil
    input = nil
    adaptor = nil
    started = nil
    frames = 0
    finished = false
    clip += 1
    return true
  }

  func cancel() {
    lock.lock()
    let w = writer
    on = false
    finished = true
    writer = nil
    lock.unlock()
    nonisolated(unsafe) let gone = w
    queue.async { gone?.cancelWriting() }
  }

  /// Stops taking frames and hands over the clip's writer (sync: a lock is not for async code).
  private func take() -> (AVAssetWriter?, AVAssetWriterInput?, URL?, Int) {
    lock.lock()
    defer { lock.unlock() }
    let got = (writer, input, url, frames)
    on = false
    writer = nil
    input = nil
    adaptor = nil
    return got
  }

  private func markFinished() {
    lock.lock()
    finished = true
    lock.unlock()
  }

  func finish() async -> URL? {
    let (w, i, out, n) = take()
    nonisolated(unsafe) let writer = w
    nonisolated(unsafe) let track = i
    guard let out, n > 0, writer != nil, track != nil else {
      queue.async { writer?.cancelWriting() }
      return nil
    }
    return await withCheckedContinuation { (c: CheckedContinuation<URL?, Never>) in
      queue.async {
        self.markFinished()
        guard let writer, let track else { return c.resume(returning: nil) }
        track.markAsFinished()
        writer.finishWriting {
          c.resume(returning: writer.status == .completed ? out : nil)
        }
      }
    }
  }

  /// The render loop: show the frame; while recording, keep a copy.
  func frame(_ context: ARView.PostProcessContext) {
    if let blit = context.commandBuffer.makeBlitCommandEncoder() {
      blit.copy(from: context.sourceColorTexture, to: context.targetColorTexture)
      blit.endEncoding()
    }
    lock.lock()
    defer { lock.unlock() }
    guard on, let url else { return }
    let now = CACurrentMediaTime()
    if let started, now - started > Self.maxSeconds { return }
    let source = context.sourceColorTexture
    if writer == nil {
      guard setUp(url: url, width: source.width, height: source.height, device: context.device) else {
        on = false
        return
      }
    }
    guard let input, let adaptor, input.isReadyForMoreMediaData,
          let pool = adaptor.pixelBufferPool, let cache, let ci else { return }
    var made: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &made)
    guard let buffer = made else { return }
    var cvTexture: CVMetalTexture?
    CVMetalTextureCacheCreateTextureFromImage(nil, cache, buffer, nil, .bgra8Unorm,
                                              Int(size.width), Int(size.height), 0, &cvTexture)
    guard let cvTexture, let target = CVMetalTextureGetTexture(cvTexture),
          let image = CIImage(mtlTexture: source, options: nil) else { return }
    let k = size.width / CGFloat(source.width)
    let scaled = image.transformed(by: CGAffineTransform(scaleX: k, y: k))
    let destination = CIRenderDestination(mtlTexture: target, commandBuffer: context.commandBuffer)
    destination.isFlipped = false
    guard (try? ci.startTask(toRender: scaled, to: destination)) != nil else { return }
    if started == nil { started = now }
    let time = CMTime(seconds: now - (started ?? now), preferredTimescale: 600)
    frames += 1
    let mine = clip
    nonisolated(unsafe) let pixels = buffer
    nonisolated(unsafe) let keep = cvTexture
    nonisolated(unsafe) let track = input
    nonisolated(unsafe) let sink = adaptor
    context.commandBuffer.addCompletedHandler { [weak self] _ in
      guard let self else { return }
      self.queue.async {
        _ = keep
        self.lock.lock()
        let done = self.finished || self.clip != mine
        self.lock.unlock()
        guard !done, track.isReadyForMoreMediaData else { return }
        sink.append(pixels, withPresentationTime: time)
      }
    }
  }

  /// Under the lock, on the first recorded frame (its size is the view's).
  private func setUp(url: URL, width: Int, height: Int, device: MTLDevice) -> Bool {
    let k = min(1, Self.maxSide / CGFloat(max(width, height)))
    let w = (Int(CGFloat(width) * k) / 2) * 2
    let h = (Int(CGFloat(height) * k) / 2) * 2
    guard w > 0, h > 0, let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return false }
    writer.metadata = []
    writer.shouldOptimizeForNetworkUse = true
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: w,
      AVVideoHeightKey: h,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 10_000_000],
    ])
    input.expectsMediaDataInRealTime = true
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: w,
      kCVPixelBufferHeightKey as String: h,
      kCVPixelBufferMetalCompatibilityKey as String: true,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ])
    guard writer.canAdd(input) else { return false }
    writer.add(input)
    guard writer.startWriting() else { return false }
    writer.startSession(atSourceTime: .zero)
    var made: CVMetalTextureCache?
    CVMetalTextureCacheCreate(nil, nil, device, nil, &made)
    guard let made else { return false }
    self.writer = writer
    self.input = input
    self.adaptor = adaptor
    cache = made
    if ci == nil { ci = CIContext(mtlDevice: device, options: [.cacheIntermediates: false]) }
    size = CGSize(width: w, height: h)
    return true
  }
}
