import CoreGraphics
import CoreText
import Foundation

/// The venue marker's artwork, and nothing else.
///
/// CoreGraphics and CoreText only, no ARKit and no UIKit, so this one file is
/// compiled by the app (for the reference image ARKit looks for) AND by
/// `scripts/make-marker.swift` (for the sheet an organiser prints). One drawing
/// function means the printed marker and the one the app expects can never
/// drift apart.
///
/// What ARKit wants from a detection image, and how this answers it:
/// - **Many distinct features.** A bold wordmark plus a seeded field of varied
///   shapes: corners, curves and edges at many scales.
/// - **High contrast.** Pure black on pure white.
/// - **No symmetry and no repetition.** The shapes are random (but seeded, so
///   every build draws the same marker), and a solid block sits in one corner.
///   A symmetric marker is detected with an ambiguous rotation, which is
///   exactly the one thing we read from it.
/// - **A known physical size.** `physicalWidth`, measured across the black
///   border's outer edge. The whole square is the image.
enum VenueMarkerArt {

    /// Width of the printed black square, in metres. ARKit needs this to get
    /// distance right: a marker printed at 18 cm would put the arena 10% too
    /// far away.
    static let physicalWidth: CGFloat = 0.20

    /// Name of the ARReferenceImage, and of the ARImageAnchor ARKit reports.
    static let imageName = "costquest.venue"

    /// Seed for the shape field. Changing it changes the marker, which breaks
    /// every sheet already printed. Do not.
    static let seed: UInt64 = 0xC057_0E57_2026

    /// The marker as a bitmap `pixels` wide and tall, or nil if the context
    /// could not be made.
    static func makeImage(pixels: Int) -> CGImage? {
        guard pixels > 0,
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: pixels, height: pixels,
                                  bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
        else { return nil }
        ctx.interpolationQuality = .high
        ctx.setShouldAntialias(true)
        draw(in: ctx, square: CGRect(x: 0, y: 0, width: pixels, height: pixels))
        return ctx.makeImage()
    }

    /// Draw the marker filling `square` in a y-up context (a bitmap or a PDF
    /// page). `square` is the black square's outer edge.
    static func draw(in ctx: CGContext, square: CGRect) {
        let s = square.width
        // Layout in unit coordinates, measured from the TOP-left, which is how
        // the design reads; `r` converts to the y-up context.
        func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
            CGRect(x: square.minX + x * s, y: square.minY + (1 - y - h) * s,
                   width: w * s, height: h * s)
        }
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: square.minX + x * s, y: square.minY + (1 - y) * s)
        }
        let black = CGColor(gray: 0, alpha: 1)
        let white = CGColor(gray: 1, alpha: 1)

        ctx.saveGState()
        defer { ctx.restoreGState() }

        // Thick black border, white field inside it.
        ctx.setFillColor(black)
        ctx.fill(square)
        let border: CGFloat = 0.07
        ctx.setFillColor(white)
        ctx.fill(r(border, border, 1 - 2 * border, 1 - 2 * border))
        ctx.setFillColor(black)

        // Orientation cue: an arrow at the top edge, pointing out of it.
        let arrow = CGMutablePath()
        arrow.move(to: p(0.50, 0.105))
        arrow.addLine(to: p(0.415, 0.215))
        arrow.addLine(to: p(0.475, 0.215))
        arrow.addLine(to: p(0.475, 0.30))
        arrow.addLine(to: p(0.525, 0.30))
        arrow.addLine(to: p(0.525, 0.215))
        arrow.addLine(to: p(0.585, 0.215))
        arrow.closeSubpath()
        ctx.addPath(arrow)
        ctx.fillPath()

        text("NORTH", in: ctx, box: r(0.10, 0.13, 0.29, 0.10), align: .right)
        text("THIS EDGE", in: ctx, box: r(0.61, 0.135, 0.28, 0.045), align: .left)
        text("FACES THE ARENA", in: ctx, box: r(0.61, 0.19, 0.28, 0.045), align: .left)

        // The wordmark, on a black band for a strong horizontal edge pair.
        ctx.fill(r(0.10, 0.33, 0.80, 0.13))
        ctx.setFillColor(white)
        text("COSTQUEST", in: ctx, box: r(0.13, 0.345, 0.74, 0.10), align: .center,
             color: white)
        ctx.setFillColor(black)

        // A seeded field of varied shapes. A jittered grid rather than pure
        // scatter, so the features cover the whole lower half evenly.
        var rng = SplitMix64(seed: seed)
        let cols = 6, rows = 4
        let x0: CGFloat = 0.10, y0: CGFloat = 0.50, w: CGFloat = 0.80, h: CGFloat = 0.40
        let cw = w / CGFloat(cols), ch = h / CGFloat(rows)
        for row in 0..<rows {
            for col in 0..<cols {
                let cx = x0 + (CGFloat(col) + 0.5) * cw + (rng.unit() - 0.5) * cw * 0.25
                let cy = y0 + (CGFloat(row) + 0.5) * ch + (rng.unit() - 0.5) * ch * 0.25
                let size = min(cw, ch) * (0.45 + 0.4 * rng.unit())
                let angle = rng.unit() * .pi
                // The bottom-left cell is always a solid block: an unambiguous
                // corner cue on top of the randomness.
                let kind = (row == rows - 1 && col == 0) ? 99 : Int(rng.unit() * 7)
                shape(kind, in: ctx, centre: p(cx, cy), size: size * s, angle: angle,
                      white: white, black: black)
            }
        }
        // A lone dot top-left inside the border, breaking the top row's
        // left/right balance.
        ctx.fillEllipse(in: r(0.11, 0.24, 0.05, 0.05))
    }

    private static func shape(_ kind: Int, in ctx: CGContext, centre: CGPoint,
                              size: CGFloat, angle: CGFloat, white: CGColor, black: CGColor) {
        ctx.saveGState()
        defer { ctx.restoreGState() }
        ctx.translateBy(x: centre.x, y: centre.y)
        ctx.rotate(by: angle)
        let half = size / 2
        let box = CGRect(x: -half, y: -half, width: size, height: size)
        ctx.setFillColor(black)
        switch kind {
        case 0: // disc
            ctx.fillEllipse(in: box)
        case 1: // rotated square
            ctx.fill(box.insetBy(dx: size * 0.08, dy: size * 0.08))
        case 2: // triangle
            let t = CGMutablePath()
            t.move(to: CGPoint(x: 0, y: half))
            t.addLine(to: CGPoint(x: -half, y: -half))
            t.addLine(to: CGPoint(x: half * 0.7, y: -half * 0.6))
            t.closeSubpath()
            ctx.addPath(t); ctx.fillPath()
        case 3: // ring
            ctx.fillEllipse(in: box)
            ctx.setFillColor(white)
            ctx.fillEllipse(in: box.insetBy(dx: size * 0.28, dy: size * 0.28))
        case 4: // L
            ctx.fill(CGRect(x: -half, y: -half, width: size * 0.34, height: size))
            ctx.fill(CGRect(x: -half, y: -half, width: size, height: size * 0.34))
        case 5: // bar
            ctx.fill(CGRect(x: -half, y: -size * 0.14, width: size, height: size * 0.28))
        case 99: // solid corner block, unrotated
            ctx.rotate(by: -angle)
            ctx.fill(box)
        default: // square with a hole
            ctx.fill(box.insetBy(dx: size * 0.05, dy: size * 0.05))
            ctx.setFillColor(white)
            ctx.fill(CGRect(x: -size * 0.05, y: -size * 0.3, width: size * 0.32, height: size * 0.32))
        }
    }

    enum Align { case left, center, right }

    /// Bold text fitted to `box`: as large as fits the box height, shrunk if
    /// it would overflow the width.
    static func text(_ string: String, in ctx: CGContext, box: CGRect, align: Align,
                     color: CGColor = CGColor(gray: 0, alpha: 1)) {
        func line(size: CGFloat) -> (CTLine, CGFloat, CGFloat, CGFloat) {
            let font = CTFontCreateWithName("Helvetica-Bold" as CFString, size, nil)
            let attrs: [CFString: Any] = [kCTFontAttributeName: font,
                                          kCTForegroundColorAttributeName: color]
            let attributed = CFAttributedStringCreate(nil, string as CFString,
                                                      attrs as CFDictionary)!
            let l = CTLineCreateWithAttributedString(attributed)
            var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
            let width = CGFloat(CTLineGetTypographicBounds(l, &ascent, &descent, &leading))
            return (l, width, ascent, descent)
        }
        // Cap height is about 0.72 of the point size for Helvetica Bold.
        var size = box.height / 0.72
        var (l, width, _, _) = line(size: size)
        if width > box.width {
            size *= box.width / width
            (l, width, _, _) = line(size: size)
        }
        let capHeight = size * 0.72
        let x: CGFloat = switch align {
        case .left: box.minX
        case .center: box.midX - width / 2
        case .right: box.maxX - width
        }
        let y = box.midY - capHeight / 2
        ctx.saveGState()
        ctx.textMatrix = .identity
        ctx.textPosition = CGPoint(x: x, y: y)
        CTLineDraw(l, ctx)
        ctx.restoreGState()
    }
}

/// A tiny deterministic generator, so the marker is identical on every build
/// and every platform. `SystemRandomNumberGenerator` cannot be seeded.
struct SplitMix64 {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
    /// Uniform in [0, 1).
    mutating func unit() -> CGFloat { CGFloat(next() >> 11) / CGFloat(1 << 53) }
}
