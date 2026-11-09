import Foundation
import SwiftUI
import simd

/// What the environment looks like at this hour.
///
/// A venue game is played in the evening far more often than at noon, and a
/// world that is always midday is a world that never matches what the player
/// can see over the top of their phone. Pokémon GO ties its scenery to the
/// real clock for the same reason.
///
/// Driven by the DEVICE clock rather than by a server: the sun outside the
/// player's window is the thing being matched, and it is local by definition.
enum TimeOfDay: String, CaseIterable {
    case dawn, day, dusk, night

    static func now(_ date: Date = .now,
                    calendar: Calendar = .current) -> TimeOfDay {
        switch calendar.component(.hour, from: date) {
        case 5..<8:   .dawn
        case 8..<17:  .day
        case 17..<20: .dusk
        default:      .night
        }
    }

    /// Where the sun sits, as a direction to light from. Low and lateral at
    /// the ends of the day, which is what makes buildings cast long sides and
    /// stops the world reading flat.
    var sunDirection: SIMD3<Float> {
        switch self {
        case .dawn:  [-140, 55, -40]
        case .day:   [-90, 190, -70]
        case .dusk:  [130, 50, 60]
        case .night: [-60, 150, -110]
        }
    }

    var sunIntensity: Float {
        switch self {
        case .dawn: 2100
        case .day: 2800
        case .dusk: 1700
        // Moonlight, and bright enough to model the roofs: the night board's
        // own colours carry the darkness, so the light doesn't have to.
        case .night: 1500
        }
    }

    /// The colour of the sun (the moon, after dark): cool at night, warm at
    /// dusk. A white light over a blue-graded board made night one flat navy.
    var sunColor: UIColor {
        switch self {
        case .dawn:  UIColor(red: 1.00, green: 0.90, blue: 0.80, alpha: 1)
        case .day:   .white
        case .dusk:  UIColor(red: 1.00, green: 0.76, blue: 0.58, alpha: 1)
        case .night: UIColor(red: 0.88, green: 0.92, blue: 1.00, alpha: 1)
        }
    }

    var fillColor: UIColor {
        switch self {
        case .dawn, .day: .white
        case .dusk:  UIColor(red: 0.78, green: 0.72, blue: 0.95, alpha: 1)
        case .night: UIColor(red: 0.84, green: 0.84, blue: 0.96, alpha: 1)
        }
    }

    /// Whether windows light up and street lamps pool on the roads.
    var lampsOn: Bool { self == .dusk || self == .night }

    /// The second light, so faces turned away from the sun are shaded rather
    /// than black. At night it carries most of the scene.
    var fillIntensity: Float {
        switch self {
        case .dawn: 900
        case .day: 1000
        case .dusk: 800
        case .night: 1000
        }
    }

    /// Tints the whole palette toward the hour. Kept subtle: a venue still has
    /// to be legible at arm's length in whatever light is actually falling on
    /// the phone.
    var wash: (tint: UIColor, amount: CGFloat) {
        switch self {
        case .dawn:  (UIColor(red: 1.00, green: 0.82, blue: 0.62, alpha: 1), 0.16)
        case .day:   (.white, 0.0)
        case .dusk:  (UIColor(red: 1.00, green: 0.60, blue: 0.42, alpha: 1), 0.22)
        case .night: (UIColor(red: 0.30, green: 0.38, blue: 0.62, alpha: 1), 0.45)
        }
    }

    /// The backdrop behind the scene while it loads: the horizon, so the
    /// first frame of the world fades out of the same colour.
    var sky: Color {
        Color(red: Double(horizon.r), green: Double(horizon.g), blue: Double(horizon.b))
    }

    /// The sky at the horizon, which is also the fog: the world fades into
    /// exactly the colour behind it, so it has no edge.
    var horizon: RGB {
        switch self {
        case .dawn:  RGB(hex: 0xF4D9C8)
        case .day:   RGB(hex: 0xDCEBF2)
        case .dusk:  RGB(hex: 0xEFC2A6)
        // A floor: the night sky (and the fog, which is this colour) is a
        // readable deep blue, never a black the board disappears into.
        case .night: RGB(hex: 0x34486F)
        }
    }

    var zenith: RGB {
        switch self {
        case .dawn:  RGB(hex: 0x9DB7DC)
        case .day:   RGB(hex: 0x8EC3E6)
        case .dusk:  RGB(hex: 0x6874AE)
        case .night: RGB(hex: 0x141D3E)
        }
    }

    /// Multiplied into every colour on the ground. Tints the LIGHT, not the
    /// board: the old wash mixed 45% toward blue-grey at night and turned the
    /// whole world one flat grey. This keeps hues apart and lets roads glow.
    var grade: RGB {
        switch self {
        case .dawn:  RGB(0.94, 0.9, 0.86)
        // A shade under white: the pale Meadow board under full sun clipped
        // roofs, roads and paving to one white, and the board lost its shapes.
        case .day:   RGB(0.9, 0.9, 0.88)
        // Dusk and night have their own board colours (Palette.worldStyle),
        // so the grade only nudges them. Multiplying the pale day board by a
        // dark blue was what turned every street, roof and park one murk.
        case .dusk:  RGB(1.0, 0.95, 0.92)
        case .night: RGB(0.97, 0.98, 1.0)
        }
    }

    /// Ambient (sky) light, as a power of two.
    var ambientExponent: Float {
        switch self {
        case .dawn: 0.6
        case .day: 1.0
        case .dusk: 0.5
        case .night: 0.55
        }
    }

    /// How brightly the roads glow. After dark the streets are the map, and
    /// contrast should go up, not down.
    var glow: Float {
        if let g = UserDefaults.standard.string(forKey: "mapGlow").flatMap(Float.init) { return g }
        switch self {
        case .dawn, .day: return 0
        case .dusk: return 0.2
        case .night: return 0.5
        }
    }
}

extension UIColor {
    /// Mixed toward a tint, for the time-of-day wash.
    func washed(_ tint: UIColor, _ amount: CGFloat) -> UIColor {
        guard amount > 0 else { return self }
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        tint.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let m = min(max(amount, 0), 1)
        return UIColor(red: r1 + (r2 - r1) * m,
                       green: g1 + (g2 - g1) * m,
                       blue: b1 + (b2 - b1) * m,
                       alpha: a1)
    }
}
