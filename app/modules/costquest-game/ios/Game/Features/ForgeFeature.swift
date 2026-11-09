import RealityKit
import SwiftUI
import UIKit

// FEATURE: Forge weapons. The weapons the Forge portal has published, shown in
// the Relicdex next to the player's Relics.
//
// Client-side only. The catalogue is read from GET v1/catalogue (see
// Net/ForgeCatalogue.swift) and each weapon's lod0 model is fetched, verified
// against its sha256 and cached per version. Nothing is granted, equipped or
// written back: a Forge weapon is labelled as such and shown with its stats
// and its model, turning in your hand.
//
// Behind ForgeFlags (on by default; `-forgeCatalogue NO` turns it off). A
// server without the catalogue (404) simply shows no Forge section.

// MARK: - State

@MainActor @Observable
final class ForgeCatalogueModel {
    static let shared = ForgeCatalogueModel()

    private(set) var weapons: [ForgeElement] = []
    /// Verified preview models on disk, by element id.
    private(set) var models: [String: URL] = [:]
    private(set) var source: ForgeCatalogueStore.Source?
    private(set) var loading = false
    @ObservationIgnored private var lastRefresh: Date?
    @ObservationIgnored private let store = ForgeCatalogueStore(baseURL: CQConfig.baseURL)

    var enabled: Bool { ForgeFlags.catalogueEnabled() }

    func weapon(_ id: String) -> ForgeElement? { weapons.first { $0.id == id } }

    /// Read the catalogue and bring the models down. Cheap to call often: the
    /// server's own max-age is a minute, so a call inside that is skipped, and
    /// past it an unchanged catalogue is a 304 of no bytes.
    func refresh(force: Bool = false) async {
        guard enabled, !loading else { return }
        if !force, let last = lastRefresh, Date().timeIntervalSince(last) < 60 { return }
        loading = true
        defer { loading = false }
        let snapshot = await store.refresh()
        lastRefresh = Date()
        source = snapshot.source
        weapons = snapshot.weapons.sorted {
            (RelicLook.order.firstIndex(of: $0.rarity ?? "") ?? 9, $0.name)
                < (RelicLook.order.firstIndex(of: $1.rarity ?? "") ?? 9, $1.name)
        }
        // What is already on disk shows at once; the rest follows the download.
        var onDisk: [String: URL] = [:]
        for w in weapons { if let url = await store.localModel(for: w) { onDisk[w.id] = url } }
        models = onDisk
        let report = await store.syncWeapons(snapshot)
        models = report.models
    }
}

enum ForgeLook {
    /// The Forge has no weapon kind yet, so the silhouette for lists is read
    /// from the name, the way a player would.
    static func kind(_ name: String) -> String {
        let n = name.lowercased()
        for (word, kind) in [("axe", "axe"), ("cleaver", "axe"), ("bow", "bow"), ("staff", "staff"),
                             ("wand", "staff"), ("hammer", "hammer"), ("mace", "hammer"),
                             ("gauntlet", "gauntlet"), ("fist", "gauntlet")] where n.contains(word) {
            return kind
        }
        return "blade"
    }

    static func number(_ v: Double?) -> String {
        guard let v else { return "-" }
        return v.rounded() == v ? String(Int(v)) : String(format: "%.1f", v)
    }

    static let accent = Color(red: 0.96, green: 0.45, blue: 0.16)
}

// MARK: - The Relicdex section

struct ForgeArmourySection: View {
    let store: RoamStore
    var onPick: (String) -> Void
    private var model: ForgeCatalogueModel { .shared }
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 2)

    var body: some View {
        if model.enabled, !model.weapons.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "hammer.fill")
                        .font(.system(size: 16, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(ForgeLook.accent).overlay(Circle().strokeBorder(.white, lineWidth: 2)))
                    GameHeading("From the Forge", size: 24)
                    Spacer()
                    Text("\(model.weapons.count)")
                        .font(GameFont.display(18).monospacedDigit())
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.3), radius: 0, y: 1)
                }
                .accessibilityElement(children: .combine)
                Text("New weapons published by the Forge. A first look: they aren't Relics yet.")
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(model.weapons) { w in
                        Button { onPick(w.id) } label: { tile(w) }
                            .buttonStyle(CardPress())
                    }
                }
            }
        }
    }

    private func tile(_ w: ForgeElement) -> some View {
        let rarity = w.rarity ?? "common"
        return HStack(spacing: 8) {
            RelicArt(kind: ForgeLook.kind(w.name), rarity: rarity, size: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text(w.name).font(GameFont.display(15)).lineLimit(2).minimumScaleFactor(0.8)
                Text(RelicLook.rarityName(rarity).uppercased())
                    .font(GameFont.display(10)).tracking(0.6)
                    .foregroundStyle(RelicLook.rarityColor(rarity) == GamePalette.sun ? GamePalette.sunDeep : RelicLook.rarityColor(rarity))
                Label(ForgeLook.number(w.stats?.damage), systemImage: "burst.fill")
                    .font(GameFont.body(12, weight: .bold))
                    .foregroundStyle(GamePalette.berry)
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(GamePalette.ink)
        .padding(8)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(GamePalette.edge(of: GamePalette.cream)).offset(y: 4)
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(GamePalette.cream)
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(RelicLook.rarityColor(rarity).opacity(0.7), lineWidth: 1.5)
        }
        .overlay(alignment: .topTrailing) {
            Text(model.models[w.id] != nil ? "FORGE · 3D" : "FORGE")
                .font(GameFont.display(9)).tracking(0.6)
                .foregroundStyle(.white)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .background(Capsule().fill(ForgeLook.accent).overlay(Capsule().strokeBorder(.white, lineWidth: 1)))
                .offset(x: 4, y: -6)
        }
        .padding(.bottom, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Forge weapon: \(w.name), \(rarity), damage \(ForgeLook.number(w.stats?.damage))")
    }
}

// MARK: - Detail

struct ForgeWeaponDetail: View {
    let store: RoamStore
    let id: String
    var onClose: () -> Void
    private var model: ForgeCatalogueModel { .shared }

    var body: some View {
        if let w = model.weapon(id) { card(w) }
    }

    private func card(_ w: ForgeElement) -> some View {
        let rarity = w.rarity ?? "common"
        let tint = RelicLook.rarityColor(rarity)
        return GamePanel {
            VStack(spacing: 12) {
                HStack(spacing: 6) {
                    GameChip(text: RelicLook.rarityName(rarity), color: tint)
                    if let realm = w.realm {
                        GameChip(text: store.factionName(realm), color: RoamStyle.realmColor(realm))
                    }
                    GameChip(text: "Forge", color: ForgeLook.accent)
                    Spacer()
                    Button(action: onClose) { Image(systemName: "xmark") }
                        .buttonStyle(.gameIcon(GamePalette.ink.opacity(0.55), diameter: 36))
                        .accessibilityLabel("Close")
                }
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(LinearGradient(colors: [GamePalette.navy, GamePalette.navyEdge],
                                             startPoint: .top, endPoint: .bottom))
                    Sunburst(colour: tint).opacity(0.35)
                        .mask(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    if let url = model.models[w.id] {
                        ForgeModelView(url: url, tint: tint)
                            .accessibilityLabel("\(w.name), a 3D model. Drag to turn it.")
                    } else {
                        RelicArt(kind: ForgeLook.kind(w.name), rarity: rarity, size: 120)
                    }
                }
                .frame(height: 230)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                VStack(spacing: 2) {
                    Text(w.name).font(GameFont.display(26)).multilineTextAlignment(.center)
                    Text("Weapon · version \(w.version)" + (model.models[w.id] != nil ? " · drag to turn" : ""))
                        .font(GameFont.body(14, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                }
                HStack(spacing: 8) {
                    stat("Damage", ForgeLook.number(w.stats?.damage), "burst.fill", GamePalette.berry)
                    stat("Range", ForgeLook.number(w.stats?.range_m) + " m", "scope", GamePalette.skyDeep)
                    stat("Cooldown", ForgeLook.number(w.stats?.cooldown_s) + " s", "timer", GamePalette.mint)
                }
                Text("Published by the Forge. A first look only: it isn't one of your Relics and can't be equipped yet.")
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: 380)
    }

    private func stat(_ title: String, _ value: String, _ symbol: String, _ colour: Color) -> some View {
        VStack(spacing: 3) {
            Image(systemName: symbol).font(.system(size: 14, weight: .heavy)).foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(Circle().fill(colour))
            Text(value).font(GameFont.display(19).monospacedDigit()).lineLimit(1).minimumScaleFactor(0.7)
            Text(title).font(GameFont.body(12, weight: .bold)).foregroundStyle(GamePalette.ink.opacity(0.65))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(colour.opacity(0.12)))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - The model, turning

/// A downloaded Forge model on a small stage, turning slowly; drag to spin
/// it. USDZ opens through RealityKit; GLB is read by GLBMesh, because
/// RealityKit does not open glTF.
struct ForgeModelView: View {
    let url: URL
    let tint: Color
    @State private var rig = ForgeModelRig()
    @State private var yaw: Float = 0
    @State private var dragFrom: Float?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = Float(context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 3600))
            let spin = reduceMotion ? 0 : t * 0.7
            RealityView { content in
                content.camera = .virtual
                await rig.build(url: url, tint: UIColor(tint))
                content.add(rig.root)
            } update: { _ in
                rig.pivot.orientation = simd_quatf(angle: spin + yaw, axis: [0, 1, 0])
            }
        }
        .gesture(DragGesture(minimumDistance: 2)
            .onChanged { g in
                let from = dragFrom ?? yaw
                dragFrom = from
                yaw = from + Float(g.translation.width) * 0.012
            }
            .onEnded { _ in dragFrom = nil })
    }
}

@MainActor
final class ForgeModelRig {
    let root = Entity()
    let pivot = Entity()
    private var built = false

    func build(url: URL, tint: UIColor) async {
        guard !built else { return }
        built = true
        let holder = Entity()
        // A little lean, so a blade reads as a blade and not a line.
        holder.orientation = simd_quatf(angle: -0.32, axis: [0, 0, 1])
        pivot.addChild(holder)
        root.addChild(pivot)

        if let model = await Self.load(url: url, tint: tint) {
            let bounds = model.visualBounds(relativeTo: nil)
            let extent = max(bounds.extents.x, bounds.extents.y, bounds.extents.z)
            let scale: Float = extent > 0 ? 0.62 / extent : 1
            model.scale = SIMD3(repeating: scale)
            model.position = -bounds.center * scale
            holder.addChild(model)
        }

        let key = DirectionalLight()
        key.light.intensity = 4200
        key.look(at: .zero, from: [0.6, 1.2, 1.4], relativeTo: nil)
        root.addChild(key)
        let rim = DirectionalLight()
        rim.light.intensity = 2200
        rim.look(at: .zero, from: [-1.0, 0.4, -0.8], relativeTo: nil)
        root.addChild(rim)
        let camera = PerspectiveCamera()
        camera.camera.fieldOfViewInDegrees = 40
        camera.position = [0, 0, 1.05]
        camera.look(at: .zero, from: camera.position, relativeTo: nil)
        root.addChild(camera)
    }

    private static func load(url: URL, tint: UIColor) async -> Entity? {
        if url.pathExtension.lowercased() == "usdz" {
            return try? await Entity(contentsOf: url)
        }
        let parsed: GLBMesh? = await Task.detached(priority: .userInitiated) {
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try? GLBMesh.parse(data)
        }.value
        guard let parsed else { return nil }
        let entity = Entity()
        for (i, part) in parsed.parts.enumerated() {
            var d = MeshDescriptor(name: "forge-part-\(i)")
            d.positions = MeshBuffers.Positions(part.positions)
            d.normals = MeshBuffers.Normals(part.normals)
            d.primitives = .triangles(part.indices)
            guard let mesh = try? MeshResource.generate(from: [d]) else { continue }
            var m = PhysicallyBasedMaterial()
            let colour = part.color.map { UIColor(red: CGFloat($0.x), green: CGFloat($0.y),
                                                  blue: CGFloat($0.z), alpha: 1) } ?? tint
            m.baseColor = .init(tint: colour)
            m.metallic = 0.35
            m.roughness = 0.38
            // Exporters disagree on winding; a preview should never show the
            // inside of a blade.
            m.faceCulling = .none
            entity.addChild(ModelEntity(mesh: mesh, materials: [m]))
        }
        return entity.children.isEmpty ? nil : entity
    }
}
