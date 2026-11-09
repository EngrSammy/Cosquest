import AVFoundation
import Foundation

/// The Warden, aloud.
///
/// Apple's speech synthesis, on the phone: no network, no audio files, no
/// cost per line. Each style gets its own delivery (pace and pitch), so the
/// arcade announcer and the mythic narrator do not sound like one reader, and
/// the best English voice installed on the phone is used, which on most
/// phones means an Enhanced or Premium voice rather than the robotic default.
///
/// `level` rises while a word is being spoken and falls between, so the
/// character in AR can move as it talks.
@MainActor
@Observable
final class WardenSpeaker: NSObject {
    /// Off (28 Sep): the Warden is read, not heard. Every spoken path comes
    /// through `speak`, so this one switch silences it, and the settings and
    /// onboarding toggles hide while it is off. Flip to true to bring it back.
    static let enabled = false

    private(set) var speaking = false
    /// 0...1, pulsed per word, for animating the character.
    private(set) var level: Double = 0

    @ObservationIgnored private let synth = AVSpeechSynthesizer()
    @ObservationIgnored private var voice: AVSpeechSynthesisVoice?

    override init() {
        super.init()
        synth.delegate = self
        voice = WardenSpeaker.bestVoice()
    }

    func speak(_ text: String, style: WardenStyle) {
        guard Self.enabled else { return }
        if synth.isSpeaking { synth.stopSpeaking(at: .word) }
        // Heard with the phone on silent, mixed with the game's own sounds.
        GameAudio.play()
        let u = AVSpeechUtterance(string: text)
        u.voice = voice
        let (rate, pitch) = Self.delivery(style)
        u.rate = rate
        u.pitchMultiplier = pitch
        u.preUtteranceDelay = 0.05
        synth.speak(u)
    }

    func stop() {
        synth.stopSpeaking(at: .immediate)
    }

    private static func delivery(_ s: WardenStyle) -> (Float, Float) {
        let base = AVSpeechUtteranceDefaultSpeechRate
        switch s {
        case .arcade: return (base * 1.08, 1.12)
        case .mythic: return (base * 0.86, 0.82)
        case .hype: return (base * 1.12, 1.18)
        case .trailer: return (base * 0.88, 0.78)
        case .quippy: return (base * 1.02, 1.04)
        case .neutral: return (base * 0.96, 1.0)
        }
    }

    /// The best-sounding English voice this phone has.
    private static func bestVoice() -> AVSpeechSynthesisVoice? {
        let english = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        func rank(_ v: AVSpeechSynthesisVoice) -> Int {
            var r = 0
            switch v.quality {
            case .premium: r += 30
            case .enhanced: r += 20
            default: break
            }
            if v.language == "en-GB" { r += 3 }
            if v.language == "en-US" { r += 2 }
            // Novelty voices exist in the list and should never be picked.
            if v.voiceTraits.contains(.isNoveltyVoice) { r -= 100 }
            return r
        }
        return english.max { rank($0) < rank($1) } ?? AVSpeechSynthesisVoice(language: "en-GB")
    }
}

extension WardenSpeaker: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = true }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer,
                                       willSpeakRangeOfSpeechString range: NSRange,
                                       utterance u: AVSpeechUtterance) {
        Task { @MainActor in
            self.level = 1
            try? await Task.sleep(for: .milliseconds(140))
            self.level = 0.25
        }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false; self.level = 0 }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false; self.level = 0 }
    }
}
