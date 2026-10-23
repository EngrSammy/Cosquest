package expo.modules.sparkscallaudio

import com.cosquest.sparks.SparksAudioSink
import com.livekit.reactnative.LiveKitReactNative
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import livekit.org.webrtc.AudioTrackSink
import java.nio.ByteBuffer
import java.nio.ByteOrder

// LiveKit calls this on its recording thread with every 10 ms of this user's
// microphone audio (16-bit PCM; Android's own echo canceller is on in call
// mode). The first channel goes to Sparks, which copies it and returns.
private object MicTap : AudioTrackSink {
  private var mono = ShortArray(0)

  override fun onData(
    audioData: ByteBuffer,
    bitsPerSample: Int,
    sampleRate: Int,
    numberOfChannels: Int,
    numberOfFrames: Int,
    absoluteCaptureTimestampMs: Long,
  ) {
    if (bitsPerSample != 16 || numberOfChannels < 1) return
    val samples = audioData.duplicate().order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    val frames = samples.remaining() / numberOfChannels
    if (frames <= 0) return
    if (mono.size < frames) mono = ShortArray(frames)
    for (i in 0 until frames) mono[i] = samples.get(i * numberOfChannels)
    SparksAudioSink.pushPCM16(mono, frames, sampleRate)
  }
}

class SparksCallAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SparksCallAudio")

    Function("attach") {
      synchronized(MicTap) {
        if (!attached) {
          LiveKitReactNative.audioRecordSamplesDispatcher.registerSink(MicTap)
          attached = true
        }
      }
      true
    }

    Function("detach") {
      synchronized(MicTap) {
        if (attached) {
          LiveKitReactNative.audioRecordSamplesDispatcher.unregisterSink(MicTap)
          attached = false
        }
      }
    }
  }

  private companion object {
    var attached = false
  }
}
