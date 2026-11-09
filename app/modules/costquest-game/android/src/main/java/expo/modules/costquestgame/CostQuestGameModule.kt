package expo.modules.costquestgame

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.nfc.NfcAdapter
import android.os.Debug
import expo.modules.costquestgame.unity.CQUnityEvents
import expo.modules.costquestgame.unity.UnityHosts
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The CostQuest game module on Android.
 *
 * The Android game is the React Native one (src/rnGame.ts implements the
 * game API in TypeScript), so this module is a helper provider: what only
 * the platform knows or can do. src/index.ts reads it as `nativeHelpers`.
 *
 * Constants: available, hasUnity, physicalMemory, nfcAvailable,
 * uwbAvailable, upstream.
 * Helpers: setGestureExclusion, startNfcScan/stopNfcScan (onNfcTag),
 * startListening/stopListening (onSpeechResult, onSpeechError),
 * startUwbRanging (documented stub), memoryReport.
 * Unity (only does something in a Unity build, see android/build.gradle):
 * unityStartDuel, unityDemoDuel, unityQuit, unitySend, unityPause, event
 * onUnityEvent, view CostQuestUnityView.
 *
 * The game-API functions the iOS module has (prewarm, pause, resume, open,
 * setSession, setUnread, setCallPill, handleURL, reset) and its events stay
 * here as no-ops, so nothing that still calls the native module directly
 * breaks; on Android the shell talks to rnGame.ts instead.
 *
 * Text-to-speech is expo-speech's job in JS; not duplicated here.
 */
class CostQuestGameModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is gone", null)

  private var nfc: NfcReader? = null
  private var speech: SpeechListener? = null
  private var unityPausedForBackground = false

  private val memoryCallbacks = object : ComponentCallbacks2 {
    override fun onTrimMemory(level: Int) {
      UnityHosts.host?.trimMemory(level)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {}

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onLowMemory() {
      UnityHosts.host?.trimMemory(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("CostQuestGame")

    Events(
      // The game API's events (iOS module); never sent on Android.
      "onReady", "onSession", "onShareToChat", "onRequestChat", "onError",
      // Android helpers.
      "onNfcTag", "onSpeechResult", "onSpeechError", "onUnityEvent"
    )

    Constant("available") { true }
    /** Unity's player classes AND the bridge are in this APK (a unityAndroid build). */
    Constant("hasUnity") { UnityHosts.unityOnClasspath && UnityHosts.host != null }
    /** Bytes of RAM (ActivityManager.MemoryInfo.totalMem), for the prewarm policy. */
    Constant("physicalMemory") { appContext.reactContext?.let { totalMemory(it) } ?: 0.0 }
    /** The phone has an NFC controller (it may still be switched off: startNfcScan says so). */
    Constant("nfcAvailable") { appContext.reactContext?.let { NfcAdapter.getDefaultAdapter(it) != null } ?: false }
    /** PackageManager.FEATURE_UWB (API 31), by name so minSdk 26 compiles. */
    Constant("uwbAvailable") { appContext.reactContext?.packageManager?.hasSystemFeature("android.hardware.uwb") == true }
    Constant("upstream") { "android-helpers" }
    /** The phone has a hardware step counter (Sensor.TYPE_STEP_COUNTER), for walking rewards. */
    Constant("stepCounterAvailable") { appContext.reactContext?.let { StepCounter.available(it) } ?: false }

    OnCreate {
      CQUnityEvents.sink = { scene, kind, json ->
        sendEvent("onUnityEvent", mapOf("scene" to scene, "kind" to kind, "json" to json))
      }
      appContext.reactContext?.applicationContext?.registerComponentCallbacks(memoryCallbacks)
    }

    OnDestroy {
      CQUnityEvents.sink = null
      appContext.reactContext?.applicationContext?.unregisterComponentCallbacks(memoryCallbacks)
      val n = nfc
      val s = speech
      nfc = null
      speech = null
      if (n != null || s != null) {
        appContext.currentActivity?.runOnUiThread {
          n?.stop()
          s?.destroy()
        }
      }
    }

    OnActivityEntersBackground {
      nfc?.suspend()
      speech?.stop()
      UnityHosts.host?.let { host ->
        if (host.showing) {
          host.pause(true)
          unityPausedForBackground = true
        }
      }
    }

    OnActivityEntersForeground {
      nfc?.resume()
      UnityHosts.host?.let { host ->
        if (unityPausedForBackground) {
          unityPausedForBackground = false
          host.focusChanged(true)
          host.pause(false)
        }
      }
    }

    // --- The game API (iOS module), no-ops on Android -------------------

    AsyncFunction("prewarm") {}
    AsyncFunction("pause") {}
    AsyncFunction("resume") {}
    AsyncFunction("open") { _: Map<String, Any?> -> }
    AsyncFunction("setSession") { _: String? -> }
    AsyncFunction("setUnread") { _: Int, _: List<Map<String, Any?>> -> }
    AsyncFunction("setCallPill") { _: Map<String, Any?>? -> }
    AsyncFunction("handleURL") { _: String -> }
    AsyncFunction("reset") {}

    /** Bytes: total RAM, this process's proportional set size, and what the system has free. */
    Function("memoryReport") {
      val ctx = context
      val info = ActivityManager.MemoryInfo()
      (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
      mapOf(
        "physical" to info.totalMem.toDouble(),
        "footprint" to Debug.getPss() * 1024.0,
        "available" to info.availMem.toDouble()
      )
    }

    // --- Gestures ---------------------------------------------------------

    /**
     * Keeps the system back gesture off these strips (dp, window coords).
     * Each rect is clamped to 200dp tall around its centre: Android honours
     * at most 200dp per edge (see GestureExclusion). An empty list clears.
     */
    AsyncFunction("setGestureExclusion") { rects: List<ExclusionRect> ->
      GestureExclusion.apply(appContext.currentActivity, rects)
    }.runOnQueue(Queues.MAIN)

    // --- NFC checkpoints --------------------------------------------------

    AsyncFunction("startNfcScan") {
      val activity = appContext.currentActivity ?: throw CodedException("ERR_NO_ACTIVITY", "No activity", null)
      val reader = nfc ?: NfcReader { id, text ->
        sendEvent("onNfcTag", mapOf("id" to id, "ndefText" to text))
      }.also { nfc = it }
      try {
        reader.start(activity)
      } catch (e: NfcException) {
        throw CodedException(e.code, e.message, null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopNfcScan") {
      nfc?.stop()
    }.runOnQueue(Queues.MAIN)

    // --- Spoken answers ---------------------------------------------------

    /** Resolves { onDevice } once listening has started; results come as events. */
    AsyncFunction("startListening") { options: ListenOptions? ->
      val listener = speech ?: SpeechListener(
        context,
        onResult = { text, final -> sendEvent("onSpeechResult", mapOf("text" to text, "final" to final)) },
        onError = { code, message -> sendEvent("onSpeechError", mapOf("code" to code, "message" to message)) }
      ).also { speech = it }
      val onDevice = try {
        listener.start(options ?: ListenOptions())
      } catch (e: SpeechException) {
        throw CodedException(e.code, e.message, null)
      }
      mapOf("onDevice" to onDevice)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopListening") {
      speech?.stop()
    }.runOnQueue(Queues.MAIN)

    /** Stops and drops the utterance: no result or error event follows (a new start() is clean). */
    AsyncFunction("cancelListening") {
      speech?.destroy()
    }.runOnQueue(Queues.MAIN)

    // --- Walking (steps) ---------------------------------------------------

    /** One read of the step counter: { steps, elapsedRealtimeMs, wallClockMs, available } (StepCounter.kt). */
    AsyncFunction("readStepCounter") { promise: expo.modules.kotlin.Promise ->
      StepCounter.read(context, promise)
    }

    // --- Run and raid clocks (LiveTimers.kt, an ongoing chronometer notification) ---

    Function("liveTimerSupported") { appContext.reactContext?.let { LiveTimers.supported(it) } ?: false }

    AsyncFunction("liveTimerStart") { kind: String, title: String, subtitle: String, link: String, endsAtMs: Double, state: Map<String, Any?>? ->
      LiveTimers.start(context, kind, title, subtitle, link, endsAtMs, state)
    }

    AsyncFunction("liveTimerUpdate") { id: String, state: Map<String, Any?>?, endsAtMs: Double? ->
      LiveTimers.update(context, id, state, endsAtMs)
    }

    AsyncFunction("liveTimerEnd") { id: String, last: Map<String, Any?>? ->
      LiveTimers.end(context, id, last)
    }

    // --- UWB ----------------------------------------------------------------

    /**
     * STUB. androidx.core.uwb can range, but a session needs the peer's UWB
     * address and session parameters exchanged out of band first. On iOS
     * that exchange rides the game's peer mesh (Bonjour, MultipeerConnectivity
     * and NearbyInteraction tokens); Android has no mesh yet, so there is
     * nothing to carry it. uwbAvailable says whether the hardware is there.
     * Not adding androidx.core.uwb until the mesh exists keeps the APK lean.
     */
    AsyncFunction("startUwbRanging") { _: Map<String, Any?>? ->
      uwbNotYet()
    }

    // --- Unity (fights) ---------------------------------------------------

    /** DuelBridge.StartDuel(setupJson): boots Unity if needed, then starts the fight. */
    AsyncFunction("unityStartDuel") { setupJson: String ->
      val host = requireUnity()
      val activity = appContext.currentActivity ?: throw CodedException("ERR_NO_ACTIVITY", "No activity", null)
      if (!host.start(activity)) throw CodedException("ERR_UNITY_START", "Unity did not start", null)
      host.send("DuelBridge", "StartDuel", setupJson)
    }.runOnQueue(Queues.MAIN)

    /** DuelBridge.DemoDuel: an offline practice fight. */
    AsyncFunction("unityDemoDuel") {
      val host = requireUnity()
      val activity = appContext.currentActivity ?: throw CodedException("ERR_NO_ACTIVITY", "No activity", null)
      if (!host.start(activity)) throw CodedException("ERR_UNITY_START", "Unity did not start", null)
      host.send("DuelBridge", "DemoDuel", "")
    }.runOnQueue(Queues.MAIN)

    /**
     * BattleBridge.StartBattle(setupJson), the iOS name. The Android export's
     * Battle scene is not detected, so `hasBattleScene` is left out (false)
     * and the RN game never asks the server for a battle here.
     */
    AsyncFunction("unityStartBattle") { setupJson: String ->
      val host = requireUnity()
      val activity = appContext.currentActivity ?: throw CodedException("ERR_NO_ACTIVITY", "No activity", null)
      if (!host.start(activity)) throw CodedException("ERR_UNITY_START", "Unity did not start", null)
      host.send("BattleBridge", "StartBattle", setupJson)
    }.runOnQueue(Queues.MAIN)

    /** DuelBridge.Quit. Unity stays loaded (it cannot be restarted); it is paused when its view goes. */
    AsyncFunction("unityQuit") {
      UnityHosts.host?.send("DuelBridge", "Quit", "")
    }.runOnQueue(Queues.MAIN)

    /** Any other bridge message (WorldRoot, HubBridge, BattleBridge; see FRAMEWORK_PIN.md). */
    AsyncFunction("unitySend") { gameObject: String, method: String, message: String? ->
      requireUnity().send(gameObject, method, message ?: "")
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("unityPause") { paused: Boolean ->
      UnityHosts.host?.pause(paused)
    }.runOnQueue(Queues.MAIN)

    // --- Views --------------------------------------------------------------

    // The iOS game's view name, kept so requireNativeView("CostQuestGame")
    // still resolves; the RN game does not use it on Android.
    View(CostQuestGameView::class) {
      Prop("accessibilityLabel") { view: CostQuestGameView, label: String? ->
        view.contentDescription = label
      }
      Prop("parked") { _: CostQuestGameView, _: Boolean? -> }
    }

    // requireNativeView("CostQuestGame", "CostQuestUnityView")
    View(CostQuestUnityView::class) {
      Prop("paused") { view: CostQuestUnityView, paused: Boolean? ->
        view.setPaused(paused == true)
      }
      Prop("accessibilityLabel") { view: CostQuestUnityView, label: String? ->
        view.contentDescription = label
      }
      OnViewDestroys { view -> view.dispose() }
    }
  }

  // Declared Unit (not Nothing): Expo reifies the function's return type.
  private fun uwbNotYet(): Unit = throw CodedException(
    "ERR_UWB_NO_MESH",
    "UWB ranging needs the peer mesh to exchange session parameters; it is not on Android yet.",
    null
  )

  private fun requireUnity() =
    UnityHosts.host ?: throw CodedException("ERR_NO_UNITY", "This build has no Unity (hasUnity is false).", null)

  private fun totalMemory(ctx: Context): Double {
    val info = ActivityManager.MemoryInfo()
    (ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
    return info.totalMem.toDouble()
  }
}
