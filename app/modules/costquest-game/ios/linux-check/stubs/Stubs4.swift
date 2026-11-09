import Foundation
// expo-modules-core 57.0.18's module DSL, signatures as in Api/Factories and Api/Builders.
public protocol AnyArgument {}
extension String: AnyArgument {}
extension Int: AnyArgument {}
extension Bool: AnyArgument {}
extension Double: AnyArgument {}
extension URL: AnyArgument {}
extension Optional: AnyArgument where Wrapped: AnyArgument {}
extension Array: AnyArgument where Element: AnyArgument {}
extension Dictionary: AnyArgument where Key == String {}
extension UIView: AnyArgument {}
public protocol AnyDefinition {}
public protocol AnyViewDefinitionElement {}
public protocol ViewDefinitionFunctionElement: AnyViewDefinitionElement { associatedtype ViewType }
public struct ModuleDefinition { init(definitions: [AnyDefinition]) {} }
@resultBuilder public struct ModuleDefinitionBuilder {
  public static func buildBlock(_ definitions: AnyDefinition...) -> ModuleDefinition { ModuleDefinition(definitions: definitions) }
}
public protocol AnyModule: AnyObject { @ModuleDefinitionBuilder func definition() -> ModuleDefinition }
open class BaseModule { public init() {}; public func sendEvent(_ eventName: String, _ body: [String: Any?] = [:]) {} }
public typealias Module = AnyModule & BaseModule
struct Def: AnyDefinition {}
public func Name(_ name: String) -> AnyDefinition { Def() }
public struct EventsDefinition: AnyDefinition, AnyViewDefinitionElement {}
public func Events(_ names: String...) -> EventsDefinition { EventsDefinition() }
public func Constants(@_implicitSelfCapture _ body: @escaping () -> [String: Any?]) -> AnyDefinition { Def() }
public func OnCreate(@_implicitSelfCapture _ closure: @escaping () -> Void) -> AnyDefinition { Def() }
public func OnAppEntersForeground(@_implicitSelfCapture _ closure: @escaping () -> Void) -> AnyDefinition { Def() }
public func OnAppEntersBackground(@_implicitSelfCapture _ closure: @escaping () -> Void) -> AnyDefinition { Def() }
public struct SyncFunctionDefinition<Args, FirstArgType, ReturnType>: AnyDefinition {}
public func Function<R>(_ name: String, @_implicitSelfCapture _ closure: @escaping () throws -> R) -> SyncFunctionDefinition<(), Void, R> { .init() }
public func Function<R, A0: AnyArgument, each A: AnyArgument>(_ name: String, @_implicitSelfCapture _ closure: @escaping (A0, repeat each A) throws -> R) -> SyncFunctionDefinition<(A0, repeat each A), A0, R> { .init() }
public struct AsyncFunctionDefinition<Args, FirstArgType, ReturnType>: AnyDefinition, ViewDefinitionFunctionElement {
  public typealias ViewType = FirstArgType
  public func runOnQueue(_ queue: DispatchQueue?) -> Self { self }
}
public func AsyncFunction<R>(_ name: String, @_implicitSelfCapture _ closure: @escaping () throws -> R) -> AsyncFunctionDefinition<(), Void, R> { .init() }
public func AsyncFunction<R, A0: AnyArgument, each A: AnyArgument>(_ name: String, @_implicitSelfCapture _ closure: @escaping (A0, repeat each A) throws -> R) -> AsyncFunctionDefinition<(A0, repeat each A), A0, R> { .init() }
public struct ConcurrentFunctionDefinition<Args, FirstArgType, ReturnType>: AnyDefinition, ViewDefinitionFunctionElement { public typealias ViewType = FirstArgType }
public func AsyncFunction<R>(_ name: String, @_inheritActorContext @_implicitSelfCapture _ closure: sending @escaping @Sendable () async throws -> sending R) -> ConcurrentFunctionDefinition<(), Void, R> { .init() }
public func AsyncFunction<R, A0: AnyArgument, each A: AnyArgument>(_ name: String, @_inheritActorContext @_implicitSelfCapture _ closure: sending @escaping @Sendable (A0, repeat each A) async throws -> sending R) -> ConcurrentFunctionDefinition<(A0, repeat each A), A0, R> { .init() }
public struct ViewDefinition<V: UIView>: AnyDefinition {}
public struct ConcreteViewProp<V: UIView, P: AnyArgument>: AnyViewDefinitionElement {}
public struct ViewLifecycleMethod<V: UIView>: AnyViewDefinitionElement {}
@resultBuilder public struct ViewDefinitionBuilder<ViewType: UIView> {
  public static func buildBlock(_ elements: AnyViewDefinitionElement...) -> [AnyViewDefinitionElement] { elements }
  public static func buildExpression(_ element: EventsDefinition) -> AnyViewDefinitionElement { element }
  public static func buildExpression<PropType: AnyArgument>(_ element: ConcreteViewProp<ViewType, PropType>) -> AnyViewDefinitionElement { element }
  public static func buildExpression(_ element: ViewLifecycleMethod<ViewType>) -> AnyViewDefinitionElement { element }
  public static func buildExpression<E: ViewDefinitionFunctionElement>(_ element: E) -> AnyViewDefinitionElement { element }
  public static func buildExpression<E: ViewDefinitionFunctionElement>(_ element: E) -> AnyViewDefinitionElement where E.ViewType == ViewType { element }
}
public func View<V: UIView>(_ viewType: V.Type, @ViewDefinitionBuilder<V> _ elements: @escaping () -> [AnyViewDefinitionElement]) -> ViewDefinition<V> { .init() }
public func Prop<V: UIView, P: AnyArgument>(_ name: String, @_implicitSelfCapture _ setter: @escaping @MainActor (V, P) -> Void) -> ConcreteViewProp<V, P> { .init() }
public func OnViewDidUpdateProps<V: UIView>(@_implicitSelfCapture _ closure: @escaping @MainActor (_ view: V) -> Void) -> ViewLifecycleMethod<V> { .init() }
extension Record { }

// The host and the rest of Embed/ the module calls.
struct GameOpenRequest: Sendable, Equatable {
  enum Kind: String, Sendable { case shrine, raid, duel, place }
  let kind: Kind; let targetId: String?; let lat: Double?; let lng: Double?; let place: String?; let madeAt: Date
}
struct GameChatPreview: Sendable, Equatable { let chatId: String; let title: String; let text: String }
struct GameCallPill: Sendable, Equatable { let title: String; let video: Bool; let answeredAtMs: Double? }
@MainActor final class GameHost {
  static let shared = GameHost()
  var sink: GameEventSink?
  func prewarm() {}; func setVisible(_ v: Bool) {}; func reset() {}; func open(_ r: GameOpenRequest) {}
  func setUnread(_ count: Int, previews: [GameChatPreview]) {}; func setCallPill(_ pill: GameCallPill?) {}
  func handleURL(_ url: URL) {}; func setSession(_ token: String?) {}
}
struct VenueEventsOptionsRecord: Record { init() {} }
struct VenueEventsOptions: Sendable { init(_ r: VenueEventsOptionsRecord) {} }
@MainActor enum VenueEventsIsland { static var sink: GameEventSink?; static func open(_ o: VenueEventsOptions) throws {}; static func close() {} }
public final class CostQuestGameView: ExpoView { var parked = false }
enum LegacyDeviceKey { static func read() -> String? { nil } }
@MainActor final class LocationSourceProbe {
  static let shared = LocationSourceProbe()
  func simulated(maxAgeS: Double) async -> Bool? { nil }
}
func cq_phys_footprint() -> UInt64 { 0 }
func os_proc_available_memory() -> Int { 0 }
