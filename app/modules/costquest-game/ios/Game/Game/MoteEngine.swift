import Foundation
import OSLog

/// The language model, running on this phone.
///
/// Milestone 1 of the agreement is AIM quantized down to a small model and an
/// inference engine that runs it on the device, and this is where that lands in
/// the game. The engine is `mote`, written in C and vectorised with ARM NEON;
/// `Engine/` is a verbatim copy of its sources, built into this target.
///
/// Two decisions are worth stating because they are not obvious.
///
/// **It stays on the CPU.** RealityKit is drawing the venue every 16.7 ms with
/// camera passthrough behind it, and dropped frames degrade ARKit's tracking,
/// which is the thing M3 is judged on. Moving inference to Metal would buy
/// tokens per second out of the same GPU that is holding the world still. The
/// engine reserves a core so the main thread stays schedulable while a matmul
/// runs, which is what stops the interface freezing mid-answer.
///
/// **It answers offline.** That is the whole point of putting it here rather
/// than calling a server: a venue is a field, the network is one bar, and a
/// player who cannot get an answer about the rules while standing in the game
/// has no answer at all.
final class MoteEngine: @unchecked Sendable {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "mote")
    private var handle: OpaquePointer?

    /// One generation at a time. The KV cache is shared state, so a second
    /// answer started while the first is still unwinding would interleave into
    /// it and produce text from neither question.
    private let queue = DispatchQueue(label: "com.djmcevents.costquest.mote",
                                      qos: .userInitiated)
    private let stopping = OSAllocatedUnfairLock(initialState: false)

    let info: Info

    struct Info: Sendable {
        let layers, dim, heads, vocab, context: Int
        let bits: Int

        /// Roughly how many parameters, for saying what is running rather than
        /// claiming a number off a spec sheet.
        var summary: String {
            "int\(bits) · \(layers) layers · dim \(dim) · context \(context)"
        }
    }

    init?(modelPath: String, tokenizerPath: String) {
        guard let handle = mote_create_from_files(modelPath, tokenizerPath) else {
            let reason = mote_last_error().map { String(cString: $0) } ?? "unknown"
            Logger(subsystem: "com.djmcevents.costquest", category: "mote")
                .error("model would not load: \(reason)")
            return nil
        }
        self.handle = handle
        var raw = mote_info_t()
        mote_get_info(handle, &raw)
        info = Info(layers: Int(raw.n_layers), dim: Int(raw.dim),
                    heads: Int(raw.n_heads), vocab: Int(raw.vocab_size),
                    context: Int(raw.seq_len), bits: Int(raw.qbits))
    }

    deinit {
        if let handle { mote_free(handle) }
    }

    /// Ask it something, and receive the answer as it is written.
    ///
    /// Streamed rather than returned whole because the first token lands in a
    /// few hundred milliseconds and the last one does not. A player standing in
    /// a field watching a spinner assumes it has hung; a player watching words
    /// appear waits happily.
    func answer(_ prompt: String, temperature: Float = 0.6,
                maxTokens: Int = 220) -> AsyncStream<String> {
        AsyncStream { continuation in
            stopping.withLock { $0 = false }
            queue.async { [weak self] in
                guard let self, let handle = self.handle else {
                    continuation.finish(); return
                }
                var params = mote_params(temperature: temperature, topp: 0.9,
                                         // Small models loop verbatim without
                                         // this, and a looping answer at a
                                         // venue reads as a broken app.
                                         repeat_penalty: 1.1, seed: 0,
                                         max_tokens: Int32(maxTokens))
                let box = Unmanaged.passRetained(Sink(continuation: continuation,
                                                      engine: self)).toOpaque()
                mote_generate(handle, prompt, &params, { piece, user in
                    guard let piece, let user else { return 0 }
                    let sink = Unmanaged<Sink>.fromOpaque(user).takeUnretainedValue()
                    return sink.emit(String(cString: piece)) ? 1 : 0
                }, box)
                Unmanaged<Sink>.fromOpaque(box).release()
                continuation.finish()
            }
        }
    }

    /// Stop the answer in progress. Checked between tokens, so it takes effect
    /// within one token rather than at the end.
    func stop() {
        stopping.withLock { $0 = true }
    }

    private var isStopping: Bool { stopping.withLock { $0 } }

    /// Carries the continuation across the C callback boundary. A class,
    /// because what crosses is a raw pointer.
    private final class Sink {
        let continuation: AsyncStream<String>.Continuation
        weak var engine: MoteEngine?

        init(continuation: AsyncStream<String>.Continuation, engine: MoteEngine) {
            self.continuation = continuation
            self.engine = engine
        }

        func emit(_ piece: String) -> Bool {
            guard engine?.isStopping != true else { return false }
            continuation.yield(piece)
            return true
        }
    }
}
