import SwiftUI

/// A player's avatar, drawn rather than downloaded.
///
/// The whole avatar is three numbers: a face shape, an emblem, and a colour.
/// That is a deliberate trade against letting players upload a picture. An
/// upload path means storage, a moderation queue, and a way for one player to
/// put an image on every other player's screen at a public event. Three numbers
/// mean none of that, render identically at any size on any device, cost
/// nothing to sync, and still let a field of two hundred people tell each other
/// apart at a glance, which is the actual job.
struct AvatarView: View {
    let avatar: Profile.Avatar
    var size: CGFloat = 64

    /// Emblems rather than faces. A venue game is played by adults in a field,
    /// and a filled emblem reads at thumbnail size where a cartoon head does
    /// not.
    ///
    /// Every name here is a long-standing SF Symbol. That is not pedantry: an
    /// name that does not exist renders as nothing at all, with no warning, and
    /// the first version of this shipped a blank first emblem because "anchor"
    /// is not a symbol however much it sounds like one.
    static let marks = ["flame.fill", "bolt.fill", "shield.fill", "star.fill",
                        "leaf.fill", "moon.fill", "drop.fill", "flag.fill"]

    private var tint: Color { Theme.faction(avatar.tint) }

    var body: some View {
        ZStack {
            // A hard base under the badge, the game's pressed-3D look.
            shape
                .fill(GamePalette.edge(of: tint))
                .offset(y: size * 0.06)
            shape
                .fill(LinearGradient(colors: [tint.opacity(0.85), tint],
                                     startPoint: .top, endPoint: .bottom))
                // Stroked inside a slightly inset frame rather than with
                // `strokeBorder`, which needs an InsettableShape and so cannot
                // be type-erased.
                .overlay(shape.stroke(GamePalette.ink, lineWidth: max(2, size * 0.06))
                    .padding(size * 0.03))
            Image(systemName: Self.marks[abs(avatar.mark) % Self.marks.count])
                .font(.system(size: size * 0.42, weight: .black))
                .foregroundStyle(.white)
                .shadow(color: GamePalette.ink.opacity(0.5), radius: 0, y: size * 0.03)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    /// Four silhouettes, so two players who chose the same emblem and colour
    /// still differ. Shapes rather than another colour ramp because shape is
    /// what survives sunlight and a small screen.
    /// Four silhouettes that are actually different.
    ///
    /// The first attempt used Circle, a rounded rectangle, Capsule and a
    /// heavily rounded rectangle. In a square frame a capsule IS a circle and
    /// so is a rectangle with a corner radius of half its side, so three of the
    /// four choices drew the same picture and the picker looked broken. These
    /// four differ at any size.
    private var shape: AnyShape {
        // Type-erased rather than a `some Shape` view builder: a builder
        // produces _ConditionalContent, which is a View and not a Shape, so it
        // could be neither filled nor stroked.
        switch abs(avatar.face) % 4 {
        case 0: AnyShape(Circle())
        case 1: AnyShape(RoundedRectangle(cornerRadius: size * 0.2, style: .continuous))
        case 2: AnyShape(Diamond())
        default: AnyShape(Hexagon())
        }
    }
}

/// A square stood on its corner.
struct Diamond: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}

/// Flat-topped, so it reads as a badge rather than as a wobbly circle.
struct Hexagon: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let width = rect.width, height = rect.height
        let inset = width * 0.25
        path.move(to: CGPoint(x: rect.minX + inset, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + height / 2))
        path.addLine(to: CGPoint(x: rect.maxX - inset, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX + inset, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + height / 2))
        path.closeSubpath()
        return path
    }
}
