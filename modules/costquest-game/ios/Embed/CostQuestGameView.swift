import ExpoModulesCore
import UIKit

/// Where the game draws: the one hosting controller GameHost keeps, attached
/// to whichever view controller holds this view. The controller outlives the
/// view, so a remount (or the page sliding away and back) finds the world
/// exactly as it was left.
///
/// `parked`: the shell sets it once the chat has been on screen for a while.
/// The world leaves the window (RealityKit stops drawing, SwiftUI pauses its
/// tasks) but the controller, and everything the player was doing, stays;
/// unparking puts the same world back. docs/merged-app-ux.md, "Warm game".
public final class CostQuestGameView: ExpoView {
  private weak var attachedTo: UIViewController?

  var parked = false {
    didSet {
      guard parked != oldValue else { return }
      if parked { detach() } else if window != nil { attach() }
    }
  }

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, !parked { attach() } else { detach() }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    if let view = GameHost.shared.existingController?.view, view.superview === self {
      view.frame = bounds
    }
  }

  private func attach() {
    let controller = GameHost.shared.hostingController()
    guard let parent = nearestViewController() else { return }
    if controller.parent !== parent {
      if controller.parent != nil {
        controller.willMove(toParent: nil)
        controller.view.removeFromSuperview()
        controller.removeFromParent()
      }
      parent.addChild(controller)
      addSubview(controller.view)
      controller.view.frame = bounds
      controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      controller.didMove(toParent: parent)
      attachedTo = parent
    } else if controller.view.superview !== self {
      addSubview(controller.view)
      controller.view.frame = bounds
    }
  }

  private func detach() {
    // Only if it is still ours: a newer view may have taken it already.
    guard let controller = GameHost.shared.existingController,
          controller.view.superview === self else { return }
    controller.willMove(toParent: nil)
    controller.view.removeFromSuperview()
    controller.removeFromParent()
    attachedTo = nil
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let vc = current as? UIViewController { return vc }
      responder = current.next
    }
    return window?.rootViewController
  }
}
