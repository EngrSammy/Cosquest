package expo.modules.costquestwarden

import android.app.ActivityManager
import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

// The Warden's on-device model for the React Native game (Android). JS side:
// modules/costquest-warden/src/index.ts and features/game/wardenModel.ts,
// which download and verify the model the game server names (GET /v1/model)
// and hand this module the paths. The iOS native game has its own
// (Game/MoteEngine.swift); both run the same C.
class CostQuestWardenModule : Module() {
  // One thread: the engine is one model and one generation at a time.
  private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "warden-mote").apply { priority = Thread.NORM_PRIORITY - 1 } }
  // Hashing a few hundred MB must not wait behind a generation, nor block one.
  private val hasher = Executors.newSingleThreadExecutor { r -> Thread(r, "warden-sha256") }
  private var loadedModel: String? = null

  private fun path(uriOrPath: String): String = uriOrPath.removePrefix("file://")

  override fun definition() = ModuleDefinition {
    Name("CostQuestWarden")

    Constants(
      "available" to MoteNative.ready,
      "physicalMemory" to physicalMemory(),
      "abi" to (android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
    )

    AsyncFunction("load") { model: String, tokenizer: String, promise: expo.modules.kotlin.Promise ->
      worker.execute {
        try {
          if (!MoteNative.ready) throw CodedException("ERR_WARDEN_NATIVE", "The model engine is not in this build.", null)
          val m = path(model)
          val t = path(tokenizer)
          if (loadedModel != m) {
            val error = MoteNative.load(m, t)
            if (error != null) throw CodedException("ERR_WARDEN_LOAD", error, null)
            loadedModel = m
          }
          val i = MoteNative.info() ?: intArrayOf()
          promise.resolve(
            mapOf(
              "dim" to i.getOrNull(0), "layers" to i.getOrNull(2), "heads" to i.getOrNull(3),
              "vocab" to i.getOrNull(5), "context" to i.getOrNull(6), "bits" to i.getOrNull(8)
            )
          )
        } catch (e: CodedException) {
          promise.reject(e)
        } catch (e: Throwable) {
          promise.reject(CodedException("ERR_WARDEN_LOAD", e.message ?: "the model did not load", e))
        }
      }
    }

    AsyncFunction("generate") { prompt: String, maxTokens: Int, temperature: Double, promise: expo.modules.kotlin.Promise ->
      worker.execute {
        try {
          if (loadedModel == null) throw CodedException("ERR_WARDEN_NOT_LOADED", "No model is loaded.", null)
          val stats = LongArray(3)
          val bytes = MoteNative.generate(prompt, maxTokens, temperature.toFloat(), 0L, stats) ?: ByteArray(0)
          val tokens = stats[0]
          val firstMs = stats[1] / 1_000_000.0
          val totalMs = stats[2] / 1_000_000.0
          val genMs = totalMs - firstMs
          promise.resolve(
            mapOf(
              "text" to String(bytes, Charsets.UTF_8),
              "tokens" to tokens,
              "firstTokenMs" to firstMs,
              "totalMs" to totalMs,
              "tokensPerSecond" to (if (tokens > 1 && genMs > 0) (tokens - 1) * 1000.0 / genMs else 0.0)
            )
          )
        } catch (e: CodedException) {
          promise.reject(e)
        } catch (e: Throwable) {
          promise.reject(CodedException("ERR_WARDEN_GENERATE", e.message ?: "generation failed", e))
        }
      }
    }

    // Stops the line being written, between tokens (a more urgent line wants the engine).
    Function("stop") {
      if (MoteNative.ready) MoteNative.stop()
    }

    AsyncFunction("unload") { promise: expo.modules.kotlin.Promise ->
      worker.execute {
        if (MoteNative.ready) MoteNative.unload()
        loadedModel = null
        promise.resolve(null)
      }
    }

    // A file's sha256, streamed (the model is too big to hash in JS).
    AsyncFunction("sha256File") { uriOrPath: String, promise: expo.modules.kotlin.Promise ->
      hasher.execute {
        try {
          val digest = MessageDigest.getInstance("SHA-256")
          FileInputStream(File(path(uriOrPath))).use { input ->
            val buffer = ByteArray(1 shl 20)
            while (true) {
              val n = input.read(buffer)
              if (n < 0) break
              digest.update(buffer, 0, n)
            }
          }
          promise.resolve(digest.digest().joinToString("") { "%02x".format(it) })
        } catch (e: Throwable) {
          promise.reject(CodedException("ERR_WARDEN_HASH", e.message ?: "could not read the file", e))
        }
      }
    }

    OnDestroy {
      MoteNative.stop()
      worker.shutdown()
      hasher.shutdown()
    }
  }

  private fun physicalMemory(): Long {
    val context = appContext.reactContext ?: return 0L
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return 0L
    val info = ActivityManager.MemoryInfo()
    am.getMemoryInfo(info)
    return info.totalMem
  }
}
