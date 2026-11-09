import Foundation
import simd

/// The shape of a venue, as the server cut it out of OpenStreetMap.
///
/// Metres on a local plane, x east and z north from `origin`, which is what
/// RealityKit wants. The phone does no reprojection and no protobuf: that
/// work has a perfectly good home on a server that already holds the tiles,
/// and this device has a game to run and a camera to keep at sixty frames.
///
/// `origin` is where the server snapped the request to (so nearby players
/// share a cached answer), not necessarily the point asked for. Everything
/// here must be drawn offset by (origin - the centre the scene uses).
struct GroundGeometry: Decodable, Sendable {
    struct Origin: Decodable, Sendable { let lat: Double; let lng: Double }
    struct Way: Decodable, Sendable {
        let w: Double        // metres wide
        let k: String        // OSM kind: major_road, minor_road, path, rail...
        var d: String? = nil // kind detail: residential, sidewalk, steps...
        let p: [[Double]]
    }
    struct Area: Decodable, Sendable {
        var k: String? = nil
        let p: [[Double]]
    }
    struct Building: Decodable, Sendable {
        let h: Double
        /// Where the building starts, when it is a part standing on another
        /// roof or a deck in the air.
        var b: Double? = nil
        let p: [[Double]]
    }

    var v: Int? = nil
    let origin: Origin
    let radius_m: Double
    /// Travels with the geometry rather than being something a client is
    /// trusted to remember. ODbL obliges it on a produced work.
    let attribution: String
    let roads: [Way]
    let water: [Area]
    let green: [Area]
    let buildings: [Building]
    var waterways: [Way]? = nil
    var paved: [Area]? = nil
    /// `[x, z, scale, variant]`.
    var trees: [[Double]]? = nil
}

extension GroundGeometry {
    /// Metres east and north of `centre` at which this geometry's origin sits.
    func offset(from centre: (lat: Double, lng: Double)) -> SIMD2<Float> {
        let x = (origin.lng - centre.lng) * 111_320 * cos(centre.lat * .pi / 180)
        let z = (origin.lat - centre.lat) * 111_320
        return SIMD2(Float(x), Float(z))
    }
}

/// Polygon triangulation for footprints and land areas.
enum WorldMesh {

    /// Ear clipping.
    ///
    /// OSM rings are simple polygons (holes are dropped on the server) but
    /// they are not convex, so a triangle fan tears on anything L-shaped,
    /// which is most buildings. Returns indices into the CLEANED ring: pass a
    /// ring that has been through `WorldBuilder.clean`, or the indices will
    /// not line up with the points.
    static func triangulate(_ ring: [SIMD2<Float>]) -> [UInt32] {
        let pts = ring
        guard pts.count >= 3 else { return [] }
        if pts.count == 3 { return signedArea(pts) >= 0 ? [0, 1, 2] : [0, 2, 1] }

        var index = Array(0..<pts.count)
        // Work anticlockwise, so the "is this ear convex" test has one answer.
        if signedArea(pts) < 0 { index.reverse() }

        var out: [UInt32] = []
        out.reserveCapacity((pts.count - 2) * 3)
        // Bounded by the work there is, not a fixed count: a fixed 4,096 cut
        // a long river bank off part way.
        var budget = pts.count * pts.count + 16
        var i = 0
        var sinceClip = 0
        while index.count > 3 && budget > 0 {
            budget -= 1
            let n = index.count
            let ia = (i + n - 1) % n, ib = i % n, ic = (i + 1) % n
            let a = index[ia], b = index[ib], c = index[ic]
            var ear = isConvex(pts[a], pts[b], pts[c])
            if ear {
                for j in index where j != a && j != b && j != c {
                    let p = pts[j]
                    // A vertex at the same place as a corner (a ring that
                    // touches itself) must not block the ear.
                    if p == pts[a] || p == pts[b] || p == pts[c] { continue }
                    if inTriangle(p, pts[a], pts[b], pts[c]) { ear = false; break }
                }
            }
            if ear {
                out += [UInt32(a), UInt32(b), UInt32(c)]
                index.remove(at: ib)
                sinceClip = 0
                i = ib % max(1, index.count)
            } else {
                i += 1
                sinceClip += 1
                // A full lap with no ear: the ring is self-intersecting or
                // degenerate here. Clip the flattest corner anyway rather
                // than leave a hole, which is what a missing roof looks like.
                if sinceClip > index.count {
                    var best = 0
                    var bestArea = Float.greatestFiniteMagnitude
                    for k in 0..<index.count {
                        let pa = pts[index[(k + index.count - 1) % index.count]]
                        let pb = pts[index[k]], pc = pts[index[(k + 1) % index.count]]
                        let area = abs(cross(pa, pb, pc))
                        if area < bestArea { bestArea = area; best = k }
                    }
                    let na = index.count
                    let pa = index[(best + na - 1) % na], pb = index[best], pc = index[(best + 1) % na]
                    if cross(pts[pa], pts[pb], pts[pc]) > 0 {
                        out += [UInt32(pa), UInt32(pb), UInt32(pc)]
                    }
                    index.remove(at: best)
                    sinceClip = 0
                    i = best % max(1, index.count)
                }
            }
        }
        if index.count == 3, isConvex(pts[index[0]], pts[index[1]], pts[index[2]]) {
            out += index.map(UInt32.init)
        }
        return out
    }

    static func signedArea(_ p: [SIMD2<Float>]) -> Float {
        var a: Float = 0
        for i in 0..<p.count {
            let q = p[(i + 1) % p.count]
            a += p[i].x * q.y - q.x * p[i].y
        }
        return a / 2
    }

    @inline(__always)
    private static func cross(_ a: SIMD2<Float>, _ b: SIMD2<Float>, _ c: SIMD2<Float>) -> Float {
        (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    }

    @inline(__always)
    private static func isConvex(_ a: SIMD2<Float>, _ b: SIMD2<Float>,
                                 _ c: SIMD2<Float>) -> Bool {
        cross(a, b, c) > 0
    }

    /// Strictly inside. A point exactly on an edge does not block an ear: the
    /// old test counted it, which is how a duplicated vertex stalled the clip.
    @inline(__always)
    private static func inTriangle(_ p: SIMD2<Float>, _ a: SIMD2<Float>,
                                   _ b: SIMD2<Float>, _ c: SIMD2<Float>) -> Bool {
        let d1 = cross(a, b, p)
        let d2 = cross(b, c, p)
        let d3 = cross(c, a, p)
        return d1 > 0 && d2 > 0 && d3 > 0
    }
}
