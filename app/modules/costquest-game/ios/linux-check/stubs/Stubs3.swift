import Foundation
// os.OSAllocatedUnfairLock, as the iOS 16+ SDK declares it.
public struct OSAllocatedUnfairLock<State>: @unchecked Sendable {
  public init(initialState: State) {}
  public func withLock<R: Sendable>(_ body: @Sendable (inout State) throws -> R) rethrows -> R { fatalError() }
}
final class MoteEngine: @unchecked Sendable {
  struct Info: Sendable { let layers, dim, heads, vocab, context: Int; let bits: Int }
  let info = Info(layers: 0, dim: 0, heads: 0, vocab: 0, context: 0, bits: 0)
  init?(modelPath: String, tokenizerPath: String) {}
  func answer(_ prompt: String, temperature: Float = 0.6, maxTokens: Int = 220) -> AsyncStream<String> { AsyncStream { $0.finish() } }
  func stop() {}
}
// CryptoKit's SHA256 (Apple SDK shape).
public struct SHA256Digest: Sequence, Sendable { public func makeIterator() -> IndexingIterator<[UInt8]> { [UInt8]().makeIterator() } }
public struct SHA256: Sendable { public init() {}; public mutating func update(data: Data) {}; public func finalize() -> SHA256Digest { SHA256Digest() } }
