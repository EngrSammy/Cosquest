package expo.modules.costquestgame

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.util.Log
import java.nio.charset.Charset

/**
 * NFC checkpoints: reads a tag's id and its first text (or URI) NDEF record
 * while the game asks for it, with NfcAdapter reader mode (the activity gets
 * the tag directly; no other app's intent filter fires meanwhile).
 *
 * Needs android.permission.NFC, which the config plugin adds only with
 * { "nfc": true } (the same switch as the iOS entitlement). Without it,
 * enableReaderMode throws a SecurityException and start() reports that.
 */
class NfcReader(private val onTag: (id: String, ndefText: String?) -> Unit) {
  private var activity: Activity? = null

  val scanning: Boolean get() = activity != null

  /** Starts (or restarts) reader mode on [activity]. Must run on the UI thread. */
  fun start(activity: Activity) {
    val adapter = NfcAdapter.getDefaultAdapter(activity)
      ?: throw NfcException("nfc_unavailable", "This phone has no NFC.")
    if (!adapter.isEnabled) throw NfcException("nfc_disabled", "NFC is off in the phone's settings.")
    val flags = NfcAdapter.FLAG_READER_NFC_A or
      NfcAdapter.FLAG_READER_NFC_B or
      NfcAdapter.FLAG_READER_NFC_F or
      NfcAdapter.FLAG_READER_NFC_V
    try {
      adapter.enableReaderMode(activity, { tag -> deliver(tag) }, flags, null)
    } catch (e: SecurityException) {
      throw NfcException("nfc_permission", "The app is built without the NFC permission (config plugin option nfc: true).")
    }
    this.activity = activity
  }

  /** Must run on the UI thread. Safe to call when not scanning. */
  fun stop() {
    val current = activity ?: return
    activity = null
    try {
      NfcAdapter.getDefaultAdapter(current)?.disableReaderMode(current)
    } catch (e: Exception) {
      Log.w(TAG, "disableReaderMode failed", e)
    }
  }

  /** Reader mode is tied to a resumed activity: pause it in the background, bring it back after. */
  fun suspend() {
    val current = activity ?: return
    try {
      NfcAdapter.getDefaultAdapter(current)?.disableReaderMode(current)
    } catch (_: Exception) {
    }
  }

  fun resume() {
    val current = activity ?: return
    try {
      start(current)
    } catch (e: Exception) {
      Log.w(TAG, "could not resume NFC reader mode", e)
    }
  }

  // Called on a binder thread.
  private fun deliver(tag: Tag) {
    val id = tag.id?.joinToString("") { "%02x".format(it) } ?: ""
    var text: String? = null
    val ndef = Ndef.get(tag)
    if (ndef != null) {
      try {
        val message: NdefMessage? = ndef.cachedNdefMessage ?: run {
          ndef.connect()
          try { ndef.ndefMessage } finally { ndef.close() }
        }
        text = message?.records?.firstNotNullOfOrNull { readable(it) }
      } catch (e: Exception) {
        Log.w(TAG, "could not read the tag's NDEF message", e)
      }
    }
    onTag(id, text)
  }

  companion object {
    private const val TAG = "CostQuestNfc"

    /** A text record's text, a URI record's URI, or a text/ MIME payload. */
    fun readable(record: NdefRecord): String? {
      val payload = record.payload ?: return null
      return when {
        record.tnf == NdefRecord.TNF_WELL_KNOWN && record.type.contentEquals(NdefRecord.RTD_TEXT) -> {
          if (payload.isEmpty()) return null
          val status = payload[0].toInt()
          val utf16 = status and 0x80 != 0
          val langLength = status and 0x3F
          if (1 + langLength > payload.size) return null
          String(
            payload, 1 + langLength, payload.size - 1 - langLength,
            if (utf16) Charsets.UTF_16 else Charsets.UTF_8
          )
        }
        record.tnf == NdefRecord.TNF_WELL_KNOWN && record.type.contentEquals(NdefRecord.RTD_URI) ->
          record.toUri()?.toString()
        record.tnf == NdefRecord.TNF_ABSOLUTE_URI -> String(payload, Charset.forName("UTF-8"))
        record.tnf == NdefRecord.TNF_MIME_MEDIA && String(record.type).startsWith("text/") ->
          String(payload, Charsets.UTF_8)
        else -> null
      }
    }
  }
}

class NfcException(val code: String, message: String) : Exception(message)
