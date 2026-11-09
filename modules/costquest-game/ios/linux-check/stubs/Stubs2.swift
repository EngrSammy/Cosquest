import Foundation
#if canImport(Glibc)
import Glibc
#endif

// ExpoModulesCore records and errors
public protocol Record: AnyArgument { init() }
@propertyWrapper public struct Field<T>: @unchecked Sendable { public var wrappedValue: T; public init(wrappedValue: T) { self.wrappedValue = wrappedValue } }
public class Exception: Error, @unchecked Sendable { public init(name: String, description: String, code: String) {} }

// AVFoundation (ObjC classes: not Sendable)
public final class AVAudioFormat { public var sampleRate: Double { 1 }; public var channelCount: UInt32 { 1 } }
public final class AVAudioPCMBuffer {}
public final class AVAudioTime {}
public final class AVAudioInputNode {
  public func removeTap(onBus: Int) {}
  public func outputFormat(forBus: Int) -> AVAudioFormat { AVAudioFormat() }
  public func installTap(onBus: Int, bufferSize: UInt32, format: AVAudioFormat?, block: @escaping @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void) {}
}
public final class AVAudioEngine { public init() {}; public var inputNode: AVAudioInputNode { AVAudioInputNode() }; public var isRunning: Bool { false }
  public func prepare() {}; public func start() throws {}; public func stop() {} }
public final class AVAudioSession {
  public static func sharedInstance() -> AVAudioSession { AVAudioSession() }
  public struct Category: Equatable, Sendable { static let playAndRecord = Category(); static let playback = Category() }
  public struct Mode: Equatable, Sendable { static let voiceChat = Mode(); static let videoChat = Mode(); static let `default` = Mode() }
  public struct CategoryOptions: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
    static let duckOthers = CategoryOptions(rawValue: 1); static let defaultToSpeaker = CategoryOptions(rawValue: 2) }
  public struct SetActiveOptions: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
    static let notifyOthersOnDeactivation = SetActiveOptions(rawValue: 1) }
  public var category: Category { Category() }
  public var mode: Mode { Mode() }
  public var categoryOptions: CategoryOptions { [] }
  public func setCategory(_ c: Category, mode: Mode, options: CategoryOptions) throws {}
  public func setActive(_ on: Bool, options: SetActiveOptions) throws {}
}
public final class AVAudioApplication { public class func requestRecordPermission() async -> Bool { true } }

// Speech
public enum SFSpeechRecognizerAuthorizationStatus: Sendable { case authorized, denied }
public final class SFTranscription { public var formattedString: String { "" } }
public final class SFSpeechRecognitionResult { public var bestTranscription: SFTranscription { SFTranscription() }; public var isFinal: Bool { false } }
public final class SFSpeechRecognitionTask { public func cancel() {} }
public final class SFSpeechAudioBufferRecognitionRequest: @unchecked Sendable {  // compiles captured in a @Sendable tap in costquest-ios (Swift 6, complete)
  public init() {}
  public var shouldReportPartialResults = false
  public var requiresOnDeviceRecognition = false
  public var contextualStrings: [String] = []
  public func append(_ b: AVAudioPCMBuffer) {}
  public func endAudio() {}
}
public final class SFSpeechRecognizer {
  public init?() {}
  public init?(locale: Locale) {}
  public var isAvailable: Bool { true }
  public var supportsOnDeviceRecognition: Bool { true }
  public class func requestAuthorization(_ handler: @escaping @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void) {}
  public func recognitionTask(with: SFSpeechAudioBufferRecognitionRequest, resultHandler: @escaping @Sendable (SFSpeechRecognitionResult?, (any Error)?) -> Void) -> SFSpeechRecognitionTask { SFSpeechRecognitionTask() }
}

// CoreMotion
public enum CMAuthorizationStatus: Sendable { case notDetermined, restricted, denied, authorized }
public final class CMPedometerData { public var distance: NSNumber? { nil }; public var numberOfSteps: NSNumber { 0 } }
public final class CMPedometer {
  public init() {}
  public class func isDistanceAvailable() -> Bool { true }
  public class func isStepCountingAvailable() -> Bool { true }
  public class func authorizationStatus() -> CMAuthorizationStatus { .authorized }
  public func queryPedometerData(from: Date, to: Date, withHandler: @escaping @Sendable (CMPedometerData?, (any Error)?) -> Void) {}
}
public let CMErrorDomain = "CMErrorDomain"
public struct CMError: Sendable { public var rawValue: Int32 }
public let CMErrorMotionActivityNotAuthorized = CMError(rawValue: 105)

// CoreNFC
public final class NFCNDEFPayload {
  public func wellKnownTypeURIPayload() -> URL? { nil }
  public func wellKnownTypeTextPayload() -> (String?, Locale?) { (nil, nil) }
}
public final class NFCNDEFMessage { public var records: [NFCNDEFPayload] { [] } }
public protocol NFCNDEFReaderSessionDelegate: NSObjectProtocol {
  func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: any Error)
  func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage])
  func readerSessionDidBecomeActive(_ session: NFCNDEFReaderSession)
}
public final class NFCNDEFReaderSession {
  public class var readingAvailable: Bool { true }
  public var alertMessage = ""
  public init(delegate: any NFCNDEFReaderSessionDelegate, queue: DispatchQueue?, invalidateAfterFirstRead: Bool) {}
  public func begin() {}
  public func invalidate() {}
  public func invalidate(errorMessage: String) {}
}
public struct NFCReaderError: Error {
  public enum Code: Sendable { case readerSessionInvalidationErrorFirstNDEFTagRead, readerSessionInvalidationErrorUserCanceled, readerSessionInvalidationErrorSessionTimeout, readerErrorUnsupportedFeature, readerErrorSecurityViolation, other }
  public var code: Code
}

// The pod's own: Unity bridge and the C setters, the Forge model view, the module.
@MainActor final class UnityBridge: NSObject {
  static let shared = UnityBridge()
  enum State: Equatable { case idle, running, failed(String) }
  var onAnchorTapped: ((String) -> Void)?
  var onCheckpointTapped: ((String) -> Void)?
  var unityView: UIView? { nil }
  func start() -> State { .idle }
  func send(object: String, method: String, message: String) {}
  func pause(_ paused: Bool) {}
  func reclaimWindow(tag: String) {}
}
public typealias CQEventCallback = @convention(c) (UnsafePointer<CChar>?, UnsafePointer<CChar>?) -> Void
public func CQSetDuelEventCallback(_ cb: CQEventCallback?) {}
public func CQSetHubEventCallback(_ cb: CQEventCallback?) {}
public struct Color { public init(uiColor: UIColor) {} }
struct ForgeModelView: SUIView { let url: URL; let tint: Color }
extension SUIView { func id<H: Hashable>(_ h: H) -> some SUIView { self } }
