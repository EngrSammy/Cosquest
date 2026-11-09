import Foundation
import simd

/// The triangles of a binary glTF (.glb), flattened into world space.
///
/// RealityKit and Model I/O open USDZ but not glTF, and the Forge publishes
/// weapons as .glb. A preview needs only geometry and a colour, so this reads
/// exactly that: every triangle primitive reachable from the default scene,
/// positions and normals transformed by its node chain, and the material's
/// base colour factor. Textures, skins and animation are not read; a model
/// that relies on a texture shows in its base colour (or the rarity's, when
/// it has none).
///
/// Foundation and simd only, so the tests compile it on their own.
struct GLBMesh: Sendable {
    struct Part: Sendable {
        var positions: [SIMD3<Float>]
        var normals: [SIMD3<Float>]
        var indices: [UInt32]
        /// RGBA, from the material; nil when the file names none.
        var color: SIMD4<Float>?
    }

    var parts: [Part]
    var boundsMin: SIMD3<Float>
    var boundsMax: SIMD3<Float>

    var triangleCount: Int { parts.reduce(0) { $0 + $1.indices.count / 3 } }

    enum ParseError: Error, Equatable {
        case notGLB, unsupportedVersion, noJSON, noBinary, badAccessor(Int), externalBuffer, tooLarge, empty
    }

    /// A cap on what a preview will build, so a malformed file cannot ask for
    /// gigabytes. Several orders above what the Forge's weapons use.
    static let maxVertices = 2_000_000

    static func parse(_ data: Data) throws -> GLBMesh {
        let bytes = [UInt8](data)
        func u32(_ o: Int) -> UInt32 {
            guard o + 4 <= bytes.count else { return 0 }
            return UInt32(bytes[o]) | UInt32(bytes[o + 1]) << 8 | UInt32(bytes[o + 2]) << 16 | UInt32(bytes[o + 3]) << 24
        }
        guard bytes.count >= 20, u32(0) == 0x4654_6C67 else { throw ParseError.notGLB }
        guard u32(4) == 2 else { throw ParseError.unsupportedVersion }

        var json: [String: Any]?
        var bin: ArraySlice<UInt8>?
        var offset = 12
        while offset + 8 <= bytes.count {
            let length = Int(u32(offset))
            let type = u32(offset + 4)
            let start = offset + 8
            guard length >= 0, start + length <= bytes.count else { break }
            let chunk = bytes[start..<start + length]
            if type == 0x4E4F_534A, json == nil {
                json = try JSONSerialization.jsonObject(with: Data(chunk)) as? [String: Any]
            } else if type == 0x004E_4942, bin == nil {
                bin = chunk
            }
            offset = start + ((length + 3) & ~3)
        }
        guard let json else { throw ParseError.noJSON }
        return try Reader(json: json, bin: bin).mesh()
    }

    private struct Reader {
        let json: [String: Any]
        let bin: ArraySlice<UInt8>?

        private func array(_ key: String) -> [[String: Any]] { json[key] as? [[String: Any]] ?? [] }

        func mesh() throws -> GLBMesh {
            let nodes = array("nodes")
            let scenes = array("scenes")
            let sceneIndex = json["scene"] as? Int ?? 0
            var roots: [Int] = []
            if sceneIndex < scenes.count, let r = scenes[sceneIndex]["nodes"] as? [Int] {
                roots = r
            } else {
                // No scene: every node nobody claims as a child is a root.
                let children = Set(nodes.flatMap { $0["children"] as? [Int] ?? [] })
                roots = nodes.indices.filter { !children.contains($0) }
            }
            var parts: [Part] = []
            var visited = Set<Int>()
            func walk(_ i: Int, _ parent: simd_float4x4) throws {
                guard i >= 0, i < nodes.count, visited.insert(i).inserted else { return }
                let node = nodes[i]
                let world = parent * Self.transform(node)
                if let m = node["mesh"] as? Int { parts += try meshParts(m, world) }
                for c in node["children"] as? [Int] ?? [] { try walk(c, world) }
            }
            for r in roots { try walk(r, matrix_identity_float4x4) }
            // A file of bare meshes with no nodes at all still has a shape.
            if nodes.isEmpty {
                for m in array("meshes").indices { parts += try meshParts(m, matrix_identity_float4x4) }
            }
            parts.removeAll { $0.indices.isEmpty }
            guard !parts.isEmpty else { throw ParseError.empty }
            var lo = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
            var hi = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
            for p in parts { for v in p.positions { lo = simd_min(lo, v); hi = simd_max(hi, v) } }
            return GLBMesh(parts: parts, boundsMin: lo, boundsMax: hi)
        }

        static func transform(_ node: [String: Any]) -> simd_float4x4 {
            if let m = node["matrix"] as? [Double], m.count == 16 {
                let f = m.map(Float.init)
                return simd_float4x4(columns: (SIMD4(f[0], f[1], f[2], f[3]), SIMD4(f[4], f[5], f[6], f[7]),
                                               SIMD4(f[8], f[9], f[10], f[11]), SIMD4(f[12], f[13], f[14], f[15])))
            }
            var out = matrix_identity_float4x4
            if let t = node["translation"] as? [Double], t.count == 3 {
                out.columns.3 = SIMD4(Float(t[0]), Float(t[1]), Float(t[2]), 1)
            }
            if let r = node["rotation"] as? [Double], r.count == 4 {
                let q = simd_quatf(ix: Float(r[0]), iy: Float(r[1]), iz: Float(r[2]), r: Float(r[3]))
                out = out * simd_float4x4(q)
            }
            if let s = node["scale"] as? [Double], s.count == 3 {
                out = out * simd_float4x4(diagonal: SIMD4(Float(s[0]), Float(s[1]), Float(s[2]), 1))
            }
            return out
        }

        private func meshParts(_ index: Int, _ world: simd_float4x4) throws -> [Part] {
            let meshes = array("meshes")
            guard index >= 0, index < meshes.count else { return [] }
            let normalMatrix: simd_float3x3 = {
                let m = simd_float3x3(SIMD3(world.columns.0.x, world.columns.0.y, world.columns.0.z),
                                      SIMD3(world.columns.1.x, world.columns.1.y, world.columns.1.z),
                                      SIMD3(world.columns.2.x, world.columns.2.y, world.columns.2.z))
                return abs(m.determinant) > 1e-12 ? m.inverse.transpose : m
            }()
            var out: [Part] = []
            for prim in meshes[index]["primitives"] as? [[String: Any]] ?? [] {
                // Triangles only (mode 4, the default). Lines and points have
                // nothing to shade.
                guard (prim["mode"] as? Int ?? 4) == 4,
                      let attrs = prim["attributes"] as? [String: Any],
                      let posIndex = attrs["POSITION"] as? Int else { continue }
                let positions = try vec3(posIndex).map { v -> SIMD3<Float> in
                    let p = world * SIMD4(v, 1)
                    return SIMD3(p.x, p.y, p.z)
                }
                guard positions.count <= GLBMesh.maxVertices else { throw ParseError.tooLarge }
                var indices: [UInt32]
                if let i = prim["indices"] as? Int {
                    indices = try scalars(i)
                } else {
                    indices = (0..<UInt32(positions.count)).map { $0 }
                }
                indices = Array(indices.prefix(indices.count - indices.count % 3))
                guard indices.allSatisfy({ Int($0) < positions.count }) else {
                    throw ParseError.badAccessor(prim["indices"] as? Int ?? -1)
                }
                let color = materialColor(prim["material"] as? Int)
                if let n = attrs["NORMAL"] as? Int {
                    let normals = try vec3(n).map { simd_normalize(normalMatrix * $0) }
                    guard normals.count == positions.count else { throw ParseError.badAccessor(n) }
                    out.append(Part(positions: positions, normals: normals, indices: indices, color: color))
                } else {
                    out.append(Self.faceted(positions, indices, color))
                }
            }
            return out
        }

        /// No normals in the file: give each triangle its own vertices and its
        /// face's normal. Faceted shading suits the low-poly weapons the
        /// Forge makes, where averaged normals would round a blade's edge off.
        static func faceted(_ p: [SIMD3<Float>], _ idx: [UInt32], _ color: SIMD4<Float>?) -> Part {
            var positions: [SIMD3<Float>] = []
            var normals: [SIMD3<Float>] = []
            positions.reserveCapacity(idx.count)
            normals.reserveCapacity(idx.count)
            var t = 0
            while t + 2 < idx.count {
                let a = p[Int(idx[t])], b = p[Int(idx[t + 1])], c = p[Int(idx[t + 2])]
                let cr = simd_cross(b - a, c - a)
                let n = simd_length(cr) > 0 ? simd_normalize(cr) : SIMD3<Float>(0, 1, 0)
                positions += [a, b, c]
                normals += [n, n, n]
                t += 3
            }
            return Part(positions: positions, normals: normals,
                        indices: (0..<UInt32(positions.count)).map { $0 }, color: color)
        }

        private func materialColor(_ index: Int?) -> SIMD4<Float>? {
            let materials = array("materials")
            guard let index, index >= 0, index < materials.count,
                  let pbr = materials[index]["pbrMetallicRoughness"] as? [String: Any],
                  let f = pbr["baseColorFactor"] as? [Double], f.count == 4 else { return nil }
            return SIMD4(Float(f[0]), Float(f[1]), Float(f[2]), Float(f[3]))
        }

        // MARK: Accessors

        private struct View {
            let base: Int
            let count: Int
            let stride: Int
            let componentType: Int
            let components: Int
            let normalized: Bool
        }

        private func view(_ accessorIndex: Int, components want: Int) throws -> View {
            let accessors = array("accessors")
            guard accessorIndex >= 0, accessorIndex < accessors.count else { throw ParseError.badAccessor(accessorIndex) }
            let a = accessors[accessorIndex]
            let comps: Int = switch a["type"] as? String {
            case "SCALAR": 1
            case "VEC2": 2
            case "VEC3": 3
            case "VEC4": 4
            default: 0
            }
            guard comps == want, let count = a["count"] as? Int, count >= 0,
                  let ctype = a["componentType"] as? Int,
                  let bvIndex = a["bufferView"] as? Int else { throw ParseError.badAccessor(accessorIndex) }
            let views = array("bufferViews")
            guard bvIndex >= 0, bvIndex < views.count else { throw ParseError.badAccessor(accessorIndex) }
            let bv = views[bvIndex]
            let buffers = array("buffers")
            let bufIndex = bv["buffer"] as? Int ?? 0
            if bufIndex < buffers.count, buffers[bufIndex]["uri"] != nil { throw ParseError.externalBuffer }
            guard bufIndex == 0, let bin else { throw ParseError.noBinary }
            let size: Int = switch ctype {
            case 5120, 5121: 1
            case 5122, 5123: 2
            case 5125, 5126: 4
            default: 0
            }
            guard size > 0 else { throw ParseError.badAccessor(accessorIndex) }
            let base = (bv["byteOffset"] as? Int ?? 0) + (a["byteOffset"] as? Int ?? 0)
            let stride = (bv["byteStride"] as? Int).flatMap { $0 > 0 ? $0 : nil } ?? size * comps
            let end = count == 0 ? base : base + stride * (count - 1) + size * comps
            guard base >= 0, end <= bin.count,
                  end <= (bv["byteOffset"] as? Int ?? 0) + (bv["byteLength"] as? Int ?? Int.max) else {
                throw ParseError.badAccessor(accessorIndex)
            }
            return View(base: base, count: count, stride: stride, componentType: ctype,
                        components: comps, normalized: a["normalized"] as? Bool ?? false)
        }

        private func component(_ v: View, _ at: Int) -> Float {
            guard let bin else { return 0 }
            let s = bin.startIndex + at
            func le(_ n: Int) -> UInt32 {
                var x: UInt32 = 0
                for k in 0..<n { x |= UInt32(bin[s + k]) << (8 * k) }
                return x
            }
            switch v.componentType {
            case 5126: return Float(bitPattern: le(4))
            case 5125: return Float(le(4))
            case 5123: return v.normalized ? Float(le(2)) / 65535 : Float(le(2))
            case 5122: let i = Int16(bitPattern: UInt16(le(2))); return v.normalized ? max(Float(i) / 32767, -1) : Float(i)
            case 5121: return v.normalized ? Float(le(1)) / 255 : Float(le(1))
            case 5120: let i = Int8(bitPattern: UInt8(le(1))); return v.normalized ? max(Float(i) / 127, -1) : Float(i)
            default: return 0
            }
        }

        func vec3(_ accessor: Int) throws -> [SIMD3<Float>] {
            let v = try view(accessor, components: 3)
            let size = v.componentType == 5126 || v.componentType == 5125 ? 4 : v.componentType <= 5121 ? 1 : 2
            return (0..<v.count).map { i in
                let o = v.base + i * v.stride
                return SIMD3(component(v, o), component(v, o + size), component(v, o + 2 * size))
            }
        }

        func scalars(_ accessor: Int) throws -> [UInt32] {
            let v = try view(accessor, components: 1)
            guard [5121, 5123, 5125].contains(v.componentType), let bin else { throw ParseError.badAccessor(accessor) }
            let size = v.componentType == 5125 ? 4 : v.componentType == 5123 ? 2 : 1
            return (0..<v.count).map { i in
                let s = bin.startIndex + v.base + i * v.stride
                var x: UInt32 = 0
                for k in 0..<size { x |= UInt32(bin[s + k]) << (8 * k) }
                return x
            }
        }
    }
}
