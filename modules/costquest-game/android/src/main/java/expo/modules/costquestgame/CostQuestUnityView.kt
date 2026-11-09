package expo.modules.costquestgame

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.widget.TextView
import expo.modules.costquestgame.unity.UnityHosts
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/**
 * Hosts Unity's view (the duel, battle, hub and world scenes) inside the RN
 * game. Thin on purpose, like the iOS UnityWorldView/UnityDuelSurface: it
 * does not own the runtime (UnityBridge does, once per process) and never
 * tears Unity down. On the window it takes Unity's view and resumes it; off
 * the window it gives the view back and pauses Unity; paused = true pauses
 * Unity and leaves its last frame in place. Only one of these
 * shows Unity at a time: the last one attached wins.
 *
 * In a build without Unity it shows a one-line explanation instead, so the
 * JS side can mount it unconditionally (it should check hasUnity first).
 */
@SuppressLint("ViewConstructor")
class CostQuestUnityView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private var paused = false
  private var attached = false

  init {
    setBackgroundColor(Color.parseColor("#14061A"))
    if (UnityHosts.host == null) {
      addView(
        TextView(context).apply {
          text = "Fights need the Unity build of CosQuest."
          setTextColor(Color.WHITE)
          gravity = Gravity.CENTER
        },
        LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
      )
    }
  }

  fun setPaused(value: Boolean) {
    if (paused == value) return
    paused = value
    sync()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    attached = true
    sync()
  }

  override fun onDetachedFromWindow() {
    attached = false
    sync()
    super.onDetachedFromWindow()
  }

  /** Called when React drops the view for good. */
  fun dispose() {
    attached = false
    sync()
  }

  private fun sync() {
    val host = UnityHosts.host ?: return
    when {
      !attached -> host.detach(this)
      paused -> host.pauseIn(this)
      else -> host.attach(this, appContext.currentActivity ?: return)
    }
  }
}
