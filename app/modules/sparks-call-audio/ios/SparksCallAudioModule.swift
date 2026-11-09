import AVFoundation
import ExpoModulesCore
import SparksSDK
import livekit_react_native
import livekit_react_native_webrtc

// LiveKit calls this on its audio thread with every 10 ms of this user's
// microphone audio, after echo cancellation and noise suppression (16-bit,
// one buffer per channel). Sparks copies it into its own buffer and returns
// at once, so this never holds up the call.
final class SparksMicTap: NSObject, LKRTCAudioRenderer {
  func render(pcmBuffer: AVAudioPCMBuffer) {
    guard pcmBuffer.frameLength > 0, let channels = pcmBuffer.int16ChannelData else { return }
    SparksAudioSink.shared.pushPCM16(channels[0], count: Int(pcmBuffer.frameLength), sampleRate: pcmBuffer.format.sampleRate)
  }
}

public class SparksCallAudioModule: Module {
  private static let tap = SparksMicTap()
  private static var attached = false
  private static let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("SparksCallAudio")

    Function("attach") { () -> Bool in
      Self.lock.lock(); defer { Self.lock.unlock() }
      if !Self.attached {
        LKAudioProcessingManager.sharedInstance().addLocalAudioRenderer(Self.tap)
        Self.attached = true
      }
      return true
    }

    Function("detach") {
      Self.lock.lock(); defer { Self.lock.unlock() }
      if Self.attached {
        LKAudioProcessingManager.sharedInstance().removeLocalAudioRenderer(Self.tap)
        Self.attached = false
      }
    }
  }
}
