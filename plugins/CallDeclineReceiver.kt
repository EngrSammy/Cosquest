package com.dammy0227.cosquest

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Declining a call from the phone's call screen while CosQuest is fully
 * closed: expo-callkit-telecom can't deliver that to JavaScript, so it sends
 * this broadcast instead (androidEventReceiver in app.json). We tell the
 * server straight away, so the caller stops hearing it ring.
 *
 * The ring push carries metadata.declineUrl + metadata.declinePass: a
 * 2-minute pass for this call and this person only (the backend's
 * callPush.withDeclinePass), so no login is needed here.
 */
class CallDeclineReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "CallDeclineReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getStringExtra("eventName") != "onCallEnded") return
        val payload = try {
            JSONObject(intent.getStringExtra("payload") ?: return)
        } catch (e: Exception) {
            return
        }
        val session = payload.optJSONObject("session") ?: return
        // Answered calls end through the app; only an unanswered ring is a decline.
        if (session.has("connectedAt") && !session.isNull("connectedAt")) return
        if (session.optString("status") == "connected") return
        val metadata = session.optJSONObject("incomingCallEvent")?.optJSONObject("metadata") ?: return
        val url = metadata.optString("declineUrl")
        val pass = metadata.optString("declinePass")
        if (!url.startsWith("https://") || pass.isEmpty()) return

        val pending = goAsync()
        Thread {
            try {
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 8000
                    readTimeout = 8000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
                connection.outputStream.use { it.write(JSONObject().put("pass", pass).toString().toByteArray()) }
                Log.i(TAG, "declined: ${connection.responseCode}")
                connection.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "decline failed: ${e.message}")
            } finally {
                pending.finish()
            }
        }.start()
    }
}
