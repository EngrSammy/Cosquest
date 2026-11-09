package expo.modules.costquestgame

import android.app.Activity
import android.graphics.Rect
import android.os.Build
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlin.math.roundToInt

/** One strip to keep the system back gesture off, in dp, window coordinates. */
class ExclusionRect : Record {
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
  @Field val width: Double = 0.0
  @Field val height: Double = 0.0
}

/**
 * System gesture exclusion (Android 10+): the shell's edge strips that start
 * the world swipe must not also start the system back gesture.
 *
 * The rects are in dp, in WINDOW coordinates (the decor view's own space;
 * with edge-to-edge on, that is the whole screen, status bar included).
 *
 * Android honours at most 200dp of exclusion per vertical screen edge
 * (View#setSystemGestureExclusionRects). A taller rect is not an error, the
 * system just ignores what is over the limit, which is hard to predict from
 * JS. So each rect is clamped here to 200dp tall, centred on the rect the
 * caller asked for. Several rects on the same edge still share the one 200dp
 * budget; keep it to one strip per edge.
 */
object GestureExclusion {
  const val MAX_EDGE_DP = 200.0

  /** The rect the system will honour, in px. Exposed for reasoning, not tests (no JVM tests here). */
  fun toPixels(rect: ExclusionRect, density: Float): Rect {
    var top = rect.y
    var height = rect.height.coerceAtLeast(0.0)
    if (height > MAX_EDGE_DP) {
      top += (height - MAX_EDGE_DP) / 2.0
      height = MAX_EDGE_DP
    }
    val left = (rect.x * density).roundToInt()
    val right = ((rect.x + rect.width.coerceAtLeast(0.0)) * density).roundToInt()
    val t = (top * density).roundToInt()
    val b = ((top + height) * density).roundToInt()
    return Rect(left, t, right, b)
  }

  /** Must run on the UI thread. An empty list clears the exclusion. */
  fun apply(activity: Activity?, rects: List<ExclusionRect>) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    val decor = activity?.window?.decorView ?: return
    val density = activity.resources.displayMetrics.density
    decor.systemGestureExclusionRects = rects.map { toPixels(it, density) }.filter { !it.isEmpty }
  }
}
