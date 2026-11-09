import SwiftUI

/// Where the player's hero stands: onboarding, the profile, and later
/// anywhere the game shows who you are.
///
/// The 3D avatar is not built yet. The stage is, so that the day it lands it
/// replaces `HeroFigure` and nothing around it moves: the panels, the floor
/// glow and the house colour are the frame, the figure is the one slot.
struct HeroStage: View {
    var tint: Color
    var height: CGFloat = 340
    /// A caption under the figure while it is a placeholder.
    /// None by default: a "coming soon" label on the first screen a client
    /// opens reads as unfinished.
    var caption: String? = nil
    /// The angled panels belong on the light pages; in the dark they read
    /// as grey boxes, so the Warden's night leaves them out.
    var panels = true

    var body: some View {
        ZStack {
            // The hero screen's long diagonal panels.
            if panels { GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                Path { p in
                    p.move(to: CGPoint(x: 0, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.36, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.5, y: h * 0.42))
                    p.addLine(to: CGPoint(x: w * 0.12, y: h * 0.96))
                    p.addLine(to: CGPoint(x: 0, y: h * 0.96))
                    p.closeSubpath()
                    p.move(to: CGPoint(x: w, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.64, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.5, y: h * 0.42))
                    p.addLine(to: CGPoint(x: w * 0.88, y: h * 0.96))
                    p.addLine(to: CGPoint(x: w, y: h * 0.96))
                    p.closeSubpath()
                }
                .fill(.white.opacity(0.16))
                Path { p in
                    p.move(to: CGPoint(x: 0, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.36, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.5, y: h * 0.42))
                    p.addLine(to: CGPoint(x: w * 0.12, y: h * 0.96))
                    p.move(to: CGPoint(x: w, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.64, y: h * 0.18))
                    p.addLine(to: CGPoint(x: w * 0.5, y: h * 0.42))
                    p.addLine(to: CGPoint(x: w * 0.88, y: h * 0.96))
                }
                .stroke(GamePalette.slate.opacity(0.7), lineWidth: 1.2)
            } }
            // Light from the floor in the house colour.
            Ellipse()
                .fill(RadialGradient(colors: [tint.opacity(0.45), tint.opacity(0)],
                                     center: .center, startRadius: 4, endRadius: 150))
                .frame(width: 300, height: 90)
                .offset(y: height * 0.36)
            HeroFigure(tint: tint)
                .frame(height: height * 0.78)
                .offset(y: height * 0.02)
            if let caption {
                Text(caption)
                    .font(GameFont.display(11)).tracking(1.4)
                    .foregroundStyle(GamePalette.mist)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(.white.opacity(0.55)))
                    .offset(y: height * 0.45)
            }
        }
        .frame(height: height)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your hero")
    }
}

/// The stand-in for the 3D avatar: a cloaked hero in the house colour,
/// breathing on the spot. Deliberately a silhouette, so it reads as "someone
/// goes here" rather than as a character the player did not choose.
struct HeroFigure: View {
    var tint: Color
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let w = min(geo.size.width, geo.size.height * 0.62), h = geo.size.height
            let cx = geo.size.width / 2
            ZStack {
                // Cloak.
                Path { p in
                    p.move(to: CGPoint(x: cx - w * 0.16, y: h * 0.24))
                    p.addQuadCurve(to: CGPoint(x: cx - w * 0.42, y: h * 0.97),
                                   control: CGPoint(x: cx - w * 0.36, y: h * 0.55))
                    p.addQuadCurve(to: CGPoint(x: cx + w * 0.42, y: h * 0.97),
                                   control: CGPoint(x: cx, y: h * 0.92))
                    p.addQuadCurve(to: CGPoint(x: cx + w * 0.16, y: h * 0.24),
                                   control: CGPoint(x: cx + w * 0.36, y: h * 0.55))
                    p.closeSubpath()
                }
                .fill(LinearGradient(colors: [GamePalette.edge(of: tint), tint.opacity(0.85)],
                                     startPoint: .top, endPoint: .bottom))
                // Body.
                RoundedRectangle(cornerRadius: w * 0.12, style: .continuous)
                    .fill(LinearGradient(colors: [GamePalette.navy, GamePalette.navyEdge],
                                         startPoint: .top, endPoint: .bottom))
                    .frame(width: w * 0.36, height: h * 0.5)
                    .position(x: cx, y: h * 0.5)
                // Chest mark in the house colour.
                Image(systemName: "diamond.fill")
                    .font(.system(size: w * 0.09, weight: .heavy))
                    .foregroundStyle(tint)
                    .shadow(color: tint, radius: 6)
                    .position(x: cx, y: h * 0.4)
                // Hood and face.
                Circle()
                    .fill(LinearGradient(colors: [tint, GamePalette.edge(of: tint)],
                                         startPoint: .top, endPoint: .bottom))
                    .frame(width: w * 0.3)
                    .position(x: cx, y: h * 0.16)
                Ellipse()
                    .fill(GamePalette.navyEdge)
                    .frame(width: w * 0.19, height: w * 0.15)
                    .position(x: cx, y: h * 0.175)
                HStack(spacing: w * 0.04) {
                    ForEach(0..<2, id: \.self) { _ in
                        Capsule().fill(.white).frame(width: w * 0.025, height: w * 0.045)
                    }
                }
                .shadow(color: tint, radius: 4)
                .position(x: cx, y: h * 0.17)
            }
            .shadow(color: GamePalette.navy.opacity(0.25), radius: 12, y: 8)
        }
        .scaleEffect(breathe ? 1.012 : 0.992, anchor: .bottom)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 2.4).repeatForever()) { breathe = true }
        }
    }
}

/// One stat, the way the hero screen shows them: icon, name, value, and a
/// sky-blue bar on a pale track.
struct HeroStatBar: View {
    let symbol: String
    let name: String
    let value: String
    var extra: String? = nil
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 22)
                Text(name.uppercased()).font(GameFont.display(15)).tracking(0.6)
                Spacer()
                Text(value).font(GameFont.display(17))
                if let extra {
                    Text(extra).font(GameFont.display(13)).foregroundStyle(GamePalette.sun)
                }
            }
            .foregroundStyle(GamePalette.ink)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(GamePalette.track)
                    Capsule()
                        .fill(LinearGradient(colors: [GamePalette.skyDeep, GamePalette.sky],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(8, geo.size.width * min(1, max(0, progress))))
                }
            }
            .frame(height: 9)
        }
        .accessibilityElement(children: .combine)
    }
}

/// An equipment slot. Filled with a Relic, or locked until the avatar work
/// gives it something to hold.
struct HeroSlot<Content: View>: View {
    let label: String
    var locked = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.white.opacity(locked ? 0.45 : 0.9))
                    .shadow(color: GamePalette.navy.opacity(0.08), radius: 6, y: 3)
                content.opacity(locked ? 0.35 : 1)
                if locked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(GamePalette.mist)
                        .padding(5)
                        .background(Circle().fill(.white))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(4)
                }
            }
            .frame(width: 70, height: 70)
            Text(label.uppercased())
                .font(GameFont.display(10)).tracking(0.8)
                .foregroundStyle(GamePalette.mist)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(locked ? "\(label), coming soon" : label)
    }
}
