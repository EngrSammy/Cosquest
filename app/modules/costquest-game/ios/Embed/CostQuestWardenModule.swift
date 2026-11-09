import CryptoKit
import ExpoModulesCore
import Foundation
import os

// The Warden's on-device model for the shared React Native game, iOS half.
// Same module name, functions, results and error codes as the Android one
// (modules/costquest-warden/android, CostQuestWardenModule.kt), so
// modules/costquest-warden/src/index.ts and features/game/wardenModel.ts run
// unchanged on both platforms.
//
// It lives in this pod, not in modules/costquest-warden, because the engine
// does: Game/Engine is the mote C engine and Game/Game/MoteEngine.swift its
// Swift face, both already built here for the native game. This file only
// adapts MoteEngine's streamed answer to the one-shot `generate` the JS
// expects. The native game keeps its own engine (ModelStore); the two are
// never loaded at once because only one game UI runs in a build.

struct WardenInfoRecord: Record {
  @Field var dim: Int? = nil
  @Field var layers: Int? = nil
  @Field var heads: Int? = nil
  @Field var vocab: Int? = nil
  @Field var context: Int? = nil
  @Field var bits: Int? = nil
}

struct WardenGenerationRecord: Record {
  @Field var text: String = ""
  @Field var tokens: Int = 0
  @Field var firstTokenMs: Double = 0
  @Field var totalMs: Double = 0
  @Field var tokensPerSecond: Double = 0
}

/// The one engine, one generation at a time (the KV cache is shared).
actor WardenEngineHolder {
  static let shared = WardenEngineHolder()

  private var engine: MoteEngine?
  private var loadedModel: String?
  /// Read by `stop()`, which must not wait for the actor (a generation holds it).
  nonisolated let current = OSAllocatedUnfairLock<MoteEngine?>(initialState: nil)

  struct Info: Sendable {
    var dim, layers, heads, vocab, context, bits: Int
  }

  struct Generation: Sendable {
    var text: String
    var tokens: Int
    var firstTokenMs: Double
    var totalMs: Double
  }

  func load(model: String, tokenizer: String) throws -> Info {
    if loadedModel != model || engine == nil {
      current.withLock { $0 = nil }
      engine = nil
      guard let made = MoteEngine(modelPath: model, tokenizerPath: tokenizer) else {
        loadedModel = nil
        throw wardenError("ERR_WARDEN_LOAD", "The model did not load.")
      }
      engine = made
      loadedModel = model
      current.withLock { $0 = made }
    }
    let i = engine!.info
    return Info(dim: i.dim, layers: i.layers, heads: i.heads, vocab: i.vocab, context: i.context, bits: i.bits)
  }

  func generate(prompt: String, maxTokens: Int, temperature: Double) async throws -> Generation {
    guard let engine else { throw wardenError("ERR_WARDEN_NOT_LOADED", "No model is loaded.") }
    let clock = ContinuousClock()
    let start = clock.now
    var first: Duration?
    var text = ""
    var tokens = 0
    // MoteEngine streams pieces (one per token) from its own queue. The
    // Warden says one line: stop at the first newline or end-of-turn mark,
    // as the Android JNI sink does (warden_jni.c on_piece).
    for await piece in engine.answer(prompt, temperature: Float(temperature), maxTokens: maxTokens) {
      if first == nil { first = clock.now - start }
      tokens += 1
      text += piece
      if let cut = text.range(of: "\n") ?? text.range(of: "<|im_end|>") {
        text = String(text[..<cut.lowerBound])
        engine.stop()
        break
      }
    }
    let total = clock.now - start
    return Generation(text: text, tokens: tokens, firstTokenMs: first.map(Self.ms) ?? 0, totalMs: Self.ms(total))
  }

  func unload() {
    current.withLock { $0 = nil }
    engine = nil
    loadedModel = nil
  }

  private static func ms(_ d: Duration) -> Double {
    let c = d.components
    return Double(c.seconds) * 1000 + Double(c.attoseconds) / 1e15
  }
}

func wardenError(_ code: String, _ message: String) -> Exception {
  Exception(name: "CostQuestWarden", description: message, code: code)
}

public final class CostQuestWardenModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CostQuestWarden")

    Constants {
      [
        // The engine is compiled into this pod on every iOS build.
        "available": true,
        "physicalMemory": Double(ProcessInfo.processInfo.physicalMemory),
        "abi": "arm64",
      ]
    }

    AsyncFunction("load") { (model: String, tokenizer: String) async throws -> WardenInfoRecord in
      Self.keepOutOfBackup(Self.path(model))
      Self.keepOutOfBackup(Self.path(tokenizer))
      let info = try await WardenEngineHolder.shared.load(model: Self.path(model), tokenizer: Self.path(tokenizer))
      var r = WardenInfoRecord()
      r.dim = info.dim
      r.layers = info.layers
      r.heads = info.heads
      r.vocab = info.vocab
      r.context = info.context
      r.bits = info.bits
      return r
    }

    AsyncFunction("generate") { (prompt: String, maxTokens: Int, temperature: Double) async throws -> WardenGenerationRecord in
      let g = try await WardenEngineHolder.shared.generate(prompt: prompt, maxTokens: maxTokens, temperature: temperature)
      var r = WardenGenerationRecord()
      r.text = g.text
      r.tokens = g.tokens
      r.firstTokenMs = g.firstTokenMs
      r.totalMs = g.totalMs
      let genMs = g.totalMs - g.firstTokenMs
      r.tokensPerSecond = g.tokens > 1 && genMs > 0 ? Double(g.tokens - 1) * 1000 / genMs : 0
      return r
    }

    /// Stops the line being written, between tokens (a more urgent line wants the engine).
    Function("stop") {
      let engine = WardenEngineHolder.shared.current.withLock { $0 }
      engine?.stop()
    }

    AsyncFunction("unload") { () async in
      await WardenEngineHolder.shared.unload()
    }

    /// A file's sha256, streamed (the model is too big to hash in JS).
    AsyncFunction("sha256File") { (uriOrPath: String) async throws -> String in
      let path = Self.path(uriOrPath)
      // Checked once it has downloaded: the moment to take it out of backups.
      Self.keepOutOfBackup(path)
      return try await Task.detached(priority: .utility) {
        guard let handle = FileHandle(forReadingAtPath: path) else {
          throw wardenError("ERR_WARDEN_HASH", "Could not read the file.")
        }
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
          let chunk = try handle.read(upToCount: 1 << 20) ?? Data()
          if chunk.isEmpty { break }
          hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
      }.value
    }
  }

  /// The model (300 MB to 1 GB) and its folder are not iCloud backup
  /// material: they download again (ModelStore kept them in Application
  /// Support with isExcludedFromBackup; features/game/wardenModel.ts keeps
  /// them under Documents/warden, so the flag is set here).
  private static func keepOutOfBackup(_ path: String) {
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var file = URL(fileURLWithPath: path)
    try? file.setResourceValues(values)
    var folder = file.deletingLastPathComponent()
    try? folder.setResourceValues(values)
  }

  /// expo-file-system hands `file://` URIs; the engine wants paths.
  private static func path(_ uriOrPath: String) -> String {
    if uriOrPath.hasPrefix("file://"), let url = URL(string: uriOrPath) { return url.path }
    return uriOrPath
  }
}
