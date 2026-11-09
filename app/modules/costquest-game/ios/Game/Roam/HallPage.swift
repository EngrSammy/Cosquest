import SwiftUI
import UIKit

// The Hero Home's first page: the player's hero standing in their faction's
// hall, rendered by the Hub scene in the embedded Unity runtime, with the
// game's buttons over it. Spec: costquest-research/23_hero_home.md.
//
// The home is two pages, HALL and WORLD, side by side. The hall is where the
// app opens: the hero is the game now, and the map is one swipe away.

// MARK: - Pages

enum HomePage: String, CaseIterable, Sendable {
    case hall, world

    var title: String { self == .hall ? "HALL" : "WORLD" }
}

/// HALL · WORLD, at the top centre. Tapping a label switches page; the badge
/// on WORLD is how many fights are in reach right now.
struct HomePageSwitcher: View {
    @Binding var page: HomePage
    var worldBadge: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(HomePage.allCases, id: \.self) { p in
                Button {
                    guard page != p else { return }
                    GameSound.shared.play(.tap)
                    withAnimation(.smooth(duration: 0.4)) { page = p }
                } label: {
                    HStack(spacing: 5) {
                        Circle().fill(page == p ? GamePalette.sun : .white.opacity(0.45))
                            .frame(width: 7, height: 7)
                        Text(p.title).font(GameFont.display(13)).tracking(1.2)
                        if p == .world, worldBadge > 0 {
                            Text("\(worldBadge)")
                                .font(GameFont.display(11).monospacedDigit())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5).frame(minHeight: 17)
                                .background(Capsule().fill(GamePalette.berry))
                        }
                    }
                    .foregroundStyle(page == p ? .white : .white.opacity(0.65))
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(Capsule().fill(page == p ? .white.opacity(0.16) : .clear))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(p == .world && worldBadge > 0 ? "World, \(worldBadge) fights in reach" : p.title.capitalized)
                .accessibilityAddTraits(page == p ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Capsule().fill(GamePalette.navy.opacity(0.78))
            .overlay(Capsule().strokeBorder(.white.opacity(0.16), lineWidth: 1.5)))
        .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
    }
}

// MARK: - The hall's host

enum HallEvent: Sendable, Equatable {
    case ready
    case heroTapped
    case heroLongPressed
    case trophyTapped(String)
}

/// Whatever draws the hall. The device draws it in Unity; the simulator has
/// no Unity, so it draws a stand-in with the same buttons over it.
@MainActor
protocol HallHost: AnyObject {
    /// False where no 3D hall can render (the simulator build).
    var isLive: Bool { get }
    var onEvent: ((HallEvent) -> Void)? { get set }
    func show(_ look: HallLook)
    func emote(_ id: String)
    func mood(_ mood: String)
    /// Stops rendering while the hall is off screen (the World page, a sheet
    /// covering it), and resumes when it is back.
    func pause(_ paused: Bool)
    func makeView(epoch: Int) -> AnyView
}

@MainActor
enum HallHosts {
    static func make() -> HallHost {
        #if NO_UNITY
        return PlaceholderHallHost()
        #else
        return UnityHallHost()
        #endif
    }
}

/// The simulator's hall: the faction's colours and a silhouette where the
/// hero would stand, so the page's layout can be seen and checked.
@MainActor
final class PlaceholderHallHost: HallHost {
    var isLive: Bool { false }
    var onEvent: ((HallEvent) -> Void)?
    private var look: HallLook?

    func show(_ look: HallLook) { self.look = look }
    func emote(_ id: String) {}
    func mood(_ mood: String) {}
    func pause(_ paused: Bool) {}
    func makeView(epoch: Int) -> AnyView {
        AnyView(HallPlaceholder(faction: look?.faction) { [weak self] in
            self?.onEvent?(.heroLongPressed)
        })
    }
}

private struct HallPlaceholder: View {
    var faction: String?
    var onLongPress: () -> Void

    var body: some View {
        let tint = RoamStyle.realmColor(faction)
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [GamePalette.navyEdge, GamePalette.navy, tint.opacity(0.55)],
                               startPoint: .top, endPoint: .bottom)
                // Where the hero stands: a third in from the left, per the
                // hall's framing, so the right side is free for panels.
                VStack(spacing: 6) {
                    Image(systemName: "figure.fencing")
                        .font(.system(size: min(geo.size.height * 0.42, 190), weight: .regular))
                        .foregroundStyle(.white.opacity(0.85))
                    Ellipse().fill(tint.opacity(0.5)).frame(width: 150, height: 22).blur(radius: 6)
                    Text("Your hall renders on the device")
                        .font(GameFont.body(12, weight: .bold))
                        .foregroundStyle(.white.opacity(0.6))
                }
                .frame(width: geo.size.width * 0.5)
                .offset(x: geo.size.width * 0.08, y: -geo.size.height * 0.14)
                .onLongPressGesture(perform: onLongPress)
            }
        }
        .ignoresSafeArea()
    }
}

// MARK: - What the hall shows

/// The ShowHall message (HubWire on the Unity side): the faction, how the hero
/// looks, and what is on the trophy shelf. Every hero field is optional;
/// Unity fills a missing one from the name and the faction.
struct HallLook: Encodable, Sendable, Equatable {
    struct Hero: Encodable, Sendable, Equatable {
        var name: String?
        var body: String?
        var skin: String?
        var suit: String?
        var hair: String?
        var weapon_class: String?
        var headgear: String?
    }
    struct Trophy: Encodable, Sendable, Equatable {
        let id: String
        /// trial | relic | codex
        let kind: String
        /// common | rare | epic | legendary
        let tier: String
        var label: String?
        var faction: String?
    }
    var faction: String
    var hero: Hero
    var trophies: [Trophy]

    var json: String {
        (try? String(data: JSONEncoder().encode(self), encoding: .utf8)) ?? "{}"
    }

    /// From the player the app already knows. At most seven trophies: the
    /// best Trials rung per faction first, then the Relics by rarity.
    @MainActor
    static func current(_ store: RoamStore) -> HallLook {
        let faction = store.me?.faction ?? "anime"
        let duel = store.me?.features?.duel
        let hero = Hero(name: store.playerName,
                        suit: faction,
                        weapon_class: duel?.fighter?.weapon_class,
                        headgear: faction)
        var trophies: [Trophy] = []
        for (f, t) in (duel?.trials ?? [:]).sorted(by: { $0.key < $1.key }) where t.cleared > 0 {
            trophies.append(Trophy(id: "trial:\(f):\(t.cleared)", kind: "trial",
                                   tier: trialTier(t.cleared, of: t.rungs),
                                   label: "\(store.factionName(f)) Trials \(t.cleared)", faction: f))
        }
        let order = ["legendary": 0, "epic": 1, "rare": 2, "common": 3]
        let relics = RelicsModel.shared.owned.sorted { (order[$0.rarity] ?? 9) < (order[$1.rarity] ?? 9) }
        for r in relics.prefix(max(0, 7 - trophies.count)) {
            trophies.append(Trophy(id: "relic:\(r.id)", kind: "relic", tier: r.rarity,
                                   label: r.name, faction: r.faction))
        }
        return HallLook(faction: faction, hero: hero, trophies: Array(trophies.prefix(7)))
    }

    private static func trialTier(_ cleared: Int, of rungs: Int) -> String {
        let share = Double(cleared) / Double(max(1, rungs))
        switch share {
        case 1...: return "legendary"
        case 0.7...: return "epic"
        case 0.4...: return "rare"
        default: return "common"
        }
    }
}

// MARK: - The hall page's own buttons

/// FIGHT and EVENTS, low on the right, clear of the hero (who stands a third
/// in from the left) and of the rail.
struct HallActions: View {
    var hasTrials: Bool
    var hasRun: Bool
    var onTrials: () -> Void
    var onRun: () -> Void
    var onEvents: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onEvents) {
                Label("EVENTS", systemImage: "ticket.fill")
                    .font(GameFont.display(17))
            }
            .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
            .accessibilityHint("Scheduled faction battles")

            Menu {
                if hasTrials {
                    Button { onTrials() } label: { Label("Guardian Trials", systemImage: "figure.fencing") }
                }
                if hasRun {
                    Button { onRun() } label: { Label("Quest Run", systemImage: "flag.checkered") }
                }
                Button { onEvents() } label: { Label("Events", systemImage: "ticket.fill") }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "figure.fencing").font(.system(size: 22, weight: .heavy))
                    Text("FIGHT").font(GameFont.display(26)).tracking(1)
                }
                .foregroundStyle(GamePalette.ink)
                .padding(.horizontal, 30).frame(height: 62)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous).fill(GamePalette.sun)
                        .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(GamePalette.sunDeep).offset(y: 5))
                )
            }
            .menuOrder(.fixed)
            .accessibilityLabel("Fight")
            .accessibilityHint("Guardian Trials, Quest Run or Events")
        }
    }
}

// MARK: - More

/// One entry in the More sheet: either an action the home runs (after the
/// sheet has closed), or a feature's own button that presents its own sheet.
struct MoreTile: Identifiable {
    let id: String
    let symbol: String
    let color: Color
    let title: String
    var badge: Int? = nil
    var action: (() -> Void)?
    var embed: AnyView? = nil

    init(id: String, symbol: String, color: Color, title: String, badge: Int? = nil,
         action: (() -> Void)?) {
        self.id = id; self.symbol = symbol; self.color = color; self.title = title
        self.badge = badge; self.action = action
    }

    init(id: String, symbol: String, color: Color, title: String, embed: AnyView) {
        self.id = id; self.symbol = symbol; self.color = color; self.title = title
        self.action = nil; self.embed = embed
    }
}

/// Everything that is not on the four-button rail, as a small grid.
struct MoreSheet: View {
    let tiles: [MoreTile]
    private let columns = [GridItem(.adaptive(minimum: 84), spacing: 14)]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("More").font(GameFont.display(26)).foregroundStyle(GamePalette.ink)
            LazyVGrid(columns: columns, alignment: .leading, spacing: 18) {
                ForEach(tiles) { tile in
                    VStack(spacing: 6) {
                        icon(tile)
                        Text(tile.title)
                            .font(GameFont.body(12, weight: .bold))
                            .foregroundStyle(GamePalette.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(GamePalette.cream.ignoresSafeArea())
        .presentationDetents([.height(300), .medium])
        .gameType()
    }

    @ViewBuilder private func icon(_ tile: MoreTile) -> some View {
        if let embed = tile.embed {
            embed
        } else if let action = tile.action {
            Button(action: action) { Image(systemName: tile.symbol) }
                .buttonStyle(.gameIcon(tile.color, diameter: 54))
                .overlay(alignment: .topTrailing) { badge(tile.badge) }
                .accessibilityLabel(tile.title)
        } else {
            // Information only (the bag's count): a button that does nothing
            // would be a lie.
            Image(systemName: tile.symbol)
                .font(.system(size: 22, weight: .heavy))
                .foregroundStyle(.white)
                .frame(width: 54, height: 54)
                .background(Circle().fill(tile.color))
                .overlay(alignment: .topTrailing) { badge(tile.badge) }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(tile.title), \(tile.badge ?? 0)")
        }
    }

    @ViewBuilder private func badge(_ n: Int?) -> some View {
        if let n, n > 0 {
            Text("\(n)")
                .font(GameFont.display(13).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, 5)
                .frame(minWidth: 20, minHeight: 20)
                .background(Capsule().fill(GamePalette.berry)
                    .overlay(Capsule().strokeBorder(.white, lineWidth: 2)))
                .offset(x: 6, y: -4)
        }
    }
}
