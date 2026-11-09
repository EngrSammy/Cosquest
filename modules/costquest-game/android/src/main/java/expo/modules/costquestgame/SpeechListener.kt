package expo.modules.costquestgame

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ListenOptions : Record {
  /** Shown only by recognisers that draw their own UI; the game draws its own prompt. */
  @Field val prompt: String? = null

  /** BCP 47, e.g. "en-GB". Default: the phone's language. */
  @Field val locale: String? = null

  /** The likeliest phrases (the answer choices); Android 13+ biases towards them. */
  @Field val choices: List<String>? = null

  /**
   * Refuse ("offline_unavailable") rather than fall back to a recogniser
   * that may send audio to a server. The game's voice answers set this:
   * iOS promises a player's voice never leaves the phone.
   */
  @Field val onDeviceOnly: Boolean = false
}

/**
 * Spoken answers (the Warden's questions): one utterance at a time, partial
 * results while the player speaks, then a final one.
 *
 * On-device first: Android 12+ phones with an on-device recogniser get it
 * (createOnDeviceSpeechRecognizer: audio never leaves the phone, as the
 * iOS game promises). Elsewhere the default recogniser is asked to prefer
 * offline (EXTRA_PREFER_OFFLINE), which is a preference, not a guarantee:
 * without a downloaded offline model Google's recogniser may use its
 * servers. start() reports which one it got ({ onDevice }).
 *
 * SpeechRecognizer must be created and driven on the main thread; every
 * method here expects to be called there. RECORD_AUDIO must already be
 * granted (the JS side asks, with the chat's microphone flow).
 */
class SpeechListener(
  private val context: Context,
  private val onResult: (text: String, final: Boolean) -> Unit,
  private val onError: (code: String, message: String) -> Unit,
) {
  private var recognizer: SpeechRecognizer? = null

  /** @return true when the on-device recogniser is used. */
  fun start(options: ListenOptions): Boolean {
    // A recogniser still waiting for its final result is dropped, not leaked.
    destroy()
    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      throw SpeechException("permission_denied", "Microphone permission is not granted.")
    }
    val onDevice = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    if (!onDevice && options.onDeviceOnly) {
      throw SpeechException("offline_unavailable", "This phone has no on-device speech recogniser.")
    }
    if (!onDevice && !SpeechRecognizer.isRecognitionAvailable(context)) {
      throw SpeechException("unavailable", "This phone has no speech recogniser.")
    }
    val r = if (onDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
    } else {
      SpeechRecognizer.createSpeechRecognizer(context)
    }
    r.setRecognitionListener(listener)
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
      options.locale?.takeIf { it.isNotBlank() }?.let { putExtra(RecognizerIntent.EXTRA_LANGUAGE, it) }
      options.prompt?.takeIf { it.isNotBlank() }?.let { putExtra(RecognizerIntent.EXTRA_PROMPT, it) }
      // The answer choices, like iOS's contextualStrings: "Alfred", not "all fred".
      val bias = options.choices?.filter { it.isNotBlank() }.orEmpty()
      if (bias.isNotEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, ArrayList(bias))
      }
    }
    recognizer = r
    r.startListening(intent)
    return onDevice
  }

  /** Stops listening; a final result may still arrive. Safe when idle. */
  fun stop() {
    recognizer?.let {
      try {
        it.stopListening()
      } catch (_: Exception) {
      }
    }
  }

  /** Drops the recogniser (module teardown, or a new start). */
  fun destroy() {
    recognizer?.let {
      try {
        it.cancel()
        it.destroy()
      } catch (_: Exception) {
      }
    }
    recognizer = null
  }

  private fun finish() {
    recognizer?.let {
      try {
        it.destroy()
      } catch (_: Exception) {
      }
    }
    recognizer = null
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}

    override fun onPartialResults(partialResults: Bundle?) {
      best(partialResults)?.let { onResult(it, false) }
    }

    override fun onResults(results: Bundle?) {
      onResult(best(results) ?: "", true)
      finish()
    }

    override fun onError(error: Int) {
      val (code, message) = describe(error)
      onError(code, message)
      finish()
    }
  }

  private fun best(bundle: Bundle?): String? =
    bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }

  companion object {
    fun describe(error: Int): Pair<String, String> = when (error) {
      SpeechRecognizer.ERROR_NO_MATCH -> "no_match" to "Didn't catch that."
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech_timeout" to "No speech heard."
      SpeechRecognizer.ERROR_AUDIO -> "audio" to "The microphone could not be read."
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission_denied" to "Microphone permission is not granted."
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network" to "The recogniser needs a network it cannot reach."
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy" to "The recogniser is busy."
      SpeechRecognizer.ERROR_CLIENT -> "client" to "Recognition was stopped."
      SpeechRecognizer.ERROR_SERVER -> "server" to "The recogniser failed."
      // API 31+ codes, by value so minSdk 26 compiles without lint noise.
      10 -> "too_many_requests" to "Too many recognition requests."
      11 -> "server_disconnected" to "The recogniser went away."
      12 -> "language_not_supported" to "This language is not supported by the recogniser."
      13 -> "language_unavailable" to "This language is not downloaded on the phone yet."
      14 -> "cannot_check_support" to "Could not check the recogniser's languages."
      else -> "error_$error" to "Speech recognition failed ($error)."
    }
  }
}

class SpeechException(val code: String, message: String) : Exception(message)
