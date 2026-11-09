package expo.modules.costquestgame

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri

/**
 * Quest Run and raid clocks in the notification shade and on the lock screen:
 * the Android twin of the iOS Live Activity (ios/Embed/LiveTimers.swift). One
 * ongoing notification per kind ("run", "raid") on a quiet channel, its time
 * a chronometer counting down to the end, so it ticks with the app closed.
 * features/game/liveTimer.ts starts, updates and ends them.
 *
 * Ongoing while the clock runs (it can't be swiped away mid-run); once over it
 * shows the result, becomes dismissable and times out after two minutes.
 * POST_NOTIFICATIONS (Android 13+) is asked for by the JS side the first time
 * a timer starts; refused, every call here is a quiet no-op.
 *
 * The framework Notification.Builder (API 26+, the app's minSdk) keeps the
 * module free of androidx.
 */
object LiveTimers {
  private const val CHANNEL = "cq_timers"
  /** RUN_GOLD / RAID_COLOR (features/game/run.ts, raids.ts). */
  private val ACCENT = mapOf("run" to Color.parseColor("#FABD29"), "raid" to Color.parseColor("#C221D6"))
  private const val DONE_TIMEOUT_MS = 120_000L

  private data class Shown(
    val kind: String,
    val title: String,
    val subtitle: String,
    val link: String,
    var endsAtMs: Long,
  )

  private val shown = mutableMapOf<String, Shown>()

  private fun manager(ctx: Context) = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun notifId(kind: String) = if (kind == "raid") 73_02 else 73_01

  fun supported(ctx: Context): Boolean = manager(ctx).areNotificationsEnabled()

  private fun ensureChannel(ctx: Context) {
    val m = manager(ctx)
    if (m.getNotificationChannel(CHANNEL) != null) return
    val ch = NotificationChannel(CHANNEL, "Timers", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Quest Run and raid clocks while one is on"
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    m.createNotificationChannel(ch)
  }

  private fun tapIntent(ctx: Context, link: String, code: Int): PendingIntent? {
    val intent = (if (link.isNotEmpty()) Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(ctx.packageName) else null)
      ?.takeIf { it.resolveActivity(ctx.packageManager) != null }
      ?: ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /** "Boss 62% · 4 fighting" style body from the state map (the same keys as iOS's record). */
  private fun body(subtitle: String, state: Map<String, Any?>?): String {
    val parts = mutableListOf<String>()
    (state?.get("line") as? String)?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
    (state?.get("fighters") as? Number)?.toInt()?.takeIf { it > 0 }?.let { parts.add(if (it == 1) "1 fighting" else "$it fighting") }
    return if (parts.isEmpty()) subtitle else parts.joinToString(" · ")
  }

  private fun post(ctx: Context, s: Shown, state: Map<String, Any?>?) {
    if (!supported(ctx)) return
    ensureChannel(ctx)
    val finished = state?.get("finished") == true
    val headline = state?.get("headline") as? String
    val hp = (state?.get("hpPercent") as? Number)?.toInt()?.coerceIn(0, 100)
    val accent = ACCENT[s.kind] ?: ACCENT.getValue("run")
    val b = Notification.Builder(ctx, CHANNEL)
      .setSmallIcon(R.drawable.cq_timer_icon)
      .setColor(accent)
      .setContentTitle(if (finished && !headline.isNullOrBlank()) headline else s.title)
      .setContentText(body(s.subtitle, state))
      .setSubText(s.subtitle)
      .setCategory(if (s.kind == "raid") Notification.CATEGORY_EVENT else Notification.CATEGORY_PROGRESS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setContentIntent(tapIntent(ctx, s.link, notifId(s.kind)))
    if (finished) {
      b.setOngoing(false).setAutoCancel(true).setTimeoutAfter(DONE_TIMEOUT_MS).setUsesChronometer(false)
    } else {
      b.setOngoing(true)
        .setWhen(s.endsAtMs)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        // Gone on its own a minute after 0:00 if the app never said it ended.
        .setTimeoutAfter((s.endsAtMs - System.currentTimeMillis() + 60_000L).coerceAtLeast(60_000L))
    }
    if (hp != null && s.kind == "raid" && !finished) b.setProgress(100, hp, false)
    try {
      manager(ctx).notify(notifId(s.kind), b.build())
    } catch (_: SecurityException) {
      // POST_NOTIFICATIONS refused between the check and the post: nothing to show.
    }
  }

  /** The timer's id (its kind: one per kind), or null when notifications are off. */
  fun start(ctx: Context, kind: String, title: String, subtitle: String, link: String, endsAtMs: Double, state: Map<String, Any?>?): String? {
    val k = if (kind == "raid") "raid" else "run"
    if (!supported(ctx)) return null
    val s = Shown(k, title, subtitle, link, endsAtMs.toLong())
    shown[k] = s
    post(ctx, s, state)
    return k
  }

  fun update(ctx: Context, idOrKind: String, state: Map<String, Any?>?, endsAtMs: Double?): Boolean {
    val targets = if (idOrKind == "all") shown.values.toList() else listOfNotNull(shown[idOrKind])
    for (s in targets) {
      if (endsAtMs != null) s.endsAtMs = endsAtMs.toLong()
      post(ctx, s, state)
    }
    return targets.isNotEmpty()
  }

  /** With a final state the result stays (dismissable) for two minutes; without, it goes now. */
  fun end(ctx: Context, idOrKind: String, last: Map<String, Any?>?) {
    val kinds = if (idOrKind == "all") listOf("run", "raid") else listOf(idOrKind)
    for (k in kinds) {
      val s = shown.remove(k)
      if (last != null && s != null) {
        post(ctx, s, last + ("finished" to true))
      } else {
        manager(ctx).cancel(notifId(k))
      }
    }
  }
}
