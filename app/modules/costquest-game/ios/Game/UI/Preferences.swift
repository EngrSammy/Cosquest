import Observation
import SwiftUI

/// The choices a player makes about the app itself.
///
/// Kept apart from Profile deliberately. A profile is who you are and it lives
/// on the server, keyed to this device's signing key; preferences are how you
/// like the app and they never leave the phone. Sending "prefers dark mode" to
/// a game server would be collecting something for no reason.
///
/// UserDefaults rather than the Keychain: none of this is secret, and a
/// preference that survives a reinstall is a preference you cannot reset.
@MainActor
@Observable
final class Preferences {
    static let shared = Preferences()

    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var label: String {
            switch self {
            case .system: "Automatic"
            case .light: "Light"
            case .dark: "Dark"
            }
        }
        var colorScheme: ColorScheme? {
            switch self {
            case .system: nil
            case .light: .light
            case .dark: .dark
            }
        }
    }

    /// What time it is in the town.
    ///
    /// "Follow the clock" is the honest default: the world should look like the
    /// hour you are playing in. The fixed options exist because a night game
    /// looks very different and nobody should have to wait until 8pm to see it.
    enum WorldClock: String, CaseIterable, Identifiable {
        case real, morning, noon, dusk, night
        var id: String { rawValue }
        var label: String {
            switch self {
            case .real: "Follow the clock"
            case .morning: "Morning"
            case .noon: "Midday"
            case .dusk: "Dusk"
            case .night: "Night"
            }
        }
        /// Nil means "use the real hour".
        var hour: Double? {
            switch self {
            case .real: nil
            case .morning: 8
            case .noon: 13
            case .dusk: 18.4
            case .night: 22
            }
        }
    }

    var appearance: Appearance {
        didSet { store.set(appearance.rawValue, forKey: Keys.appearance) }
    }

    var worldClock: WorldClock {
        didSet { store.set(worldClock.rawValue, forKey: Keys.worldClock) }
    }

    var haptics: Bool {
        didSet { store.set(haptics, forKey: Keys.haptics) }
    }

    /// Shrines through the camera (AR) or on a rendered stage. AR drains the
    /// battery and is awkward one-handed; plenty of players will want it off.
    var shrineAR: Bool {
        didSet { store.set(shrineAR, forKey: Keys.shrineAR) }
    }

    /// Whether the Warden speaks its lines aloud. The lines still appear.
    var wardenSpeaks: Bool {
        didSet { store.set(wardenSpeaks, forKey: Keys.wardenSpeaks) }
    }

    /// Where prize money goes. Held on the device until a game is joined,
    /// because the server attaches it to a player row rather than to a profile.
    ///
    /// Naming one makes the join request SIGNED: a device key is the whole
    /// identity here, and anyone who learned one could otherwise point someone
    /// else's winnings at themselves.
    var payoutDestination: String {
        didSet { store.set(payoutDestination, forKey: Keys.payout) }
    }

    /// The hour the world should be lit for, right now.
    var effectiveHour: Double {
        worldClock.hour ?? Double(Calendar.current.component(.hour, from: Date()))
    }

    private let store = UserDefaults.standard

    private enum Keys {
        static let appearance = "cq.appearance"
        static let worldClock = "cq.worldClock"
        static let haptics = "cq.haptics"
        static let payout = "cq.payoutDestination"
        static let wardenSpeaks = "cq.wardenSpeaks"
        static let shrineAR = "cq.shrineAR"
    }

    private init() {
        let s = UserDefaults.standard
        appearance = Appearance(rawValue: s.string(forKey: Keys.appearance) ?? "") ?? .system
        worldClock = WorldClock(rawValue: s.string(forKey: Keys.worldClock) ?? "") ?? .real
        // `object(forKey:)` first, because `bool(forKey:)` returns false for a
        // key that was never set, and "off by default" is the wrong default for
        // haptics.
        haptics = s.object(forKey: Keys.haptics) as? Bool ?? true
        payoutDestination = s.string(forKey: Keys.payout) ?? ""
        wardenSpeaks = s.object(forKey: Keys.wardenSpeaks) as? Bool ?? true
        shrineAR = s.object(forKey: Keys.shrineAR) as? Bool ?? false
    }
}
