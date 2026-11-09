package expo.modules.costquestgame

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.kotlin.Promise
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Walking rewards (costquest-ios Features/StepsFeature.swift, which asks
 * CMPedometer for the distance since Monday). Android has no pedometer
 * history to ask, so this reads the hardware step counter
 * (Sensor.TYPE_STEP_COUNTER) once: the steps counted since the phone last
 * booted, kept by the sensor hub while the app is closed. The JS side
 * (features/game/steps.ts) turns two readings into the steps between them,
 * spots reboots, and keeps the week's tally.
 *
 * The counter only counts while some client has it activated. On most
 * phones the system's own activity recognition (or a health app) keeps it on
 * all day; where nothing does, it counts less than was walked, never more.
 *
 * Each reading pairs the count with SystemClock.elapsedRealtime() and the
 * wall clock taken together, so the JS side can work out when the phone
 * booted (wall - elapsed) and tell a reboot from a clock change.
 *
 * Android 10+ (API 29) needs ACTIVITY_RECOGNITION granted at run time; the
 * JS side asks (PermissionsAndroid), this only checks. Without it the
 * sensor would register and stay silent, so read() says so instead.
 */
object StepCounter {
  /** How long to wait for the first event. On-change sensors report on activation, so this is slack. */
  private const val TIMEOUT_MS = 4000L

  fun available(context: Context): Boolean = sensorManager(context)?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null

  /**
   * Resolves { steps, elapsedRealtimeMs, wallClockMs, available }, with
   * available = false (and steps null) on a phone without the sensor.
   * Rejects ERR_STEPS_PERMISSION (not granted), ERR_STEPS_SENSOR (would not
   * register) or ERR_STEPS_TIMEOUT (no event). Safe on any thread: the
   * listener and the timeout run on the main looper, and the promise settles
   * exactly once.
   */
  fun read(context: Context, promise: Promise) {
    val manager = sensorManager(context)
    val sensor = manager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    if (manager == null || sensor == null) {
      promise.resolve(
        mapOf(
          "available" to false,
          "steps" to null,
          "elapsedRealtimeMs" to SystemClock.elapsedRealtime().toDouble(),
          "wallClockMs" to System.currentTimeMillis().toDouble()
        )
      )
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("ERR_STEPS_PERMISSION", "Physical activity permission is not granted.", null)
      return
    }

    val handler = Handler(Looper.getMainLooper())
    val settled = AtomicBoolean(false)
    lateinit var listener: SensorEventListener
    val timeout = Runnable {
      if (settled.compareAndSet(false, true)) {
        manager.unregisterListener(listener)
        promise.reject("ERR_STEPS_TIMEOUT", "The step counter did not answer.", null)
      }
    }
    listener = object : SensorEventListener {
      override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_STEP_COUNTER || event.values.isEmpty()) return
        // Sampled together: their difference is the boot time.
        val elapsed = SystemClock.elapsedRealtime()
        val wall = System.currentTimeMillis()
        if (!settled.compareAndSet(false, true)) return
        handler.removeCallbacks(timeout)
        manager.unregisterListener(this)
        promise.resolve(
          mapOf(
            "available" to true,
            "steps" to event.values[0].toDouble(),
            "elapsedRealtimeMs" to elapsed.toDouble(),
            "wallClockMs" to wall.toDouble()
          )
        )
      }

      override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    handler.post {
      if (settled.get()) return@post
      val ok = try {
        manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, handler)
      } catch (_: SecurityException) {
        false
      }
      if (!ok) {
        if (settled.compareAndSet(false, true)) {
          promise.reject("ERR_STEPS_SENSOR", "The step counter could not be read.", null)
        }
        return@post
      }
      handler.postDelayed(timeout, TIMEOUT_MS)
    }
  }

  private fun sensorManager(context: Context): SensorManager? =
    context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
}
