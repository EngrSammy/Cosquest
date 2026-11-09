import SwiftUI
import UIKit

// FEATURE: relics. The faction weapons a player collects, powers up and takes
// into a siege.
//
// This file is the whole iOS side of the feature: the wire shapes, one shared
// model, the rail button, the Relicdex, the detail card, the drop reveal the
// reward screen plays, and the badge the HUD and the siege show. The server
// decides every drop, level and shard (see costquest-backend
// app/roam_relics.py); the phone reads GET v1/roam/relics and draws it.
//
// No real IP: the names are the server's, evocative of a fandom and owned by
// nobody. Relics have no 3D models: each kind is a drawn silhouette in a
// rarity-coloured crystal frame.

// MARK: - Wire

struct Relic: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
    let faction: String
    /// common | rare | epic | legendary
    let rarity: String
    /// blade | axe | bow | staff | hammer | gauntlet
    let kind: String
    let power: Double
    /// cleave | ward | focus | insight | surge
    let ability: String
    let lore: String?
    var ability_text: String?
    var faction_name: String?
    var next_level_cost: Int?
    var level: Int?
    var shards: Int?
    var power_now: Double?
    var found_at: String?

    enum CodingKeys: String, CodingKey {
        case id, name, faction, rarity, kind, power, ability, lore, level, shards, power_now, found_at
        case ability_text, faction_name, next_level_cost
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        faction = try c.decodeIfPresent(String.self, forKey: .faction) ?? ""
        rarity = try c.decodeIfPresent(String.self, forKey: .rarity) ?? "common"
        kind = try c.decodeIfPresent(String.self, forKey: .kind) ?? "blade"
        power = Self.number(c, .power) ?? 10
        ability = try c.decodeIfPresent(String.self, forKey: .ability) ?? ""
        lore = try c.decodeIfPresent(String.self, forKey: .lore)
        level = try c.decodeIfPresent(Int.self, forKey: .level)
        shards = try c.decodeIfPresent(Int.self, forKey: .shards)
        power_now = Self.number(c, .power_now)
        found_at = try c.decodeIfPresent(String.self, forKey: .found_at)
        ability_text = try? c.decodeIfPresent(String.self, forKey: .ability_text)
        faction_name = try? c.decodeIfPresent(String.self, forKey: .faction_name)
        next_level_cost = try? c.decodeIfPresent(Int.self, forKey: .next_level_cost)
    }

    /// Python writes 14 and 15.12 alike; take either.
    private static func number(_ c: KeyedDecodingContainer<CodingKeys>, _ k: CodingKeys) -> Double? {
        if let d = try? c.decodeIfPresent(Double.self, forKey: k) { return d }
        if let i = try? c.decodeIfPresent(Int.self, forKey: k) { return Double(i) }
        return nil
    }

    var powerNow: Int { Int((power_now ?? power).rounded()) }
    var levelNow: Int { level ?? 1 }
    /// Shards the next level costs: level × 10.
    var levelCost: Int { next_level_cost ?? levelNow * 10 }
    var maxed: Bool { levelNow >= RelicLook.maxLevel }
    var canLevel: Bool { !maxed && (shards ?? 0) >= levelCost }
}

/// An entry in the full catalogue: enough to draw a silhouette.
struct RelicStub: Decodable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
    let faction: String
    let rarity: String
    var kind: String?
}

struct RelicsPayload: Decodable, Sendable, Equatable {
    let owned: [Relic]
    let equipped: String?
    let catalogue_size: Int
    let catalogue: [RelicStub]
}

private struct RelicBody: Encodable, Sendable {
    let device_key: String
    let relic_id: String
}

private struct RelicKeyBody: Encodable, Sendable {
    let device_key: String
}

/// Equip, level and starter all answer with the relic, sometimes wrapped.
private struct RelicReply: Decodable, Sendable {
    let relic: Relic?
    init(from decoder: Decoder) throws {
        struct Wrapped: Decodable { let relic: Relic?; let equipped: Relic? }
        if let w = try? Wrapped(from: decoder), let r = w.relic ?? w.equipped {
            relic = r
        } else {
            relic = try? Relic(from: decoder)
        }
    }
}

// MARK: - Look

enum RelicLook {
    static let maxLevel = 10
    static let order = ["legendary", "epic", "rare", "common"]

    static func rarityColor(_ r: String) -> Color {
        switch r {
        case "legendary": return Color(red: 1.00, green: 0.42, blue: 0.20)
        case "epic": return GamePalette.sun
        case "rare": return Color(red: 0.60, green: 0.38, blue: 0.97)
        default: return GamePalette.sky
        }
    }

    static func rarityName(_ r: String) -> String { r.capitalized }

    static func abilityName(_ a: String) -> String {
        switch a {
        case "cleave": return "Cleave"
        case "ward": return "Ward"
        case "focus": return "Focus"
        case "insight": return "Insight"
        case "surge": return "Surge"
        default: return a.capitalized
        }
    }

    static func abilityLine(_ a: String) -> String {
        switch a {
        case "cleave": return "+50% damage on a Flawless answer."
        case "ward": return "Blocks the Guardian's first strike in every siege."
        case "focus": return "+4 seconds on every question."
        case "insight": return "Removes two wrong answers on the first question."
        case "surge": return "Double damage from the third right answer in a row."
        default: return "A power of its own."
        }
    }

    static func abilitySymbol(_ a: String) -> String {
        switch a {
        case "cleave": return "burst.fill"
        case "ward": return "shield.fill"
        case "focus": return "timer"
        case "insight": return "eye.fill"
        case "surge": return "bolt.fill"
        default: return "sparkles"
        }
    }

    static func kindName(_ k: String) -> String { k.capitalized }
}

// MARK: - State

/// The player's Relics. One for the whole app, because the HUD badge, the
/// rail, the Relicdex and the siege all show the same equipped Relic, and a
/// level bought in the sheet has to be the power the siege swings with.
@MainActor @Observable
final class RelicsModel {
    static let shared = RelicsModel()

    private(set) var payload: RelicsPayload?
    private(set) var failed = false
    private(set) var loading = false
    /// The server's refusal, in its own words ("Needs 12 shards").
    var problem: String?
    private var starterAsked = false

    var owned: [Relic] { payload?.owned ?? [] }
    var equipped: Relic? {
        guard let id = payload?.equipped else { return nil }
        return owned.first { $0.id == id }
    }

    /// The equipped Relic from the model, or from `me` before the Relicdex
    /// has been fetched.
    func equipped(_ store: RoamStore) -> Relic? { equipped ?? store.me?.features?.relics?.equipped }
    func relic(_ id: String) -> Relic? { owned.first { $0.id == id } }

    func refresh(_ store: RoamStore) async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let key = try await store.api.deviceKey()
            payload = try await store.api.roamGet(
                "v1/roam/relics", query: [URLQueryItem(name: "device_key", value: key)],
                as: RelicsPayload.self)
            failed = false
        } catch {
            failed = true
        }
        // Everyone starts with one. The server grants it once; asking again
        // is harmless, and covers a player who onboarded before Relics.
        if payload?.owned.isEmpty == true, store.me?.tutorial_done == true, !starterAsked {
            starterAsked = true
            await starter(store)
        }
    }

    func starter(_ store: RoamStore) async {
        do { _ = try await claimStarter(store) } catch { starterAsked = false }
    }

    /// Claim the player's first Relic (a common one of their faction) and
    /// return it. Idempotent on the server: a second call returns the same
    /// Relic, so the onboarding can call it to show the Warden handing it
    /// over without worrying whether it was already granted.
    @discardableResult
    func claimStarter(_ store: RoamStore) async throws -> Relic {
        let key = try await store.api.deviceKey()
        let r = try await store.api.roamPost("v1/roam/relics/starter",
                                             body: RelicKeyBody(device_key: key), as: RelicReply.self)
        starterAsked = true
        loading = false
        await refresh(store)
        if let relic = r.relic { return relic }
        if let relic = owned.first { return relic }
        throw GameClient.ClientError.decoding("Relic")
    }

    func equip(_ relic: Relic, store: RoamStore) async {
        problem = nil
        do {
            let key = try await store.api.deviceKey()
            _ = try await store.api.roamPost("v1/roam/relics/equip",
                                             body: RelicBody(device_key: key, relic_id: relic.id),
                                             as: RelicReply.self)
            GameSound.shared.play(.coin)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            await refresh(store)
        } catch {
            problem = error.localizedDescription
        }
    }

    /// Returns the levelled relic so the detail card can celebrate it.
    func levelUp(_ relic: Relic, store: RoamStore) async -> Relic? {
        problem = nil
        do {
            let key = try await store.api.deviceKey()
            let r = try await store.api.roamPost("v1/roam/relics/level",
                                                 body: RelicBody(device_key: key, relic_id: relic.id),
                                                 as: RelicReply.self)
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await refresh(store)
            return r.relic ?? self.relic(relic.id)
        } catch {
            problem = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return nil
        }
    }

    /// A drop arrived with an answer: fold it in without waiting for a fetch.
    func noteDrop(_ store: RoamStore) { Task { await refresh(store) } }
}

// MARK: - The weapon, drawn

/// Each kind as a chunky silhouette, pointing up in a unit square. Built from
/// overlapping parts: stroke the whole path in ink, fill it on top, and the
/// fill covers every inner edge, leaving one clean cartoon outline.
struct WeaponShape: Shape {
    let kind: String

    func path(in r: CGRect) -> Path {
        let s = min(r.width, r.height)
        let o = CGPoint(x: r.midX - s / 2, y: r.midY - s / 2)
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: o.x + x * s, y: o.y + y * s) }
        func rect(_ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat, _ rad: CGFloat = 0.02) -> Path {
            Path(roundedRect: CGRect(x: o.x + x0 * s, y: o.y + y0 * s,
                                     width: (x1 - x0) * s, height: (y1 - y0) * s),
                 cornerRadius: rad * s)
        }
        func circle(_ x: CGFloat, _ y: CGFloat, _ rad: CGFloat) -> Path {
            Path(ellipseIn: CGRect(x: o.x + (x - rad) * s, y: o.y + (y - rad) * s,
                                   width: rad * 2 * s, height: rad * 2 * s))
        }
        var path = Path()
        switch kind {
        case "axe":
            path.addPath(rect(0.45, 0.10, 0.55, 0.96, 0.04))
            var head = Path()
            head.move(to: p(0.53, 0.16))
            head.addLine(to: p(0.74, 0.07))
            head.addQuadCurve(to: p(0.76, 0.58), control: p(1.02, 0.30))
            head.addLine(to: p(0.53, 0.46))
            head.closeSubpath()
            path.addPath(head)
            var spike = Path()
            spike.move(to: p(0.47, 0.22))
            spike.addLine(to: p(0.27, 0.30))
            spike.addLine(to: p(0.47, 0.40))
            spike.closeSubpath()
            path.addPath(spike)
            path.addPath(circle(0.5, 0.94, 0.06))
        case "bow":
            var limb = Path()
            limb.move(to: p(0.60, 0.06))
            limb.addQuadCurve(to: p(0.60, 0.94), control: p(0.02, 0.50))
            path.addPath(limb.strokedPath(StrokeStyle(lineWidth: 0.11 * s, lineCap: .round)))
            var string = Path()
            string.move(to: p(0.60, 0.06))
            string.addLine(to: p(0.60, 0.94))
            path.addPath(string.strokedPath(StrokeStyle(lineWidth: 0.035 * s, lineCap: .round)))
            // The arrow, nocked.
            path.addPath(rect(0.30, 0.47, 0.86, 0.53, 0.02))
            var tip = Path()
            tip.move(to: p(0.98, 0.50))
            tip.addLine(to: p(0.82, 0.40))
            tip.addLine(to: p(0.82, 0.60))
            tip.closeSubpath()
            path.addPath(tip)
            path.addPath(rect(0.40, 0.33, 0.50, 0.49, 0.02))
            path.addPath(rect(0.40, 0.33, 0.44, 0.50, 0.01))
        case "staff":
            path.addPath(rect(0.45, 0.28, 0.55, 0.97, 0.04))
            // A crystal head in a forked cradle.
            var fork = Path()
            fork.move(to: p(0.30, 0.20))
            fork.addQuadCurve(to: p(0.70, 0.20), control: p(0.50, 0.46))
            path.addPath(fork.strokedPath(StrokeStyle(lineWidth: 0.07 * s, lineCap: .round)))
            var gem = Path()
            gem.move(to: p(0.50, 0.00))
            gem.addLine(to: p(0.63, 0.17))
            gem.addLine(to: p(0.50, 0.34))
            gem.addLine(to: p(0.37, 0.17))
            gem.closeSubpath()
            path.addPath(gem)
            path.addPath(rect(0.40, 0.60, 0.60, 0.66, 0.02))
        case "hammer":
            path.addPath(rect(0.45, 0.32, 0.55, 0.96, 0.04))
            path.addPath(rect(0.16, 0.08, 0.84, 0.38, 0.06))
            path.addPath(rect(0.10, 0.12, 0.20, 0.34, 0.03))
            path.addPath(rect(0.80, 0.12, 0.90, 0.34, 0.03))
            path.addPath(circle(0.5, 0.93, 0.06))
        case "gauntlet":
            // A fist: four knuckles over a palm, a thumb across, a cuff below.
            for i in 0..<4 {
                let x = 0.22 + CGFloat(i) * 0.145
                path.addPath(rect(x, 0.12 + (i == 0 || i == 3 ? 0.05 : 0), x + 0.15, 0.46, 0.07))
            }
            path.addPath(rect(0.20, 0.30, 0.80, 0.70, 0.12))
            path.addPath(rect(0.14, 0.44, 0.52, 0.58, 0.07))
            var cuff = Path()
            cuff.move(to: p(0.26, 0.68))
            cuff.addLine(to: p(0.74, 0.68))
            cuff.addLine(to: p(0.80, 0.95))
            cuff.addLine(to: p(0.20, 0.95))
            cuff.closeSubpath()
            path.addPath(cuff)
        default: // blade
            var blade = Path()
            blade.move(to: p(0.50, 0.02))
            blade.addLine(to: p(0.60, 0.14))
            blade.addLine(to: p(0.60, 0.64))
            blade.addLine(to: p(0.40, 0.64))
            blade.addLine(to: p(0.40, 0.14))
            blade.closeSubpath()
            path.addPath(blade)
            path.addPath(rect(0.22, 0.62, 0.78, 0.71, 0.04))
            path.addPath(rect(0.45, 0.70, 0.55, 0.88, 0.02))
            path.addPath(circle(0.5, 0.92, 0.065))
        }
        return path
    }
}

/// A fuller of light down the weapon, so it reads as metal rather than a
/// sticker. Drawn inside the silhouette.
private struct WeaponShine: Shape {
    let kind: String
    func path(in r: CGRect) -> Path {
        let s = min(r.width, r.height)
        let o = CGPoint(x: r.midX - s / 2, y: r.midY - s / 2)
        func rr(_ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat) -> Path {
            Path(roundedRect: CGRect(x: o.x + x0 * s, y: o.y + y0 * s,
                                     width: (x1 - x0) * s, height: (y1 - y0) * s),
                 cornerRadius: 0.02 * s)
        }
        switch kind {
        case "blade": return rr(0.475, 0.14, 0.51, 0.58)
        case "axe": return rr(0.64, 0.16, 0.70, 0.46)
        case "hammer": return rr(0.24, 0.12, 0.76, 0.17)
        case "staff": return rr(0.46, 0.07, 0.50, 0.24)
        case "gauntlet": return rr(0.30, 0.34, 0.70, 0.39)
        default: return Path()
        }
    }
}

/// The weapon with its ink outline, metal fill and a glint.
struct WeaponGlyph: View {
    let kind: String
    var fill: Color = GamePalette.cream
    var ink: Color = GamePalette.ink
    var lineWidth: CGFloat = 3

    var body: some View {
        ZStack {
            WeaponShape(kind: kind).stroke(ink, style: StrokeStyle(lineWidth: lineWidth * 2, lineJoin: .round))
            WeaponShape(kind: kind).fill(
                LinearGradient(colors: [fill, fill.opacity(0.78)], startPoint: .topLeading,
                               endPoint: .bottomTrailing))
            WeaponShine(kind: kind).fill(.white.opacity(0.85))
        }
        .rotationEffect(.degrees(kind == "bow" ? -30 : 38))
    }
}

/// A crystal badge: a faceted hexagon in the rarity's colour, a hard darker
/// base like every panel in the game, and the weapon across it.
struct RelicArt: View {
    let kind: String
    let rarity: String
    var owned = true
    var size: CGFloat = 80
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let tint = owned ? RelicLook.rarityColor(rarity) : GamePalette.navy
        ZStack {
            CrystalFrame().fill(GamePalette.edge(of: tint)).offset(y: size * 0.05)
            CrystalFrame().fill(LinearGradient(
                colors: owned ? [tint.opacity(0.85), tint, GamePalette.edge(of: tint)]
                              : [GamePalette.navy.opacity(0.9), GamePalette.navyEdge],
                startPoint: .top, endPoint: .bottom))
            // The facets: a light upper-left face and a darker lower-right.
            CrystalFacet().fill(.white.opacity(owned ? 0.22 : 0.06))
            CrystalFrame().stroke(owned ? .white.opacity(0.75) : .white.opacity(0.12),
                                  lineWidth: max(1.5, size * 0.03))
                .padding(size * 0.05)
            if owned {
                WeaponGlyph(kind: kind, lineWidth: max(1.5, size * 0.028))
                    .padding(size * 0.2)
                    .shadow(color: .black.opacity(0.3), radius: 0, y: size * 0.03)
            } else {
                WeaponShape(kind: kind).fill(.white.opacity(0.13))
                    .rotationEffect(.degrees(kind == "bow" ? -30 : 38))
                    .padding(size * 0.2)
                Text("?")
                    .font(GameFont.display(size * 0.3))
                    .foregroundStyle(.white.opacity(0.5))
            }
            CrystalFrame().stroke(GamePalette.ink.opacity(owned ? 0.9 : 0.5), lineWidth: max(2, size * 0.04))
            if owned && rarity == "legendary" {
                TimelineView(.animation(paused: reduceMotion)) { t in
                    let turn = t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4) / 4 * 360
                    CrystalFrame()
                        .stroke(AngularGradient(colors: [GamePalette.sun, .white, GamePalette.berry,
                                                         GamePalette.sun, .white, GamePalette.sun],
                                                center: .center, angle: .degrees(turn)),
                                lineWidth: max(2, size * 0.05))
                        .shadow(color: GamePalette.sun.opacity(0.8), radius: size * 0.08)
                }
            }
        }
        .frame(width: size, height: size * 1.08)
        .accessibilityHidden(true)
    }
}

/// A pointy-topped hexagon with softened corners.
struct CrystalFrame: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        let pts = [CGPoint(x: r.midX, y: r.minY),
                   CGPoint(x: r.minX + w, y: r.minY + h * 0.25),
                   CGPoint(x: r.minX + w, y: r.minY + h * 0.75),
                   CGPoint(x: r.midX, y: r.maxY),
                   CGPoint(x: r.minX, y: r.minY + h * 0.75),
                   CGPoint(x: r.minX, y: r.minY + h * 0.25)]
        var path = Path()
        let k = min(w, h) * 0.1
        for i in 0..<pts.count {
            let a = pts[(i + pts.count - 1) % pts.count], b = pts[i], c = pts[(i + 1) % pts.count]
            let from = Self.toward(b, a, k), to = Self.toward(b, c, k)
            if i == 0 { path.move(to: from) } else { path.addLine(to: from) }
            path.addQuadCurve(to: to, control: b)
        }
        path.closeSubpath()
        return path
    }

    static func toward(_ p: CGPoint, _ q: CGPoint, _ d: CGFloat) -> CGPoint {
        let dx = q.x - p.x, dy = q.y - p.y
        let len = max(0.001, sqrt(dx * dx + dy * dy))
        return CGPoint(x: p.x + dx / len * d, y: p.y + dy / len * d)
    }
}

private struct CrystalFacet: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY + r.height * 0.06))
        p.addLine(to: CGPoint(x: r.minX + r.width * 0.06, y: r.minY + r.height * 0.28))
        p.addLine(to: CGPoint(x: r.minX + r.width * 0.06, y: r.minY + r.height * 0.55))
        p.addLine(to: CGPoint(x: r.midX, y: r.midY))
        p.closeSubpath()
        return p
    }
}

/// Ten pips, filled to the level.
struct RelicPips: View {
    let level: Int
    var tint: Color
    var size: CGFloat = 7

    var body: some View {
        HStack(spacing: size * 0.4) {
            ForEach(0..<RelicLook.maxLevel, id: \.self) { i in
                Circle()
                    .fill(i < level ? tint : GamePalette.ink.opacity(0.15))
                    .overlay(Circle().strokeBorder(GamePalette.ink.opacity(i < level ? 0.5 : 0.15), lineWidth: 1))
                    .frame(width: size, height: size)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Level \(level) of \(RelicLook.maxLevel)")
    }
}

// MARK: - Rail button and HUD badge

/// The rail's Relics button: the equipped weapon itself, in its crystal.
struct RelicsButton: View {
    let store: RoamStore
    var onOpen: () -> Void
    private var model: RelicsModel { .shared }

    var body: some View {
        Button(action: onOpen) {
            WeaponShape(kind: model.equipped?.kind ?? "blade")
                .fill(.white)
                .rotationEffect(.degrees(38))
                .frame(width: 26, height: 26)
        }
        .buttonStyle(.gameIcon(Color(red: 0.60, green: 0.38, blue: 0.97), diameter: 50))
        .overlay(alignment: .topTrailing) {
            if let n = model.payload?.owned.count, n > 0 {
                Text("\(n)")
                    .font(GameFont.display(13).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 5)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Capsule().fill(GamePalette.skyDeep)
                        .overlay(Capsule().strokeBorder(.white, lineWidth: 2)))
                    .offset(x: 6, y: -4)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityLabel("Relics")
        .task {
            await model.refresh(store)
            // Bring the Forge's weapons down early, so the Relicdex opens with
            // them already there.
            await ForgeCatalogueModel.shared.refresh()
        }
        .onChange(of: store.me) { _, _ in Task { await model.refresh(store) } }
    }
}

/// The equipped Relic, for the HUD: its crystal and its power.
struct EquippedRelicPill: View {
    let relic: Relic

    var body: some View {
        HStack(spacing: 6) {
            RelicArt(kind: relic.kind, rarity: relic.rarity, size: 24)
            Text("\(relic.powerNow)")
                .font(GameFont.display(18).monospacedDigit())
                .contentTransition(.numericText())
        }
        .padding(.leading, 8).padding(.trailing, 12).padding(.vertical, 4)
        .background(Capsule().fill(GamePalette.navy.opacity(0.78))
            .overlay(Capsule().strokeBorder(RelicLook.rarityColor(relic.rarity).opacity(0.8), lineWidth: 1.5)))
        .foregroundStyle(.white)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Equipped Relic: \(relic.name), power \(relic.powerNow)")
    }
}

// MARK: - The Relicdex

struct RelicdexSheet: View {
    let store: RoamStore
    @Environment(\.dismiss) private var dismiss
    @State private var picked: String?
    /// A Forge weapon being looked at (Features/ForgeFeature.swift).
    @State private var forgePicked: String?
    private var model: RelicsModel { .shared }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 4)
    private static let factions = ["anime", "marvel", "dc", "movies", "gaming"]

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "Relics") { dismiss() }
                    content
                }
                .padding(18)
            }
            if let id = picked {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture { picked = nil }
                    .accessibilityHidden(true)
                RelicDetail(store: store, id: id, stub: stub(id)) { picked = nil }
                    .padding(20)
                    .transition(.scale(scale: 0.88).combined(with: .opacity))
            }
            if let id = forgePicked {
                Color.black.opacity(0.5)
                    .ignoresSafeArea()
                    .onTapGesture { forgePicked = nil }
                    .accessibilityHidden(true)
                ForgeWeaponDetail(store: store, id: id) { forgePicked = nil }
                    .padding(20)
                    .transition(.scale(scale: 0.88).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.78), value: picked)
        .animation(.spring(response: 0.35, dampingFraction: 0.78), value: forgePicked)
        .gameType()
        .presentationDragIndicator(.visible)
        .task {
            async let forge: Void = ForgeCatalogueModel.shared.refresh()
            await model.refresh(store)
            await forge
            #if DEBUG
            if let id = UserDefaults.standard.string(forKey: "roamRelic") {
                picked = id == "equipped" ? model.payload?.equipped : id
            }
            if let id = UserDefaults.standard.string(forKey: "forgeWeapon") {
                forgePicked = id == "first" ? ForgeCatalogueModel.shared.weapons.first?.id : id
            }
            #endif
        }
    }

    private func stub(_ id: String) -> RelicStub? { model.payload?.catalogue.first { $0.id == id } }

    @ViewBuilder private var content: some View {
        if let p = model.payload {
            HStack(spacing: 8) {
                GameChip(text: "\(p.owned.count) of \(p.catalogue_size) found", color: GamePalette.skyDeep)
                let shards = p.owned.reduce(0) { $0 + ($1.shards ?? 0) }
                if shards > 0 { GameChip(text: "\(shards) shards", color: Color(red: 0.60, green: 0.38, blue: 0.97)) }
                Spacer()
            }
            if let e = model.equipped { hero(e) }
            ForgeArmourySection(store: store) { forgePicked = $0 }
            // Your own faction first: its Relics drop twice as often.
            let mine = store.me?.faction
            ForEach(Self.factions.sorted { ($0 == mine ? 0 : 1) < ($1 == mine ? 0 : 1) }, id: \.self) { f in
                section(f, p)
            }
        } else if model.failed {
            GamePanel {
                VStack(spacing: 12) {
                    Text("Couldn't load your Relics.").font(GameFont.body(17, weight: .bold))
                    Button("Try again") { Task { await model.refresh(store) } }
                        .buttonStyle(.game(GamePalette.sky, size: .small))
                }
                .frame(maxWidth: .infinity)
            }
            ForgeArmourySection(store: store) { forgePicked = $0 }
        } else {
            ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 40)
        }
    }

    /// The Relic in hand, big, because it is the one that goes into a siege.
    private func hero(_ r: Relic) -> some View {
        Button { picked = r.id } label: {
            GamePanel {
                HStack(spacing: 14) {
                    RelicArt(kind: r.kind, rarity: r.rarity, size: 86)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("EQUIPPED")
                            .font(GameFont.display(12)).tracking(1.2)
                            .foregroundStyle(RelicLook.rarityColor(r.rarity) == GamePalette.sun
                                             ? GamePalette.sunDeep : RelicLook.rarityColor(r.rarity))
                        Text(r.name).font(GameFont.display(22)).lineLimit(2).minimumScaleFactor(0.8)
                        HStack(spacing: 10) {
                            Label("\(r.powerNow)", systemImage: "burst.fill")
                                .font(GameFont.display(17))
                            Label(RelicLook.abilityName(r.ability), systemImage: RelicLook.abilitySymbol(r.ability))
                                .font(GameFont.body(15, weight: .bold))
                                .foregroundStyle(GamePalette.skyDeep)
                        }
                        RelicPips(level: r.levelNow, tint: RelicLook.rarityColor(r.rarity))
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .buttonStyle(CardPress())
        .accessibilityLabel("Equipped: \(r.name), power \(r.powerNow). Shows the Relic.")
    }

    private func section(_ faction: String, _ p: RelicsPayload) -> some View {
        let all = p.catalogue.filter { $0.faction == faction }
            .sorted { (RelicLook.order.firstIndex(of: $0.rarity) ?? 9, $0.name) < (RelicLook.order.firstIndex(of: $1.rarity) ?? 9, $1.name) }
        let have = all.filter { model.relic($0.id) != nil }.count
        let colour = RoamStyle.realmColor(faction)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: RoamStyle.realmSymbol(faction))
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(colour).overlay(Circle().strokeBorder(.white, lineWidth: 2)))
                GameHeading(store.factionName(faction), size: 24)
                if faction == store.me?.faction { GameChip(text: "Yours", color: colour) }
                Spacer()
                Text("\(have)/\(all.count)")
                    .font(GameFont.display(18).monospacedDigit())
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.3), radius: 0, y: 1)
            }
            .accessibilityElement(children: .combine)
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(all) { s in
                    Button { picked = s.id } label: { tile(s) }
                        .buttonStyle(CardPress())
                }
            }
        }
    }

    private func tile(_ s: RelicStub) -> some View {
        let r = model.relic(s.id)
        let owned = r != nil
        let equipped = model.payload?.equipped == s.id
        return VStack(spacing: 4) {
            RelicArt(kind: r?.kind ?? s.kind ?? "blade", rarity: s.rarity, owned: owned, size: 54)
                .padding(.top, 4)
            if let r {
                RelicPips(level: r.levelNow, tint: RelicLook.rarityColor(s.rarity), size: 4)
            } else {
                Text(RelicLook.rarityName(s.rarity).uppercased())
                    .font(GameFont.display(9)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(height: 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(owned ? GamePalette.edge(of: GamePalette.cream) : GamePalette.navyEdge.opacity(0.6))
                    .offset(y: 4)
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(owned ? GamePalette.cream : GamePalette.navy.opacity(0.55))
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(equipped ? GamePalette.mint : (owned ? RelicLook.rarityColor(s.rarity).opacity(0.7) : .white.opacity(0.1)),
                              lineWidth: equipped ? 3 : 1.5)
        }
        .overlay(alignment: .topTrailing) {
            if equipped {
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(GamePalette.mint).overlay(Circle().strokeBorder(.white, lineWidth: 1.5)))
                    .offset(x: 4, y: -4)
            } else if let r, r.canLevel {
                Image(systemName: "arrow.up")
                    .font(.system(size: 10, weight: .black))
                    .foregroundStyle(GamePalette.ink)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(GamePalette.sun).overlay(Circle().strokeBorder(.white, lineWidth: 1.5)))
                    .offset(x: 4, y: -4)
            }
        }
        .padding(.bottom, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(owned ? "\(s.name), \(s.rarity), level \(r?.levelNow ?? 1)\(equipped ? ", equipped" : "")"
                                  : "Not found yet, \(s.rarity)")
    }
}

// MARK: - Detail

struct RelicDetail: View {
    let store: RoamStore
    let id: String
    let stub: RelicStub?
    var onClose: () -> Void
    @State private var busy = false
    @State private var bumped = 0
    private var model: RelicsModel { .shared }

    var body: some View {
        if let r = model.relic(id) { owned(r) } else { locked }
    }

    private func owned(_ r: Relic) -> some View {
        let tint = RelicLook.rarityColor(r.rarity)
        return GamePanel {
            VStack(spacing: 12) {
                HStack(spacing: 6) {
                    GameChip(text: RelicLook.rarityName(r.rarity), color: tint)
                    GameChip(text: store.factionName(r.faction), color: RoamStyle.realmColor(r.faction))
                    Spacer()
                    Button(action: onClose) { Image(systemName: "xmark") }
                        .buttonStyle(.gameIcon(GamePalette.ink.opacity(0.55), diameter: 36))
                        .accessibilityLabel("Close")
                }
                ZStack {
                    Sunburst(colour: tint).frame(width: 260, height: 260).opacity(0.5)
                        .mask(Circle().frame(width: 200, height: 200))
                    RelicArt(kind: r.kind, rarity: r.rarity, size: 130)
                        .keyframeAnimator(initialValue: 1.0, trigger: bumped) { v, s in v.scaleEffect(s) } keyframes: { _ in
                            SpringKeyframe(1.25, duration: 0.18)
                            SpringKeyframe(1.0, duration: 0.4)
                        }
                }
                .frame(height: 160)
                VStack(spacing: 2) {
                    Text(r.name).font(GameFont.display(26)).multilineTextAlignment(.center)
                    Text("\(RelicLook.kindName(r.kind)) · Level \(r.levelNow)")
                        .font(GameFont.body(15, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                }
                HStack(spacing: 10) {
                    stat("Power", "\(r.powerNow)", "burst.fill", GamePalette.berry)
                    stat(RelicLook.abilityName(r.ability), nil, RelicLook.abilitySymbol(r.ability), GamePalette.skyDeep)
                }
                Text(r.ability_text ?? RelicLook.abilityLine(r.ability))
                    .font(GameFont.body(15, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if let lore = r.lore, !lore.isEmpty {
                    Text("“\(lore)”")
                        .font(GameFont.body(14, weight: .medium).italic())
                        .foregroundStyle(GamePalette.ink.opacity(0.65))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                RelicPips(level: r.levelNow, tint: tint, size: 10)
                if !r.maxed { shardBar(r) }
                if let problem = model.problem {
                    Text(problem).font(GameFont.body(13, weight: .bold)).foregroundStyle(GamePalette.berry)
                }
                HStack(spacing: 10) {
                    if !r.maxed {
                        Button {
                            busy = true
                            Task {
                                if await model.levelUp(r, store: store) != nil { bumped += 1 }
                                busy = false
                            }
                        } label: { Label("Level up", systemImage: "arrow.up.circle.fill") }
                        .buttonStyle(.game(GamePalette.sun, size: .medium))
                        .disabled(!r.canLevel || busy)
                    }
                    if model.payload?.equipped == r.id {
                        Button {} label: { Label("Equipped", systemImage: "checkmark") }
                            .buttonStyle(.game(GamePalette.mint.opacity(0.6), size: .medium))
                            .allowsHitTesting(false)
                    } else {
                        Button {
                            busy = true
                            Task { await model.equip(r, store: store); busy = false }
                        } label: { Label("Equip", systemImage: "hand.raised.fill") }
                        .buttonStyle(.game(GamePalette.mint, size: .medium))
                        .disabled(busy)
                    }
                }
            }
        }
        .frame(maxWidth: 380)
    }

    private func shardBar(_ r: Relic) -> some View {
        let have = r.shards ?? 0
        let frac = Double(have) / Double(max(1, r.levelCost))
        return VStack(spacing: 4) {
            HStack {
                Label("Shards", systemImage: "diamond.fill")
                    .font(GameFont.body(13, weight: .bold))
                    .foregroundStyle(Color(red: 0.60, green: 0.38, blue: 0.97))
                Spacer()
                Text("\(have) / \(r.levelCost)")
                    .font(GameFont.display(15).monospacedDigit())
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(GamePalette.ink.opacity(0.12))
                    Capsule()
                        .fill(LinearGradient(colors: frac >= 1 ? [GamePalette.sun, GamePalette.sunDeep]
                                                               : [Color(red: 0.72, green: 0.55, blue: 1), Color(red: 0.50, green: 0.30, blue: 0.9)],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(12, g.size.width * min(1, frac)))
                        .overlay(alignment: .top) {
                            Capsule().fill(.white.opacity(0.3)).frame(height: 4).padding(.horizontal, 6).padding(.top, 2)
                        }
                }
            }
            .frame(height: 14)
            .animation(.spring(response: 0.4, dampingFraction: 0.7), value: have)
            Text(frac >= 1 ? "Ready to level up: +8% power" : "Duplicates break into shards.")
                .font(GameFont.body(12, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.55))
        }
    }

    private func stat(_ title: String, _ value: String?, _ symbol: String, _ colour: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 15, weight: .heavy)).foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(Circle().fill(colour))
            if let value {
                Text(value).font(GameFont.display(22).monospacedDigit())
            }
            Text(title).font(GameFont.body(15, weight: .bold))
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Capsule().fill(colour.opacity(0.12)))
    }

    private var locked: some View {
        GamePanel {
            VStack(spacing: 12) {
                HStack {
                    if let stub { GameChip(text: RelicLook.rarityName(stub.rarity), color: RelicLook.rarityColor(stub.rarity)) }
                    Spacer()
                    Button(action: onClose) { Image(systemName: "xmark") }
                        .buttonStyle(.gameIcon(GamePalette.ink.opacity(0.55), diameter: 36))
                        .accessibilityLabel("Close")
                }
                RelicArt(kind: stub?.kind ?? "blade", rarity: stub?.rarity ?? "common", owned: false, size: 120)
                Text(stub?.name ?? "Unknown Relic").font(GameFont.display(24)).multilineTextAlignment(.center)
                Text("Not found yet")
                    .font(GameFont.body(15, weight: .bold))
                    .foregroundStyle(GamePalette.ink.opacity(0.6))
                Text(hint)
                    .font(GameFont.body(14, weight: .medium))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(GamePalette.ink.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: 360)
    }

    private var hint: String {
        switch stub?.rarity {
        case "legendary": return "One in each faction. Legendary points drop Relics half the time, and a siege won at one can hold it."
        case "epic": return "Epic points and won sieges are where these turn up."
        default: return "Answer right at any Quest Point and a Relic may drop. Rarer points drop more often."
        }
    }
}

// MARK: - The drop reveal

/// A Relic dropping, on the reward screen: a burst in its rarity's colour,
/// the crystal flips in, and a line says whether it is new or shards.
struct RelicDropCard: View {
    let relic: Relic
    let isNew: Bool
    let shards: Int?
    @State private var flipped = false
    @State private var glow = false

    var body: some View {
        let tint = RelicLook.rarityColor(relic.rarity)
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(RadialGradient(colors: [tint.opacity(0.9), tint.opacity(0)],
                                             center: .center, startRadius: 4, endRadius: 56))
                    .frame(width: 112, height: 112)
                    .scaleEffect(glow ? 1.1 : 0.6)
                    .opacity(glow ? 1 : 0)
                RelicArt(kind: relic.kind, rarity: relic.rarity, size: 66)
                    .rotation3DEffect(.degrees(flipped ? 0 : 180), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
                    .scaleEffect(flipped ? 1 : 0.4)
                    .opacity(flipped ? 1 : 0)
            }
            .frame(width: 80, height: 80)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    if isNew {
                        Text("NEW!")
                            .font(GameFont.display(13)).tracking(1)
                            .foregroundStyle(GamePalette.ink)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Capsule().fill(GamePalette.sun).shadow(color: GamePalette.sunDeep, radius: 0, y: 2))
                    }
                    Text(RelicLook.rarityName(relic.rarity).uppercased() + " RELIC")
                        .font(GameFont.display(12)).tracking(1)
                        .foregroundStyle(tint == GamePalette.sun ? GamePalette.sunDeep : tint)
                }
                Text(relic.name)
                    .font(GameFont.display(20))
                    .lineLimit(2).minimumScaleFactor(0.8)
                Text(isNew ? "\(RelicLook.abilityName(relic.ability)) · power \(relic.powerNow)"
                           : "+\(shards ?? 0) shards")
                    .font(GameFont.body(14, weight: .bold))
                    .foregroundStyle(isNew ? GamePalette.skyDeep : Color(red: 0.55, green: 0.34, blue: 0.95))
            }
            .opacity(flipped ? 1 : 0)
            .offset(x: flipped ? 0 : 12)
            Spacer(minLength: 0)
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(tint.opacity(0.14))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(tint.opacity(0.6), lineWidth: 2)))
        .task {
            try? await Task.sleep(for: .milliseconds(150))
            withAnimation(.easeOut(duration: 0.35)) { glow = true }
            GameSound.shared.play(isNew ? .fanfare : .coin)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            withAnimation(.spring(response: 0.6, dampingFraction: 0.62)) { flipped = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(isNew ? "New Relic: \(relic.name), \(relic.rarity)" : "\(relic.name) again: \(shards ?? 0) shards")
    }
}

#if DEBUG
/// A reward with a Relic in it, from the server's own example JSON, so the
/// drop reveal can be looked at without waiting on a 6% roll.
enum RelicDropPreview {
    static func verdict(new isNew: Bool) -> RoamVerdict? {
        let standing = #"{"level":4,"rank":"Rookie","xp":470,"level_floor_xp":450,"next_level_xp":800,"into_level":20,"level_span":350,"max_level":false}"#
        let relic = isNew
            ? #"{"kind":"relic","relic":{"id":"gaming-glitch","name":"Glitch Cleaver","faction":"gaming","rarity":"epic","kind":"axe","power":18,"ability":"cleave","lore":"It hits things that aren't there yet.","level":1,"shards":0,"power_now":18,"next_level_cost":10},"new":true,"shards":0,"title":"New Relic: Glitch Cleaver!","icon":"sparkles"}"#
            : #"{"kind":"relic","relic":{"id":"gaming-frame-perfect","name":"Frame-Perfect Gauntlet","faction":"gaming","rarity":"rare","kind":"gauntlet","power":14,"ability":"surge","level":2,"shards":8,"power_now":15,"next_level_cost":20},"new":false,"shards":8,"title":"Frame-Perfect Gauntlet: +8 shards","icon":"sparkles"}"#
        let json = """
        {"attempt_id":"preview","point_id":"p","point_name":"Big Ben","kind":"trivia","tier":"epic","late":false,
         "correct":1,"total":1,"reveal":{"correct":[0]},
         "reward":{"xp":60,"coins":5,"faction_points":10,"lines":[{"label":"Epic point","xp":45,"coins":5,"faction_points":10},{"label":"Flawless","xp":15,"coins":0,"faction_points":0}]},
         "before":\(standing),"after":\(standing),"leveled_up":false,"rank_up":false,"answer_run":2,"streak":1,
         "dailies_completed":[],"cooling_until":"2026-09-26T23:00:00+00:00","grade":"Flawless",
         "extras":[\(relic)]}
        """
        return try? JSONDecoder().decode(RoamVerdict.self, from: Data(json.utf8))
    }
}
#endif
