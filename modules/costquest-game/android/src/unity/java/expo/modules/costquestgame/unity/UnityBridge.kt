package expo.modules.costquestgame.unity

import android.app.Activity
import android.content.ComponentCallbacks2
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import com.unity3d.player.IUnityPlayerLifecycleEvents
import com.unity3d.player.UnityPlayer
import com.unity3d.player.UnityPlayerForActivityOrService

/**
 * The embedded Unity runtime on Android (Unity 6 "Unity as a Library").
 * COMPILED ONLY INTO UNITY BUILDS: this source set (src/unity/java) is added
 * by android/build.gradle when the app includes :unityLibrary.
 *
 * The Android counterpart of ios/Game/Unity/UnityBridge.swift:
 *  - one UnityPlayer per process, created lazily on first use and never
 *    destroyed (Unity cannot be restarted in the same process; destroy()
 *    would also kill the process in Unity 6);
 *  - Unity's FrameLayout is moved into whichever CostQuestUnityView is on
 *    screen, never into an activity of its own (UnityPlayerActivity is
 *    removed from the manifest by the config plugin);
 *  - main-thread only.
 *
 * Unity 6 API: UnityPlayerForActivityOrService(context, lifecycleEvents) and
 * getFrameLayout(); the export must use Application Entry = Activity (the
 * export script sets it), not GameActivity.
 */
object UnityBridge : UnityHost, IUnityPlayerLifecycleEvents {
  private const val TAG = "CostQuestUnity"

  private var player: UnityPlayerForActivityOrService? = null
  private var failed = false
  private var paused = false
  private var owner: ViewGroup? = null

  override val running: Boolean get() = player != null

  override val showing: Boolean get() = player != null && owner != null && !paused

  override fun start(activity: Activity): Boolean {
    if (player != null) return true
    if (failed) return false
    return try {
      // Unity reads its command line from the activity's intent extra "unity"
      // (UnityPlayerActivity sets it); leave the host's intent as it is.
      val p = UnityPlayerForActivityOrService(activity, this)
      player = p
      paused = false
      Log.i(TAG, "Unity started")
      true
    } catch (e: Throwable) {
      // A missing libunity.so / libil2cpp.so (wrong ABI: Unity is arm64-v8a
      // only) lands here instead of crashing the app.
      Log.e(TAG, "Unity did not start", e)
      failed = true
      false
    }
  }

  override fun attach(container: ViewGroup, activity: Activity): Boolean {
    if (!start(activity)) return false
    val p = player ?: return false
    val frame: FrameLayout = p.frameLayout
    if (frame.parent !== container) {
      (frame.parent as? ViewGroup)?.removeView(frame)
      container.addView(frame, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    owner = container
    // Unity only renders while it believes its window has focus; embedded,
    // nothing forwards the activity's onWindowFocusChanged to it.
    p.windowFocusChanged(true)
    pause(false)
    frame.requestFocus()
    return true
  }

  override fun detach(container: ViewGroup) {
    val p = player ?: return
    if (owner !== container) return
    pause(true)
    val frame = p.frameLayout
    if (frame.parent === container) container.removeView(frame)
    owner = null
  }

  override fun pauseIn(container: ViewGroup) {
    if (owner === container) pause(true)
  }

  override fun send(gameObject: String, method: String, message: String) {
    if (player == null) {
      Log.w(TAG, "$gameObject.$method before Unity started: dropped")
      return
    }
    UnityPlayer.UnitySendMessage(gameObject, method, message)
  }

  override fun pause(paused: Boolean) {
    val p = player ?: return
    if (paused == this.paused) return
    // onPause/onResume: what Unity's own UnityPlayerActivity calls. In Unity 6
    // they reach the same setupUnityToBePaused/Resumed as the deprecated
    // pause()/resume() (checked against 6000.0.84f1's classes.jar).
    if (paused) p.onPause() else p.onResume()
    this.paused = paused
  }

  override fun focusChanged(hasFocus: Boolean) {
    player?.windowFocusChanged(hasFocus)
  }

  override fun trimMemory(level: Int) {
    val p = player ?: return
    // The same mapping as Unity's own UnityPlayerActivity, plus COMPLETE
    // (what the module passes for onLowMemory).
    @Suppress("DEPRECATION")
    val usage = when (level) {
      ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE -> UnityPlayerForActivityOrService.MemoryUsage.Medium
      ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> UnityPlayerForActivityOrService.MemoryUsage.High
      ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL,
      ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> UnityPlayerForActivityOrService.MemoryUsage.Critical
      else -> return
    }
    p.onTrimMemory(usage)
  }

  // IUnityPlayerLifecycleEvents. Unity calls these when its own code asks to
  // unload or quit (Application.Unload / Application.Quit). The app keeps
  // running; report it so the game can leave the fight screen.
  override fun onUnityPlayerUnloaded() {
    Log.i(TAG, "Unity unloaded itself")
    CQUnityEvents.sink?.invoke("unity", "unloaded", "")
  }

  override fun onUnityPlayerQuitted() {
    Log.i(TAG, "Unity quit")
    player = null
    owner = null
    failed = true // cannot be restarted in this process
    CQUnityEvents.sink?.invoke("unity", "quit", "")
  }
}
