import Foundation
import Observation

/// Whether there is a world on screen yet.
///
/// The app used to draw its whole interface the instant the view appeared —
/// profile chip, nearby button, the lot — over a grey rectangle that Unity was
/// still starting up behind. It looked like the app had loaded and the world
/// had failed.
///
/// Separate from UnityBridge because this is observable UI state and that is an
/// NSObject wrapper around a C API; keeping them apart means SwiftUI is not
/// observing a lifecycle object it should not be touching.
@MainActor
@Observable
final class WorldState {
    static let shared = WorldState()

    /// True once Unity has built the world and been through a frame.
    private(set) var isReady = false

    /// How many buildings it put up. Only useful for a diagnostic line.
    private(set) var buildingCount = 0

    /// Why the interface was shown, for diagnosis.
    private(set) var reason = "waiting"

    private init() {}

    func markReady(buildings: Int) {
        buildingCount = buildings
        reason = "unity reported \(buildings) buildings"
        // Never un-readies. Unity cannot be restarted in this process, so
        // once a world exists it exists for the session, and flickering the
        // interface off again would be worse than any state it could report.
        isReady = true
    }

    /// Shows the interface whether or not Unity ever reported in.
    ///
    /// The gate had no way out: if that one callback never arrived, the app sat
    /// on a spinner for the rest of the session with no way to reach anything.
    /// A gate with no timeout is worse than no gate, because the failure is
    /// total and silent. Unity may well be rendering perfectly behind this.
    func giveUpWaiting() {
        guard !isReady else { return }
        reason = "timed out waiting for the world"
        isReady = true
    }

    /// Starts the clock. Called when the world view appears.
    func beginWaiting(seconds: Double = 6.0) {
        guard !isReady else { return }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(seconds))
            giveUpWaiting()
        }
    }
}
