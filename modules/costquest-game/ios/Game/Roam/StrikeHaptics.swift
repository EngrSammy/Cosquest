import CoreHaptics
import UIKit

/// The Strike, felt. Core Haptics rather than the stock impact generator: the
/// three pulses sharpen as they rise, and the break is a burst you feel in the
/// palm, the way the ball's click is a sound you feel in Pokémon GO.
@MainActor
final class StrikeHaptics {
    static let shared = StrikeHaptics()
    private var engine: CHHapticEngine?

    private init() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        engine = try? CHHapticEngine()
        engine?.isAutoShutdownEnabled = true
        engine?.resetHandler = { @Sendable [weak self] in
            Task { @MainActor in try? self?.engine?.start() }
        }
    }

    private func play(_ events: [CHHapticEvent]) {
        guard let engine else { return }
        do {
            try engine.start()
            let player = try engine.makePlayer(with: CHHapticPattern(events: events, parameters: []))
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    private func tap(_ t: TimeInterval, _ intensity: Float, _ sharpness: Float) -> CHHapticEvent {
        CHHapticEvent(eventType: .hapticTransient, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
        ], relativeTime: t)
    }

    /// One of the three pulses, 0...2, each sharper than the last.
    func pulse(_ i: Int) {
        let k = Float(i)
        guard engine != nil else {
            UIImpactFeedbackGenerator(style: i == 2 ? .heavy : .medium).impactOccurred()
            return
        }
        play([tap(0, 0.45 + 0.2 * k, 0.3 + 0.3 * k)])
    }

    /// The crystal breaking: a burst and a rumble for a win, a dull thud for a miss.
    func resolve(win: Bool) {
        guard engine != nil else {
            UINotificationFeedbackGenerator().notificationOccurred(win ? .success : .error)
            return
        }
        if win {
            play([
                tap(0, 1.0, 0.9),
                CHHapticEvent(eventType: .hapticContinuous, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.7),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2),
                ], relativeTime: 0.02, duration: 0.35),
                tap(0.18, 0.6, 1.0), tap(0.3, 0.4, 1.0),
            ])
        } else {
            play([tap(0, 0.7, 0.05), tap(0.12, 0.35, 0.05)])
        }
    }
}
