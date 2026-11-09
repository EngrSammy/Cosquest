import ARKit
import AVFoundation
import ExpoModulesCore
import SwiftUI
import UIKit

// The shrine a player meets at a Quest Point, for the shared React Native
// game on iOS: the native game's own ShrineStage and ShrineScene
// (Game/Roam/ShrineStage.swift), unchanged, in a hosting controller. Through
// the camera (ARKit world tracking, the shrine on the floor ahead) when the
// player has AR on and the phone can do it, otherwise on its rendered
// RealityKit stage. The RN encounter (components/game/ShrineStage.tsx) drives
// it through the same handle as its 2D crystal: pulse, resolve, reset, plus a
// photo of the moment when the camera was used. Android, and iOS with the
// island "arShrine" turned off, draw the 2D crystal instead.
//
// requireNativeView("CostQuestGame", "CostQuestShrineView"): props tint,
// wardenTint ("#RRGGBB"), useAR; event onPlaced; view functions pulse(i),
// resolve(correct), reset(), photo() -> file URI or null.

public final class CostQuestShrineView: ExpoView {
  let onPlaced = EventDispatcher()

  var tint = UIColor(red: 0.95, green: 0.6, blue: 0.18, alpha: 1) { didSet { dirty = true } }
  var wardenTint: UIColor? { didSet { dirty = true } }
  var useAR = false { didSet { if useAR != oldValue { dirty = true } } }

  private var dirty = true
  private var scene: ShrineScene?
  private var host: UIHostingController<AnyView>?
  private var asking = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .clear
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
  }

  /// After a batch of props: one new stage, not one per prop.
  func propsDone() {
    guard dirty else { return }
    // The camera prompt comes before the AR view, not during its placement
    // (EncounterView .task), and only when the camera is really going to be used.
    if useAR, ARWorldTrackingConfiguration.isSupported,
       AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
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
    }
    dirty = false
    host?.view.removeFromSuperview()
    let made = ShrineScene(tint: tint, wardenTint: wardenTint)
    scene = made
    let stage = ShrineStage(scene: made, useAR: useAR) { [weak self] in
      self?.onPlaced(["ar": made.arView != nil])
    }
    let controller = UIHostingController(rootView: AnyView(stage.ignoresSafeArea()))
    controller.view.backgroundColor = .clear
    controller.view.frame = bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(controller.view)
    host = controller
  }

  func pulse(_ i: Int) { scene?.pulse(max(0, min(2, i))) }
  func resolve(_ correct: Bool) { scene?.resolve(correct: correct) }
  func reset() { scene?.reset() }

  /// The shrine standing in the player's street, as a JPEG in the caches
  /// folder; null on the rendered stage, which has nothing of theirs in it.
  func photo() async -> String? {
    guard let scene, scene.arView != nil, let image = await scene.photo(),
          let data = image.jpegData(compressionQuality: 0.88) else { return nil }
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("costquest-shrine-\(UUID().uuidString).jpg")
    do {
      try data.write(to: url, options: .atomic)
      return url.absoluteString
    } catch {
      return nil
    }
  }

  nonisolated static var arSupported: Bool { ARWorldTrackingConfiguration.isSupported }
}
