package expo.modules.costquestgame.unity

import android.app.Activity
import android.util.Log
import android.view.ViewGroup

/**
 * What the module needs from the embedded Unity runtime. The implementation
 * (src/unity/java/.../UnityBridge.kt) references com.unity3d.player and is
 * compiled only into Unity builds, so the module never names it: [UnityHosts]
 * finds it by reflection.
 *
 * Same rules as the iOS UnityBridge (ios/Game/Unity/UnityBridge.swift):
 * one Unity per process, started on first use and never torn down (Unity
 * cannot be restarted in the same process); afterwards it is only shown,
 * hidden, paused and resumed. All methods must be called on the main thread.
 */
interface UnityHost {
  /** True once the player exists. */
  val running: Boolean

  /** True while Unity's view is in a container and not paused. */
  val showing: Boolean

  /** Creates the player if needed (needs the activity). Returns false if Unity failed to start. */
  fun start(activity: Activity): Boolean

  /** Puts Unity's view into [container] (taking it from any previous one) and resumes it. */
  fun attach(container: ViewGroup, activity: Activity): Boolean

  /** Takes Unity's view out of [container] if it is there, and pauses Unity. */
  fun detach(container: ViewGroup)

  /** Pauses Unity if its view is in [container] (the view's paused prop); the view stays put. */
  fun pauseIn(container: ViewGroup)

  /** UnitySendMessage(gameObject, method, message). A no-op before start, like iOS. */
  fun send(gameObject: String, method: String, message: String)

  /** Stops rendering without tearing down (off screen, app in background). */
  fun pause(paused: Boolean)

  /** The app's window gained or lost focus; Unity renders only while it believes it has focus. */
  fun focusChanged(hasFocus: Boolean)

  /** Memory pressure from the system (ComponentCallbacks2 level). */
  fun trimMemory(level: Int)
}

object UnityHosts {
  private const val IMPL = "expo.modules.costquestgame.unity.UnityBridge"

  /** Unity's player classes are in the APK (the app was built with the Unity export). */
  val unityOnClasspath: Boolean by lazy {
    try {
      Class.forName("com.unity3d.player.UnityPlayer")
      true
    } catch (_: Throwable) {
      false
    }
  }

  /** The bridge, or null in a build without Unity. */
  val host: UnityHost? by lazy {
    if (!unityOnClasspath) return@lazy null
    try {
      Class.forName(IMPL).getField("INSTANCE").get(null) as UnityHost
    } catch (e: Throwable) {
      Log.e("CostQuestUnity", "Unity is in the APK but the bridge is not", e)
      null
    }
  }
}
