import Foundation
import simd

/// One vertex of the Roam world: position, normal and texture coordinate.
///
/// 32 bytes, all four-byte aligned, so an array of these IS the vertex buffer
/// and building a mesh is a copy. The coordinate points into the build's
/// colour atlas (see `ColourAtlas`): a standard lit material with the atlas as
/// its texture draws every road, park and roof of a layer in ONE draw, which
/// is vertex colour by another name, with no custom shader.
struct WorldVertex: Sendable {
    var px: Float, py: Float, pz: Float
    var nx: Float, ny: Float, nz: Float
    var u: Float, v: Float
}

/// The vertices and triangles of one layer, built off the main actor.
struct MeshBlob: Sendable {
    var vertices: [WorldVertex] = []
    /// Per vertex, packed sRGB with a glow flag in alpha: what the atlas pass
    /// turns into texture coordinates.
    var colours: [UInt32] = []
    var indices: [UInt32] = []
    var lo = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
    var hi = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)

    var isEmpty: Bool { indices.isEmpty }

    @inline(__always)
    mutating func vertex(_ p: SIMD3<Float>, _ n: SIMD3<Float>, _ c: UInt32) -> UInt32 {
        vertices.append(WorldVertex(px: p.x, py: p.y, pz: p.z,
                                    nx: n.x, ny: n.y, nz: n.z, u: 0, v: 0))
        colours.append(c)
        lo = simd_min(lo, p)
        hi = simd_max(hi, p)
        return UInt32(vertices.count - 1)
    }

    /// Winds every triangle to face the way its vertex normals point.
    ///
    /// Double-sided materials light a back face with the normal flipped, so a
    /// ground triangle wound downward was lit from below and came out at 60%
    /// brightness: the whole board looked dim khaki under a white-hot city.
    mutating func orient() {
        var t = 0
        while t + 2 < indices.count {
            let a = Int(indices[t]), b = Int(indices[t + 1]), c = Int(indices[t + 2])
            let va = vertices[a], vb = vertices[b], vc = vertices[c]
            let pa = SIMD3(va.px, va.py, va.pz)
            let n = simd_cross(SIMD3(vb.px, vb.py, vb.pz) - pa, SIMD3(vc.px, vc.py, vc.pz) - pa)
            let want = SIMD3(va.nx + vb.nx + vc.nx, va.ny + vb.ny + vc.ny, va.nz + vb.nz + vc.nz)
            if simd_dot(n, want) < 0 { indices.swapAt(t + 1, t + 2) }
            t += 3
        }
    }

    @inline(__always)
    mutating func triangle(_ a: UInt32, _ b: UInt32, _ c: UInt32) {
        indices.append(a); indices.append(b); indices.append(c)
    }
}

/// Everything the scene draws from one ground response.
struct WorldBlobs: Sendable {
    var ground = MeshBlob()
    /// Street and path surfaces, apart from the rest of the ground so they
    /// can light up after dark.
    var roads = MeshBlob()
    var water = MeshBlob()
    var buildings = MeshBlob()
    var trees = MeshBlob()
    /// Lit windows after dark, drawn unlit so they stay warm and bright.
    var lights = MeshBlob()
    var atlas = ColourAtlas()
    var stats: String = ""
}

/// Every colour a build uses, one texel each, in a small texture.
///
/// Flat colours sample a texel's centre. A face that shades from one colour
/// to another (a wall darker at its foot) gets the two colours in ADJACENT
/// texels, and its texture coordinate runs from one centre to the other, so
/// linear filtering produces exactly that gradient and nothing else. No mip
/// maps, or distant faces would blend neighbouring entries.
struct ColourAtlas: Sendable {
    static let size = 256
    /// RGBA8 sRGB, row 0 at the top.
    var pixels = [UInt32](repeating: 0xFF00_0000, count: size * size)
    private var flat: [UInt32: Int] = [:]
    private var ramps: [UInt64: Int] = [:]
    private var cursor = 0
    var used: Int { cursor }

    static func uv(_ i: Int) -> (Float, Float) {
        let x = i % size, y = i / size
        return ((Float(x) + 0.5) / Float(size), 1 - (Float(y) + 0.5) / Float(size))
    }

    private mutating func put(_ c: UInt32, at i: Int) {
        pixels[i] = c | 0xFF00_0000
    }

    mutating func texel(_ c: UInt32) -> Int {
        if let i = flat[c] { return i }
        let i = min(cursor, Self.size * Self.size - 1)
        if cursor < Self.size * Self.size { cursor += 1 }
        put(c, at: i)
        flat[c] = i
        return i
    }

    /// Two adjacent texels in one row: a, then b.
    mutating func ramp(_ a: UInt32, _ b: UInt32) -> Int {
        let key = UInt64(a) << 32 | UInt64(b)
        if let i = ramps[key] { return i }
        if cursor % Self.size == Self.size - 1 { cursor += 1 }
        guard cursor + 1 < Self.size * Self.size else { return texel(a) }
        let i = cursor
        cursor += 2
        put(a, at: i)
        put(b, at: i + 1)
        ramps[key] = i
        return i
    }

    /// Gives every vertex of a blob its coordinate.
    mutating func assign(_ blob: inout MeshBlob) {
        for i in 0..<blob.vertices.count {
            let (u, v) = Self.uv(texel(blob.colours[i]))
            blob.vertices[i].u = u
            blob.vertices[i].v = v
        }
        var t = 0
        let idx = blob.indices
        while t + 2 < idx.count {
            let a = Int(idx[t]), b = Int(idx[t + 1]), c = Int(idx[t + 2])
            t += 3
            let ca = blob.colours[a], cb = blob.colours[b], cc = blob.colours[c]
            guard ca != cb || cb != cc else { continue }
            // Two colours on one face: a gradient. (Three never happens in
            // what the builder makes; those faces keep their flat texels.)
            let set = Array(Set([ca, cb, cc]))
            guard set.count == 2 else { continue }
            let lo = min(set[0], set[1]), hi = max(set[0], set[1])
            let base = ramp(lo, hi)
            for vi in [a, b, c] {
                let (u, v) = Self.uv(blob.colours[vi] == lo ? base : base + 1)
                blob.vertices[vi].u = u
                blob.vertices[vi].v = v
            }
        }
    }
}

/// A colour, sRGB.
struct RGB: Sendable {
    var r: Float, g: Float, b: Float

    init(_ r: Float, _ g: Float, _ b: Float) { self.r = r; self.g = g; self.b = b }
    init(hex: UInt32) {
        r = Float((hex >> 16) & 0xFF) / 255
        g = Float((hex >> 8) & 0xFF) / 255
        b = Float(hex & 0xFF) / 255
    }

    func scaled(_ f: Float) -> RGB { RGB(min(1, r * f), min(1, g * f), min(1, b * f)) }
    func mixed(_ o: RGB, _ t: Float) -> RGB {
        RGB(r + (o.r - r) * t, g + (o.g - g) * t, b + (o.b - b) * t)
    }

    /// Packed as RGBA8 bytes in memory order (R lowest), sRGB, quantised to
    /// 6 bits a channel so near-identical shades share a texel. Alpha is a
    /// flag: non-zero glows at night.
    func packed(alpha: Float = 0) -> UInt32 {
        func q(_ v: Float) -> UInt32 {
            let b = UInt32(max(0, min(255, (v * 255).rounded())))
            return b & 0xFC | (b >> 6)
        }
        let a: UInt32 = alpha > 0.01 ? 0xFF : 0
        return q(r) | (q(g) << 8) | (q(b) << 16) | (a << 24)
    }
}

/// The colours and proportions of the world, resolved to plain values so the
/// builder can run on any thread.
struct BoardStyle: Sendable {
    var earth: RGB
    var park: RGB
    var parkEdge: RGB
    var grass: RGB
    var wood: RGB
    var pitch: RGB
    var paved: RGB
    var water: RGB
    var shore: RGB
    var road: RGB
    var roadMajor: RGB
    var casing: RGB
    var path: RGB
    var rail: RGB
    var railTie: RGB
    var walls: [RGB]
    var roofs: [RGB]
    var trunk: RGB
    var leaves: [RGB]
    /// How much the roads glow (vertex alpha); the hour decides whether it
    /// shows.
    var roadGlow: Float = 0.55
    var buildingScale: Float = 1
    /// Drawn heights above this are compressed, so a tower still reads as a
    /// tower without walling off the street.
    var buildingKnee: Float = 1_000
    var buildingCap: Float = 1_000
    /// After dark: lit windows (empty = none), how many of them are lit, the
    /// roof's edge in moonlight, and warm pools of lamplight along streets.
    var windows: [RGB] = []
    var windowShare: Float = 0
    var roofRim: RGB? = nil
    var lampPools = false
}

/// Turns a ground response into vertex blobs. Pure and `nonisolated`: it runs
/// in a detached task, and only the final copy into GPU buffers happens on the
/// main actor.
enum WorldBuilder {

    // Layer heights, in metres. The camera's near plane is a metre out, which
    // gives the depth buffer millimetres to spare at these separations.
    static let yEarth: Float = 0
    static let yShore: Float = 0.04
    static let yGreen: Float = 0.08
    static let yPaved: Float = 0.16
    static let yWater: Float = 0.2
    static let yRail: Float = 0.26
    static let yTie: Float = 0.3
    static let yPath: Float = 0.34
    static let yCasing: Float = 0.4
    static let yRoad: Float = 0.46
    static let yMajor: Float = 0.52

    static func build(_ g: GroundGeometry, style s: BoardStyle) -> WorldBlobs {
        var out = WorldBlobs()
        // (east, north) from the server to the scene's (x, z): +z is SOUTH in
        // a right-handed y-up frame, or the city is drawn mirrored.
        func pts(_ p: [[Double]]) -> [SIMD2<Float>] {
            p.compactMap { $0.count >= 2 ? SIMD2(Float($0[0]), -Float($0[1])) : nil }
        }

        // The earth: a wide disc, far past the data, so the fog always has
        // ground under it and nothing ever shows an edge.
        disc(&out.ground, centre: .zero, radius: 1_800, y: yEarth,
             colour: s.earth.packed(), segments: 72)

        // Land cover, in an order that puts the smaller, more specific kinds
        // on top: a pitch inside a park, a garden inside a wood.
        func rank(_ k: String?) -> (Float, RGB, Bool) {
            switch k ?? "" {
            case "forest", "wood", "scrub", "nature_reserve", "orchard":
                return (0, s.wood, true)
            case "park", "recreation_ground", "village_green", "cemetery",
                 "grave_yard", "golf_course", "heath", "wetland", "farmland":
                return (1, s.park, true)
            case "grass", "garden", "meadow", "allotments":
                return (2, s.grass, false)
            case "pitch", "playground":
                return (3, s.pitch, false)
            default:
                return (1, s.park, true)
            }
        }
        for area in g.green {
            let ring = pts(area.p)
            let (r, colour, edged) = rank(area.k)
            let y = yGreen + r * 0.015
            flat(&out.ground, ring: ring, y: y, colour: colour.packed())
            if edged {
                band(&out.ground, ring: ring, width: 2.6, y: y + 0.005,
                     colour: s.parkEdge.packed())
            }
        }
        for area in g.paved ?? [] {
            flat(&out.ground, ring: pts(area.p), y: yPaved, colour: s.paved.packed())
        }

        // Water, with a pale shore laid UNDER it: only the half of the band
        // that lies on land shows, which reads as a bank or an embankment.
        for area in g.water {
            let ring = pts(area.p)
            flat(&out.water, ring: ring, y: yWater, colour: s.water.packed())
            outline(&out.ground, ring: ring, width: 7, y: yShore, colour: s.shore.packed())
        }
        for way in g.waterways ?? [] {
            let line = pts(way.p)
            strip(&out.water, line: line, width: Float(way.w), y: yWater,
                  colour: s.water.packed(), caps: true)
            strip(&out.ground, line: line, width: Float(way.w) + 5, y: yShore,
                  colour: s.shore.packed(), caps: true)
        }

        // Roads, by class. A kerb (casing) under the streets so they separate
        // from pale ground; paths narrower and dashed; rail as a dark bed with
        // sleepers. Major roads sit on top of minor ones at a junction.
        for way in g.roads {
            let line = pts(way.p)
            guard line.count >= 2 else { continue }
            let w = Float(way.w)
            switch way.k {
            case "rail":
                // A pale ballast bed, sleepers, and two thin rails: reads as
                // a railway, and never as a street across the river.
                strip(&out.ground, line: line, width: 3.4, y: yRail,
                      colour: s.rail.packed(), caps: false)
                ties(&out.ground, line: line, width: 2.8, spacing: 2.2, y: yTie,
                     colour: s.rail.scaled(0.86).packed())
                for side: Float in [-0.72, 0.72] {
                    strip(&out.ground, line: offsetLine(line, by: side), width: 0.32,
                          y: yTie + 0.02, colour: s.railTie.packed(), caps: false)
                }
            case "path":
                let sidewalk = way.d == "sidewalk" || way.d == "crossing"
                let width = sidewalk ? max(1.2, w * 0.8) : max(1.4, w * 0.85)
                if sidewalk || way.d == "steps" {
                    strip(&out.roads, line: line, width: width, y: yPath,
                          colour: s.path.packed(), caps: true)
                } else {
                    dashes(&out.roads, line: line, width: width, y: yPath,
                           colour: s.path.packed(), on: 3.2, off: 2.0)
                }
            default:
                let major = way.k == "major_road" || way.k == "highway"
                let width = major ? w * 1.1 : w
                strip(&out.ground, line: line, width: width + 2.0, y: yCasing,
                      colour: s.casing.packed(), caps: true)
                strip(&out.roads, line: line, width: width,
                      y: major ? yMajor : yRoad,
                      colour: (major ? s.roadMajor : s.road).packed(alpha: s.roadGlow),
                      caps: true)
                if s.lampPools {
                    lamps(&out.lights, line: line, width: width,
                          y: (major ? yMajor : yRoad) + 0.04,
                          colour: RGB(hex: 0xFFE4A6).packed())
                }
            }
        }

        // Buildings.
        for b in g.buildings {
            var ring = clean(pts(b.p))
            guard ring.count >= 3 else { continue }
            if signedArea(ring) < 0 { ring.reverse() }
            let (base, top) = drawnHeights(real: Float(b.h), base: Float(b.b ?? 0), style: s)
            guard top > base + 0.4 else { continue }
            let key = hashKey(ring[0], salt: 0)
            prism(&out.buildings, ring: ring, base: base, top: top, key: key, style: s)
            if !s.windows.isEmpty {
                for i in 0..<ring.count {
                    let a = ring[i], b = ring[(i + 1) % ring.count]
                    let e = b - a
                    let len = simd_length(e)
                    guard len > 0.05 else { continue }
                    windows(&out.lights, a: a, b: b, e: e, len: len,
                            outward: SIMD3<Float>(e.y / len, 0, -e.x / len),
                            base: base, top: top, key: key &+ UInt32(i), style: s)
                }
            }
        }

        // Trees.
        for t in g.trees ?? [] where t.count >= 2 {
            let scale = t.count > 2 ? Float(t[2]) : 1
            let variant = t.count > 3 ? Int(t[3]) : 0
            tree(&out.trees, at: SIMD2(Float(t[0]), -Float(t[1])), scale: scale,
                 variant: variant, style: s)
        }

        out.ground.orient()
        out.roads.orient()
        out.water.orient()
        out.buildings.orient()
        out.trees.orient()
        out.lights.orient()
        // Colours to texture coordinates, one atlas for every layer.
        var atlas = ColourAtlas()
        atlas.assign(&out.ground)
        atlas.assign(&out.roads)
        atlas.assign(&out.buildings)
        atlas.assign(&out.trees)
        atlas.assign(&out.lights)
        // Water is textured by a tiled ripple instead, in world metres.
        for i in 0..<out.water.vertices.count {
            out.water.vertices[i].u = out.water.vertices[i].px / 70
            out.water.vertices[i].v = out.water.vertices[i].pz / 70
        }
        out.atlas = atlas
        out.stats = "atlas \(atlas.used) colours, ground \(out.ground.vertices.count)v, water \(out.water.vertices.count)v, "
            + "buildings \(out.buildings.vertices.count)v, trees \(out.trees.vertices.count)v"
        return out
    }

    // MARK: - Heights

    /// Real height to drawn height. Linear to the knee, compressed above it,
    /// capped: the map keeps buildings low so the game stays in view.
    static func drawnHeights(real h: Float, base b: Float, style s: BoardStyle) -> (Float, Float) {
        func map(_ v: Float) -> Float {
            let lin = v * s.buildingScale
            let bent = lin <= s.buildingKnee ? lin : s.buildingKnee + (lin - s.buildingKnee) * 0.4
            return min(s.buildingCap, bent)
        }
        let base = b > 0 ? map(b) : 0
        var top = map(max(h, 1))
        // Nothing thinner than a storey, unless it is a lifted part whose
        // point is to sit on the roof below.
        if base == 0 { top = max(top, 3.2) }
        return (base, top)
    }

    // MARK: - Flat shapes

    /// A filled polygon, facing up.
    static func flat(_ blob: inout MeshBlob, ring: [SIMD2<Float>], y: Float, colour: UInt32) {
        let pts = clean(ring)
        guard pts.count >= 3 else { return }
        let tris = WorldMesh.triangulate(pts)
        guard !tris.isEmpty else { return }
        let up = SIMD3<Float>(0, 1, 0)
        let base = UInt32(blob.vertices.count)
        for p in pts { _ = blob.vertex(SIMD3(p.x, y, p.y), up, colour) }
        var i = 0
        while i + 2 < tris.count {
            blob.triangle(base + tris[i], base + tris[i + 1], base + tris[i + 2])
            i += 3
        }
    }

    /// A band just inside a polygon's edge: a park's darker hedge line.
    static func band(_ blob: inout MeshBlob, ring: [SIMD2<Float>], width: Float,
                     y: Float, colour: UInt32) {
        var pts = clean(ring)
        guard pts.count >= 3 else { return }
        if signedArea(pts) < 0 { pts.reverse() }
        let up = SIMD3<Float>(0, 1, 0)
        for i in 0..<pts.count {
            let a = pts[i], b = pts[(i + 1) % pts.count]
            let e = b - a
            let len = simd_length(e)
            guard len > 0.3 else { continue }
            // Anticlockwise, so the inside is on the left.
            let inward = SIMD2<Float>(-e.y, e.x) / len * min(width, len * 0.5)
            let v0 = blob.vertex(SIMD3(a.x, y, a.y), up, colour)
            let v1 = blob.vertex(SIMD3(b.x, y, b.y), up, colour)
            let v2 = blob.vertex(SIMD3(a.x + inward.x, y, a.y + inward.y), up, colour)
            let v3 = blob.vertex(SIMD3(b.x + inward.x, y, b.y + inward.y), up, colour)
            // Anticlockwise in (x, z) faces DOWN in RealityKit's frame, so
            // these are wound the other way: a roof rim must survive culling.
            blob.triangle(v0, v2, v1)
            blob.triangle(v2, v3, v1)
        }
    }

    /// A strip centred on a closed ring's edge.
    static func outline(_ blob: inout MeshBlob, ring: [SIMD2<Float>], width: Float,
                        y: Float, colour: UInt32) {
        var line = clean(ring)
        guard line.count >= 3 else { return }
        line.append(line[0])
        strip(&blob, line: line, width: width, y: y, colour: colour, caps: false)
    }

    /// A ribbon along a polyline with mitred joins, and round caps so ways
    /// meeting at a junction join rather than overlap in square slabs.
    static func strip(_ blob: inout MeshBlob, line raw: [SIMD2<Float>], width: Float,
                      y: Float, colour: UInt32, caps: Bool) {
        let line = dedupe(raw)
        guard line.count >= 2 else { return }
        let hw = width / 2
        let up = SIMD3<Float>(0, 1, 0)
        var prevL: UInt32 = 0, prevR: UInt32 = 0
        for i in 0..<line.count {
            let p = line[i]
            let dIn = i > 0 ? simd_normalize(p - line[i - 1]) : nil
            let dOut = i < line.count - 1 ? simd_normalize(line[i + 1] - p) : nil
            var offset: SIMD2<Float>
            var sharp = false
            switch (dIn, dOut) {
            case let (a?, b?):
                let t = a + b
                let tl = simd_length(t)
                let nb = SIMD2<Float>(-b.y, b.x)
                if tl < 1e-3 {
                    offset = nb * hw
                    sharp = true
                } else {
                    let miter = SIMD2<Float>(-t.y, t.x) / tl
                    let cosHalf = simd_dot(miter, nb)
                    sharp = cosHalf < 0.7
                    offset = miter * (hw / max(cosHalf, 0.5))
                }
            case let (a?, nil): offset = SIMD2(-a.y, a.x) * hw
            case let (nil, b?): offset = SIMD2(-b.y, b.x) * hw
            default: return
            }
            let l = blob.vertex(SIMD3(p.x + offset.x, y, p.y + offset.y), up, colour)
            let r = blob.vertex(SIMD3(p.x - offset.x, y, p.y - offset.y), up, colour)
            if i > 0 {
                blob.triangle(prevL, prevR, l)
                blob.triangle(l, prevR, r)
            }
            prevL = l; prevR = r
            // A tight bend clamps its mitre, which leaves a notch: fill it.
            if sharp { disc(&blob, centre: p, radius: hw, y: y, colour: colour, segments: 10) }
        }
        if caps {
            disc(&blob, centre: line[0], radius: hw, y: y, colour: colour, segments: 10)
            disc(&blob, centre: line[line.count - 1], radius: hw, y: y, colour: colour, segments: 10)
        }
    }

    /// A footpath: short strips with gaps.
    static func dashes(_ blob: inout MeshBlob, line raw: [SIMD2<Float>], width: Float,
                       y: Float, colour: UInt32, on: Float, off: Float) {
        let line = dedupe(raw)
        guard line.count >= 2 else { return }
        var drawing = true
        var left = on
        var run: [SIMD2<Float>] = [line[0]]
        for i in 0..<(line.count - 1) {
            var a = line[i]
            let b = line[i + 1]
            var seg = simd_length(b - a)
            let dir = (b - a) / max(seg, 1e-4)
            while seg > 0 {
                let step = min(seg, left)
                let p = a + dir * step
                if drawing { run.append(p) }
                a = p; seg -= step; left -= step
                if left <= 1e-4 {
                    if drawing, run.count >= 2 {
                        strip(&blob, line: run, width: width, y: y, colour: colour, caps: false)
                    }
                    drawing.toggle()
                    left = drawing ? on : off
                    run = [p]
                }
            }
        }
        if drawing, run.count >= 2 {
            strip(&blob, line: run, width: width, y: y, colour: colour, caps: false)
        }
    }

    /// Railway sleepers: short bars across the line at a fixed spacing.
    static func ties(_ blob: inout MeshBlob, line raw: [SIMD2<Float>], width: Float,
                     spacing: Float, y: Float, colour: UInt32) {
        let line = dedupe(raw)
        guard line.count >= 2 else { return }
        let up = SIMD3<Float>(0, 1, 0)
        var carry: Float = spacing / 2
        for i in 0..<(line.count - 1) {
            let a = line[i], b = line[i + 1]
            let len = simd_length(b - a)
            guard len > 1e-3 else { continue }
            let d = (b - a) / len
            let n = SIMD2<Float>(-d.y, d.x) * (width / 2)
            let t = d * 0.26
            var s = carry
            while s < len {
                let c = a + d * s
                let v0 = blob.vertex(SIMD3(c.x + n.x - t.x, y, c.y + n.y - t.y), up, colour)
                let v1 = blob.vertex(SIMD3(c.x + n.x + t.x, y, c.y + n.y + t.y), up, colour)
                let v2 = blob.vertex(SIMD3(c.x - n.x - t.x, y, c.y - n.y - t.y), up, colour)
                let v3 = blob.vertex(SIMD3(c.x - n.x + t.x, y, c.y - n.y + t.y), up, colour)
                blob.triangle(v0, v1, v2)
                blob.triangle(v2, v1, v3)
                s += spacing
            }
            carry = s - len
        }
    }

    static func disc(_ blob: inout MeshBlob, centre c: SIMD2<Float>, radius: Float,
                     y: Float, colour: UInt32, segments: Int) {
        let up = SIMD3<Float>(0, 1, 0)
        let mid = blob.vertex(SIMD3(c.x, y, c.y), up, colour)
        let first = UInt32(blob.vertices.count)
        for k in 0..<segments {
            let a = Float(k) / Float(segments) * 2 * .pi
            _ = blob.vertex(SIMD3(c.x + cos(a) * radius, y, c.y + sin(a) * radius), up, colour)
        }
        for k in 0..<UInt32(segments) {
            blob.triangle(mid, first + k, first + (k + 1) % UInt32(segments))
        }
    }

    // MARK: - Buildings

    /// A building: walls darker at the foot (ground contact) and lighter at the
    /// top, a roof a step lighter again, and a per-building family and tone so
    /// a street reads as many buildings rather than one slab.
    static func prism(_ blob: inout MeshBlob, ring: [SIMD2<Float>], base: Float, top: Float,
                      key: UInt32, style s: BoardStyle) {
        let fam = Int(key % UInt32(max(1, s.walls.count)))
        let jitter = 0.95 + Float((key >> 8) % 100) / 100 * 0.1
        let wall = s.walls[fam].scaled(jitter)
        let roof = s.roofs[fam % s.roofs.count].scaled(jitter)
        // Ambient occlusion at the foot: only for walls that reach the ground.
        let footShade: Float = base > 0 ? 0.9 : 0.7
        let wallLow = wall.scaled(footShade).packed()
        let wallHigh = wall.packed()
        let roofC = roof.packed()
        let rimC = (s.roofRim.map { roof.mixed($0, 0.7) } ?? roof.scaled(0.86)).packed()

        // Roof, with a darker rim just inside the edge: a crisp top line that
        // reads as an outline from above.
        let up = SIMD3<Float>(0, 1, 0)
        let tris = WorldMesh.triangulate(ring)
        if !tris.isEmpty {
            let b0 = UInt32(blob.vertices.count)
            for p in ring { _ = blob.vertex(SIMD3(p.x, top, p.y), up, roofC) }
            var i = 0
            while i + 2 < tris.count {
                // Ring is anticlockwise in (x, z), so this faces up.
                blob.triangle(b0 + tris[i], b0 + tris[i + 2], b0 + tris[i + 1])
                i += 3
            }
            band(&blob, ring: ring, width: 0.7, y: top + 0.03, colour: rimC)
        }

        for i in 0..<ring.count {
            let a = ring[i], b = ring[(i + 1) % ring.count]
            let e = b - a
            let len = simd_length(e)
            guard len > 0.05 else { continue }
            let outward = SIMD3<Float>(e.y / len, 0, -e.x / len)
            let a0 = blob.vertex(SIMD3(a.x, base, a.y), outward, wallLow)
            let b0 = blob.vertex(SIMD3(b.x, base, b.y), outward, wallLow)
            let a1 = blob.vertex(SIMD3(a.x, top, a.y), outward, wallHigh)
            let b1 = blob.vertex(SIMD3(b.x, top, b.y), outward, wallHigh)
            blob.triangle(a0, a1, b0)
            blob.triangle(b0, a1, b1)
        }
        // A lifted part has an underside someone standing back can see.
        if base > 0, !tris.isEmpty {
            let down = SIMD3<Float>(0, -1, 0)
            let b0 = UInt32(blob.vertices.count)
            for p in ring { _ = blob.vertex(SIMD3(p.x, base, p.y), down, wallLow) }
            var i = 0
            while i + 2 < tris.count {
                blob.triangle(b0 + tris[i], b0 + tris[i + 1], b0 + tris[i + 2])
                i += 3
            }
        }
    }

    /// Lit windows after dark: small warm quads a few centimetres proud of
    /// the wall, some floors lit and some not, per building. They go in the
    /// building layer's atlas like any colour, so they cost no extra draw;
    /// their brightness comes from being near-white warm against indigo.
    static func windows(_ blob: inout MeshBlob, a: SIMD2<Float>, b: SIMD2<Float>, e: SIMD2<Float>,
                        len: Float, outward: SIMD3<Float>, base: Float, top: Float,
                        key: UInt32, style s: BoardStyle) {
        let h = top - base
        guard len > 2.2, h > 2.2 else { return }
        let floorH: Float = 2.6, bayW: Float = 2.4
        let floors = max(1, Int(h / floorH))
        let bays = max(1, Int(len / bayW))
        guard floors * bays <= 60 else { return }
        let dir = e / len
        let push = SIMD2(outward.x, outward.z) * 0.06
        var rng = key &* 2654435761
        for f in 0..<floors {
            for k in 0..<bays {
                rng = rng &* 1664525 &+ 1013904223
                let lit = Float(rng >> 8 & 0xFFFF) / 65535 < s.windowShare
                guard lit else { continue }
                let c = s.windows[Int(rng >> 24) % s.windows.count].packed()
                let cx = (Float(k) + 0.5) * (len / Float(bays))
                let y0 = base + Float(f) * floorH + 0.9, y1 = min(top - 0.3, y0 + 1.1)
                guard y1 > y0 + 0.3 else { continue }
                let p0 = a + dir * (cx - 0.55) + push, p1 = a + dir * (cx + 0.55) + push
                let v0 = blob.vertex(SIMD3(p0.x, y0, p0.y), outward, c)
                let v1 = blob.vertex(SIMD3(p1.x, y0, p1.y), outward, c)
                let v2 = blob.vertex(SIMD3(p0.x, y1, p0.y), outward, c)
                let v3 = blob.vertex(SIMD3(p1.x, y1, p1.y), outward, c)
                blob.triangle(v0, v2, v1)
                blob.triangle(v1, v2, v3)
            }
        }
        _ = b
    }

    /// Street lamps seen from above: a small warm point at each kerb every
    /// ~26 m, alternating sides. Unlit, in the
    /// lights layer, so they read as lamps rather than as beads on the road.
    static func lamps(_ blob: inout MeshBlob, line: [SIMD2<Float>], width: Float,
                      y: Float, colour: UInt32) {
        var carry: Float = 13
        var side: Float = 1
        for i in 0..<max(0, line.count - 1) {
            let a = line[i], b = line[i + 1]
            let seg = simd_length(b - a)
            guard seg > 0.01 else { continue }
            let dir = (b - a) / seg
            let normal = SIMD2(-dir.y, dir.x)
            var t = carry
            while t < seg {
                let p = a + (b - a) * (t / seg) + normal * (width * 0.5 + 0.5) * side
                disc(&blob, centre: p, radius: 1.0, y: y, colour: colour, segments: 8)
                side = -side
                t += 26
            }
            carry = t - seg
        }
    }

    // MARK: - Trees

    /// A low-poly tree, faceted: a trunk and one of three canopies (round,
    /// cone, tall conifer). Vertex alpha is height up the tree, for the sway.
    static func tree(_ blob: inout MeshBlob, at c: SIMD2<Float>, scale: Float,
                     variant: Int, style s: BoardStyle) {
        let key = hashKey(c, salt: 91)
        let leaf = s.leaves[Int(key % UInt32(s.leaves.count))]
            .scaled(0.92 + Float((key >> 9) % 100) / 100 * 0.16)
        let k = scale
        let trunkH: Float = 1.6 * k
        prismFaceted(&blob, centre: c, radius: 0.35 * k, y0: 0, y1: trunkH + 0.4 * k,
                     sides: 5, colour: s.trunk, alpha0: 0, alpha1: 0)
        switch variant {
        case 1:
            cone(&blob, centre: c, radius: 2.5 * k, y0: trunkH, y1: trunkH + 5.2 * k,
                 sides: 7, colour: leaf, twist: Float(key % 7))
        case 2:
            let dark = leaf.scaled(0.86)
            cone(&blob, centre: c, radius: 2.2 * k, y0: trunkH - 0.2 * k, y1: trunkH + 3.4 * k,
                 sides: 6, colour: dark, twist: Float(key % 5))
            cone(&blob, centre: c, radius: 1.6 * k, y0: trunkH + 2.0 * k, y1: trunkH + 5.6 * k,
                 sides: 6, colour: dark.scaled(1.08), twist: Float(key % 5) + 0.5)
        default:
            blobCanopy(&blob, centre: SIMD3(c.x, trunkH + 1.9 * k, c.y), radius: 2.4 * k,
                       colour: leaf, twist: Float(key % 11))
        }
    }

    static func prismFaceted(_ blob: inout MeshBlob, centre c: SIMD2<Float>, radius: Float,
                             y0: Float, y1: Float, sides: Int, colour: RGB,
                             alpha0: Float, alpha1: Float) {
        for k in 0..<sides {
            let a0 = Float(k) / Float(sides) * 2 * .pi
            let a1 = Float(k + 1) / Float(sides) * 2 * .pi
            let p0 = SIMD2(c.x + cos(a0) * radius, c.y + sin(a0) * radius)
            let p1 = SIMD2(c.x + cos(a1) * radius, c.y + sin(a1) * radius)
            let mid = (a0 + a1) / 2
            let n = SIMD3<Float>(cos(mid), 0, sin(mid))
            let lo = colour.packed(alpha: alpha0), hi = colour.packed(alpha: alpha1)
            let v0 = blob.vertex(SIMD3(p0.x, y0, p0.y), n, lo)
            let v1 = blob.vertex(SIMD3(p1.x, y0, p1.y), n, lo)
            let v2 = blob.vertex(SIMD3(p0.x, y1, p0.y), n, hi)
            let v3 = blob.vertex(SIMD3(p1.x, y1, p1.y), n, hi)
            blob.triangle(v0, v2, v1)
            blob.triangle(v1, v2, v3)
        }
    }

    static func cone(_ blob: inout MeshBlob, centre c: SIMD2<Float>, radius: Float,
                     y0: Float, y1: Float, sides: Int, colour: RGB, twist: Float) {
        let apex = SIMD3<Float>(c.x, y1, c.y)
        let h = y1 - y0
        for k in 0..<sides {
            let a0 = (Float(k) + twist * 0.1) / Float(sides) * 2 * .pi
            let a1 = (Float(k + 1) + twist * 0.1) / Float(sides) * 2 * .pi
            let p0 = SIMD3<Float>(c.x + cos(a0) * radius, y0, c.y + sin(a0) * radius)
            let p1 = SIMD3<Float>(c.x + cos(a1) * radius, y0, c.y + sin(a1) * radius)
            let n = simd_normalize(simd_cross(p1 - p0, apex - p0))
            let facing = n.y < 0 ? -n : n
            // Faces toward the sun a touch lighter: faceting you can read.
            let tone = colour.scaled(0.92 + 0.14 * max(0, facing.x * -0.5 + facing.z * -0.3 + 0.5))
            let base = tone.packed()
            let v0 = blob.vertex(p0, facing, base)
            let v1 = blob.vertex(p1, facing, base)
            let v2 = blob.vertex(apex, facing, base)
            blob.triangle(v0, v2, v1)
            _ = h
        }
        // Underside, so a canopy seen from low down is not hollow.
        let down = SIMD3<Float>(0, -1, 0)
        let under = colour.scaled(0.7).packed()
        let mid = blob.vertex(SIMD3(c.x, y0, c.y), down, under)
        let first = UInt32(blob.vertices.count)
        for k in 0..<sides {
            let a = (Float(k) + twist * 0.1) / Float(sides) * 2 * .pi
            _ = blob.vertex(SIMD3(c.x + cos(a) * radius, y0, c.y + sin(a) * radius), down, under)
        }
        for k in 0..<UInt32(sides) {
            blob.triangle(mid, first + k, first + (k + 1) % UInt32(sides))
        }
    }

    /// A round canopy: an octahedron with its equator turned, flat-shaded.
    static func blobCanopy(_ blob: inout MeshBlob, centre c: SIMD3<Float>, radius r: Float,
                           colour: RGB, twist: Float) {
        let top = c + SIMD3(0, r * 1.05, 0)
        let bottom = c - SIMD3(0, r * 0.75, 0)
        let sides = 6
        var ring: [SIMD3<Float>] = []
        for k in 0..<sides {
            let a = (Float(k) + twist * 0.13) / Float(sides) * 2 * .pi
            ring.append(c + SIMD3(cos(a) * r, (k % 2 == 0 ? 0.25 : -0.15) * r, sin(a) * r))
        }
        for k in 0..<sides {
            let p0 = ring[k], p1 = ring[(k + 1) % sides]
            for (apex, alpha) in [(top, Float(1)), (bottom, Float(0.4))] {
                var n = simd_normalize(simd_cross(p1 - p0, apex - p0))
                if simd_dot(n, (p0 + p1 + apex) / 3 - c) < 0 { n = -n }
                let lightish = 0.84 + 0.22 * max(0, n.y * 0.6 + n.x * -0.3 + n.z * -0.2 + 0.3)
                let tone = colour.scaled(apex == top ? lightish : lightish * 0.82)
                let c = tone.packed()
                let v0 = blob.vertex(p0, n, c)
                let v1 = blob.vertex(p1, n, c)
                let v2 = blob.vertex(apex, n, c)
                _ = alpha
                blob.triangle(v0, v2, v1)
            }
        }
    }

    // MARK: - Helpers

    /// A ring with consecutive duplicates and the closing point removed.
    ///
    /// The duplicate is not harmless: it sits on the boundary of every ear
    /// that touches it, the triangulator counts that as inside, and those ears
    /// are never clipped. That is how 15% of London's roofs went missing.
    static func clean(_ ring: [SIMD2<Float>]) -> [SIMD2<Float>] {
        var out: [SIMD2<Float>] = []
        out.reserveCapacity(ring.count)
        for p in ring {
            if let last = out.last, simd_distance_squared(last, p) < 0.0025 { continue }
            out.append(p)
        }
        while out.count > 1, let f = out.first, let l = out.last,
              simd_distance_squared(f, l) < 0.0025 {
            out.removeLast()
        }
        return out
    }

    /// A polyline moved sideways by a distance (left positive), mitred.
    static func offsetLine(_ raw: [SIMD2<Float>], by d: Float) -> [SIMD2<Float>] {
        let line = dedupe(raw)
        guard line.count >= 2 else { return line }
        var out: [SIMD2<Float>] = []
        for i in 0..<line.count {
            let dIn = i > 0 ? simd_normalize(line[i] - line[i - 1]) : nil
            let dOut = i < line.count - 1 ? simd_normalize(line[i + 1] - line[i]) : nil
            let t = simd_normalize((dIn ?? dOut!) + (dOut ?? dIn!))
            let n = SIMD2<Float>(-t.y, t.x)
            let ref = dOut ?? dIn!
            let c = max(0.5, simd_dot(n, SIMD2(-ref.y, ref.x)))
            out.append(line[i] + n * (d / c))
        }
        return out
    }

    static func dedupe(_ line: [SIMD2<Float>]) -> [SIMD2<Float>] {
        var out: [SIMD2<Float>] = []
        out.reserveCapacity(line.count)
        for p in line {
            if let last = out.last, simd_distance_squared(last, p) < 0.01 { continue }
            out.append(p)
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

    static func hashKey(_ p: SIMD2<Float>, salt: UInt32) -> UInt32 {
        var h = UInt32(bitPattern: Int32(truncatingIfNeeded: Int((p.x * 10).rounded())))
            &* 0x9E3779B1
        h ^= UInt32(bitPattern: Int32(truncatingIfNeeded: Int((p.y * 10).rounded()))) &* 0x85EBCA6B
        h ^= salt &* 0xC2B2AE35
        h ^= h >> 15
        h = h &* 0x2C1B3C6D
        h ^= h >> 12
        return h
    }
}
