// Not the real SDKs: stand-ins with their signatures and actor isolation (copied
// from expo-modules-core 57.0.18 and the Apple SDK declarations) so
// app/scripts/swift-stub-check.sh can type-check ios/Embed on Linux.
// Stand-ins for Apple frameworks and the pod's own types, with the real
// signatures and actor isolation, so the islands can be type-checked on Linux.
import Foundation

// UIKit / SwiftUI
@MainActor open class UIView: NSObject {
  public override init() {}
  open var bounds: CGRect = .zero
  open var frame: CGRect = .zero
  open var clipsToBounds = false
  open var backgroundColor: UIColor?
  open var accessibilityLabel: String?
  open var isAccessibilityElement = false
  open var window: AnyObject?
  open var superview: UIView?
  open var autoresizingMask: AutoresizingMask = []
  public struct AutoresizingMask: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
    public static let flexibleWidth = AutoresizingMask(rawValue: 1); public static let flexibleHeight = AutoresizingMask(rawValue: 2) }
  open func layoutSubviews() {}
  open func didMoveToWindow() {}
  open func addSubview(_ v: UIView) {}
  open func removeFromSuperview() {}
}
public final class UIColor: @unchecked Sendable { public init(red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {}; public static let white = UIColor(red: 1, green: 1, blue: 1, alpha: 1); public static let clear = UIColor(red: 0, green: 0, blue: 0, alpha: 0) }
public final class UIImage { public func jpegData(compressionQuality: Double) -> Data? { nil } }
public protocol SUIView {}
public struct AnyView: SUIView { public init<V: SUIView>(_ v: V) {} }
extension SUIView { public func ignoresSafeArea() -> some SUIView { self } }
@MainActor open class UIHostingController<Content: SUIView> { public let view = UIView(); public init(rootView: Content) {} }

// ExpoModulesCore
public final class AppContext {}
@MainActor open class ExpoView: UIView { public required init(appContext: AppContext? = nil) { super.init() } }
public final class EventDispatcher { public init() {}; public func callAsFunction(_ payload: [String: Any]) {} }

// ARKit / AVFoundation / NearbyInteraction
public final class ARWorldTrackingConfiguration { public class var isSupported: Bool { true } }
public enum AVAuthorizationStatus: Sendable { case notDetermined, restricted, denied, authorized }
public enum AVMediaType: Sendable { case video }
public final class AVCaptureDevice {
  public class func authorizationStatus(for: AVMediaType) -> AVAuthorizationStatus { .authorized }
  public class func requestAccess(for: AVMediaType, completionHandler: @escaping @Sendable (Bool) -> Void) {}
}
public final class NIDeviceCapability: @unchecked Sendable { public var supportsPreciseDistanceMeasurement: Bool { true } }
open class NISession: NSObject { public class var deviceCapabilities: NIDeviceCapability { NIDeviceCapability() } }

// The pod's own types the islands use (signatures as in Game/ and Embed/).
final class GameEventSink: @unchecked Sendable {
  nonisolated(unsafe) static var current: GameEventSink?
  init(module: CostQuestGameModule?) {}
  func send(_ name: String, _ body: [String: Any?] = [:]) {}
}
@MainActor final class ShrineScene {
  weak var arView: UIView?
  init(tint: UIColor, wardenTint: UIColor? = nil) {}
  func pulse(_ i: Int) {}
  func reset() {}
  func photo() async -> UIImage? { nil }
  func resolve(correct: Bool) {}
}
struct ShrineStage: SUIView {
  let scene: ShrineScene
  var useAR = true
  var onPlaced: () -> Void = {}
}
actor FriendBeacon {
  enum Event: Sendable {
    case seen([String: String])
    case hello(key: String, handle: String)
    case token(key: String, data: Data)
    case linkLost(key: String)
    case denied
  }
  init(key: String, handle: String, emit: @escaping @Sendable (Event) -> Void) {}
  func start() {}
  func stop() {}
  func send(token: Data, to peer: String) {}
}
@MainActor final class FriendRanger: NSObject {
  static var isSupported: Bool { true }
  var onDistance: ((_ peer: String, _ metres: Double) -> Void)?
  func token(for peer: String) -> Data? { nil }
  func accept(_ data: Data, from peer: String) -> Data? { nil }
  func stopAll() {}
}

public enum NSTextAlignment: Sendable { case center, left }
public final class UIFont: @unchecked Sendable { public enum TextStyle: Sendable { case body }; public class func preferredFont(forTextStyle: TextStyle) -> UIFont { UIFont() } }
@MainActor open class UILabel: UIView { open var text: String?; open var textColor: UIColor?; open var textAlignment: NSTextAlignment = .left; open var numberOfLines = 1; open var font: UIFont? }
