import SwiftUI
import UIKit

/// The lobby: a path of games you read in one glance.
///
/// This replaces a 3D world, and the reasons are all evidence rather than
/// taste. Embedding Unity cost this app a window that ate every tap, a
/// callback race that hid the interface behind a spinner, a runtime left
/// paused, a camera that slid back under your thumb, and finally two worlds
/// drawn on top of each other. None of those failures are possible here. The
/// framework was also 488MB to draw a lobby.
///
/// What it is modelled on answers three questions without moving anything:
/// where am I, where is everyone else, what is next. A fixed 2D board answers
/// them directly; a camera in a 3D place answers them only after you have
/// flown it somewhere useful.
///
/// The one thing deliberately NOT copied is the numbered ladder. That game has
/// 1,614 levels in a fixed order. Ours has games that start, end and have
/// people in them, so the nodes are games, and "behind you" means played
/// rather than lower-numbered.
struct LobbyView: View {
    let games: [GameSummary]
    let playedIDs: Set<String>
    /// How many people are at each game, by id.
    let crowd: [String: Int]
    let onPick: (GameSummary) -> Void

    /// Played first, so the path runs history → now → next.
    private var ordered: [GameSummary] {
        games.filter { playedIDs.contains($0.game_id) }
            + games.filter { !playedIDs.contains($0.game_id) }
    }

    private var playedCount: Int { games.filter { playedIDs.contains($0.game_id) }.count }

    /// Vertical spacing between nodes. Generous: a cramped path reads as a
    /// list, and a list is what this is trying not to be.
    private let step: CGFloat = 132

    var body: some View {
        GeometryReader { geo in
            ScrollViewReader { scroller in
                ScrollView(.vertical, showsIndicators: false) {
                    ZStack(alignment: .top) {
                        // At least a screen of land: with one or two games on
                        // (a desk demo) the board ended a third of the way down
                        // and the rest of the screen was blank.
                        Scenery(height: max(CGFloat(max(ordered.count, 1)) * step + 260,
                                            geo.size.height))
                        trail(width: geo.size.width)
                        nodes(width: geo.size.width)
                    }
                    .frame(width: geo.size.width)
                    .padding(.bottom, 140)
                }
                // The sea the scenery is drawn on, so the scroll's overrun and
                // the space under the last node read as water, not a blank.
                .background(Color(red: 0.38, green: 0.66, blue: 0.80))
                .onAppear {
                    // Open where the player is: the boundary between played and
                    // next. Starting at the top would show them their history.
                    scroller.scrollTo(scrollAnchorID, anchor: .center)
                }
            }
        }
    }

    private var scrollAnchorID: String {
        ordered.indices.contains(playedCount)
            ? ordered[playedCount].game_id
            : (ordered.last?.game_id ?? "top")
    }

    // MARK: - The path

    /// Horizontal offset of the path at a given node. A gentle weave, so the
    /// eye follows a route rather than scanning a column.
    private func x(at index: Int, width: CGFloat) -> CGFloat {
        let t = CGFloat(index)
        return width / 2 + sin(t * 0.78) * (width * 0.24)
    }

    private func y(at index: Int) -> CGFloat {
        // Drawn bottom-up: the newest thing is furthest down the scroll, which
        // is the direction the reference scrolls and the direction people
        // expect "onward" to be.
        CGFloat(ordered.count - 1 - index) * step + 120
    }

    private func trail(width: CGFloat) -> some View {
        Path { p in
            guard ordered.count > 1 else { return }
            p.move(to: CGPoint(x: x(at: 0, width: width), y: y(at: 0)))
            for i in 1..<ordered.count {
                let a = CGPoint(x: x(at: i - 1, width: width), y: y(at: i - 1))
                let b = CGPoint(x: x(at: i, width: width), y: y(at: i))
                // Curves, not corners: a hand-drawn road rather than a graph.
                p.addCurve(to: b,
                           control1: CGPoint(x: a.x, y: (a.y + b.y) / 2),
                           control2: CGPoint(x: b.x, y: (a.y + b.y) / 2))
            }
        }
        .stroke(style: StrokeStyle(lineWidth: 14, lineCap: .round, dash: [4, 18]))
        .foregroundStyle(GamePalette.cream.opacity(0.9))
        .shadow(color: GamePalette.ink.opacity(0.35), radius: 0, y: 3)
    }

    private func nodes(width: CGFloat) -> some View {
        ForEach(Array(ordered.enumerated()), id: \.element.game_id) { index, game in
            GameNode(game: game,
                     played: playedIDs.contains(game.game_id),
                     isNext: index == playedCount,
                     here: crowd[game.game_id] ?? 0,
                     onTap: { onPick(game) })
                .position(x: x(at: index, width: width), y: y(at: index))
                .id(game.game_id)
        }
    }
}

/// One game on the path.
private struct GameNode: View {
    let game: GameSummary
    let played: Bool
    /// The one the player is up to. Gets the sunburst, like the reference.
    let isNext: Bool
    let here: Int
    let onTap: () -> Void

    private var tint: Color { Theme.faction(game.factions.first?.color) }

    @State private var appeared = false
    @State private var pulse = false

    private var isLive: Bool { game.status == "live" }
    private var size: CGFloat { isNext ? 76 : 62 }

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 6) {
                if here > 0 { crowdRow }

                ZStack {
                    if isNext || isLive {
                        // The idle pulse: a ring breathing out from the level
                        // you are up to, so the eye lands on it first.
                        Circle()
                            .stroke(tint, lineWidth: 5)
                            .frame(width: size, height: size)
                            .scaleEffect(pulse ? 1.6 : 1)
                            .opacity(pulse ? 0 : 0.8)
                    }
                    // The 3D base the node sits on.
                    Circle()
                        .fill(played ? Color(white: 0.35) : GamePalette.edge(of: tint))
                        .frame(width: size, height: size)
                        .offset(y: 6)
                    Circle()
                        .fill(played ? Color(white: 0.62)
                              : tint)
                        .frame(width: size, height: size)
                        .overlay {
                            Ellipse().fill(.white.opacity(0.28))
                                .frame(width: size * 0.6, height: size * 0.22)
                                .offset(y: -size * 0.26)
                        }
                        .overlay { Circle().strokeBorder(GamePalette.ink, lineWidth: 4) }

                    Group {
                        if played {
                            Image(systemName: "checkmark")
                        } else if isLive {
                            Image(systemName: "play.fill")
                        } else {
                            Image(systemName: "clock.fill")
                        }
                    }
                    .font(.system(size: size * 0.36, weight: .black))
                    .foregroundStyle(.white)
                    .shadow(color: GamePalette.ink.opacity(0.6), radius: 0, y: 2)
                }
                .overlay(alignment: .top) {
                    if isLive && !played {
                        GameChip(text: "Live")
                            .scaleEffect(0.85)
                            .offset(y: -18)
                    }
                }
                .scaleEffect(isNext && pulse ? 1.06 : 1)

                Text(game.title)
                    .font(GameFont.display(15, relativeTo: .caption))
                    .foregroundStyle(.white)
                    .shadow(color: GamePalette.ink, radius: 0, y: 1.5)
                    .lineLimit(1)
                    .padding(.horizontal, 11).padding(.vertical, 4)
                    .background(Capsule().fill(played ? GamePalette.navy.opacity(0.6) : GamePalette.navy)
                        .overlay(Capsule().strokeBorder(.white.opacity(0.4), lineWidth: 1.5)))
                    .frame(maxWidth: 160)
            }
        }
        .buttonStyle(NodePress())
        .opacity(played ? 0.7 : 1)
        .scaleEffect(appeared ? 1 : 0.1)
        .accessibilityLabel(game.title)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.5)
                .delay(Double.random(in: 0...0.25))) { appeared = true }
            if isNext || isLive {
                withAnimation(.easeOut(duration: 1.3).repeatForever(autoreverses: false)) {
                    pulse = true
                }
            }
        }
    }

    /// Who is out there now. The live version of friends' faces on the path,
    /// and the first thing in this app that makes another player's decision
    /// visible: four people already out is a reason to go.
    private var crowdRow: some View {
        HStack(spacing: -7) {
            ForEach(0..<min(here, 4), id: \.self) { _ in
                Circle()
                    .fill(tint)
                    .frame(width: 21, height: 21)
                    .overlay { Circle().strokeBorder(GamePalette.ink, lineWidth: 2.5) }
                    .overlay {
                        Image(systemName: "person.fill")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white)
                    }
            }
            if here > 4 {
                Text("+\(here - 4)")
                    .font(GameFont.display(12))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(GamePalette.navy, in: .capsule)
                    .padding(.leading, 9)
            }
        }
    }
}

private struct NodePress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.55), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, down in
                if down {
                    GameSound.shared.play(.tap)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
    }
}

/// The map the path runs through.
///
/// A drawn world, not a real one. It is not Apple Maps and it is not trying to
/// be anywhere: an accurate map would be a promise this game cannot keep,
/// because the lobby is a hub and the games are at venues somewhere else
/// entirely. What it has to do is give the road a landscape to cross so that
/// scrolling feels like travelling.
///
/// Everything is derived from one seed, so it is the same coastline, the same
/// forests and the same lake every time the app opens. A lobby that redrew its
/// own geography on each launch would be unsettling in a way that is hard to
/// name and easy to feel.
private struct Scenery: View {
    let height: CGFloat

    var body: some View {
        Canvas { ctx, size in
            var seed: UInt64 = 0xC0517_9E57
            func rnd() -> CGFloat {
                seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17
                return CGFloat(seed % 10_000) / 10_000
            }

            let sea    = Color(red: 0.38, green: 0.66, blue: 0.80)
            let shallow = Color(red: 0.52, green: 0.78, blue: 0.86)
            let sand   = Color(red: 0.90, green: 0.84, blue: 0.66)
            let grass  = Color(red: 0.55, green: 0.74, blue: 0.45)
            let grassDark = Color(red: 0.44, green: 0.65, blue: 0.38)
            let forest = Color(red: 0.24, green: 0.48, blue: 0.30)
            let rock   = Color(red: 0.66, green: 0.64, blue: 0.62)

            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(sea))

            // The coast. Both edges wander, so the land is a shape rather than
            // a column, and the road has room to weave inside it.
            func coast(_ y: CGFloat, left: Bool) -> CGFloat {
                let a = sin(y * 0.0071) * 0.055
                let b = sin(y * 0.0166 + (left ? 1.2 : 2.7)) * 0.032
                let base: CGFloat = left ? 0.10 : 0.90
                return size.width * (base + (left ? (a + b) : -(a + b)))
            }

            var land = Path()
            land.move(to: CGPoint(x: coast(0, left: true), y: 0))
            var y: CGFloat = 0
            while y <= size.height { land.addLine(to: CGPoint(x: coast(y, left: true), y: y)); y += 22 }
            y = size.height
            while y >= 0 { land.addLine(to: CGPoint(x: coast(y, left: false), y: y)); y -= 22 }
            land.closeSubpath()

            // Shallows read as a beach shelf and stop the coast being a hard
            // line between two flat colours.
            ctx.stroke(land, with: .color(shallow), lineWidth: 26)
            ctx.fill(land, with: .color(sand))
            ctx.stroke(land, with: .color(sand), lineWidth: 2)

            var inner = Path()
            inner.move(to: CGPoint(x: coast(0, left: true) + 20, y: 0))
            y = 0
            while y <= size.height { inner.addLine(to: CGPoint(x: coast(y, left: true) + 20, y: y)); y += 22 }
            y = size.height
            while y >= 0 { inner.addLine(to: CGPoint(x: coast(y, left: false) - 20, y: y)); y -= 22 }
            inner.closeSubpath()
            ctx.fill(inner, with: .color(grass))

            // Meadow patches: large soft blobs of a second green, so the
            // interior is not one flat fill.
            var my: CGFloat = 60
            while my < size.height {
                let cx = size.width * (0.2 + rnd() * 0.6)
                let w = size.width * (0.26 + rnd() * 0.3)
                let h = 90 + rnd() * 110
                ctx.fill(Path(ellipseIn: CGRect(x: cx - w / 2, y: my, width: w, height: h)),
                         with: .color(grassDark.opacity(0.55)))
                my += 190 + rnd() * 150
            }

            // A lake, once, about a third of the way along. One landmark the
            // eye can use to know roughly where it is on a long scroll.
            let lakeY = size.height * 0.34
            ctx.fill(Path(ellipseIn: CGRect(x: size.width * 0.13, y: lakeY,
                                            width: size.width * 0.3, height: 130)),
                     with: .color(shallow))
            ctx.fill(Path(ellipseIn: CGRect(x: size.width * 0.145, y: lakeY + 9,
                                            width: size.width * 0.27, height: 112)),
                     with: .color(sea))

            // Forests: clusters rather than an even sprinkle, because trees
            // grow in woods.
            var fy: CGFloat = 70
            while fy < size.height {
                let side: CGFloat = rnd() < 0.5 ? 0.16 : 0.78
                let cx = size.width * (side + rnd() * 0.08)
                let n = 3 + Int(rnd() * 5)
                for _ in 0..<n {
                    let px = cx + (rnd() - 0.5) * 78
                    let py = fy + (rnd() - 0.5) * 68
                    let r = 11 + rnd() * 9
                    ctx.fill(Path(CGRect(x: px + r * 0.78, y: py + r * 1.4,
                                         width: r * 0.34, height: r * 0.8)),
                             with: .color(Color(red: 0.36, green: 0.26, blue: 0.18)))
                    ctx.fill(Path(ellipseIn: CGRect(x: px, y: py, width: r * 1.9, height: r * 1.8)),
                             with: .color(forest))
                    ctx.fill(Path(ellipseIn: CGRect(x: px + r * 0.3, y: py + r * 0.16,
                                                    width: r * 1.1, height: r * 1.0)),
                             with: .color(forest.opacity(0.55)))
                }
                fy += 150 + rnd() * 140
            }

            // A few outcrops, for variety at the edges.
            var ry: CGFloat = 200
            while ry < size.height {
                let px = size.width * (rnd() < 0.5 ? 0.2 : 0.74)
                let w = 26 + rnd() * 26
                var r = Path()
                r.move(to: CGPoint(x: px, y: ry + w * 0.6))
                r.addLine(to: CGPoint(x: px + w * 0.45, y: ry))
                r.addLine(to: CGPoint(x: px + w, y: ry + w * 0.6))
                r.closeSubpath()
                ctx.fill(r, with: .color(rock))
                ry += 340 + rnd() * 260
            }
        }
        .frame(height: height)
        .allowsHitTesting(false)
    }
}
