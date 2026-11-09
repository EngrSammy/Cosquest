import Foundation
import Observation
import OSLog

private let presenceLog = Logger(subsystem: "com.djmcevents.costquest", category: "presence")

/// Who is in the outpost, and telling the world you are too.
///
/// A hub with nobody in it is a lobby, and the whole reason the world shrank
/// from a town to a 130 metre outpost was so that the people who ARE about are
/// visible. This is the half that makes that true.
///
/// Two jobs on one timer: say you are here, and find out who else is. Polling
/// rather than a socket because presence is not urgent — someone appearing
/// four seconds late costs nothing, and a socket per player idling in a hub is
/// a lot of connections for very little.
@MainActor
@Observable
final class Presence {
    static let shared = Presence()

    private(set) var people: [PresencePerson] = []
    private(set) var here = 0
    /// Nil until the first round trip succeeds, so the interface can tell
    /// "nobody is about" from "we have not asked yet".
    private(set) var lastError: String?

    /// What this player is doing, which travels with the heartbeat.
    var status: String = "idle"
    var gameID: String?

    private var task: Task<Void, Never>?
    private let client = GameClient()

    private init() {}

    /// Beat every 30 seconds. The server holds a heartbeat for 120, so a
    /// player survives three missed beats before fading out of the crowd:
    /// enough to walk through a tunnel without disappearing.
    func start(every seconds: Double = 30) {
        guard task == nil else { return }
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.tick()
                try? await Task.sleep(for: .seconds(seconds))
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func tick() async {
        do {
            _ = try await client.presenceBeat(status: status, gameID: gameID)
            people = try await client.presenceRoster()
            here = people.count
            lastError = nil
        } catch {
            // Reported rather than swallowed. An empty outpost and a failed
            // request look identical otherwise, which is the same trap the
            // games list fell into.
            lastError = error.localizedDescription
            presenceLog.error("presence failed: \(error.localizedDescription)")
        }
    }

    /// The people, as the world needs them: no identity, no position.
    var forWorld: [[String: Any]] {
        people.map { ["handle": $0.handle ?? "", "status": $0.status, "seen_s": $0.seen_s] }
    }
}
