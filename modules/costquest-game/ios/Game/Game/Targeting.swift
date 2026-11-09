import CoreLocation
import Foundation
import simd

/// Who the phone is pointed at.
///
/// Pulled out of the HUD because two things need the same answer and they must
/// not disagree: the button that fires, and the reticle drawn in the world. A
/// reticle sitting on one player while the button shoots another is the kind of
/// bug that only shows up with two people in a field.
///
/// The measurement has two sources and the difference between them is how fair
/// the game feels rather than whether it can be cheated. Ultra wideband is a
/// radio measurement good to about ten centimetres with a real bearing. The
/// live map is GPS, good to about five metres, which at close range is the
/// difference between "behind that crate" and "on the other side of it". Either
/// way the range travels to the server as this device's claim and the server
/// range checks it.
struct Targeting {

    struct Target: Equatable, Identifiable {
        let id: String
        let label: String
        /// Metres.
        let distance: Double
        /// Compass bearing to them, degrees from true north.
        let bearing: Double
        /// Degrees above the horizontal. Zero unless ultra wideband gave one.
        let elevation: Double
        /// Degrees between them and where the phone is pointing.
        let offAxis: Double
        /// True when this came from the radio rather than from two GPS fixes.
        let isPrecise: Bool
    }

    /// Everyone this player could shoot, nearest to the centre of the screen
    /// first.
    ///
    /// Targets the engine would refuse are never offered. A fire button that
    /// always comes back "friendly fire" is worse than no button, and the
    /// player cannot tell the difference between a rule and a bug.
    @MainActor
    static func candidates(session: GameSession, heading: Double) -> [Target] {
        guard let mine = session.playerID, let me = session.map[mine] else { return [] }

        return session.map.compactMap { id, player -> Target? in
            guard id != mine, player.state == "active" else { return nil }
            if let side = session.faction, player.faction == side { return nil }

            let fix = session.bearings[id]
            let precise = fix?.isFresh == true
            let distance = precise ? fix!.distance
                : haversine(me.lat, me.lng, player.lat, player.lng)
            // An ultra wideband azimuth is relative to where the phone is
            // pointing; a map bearing is relative to true north. They are
            // brought into the same frame here rather than at the call sites,
            // which is exactly the mistake this type exists to prevent.
            let bearing = precise
                ? (heading + fix!.azimuth).truncatingRemainder(dividingBy: 360)
                : compassBearing(from: (me.lat, me.lng), to: (player.lat, player.lng))
            let offAxis = angleDifference(bearing, heading)

            // A generous cone. A phone held at arm's length outdoors is not a
            // precision instrument, and a reticle that will not settle is the
            // most infuriating thing an AR game can do.
            guard offAxis < 35 else { return nil }
            return Target(id: id, label: session.handle(of: id) ?? "Rival", distance: distance,
                          bearing: bearing < 0 ? bearing + 360 : bearing,
                          elevation: precise ? fix!.elevation : 0,
                          offAxis: offAxis, isPrecise: precise)
        }
        // Sorted by angle, not by metres: the player is aiming, and aiming is
        // an angle.
        .sorted { $0.offAxis < $1.offAxis }
    }

    @MainActor
    static func best(session: GameSession, heading: Double) -> Target? {
        candidates(session: session, heading: heading).first
    }

    // MARK: - Geometry

    static func haversine(_ lat1: Double, _ lng1: Double,
                          _ lat2: Double, _ lng2: Double) -> Double {
        let radius = 6_371_000.0
        let dLat = (lat2 - lat1) * .pi / 180
        let dLng = (lng2 - lng1) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
        return radius * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    static func compassBearing(from: (Double, Double), to: (Double, Double)) -> Double {
        let lat1 = from.0 * .pi / 180, lat2 = to.0 * .pi / 180
        let dLng = (to.1 - from.1) * .pi / 180
        let y = sin(dLng) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
        let degrees = atan2(y, x) * 180 / .pi
        return degrees < 0 ? degrees + 360 : degrees
    }

    /// The shortest angle between two compass bearings, which is not their
    /// difference: 350 and 10 are twenty degrees apart, not three hundred.
    static func angleDifference(_ a: Double, _ b: Double) -> Double {
        let diff = abs((a - b).truncatingRemainder(dividingBy: 360))
        return min(diff, 360 - diff)
    }
}
