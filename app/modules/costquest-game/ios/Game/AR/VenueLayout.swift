import CoreLocation
import CryptoKit
import Foundation
import simd

/// Decides where every asset in a pack stands, and does it the same way on
/// every phone.
///
/// The server deliberately sends no coordinates. It judges the game and it
/// serves the pack; it has never seen the field. So the layout has to be
/// computed on the device, and if two devices computed different layouts the
/// game would be nonsense: I would take cover behind a crate you cannot see.
///
/// The way out is to make the layout a pure function of things both phones
/// already agree on, the game id and the pack version, run through a seeded
/// generator. No negotiation, no round trip, no leader. Every phone that joins,
/// including one that joins forty minutes late on a different network, derives
/// byte-identical positions. It also means the layout is reproducible off the
/// device, so a venue can be walked and checked before an event.
///
/// The rules the generator works under are the ones that make a field playable
/// rather than a scatter of props:
///
/// - The hero asset anchors the space and is placed first, in view of the
///   entrance, because a player arriving needs one landmark to orient on.
/// - Props form a loose ring at cover distance, the range the engine's
///   `max_range_m` makes a fight happen at.
/// - Filler dresses the edges and is allowed to crowd, because it is scenery.
/// - Nothing overlaps anything, checked against each asset's real footprint
///   from the manifest rather than a guessed radius.
struct VenueLayout {

    struct Placement: Sendable {
        let asset: PackManifest.Asset
        /// Metres from the venue origin in ARKit's world frame: +X east, +Y up,
        /// -Z north. That is what both `.gravityAndHeading` world tracking and
        /// geo tracking give, so there is one convention in the app rather than
        /// one per mode.
        let position: SIMD3<Float>
        /// Rotation about the vertical, radians.
        let yaw: Float
        /// The organiser's point, when this asset stands at one. Nil means the
        /// asset is scenery: it can be walked past and hidden behind, and
        /// nothing about it is scored.
        let anchor: GameAnchor?
        /// Uniform scale applied to the model. 1 at a real venue; below 1 in a
        /// compact (room sized) field, so a lighthouse built at twenty metres
        /// stands at about head height instead of through the ceiling.
        var scale: Float = 1

        var isScored: Bool { anchor != nil }
        /// How far from the origin, kept because the renderer sorts by it and
        /// so does the level-of-detail decision.
        var distance: Float { simd_length(SIMD3(position.x, 0, position.z)) }
    }

    let placements: [Placement]

    /// Radius of the playable field. Everything lands inside this, well within
    /// the server's default 250 m geofence, and close enough that a player can
    /// cross it in under a minute.
    static let fieldRadius: Float = 45

    /// True when this field was laid out at room scale. See `isCompact`.
    let compact: Bool

    /// Distance from the venue centre inside which every authored anchor has
    /// to sit for the game to count as a room, a desk or a small courtyard
    /// rather than a venue. At that size the full layout (scenery out to 45 m,
    /// a hero at 10 to 18 m) puts everything through the walls, so the field
    /// is drawn at room scale instead.
    static let compactRadius: Double = 15

    /// Whether the game should be laid out at room scale. A game with no fixed
    /// venue has no real extent at all and is always compact, as is one whose
    /// anchors all sit within `compactRadius` of the centre. Every input is
    /// shared, so every phone reaches the same answer.
    static func isCompact(anchors: [GameAnchor], venue: CLLocationCoordinate2D?) -> Bool {
        guard let venue else { return true }
        return anchors.allSatisfy { anchor in
            let o = offset(of: CLLocationCoordinate2D(latitude: anchor.lat, longitude: anchor.lng),
                           from: venue)
            return Double(simd_length(o)) <= compactRadius
        }
    }

    /// Build a field.
    ///
    /// `anchors` are the organiser's authored points, which carry real
    /// coordinates and name an asset in the pack. Those are not suggestions:
    /// a capture point exists at a place somebody chose, often a real feature
    /// of the venue, and the server's rules are written against it. So an
    /// anchored asset is placed where the anchor says and is taken out of the
    /// scatter entirely. The generator only decides where the scenery goes.
    init(manifest: PackManifest, gameID: String,
         anchors: [GameAnchor] = [], venue: CLLocationCoordinate2D? = nil) {
        // Seeded from both, so re-approving an environment reshuffles the field
        // (a new pack version is a new layout, which is what an organiser
        // expects from an edit) while a re-join of the same game does not.
        var rng = SeededGenerator(seed: "\(gameID)/\(manifest.pack_id)/\(manifest.version)")
        let compact = Self.isCompact(anchors: anchors, venue: venue)
        self.compact = compact

        // Placed in a fixed order regardless of the order the manifest happens
        // to list them in, because rejection sampling depends on what is
        // already on the field and JSON ordering is not a promise.
        let ranked = manifest.assets.sorted { lhs, rhs in
            let order = ["hero": 0, "landmark": 0, "prop": 1, "filler": 2]
            let l = order[lhs.cls] ?? 1, r = order[rhs.cls] ?? 1
            return l == r ? lhs.name < rhs.name : l < r
        }

        var placed: [Placement] = []

        // Authored points first, at their own coordinates, so the scatter has
        // to work around them rather than the other way round.
        let byName = Dictionary(manifest.assets.map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        var anchored: Set<String> = []
        let authored = anchors.sorted(by: { $0.id < $1.id })
            .filter { byName[$0.asset] != nil }
        // Real offsets from the venue when there is one. At room scale they
        // are drawn in towards the player so every point is within a few
        // steps: a capture point twelve metres away is in the next room.
        var offsets: [SIMD3<Float>] = authored.map { anchor in
            guard let venue else { return .zero }
            return Self.offset(of: CLLocationCoordinate2D(latitude: anchor.lat,
                                                          longitude: anchor.lng),
                               from: venue)
        }
        if compact {
            let farthest = offsets.map { simd_length($0) }.max() ?? 0
            if venue == nil || farthest < 0.5 {
                // No usable geometry: stand the points on an even ring around
                // the origin, in id order, so every phone draws the same one.
                let n = max(authored.count, 1)
                offsets = (0..<authored.count).map { i in
                    let bearing = Float(i) / Float(n) * 2 * .pi + 0.4
                    let r: Float = 2.2 + Float(i % 2) * 0.8
                    return SIMD3(r * sin(bearing), 0, -r * cos(bearing))
                }
            } else {
                let squeeze = min(1, Self.compactAnchorReach / farthest)
                offsets = offsets.map { o in
                    var p = o * squeeze
                    let d = simd_length(p)
                    // Not underfoot either: a point inside a metre is one the
                    // player cannot see without looking straight down.
                    if d < 1.2 { p = d > 0.01 ? p / d * 1.2 : SIMD3(0, 0, -1.2) }
                    return p
                }
            }
        }
        for (anchor, offset) in zip(authored, offsets) {
            guard let asset = byName[anchor.asset] else { continue }
            let alt = compact ? min(max(Float(anchor.alt_m), 0), 1) : Float(anchor.alt_m)
            placed.append(Placement(asset: asset,
                                    position: SIMD3(offset.x, alt, offset.z),
                                    yaw: 0, anchor: anchor,
                                    scale: compact ? Self.roomScale(of: asset, cls: "interactable") : 1))
            anchored.insert(anchor.asset)
        }

        for asset in ranked where !anchored.contains(asset.name) {
          for _ in 0..<Self.copies(of: asset.cls, compact: compact) {
            let scale = compact ? Self.roomScale(of: asset, cls: asset.cls) : 1
            let radius = Self.footprintRadius(of: asset) * scale
            let band = compact ? Self.compactBand(for: asset.cls) : Self.band(for: asset.cls)
            let spacing: Float = compact ? 0.4 : 1.0
            let widen: Float = compact ? 1.5 : 6

            // Rejection sampling with a widening search. Fifty tries at the
            // preferred distance, then the band relaxes outward rather than
            // giving up: a dropped asset is a hole in the field that only some
            // players would notice, which is worse than one crate further out
            // than intended.
            var position: SIMD3<Float>?
            for attempt in 0..<200 {
                let relax = Float(attempt / 50) * widen
                let distance = Float.random(in: (band.near)...(band.far + relax), using: &rng)
                let bearing = Float.random(in: 0..<(2 * .pi), using: &rng)
                // -Z is north, so a compass bearing turns into a position by
                // negating the northward component.
                let candidate = SIMD3<Float>(distance * sin(bearing), 0,
                                             -distance * cos(bearing))
                let clear = placed.allSatisfy { other in
                    let gap = simd_distance(SIMD3(candidate.x, 0, candidate.z),
                                            SIMD3(other.position.x, 0, other.position.z))
                    return gap > radius + Self.footprintRadius(of: other.asset) * other.scale + spacing
                }
                if clear { position = candidate; break }
            }
            guard let position else { continue }

            placed.append(Placement(asset: asset, position: position,
                                    yaw: Float.random(in: 0..<(2 * .pi), using: &rng),
                                    anchor: nil, scale: scale))
          }
        }
        placements = placed
    }

    /// Metres east and north of the venue origin.
    ///
    /// An equirectangular approximation, which is wrong at continental scale
    /// and exact enough here: the field is inside a 250 m geofence, where the
    /// error against a proper geodesic is well under a centimetre. Latitude
    /// scaling on the east axis is the part that actually matters, and it is
    /// the part a naive version leaves out.
    static func offset(of point: CLLocationCoordinate2D,
                       from origin: CLLocationCoordinate2D) -> SIMD3<Float> {
        let metresPerDegree = 111_320.0
        let east = (point.longitude - origin.longitude) * metresPerDegree
            * cos(origin.latitude * .pi / 180)
        let north = (point.latitude - origin.latitude) * metresPerDegree
        return SIMD3(Float(east), 0, Float(-north))
    }

    /// How many of an asset stand in the field.
    ///
    /// One each was the original rule, and it is why a field never looked like
    /// anywhere: a pack of fifty assets put fifty objects in a ninety-metre
    /// circle, which is emptier than an actual car park. A wood is not fifty
    /// species of tree, it is one tree forty times, and RealityKit is built for
    /// exactly that: `AssetLibrary` parses each mesh once and every copy after
    /// the first is a `clone(recursive:)` sharing the same mesh and material,
    /// so the tenth barrel costs a transform and nothing else.
    ///
    /// Heroes stay unique. Seeing two identical windmills is worse than seeing
    /// one, because the repeat is what tells you it was assembled rather than
    /// built.
    private static func copies(of cls: String, compact: Bool = false) -> Int {
        switch cls {
        case "hero", "landmark": 1
        case "filler": compact ? 2 : 4
        default: compact ? 1 : 2
        }
    }

    /// How far out authored points may sit in a compact field: a few steps
    /// from a desk, well inside the HUD's reach.
    static let compactAnchorReach: Float = 4.5

    /// Room-scale bands: scenery at 3 to 12 m, the hero at 4 to 6 m, so the
    /// landmark is in view across the room rather than beyond the building.
    private static func compactBand(for cls: String) -> (near: Float, far: Float) {
        switch cls {
        case "hero", "landmark": return (4, 6)
        case "filler": return (3, 12)
        default: return (3, 9)
        }
    }

    /// Shrink an asset built for an outdoor venue until it fits indoors. Only
    /// ever scales down: something already small stays its real size.
    private static func roomScale(of asset: PackManifest.Asset, cls: String) -> Float {
        let tallest: Double = switch cls {
        case "hero", "landmark": 2.4
        case "interactable": 0.9
        case "filler": 1.4
        default: 1.2
        }
        guard asset.bounds_m.count == 2, asset.bounds_m[0].count == 3 else { return 1 }
        let h = asset.height
        let w = Double(footprintRadius(of: asset)) * 2
        let size = max(h, w * 0.8)
        guard size > tallest, size > 0 else { return 1 }
        return Float(tallest / size)
    }

    /// Distance band per class, in metres from the origin.
    private static func band(for cls: String) -> (near: Float, far: Float) {
        switch cls {
        case "hero", "landmark": return (10, 18)
        case "filler": return (6, fieldRadius)
        default: return (8, 32)
        }
    }

    /// Half the asset's larger horizontal dimension, from the bounds the
    /// renderer measured. Using the real footprint is what stops a lighthouse
    /// being spaced like a rope coil.
    private static func footprintRadius(of asset: PackManifest.Asset) -> Float {
        guard asset.bounds_m.count == 2, asset.bounds_m[0].count == 3 else { return 1 }
        let up = asset.upAxis
        let horizontal = (0..<3).filter { $0 != up }
        let spans = horizontal.map { abs(asset.bounds_m[1][$0] - asset.bounds_m[0][$0]) }
        return Float((spans.max() ?? 2) / 2)
    }
}

/// A generator that produces the same numbers on every device, for ever.
///
/// `SystemRandomNumberGenerator` is the right default everywhere else and is
/// exactly wrong here: the whole point is that two phones agree. SplitMix64 is
/// used because it is four lines, has no state to get wrong, and its output
/// does not depend on the Swift version or the chip, which a hash-based
/// generator seeded from `hashValue` very much would.
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: String) {
        // A cryptographic hash for the seed so that similar ids do not produce
        // similar fields, which they would with a simple string fold.
        let digest = SHA256.hash(data: Data(seed.utf8))
        state = digest.withUnsafeBytes { $0.load(as: UInt64.self) }
    }

    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}
