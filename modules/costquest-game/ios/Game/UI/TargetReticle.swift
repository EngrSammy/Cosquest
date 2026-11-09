import Combine
import SwiftUI

/// The lock-on: a reticle sitting on the player the phone is pointed at, with
/// their distance and which way they are.
///
/// M3 acceptance asks for exactly this, and the detail that makes it work is
/// that the reticle is placed by ARKit's own camera projection rather than by
/// an assumed field of view. Camera intrinsics differ between devices and
/// between video formats; a reticle drawn from an assumed sixty degrees sits
/// beside the person instead of on them, and it drifts as you turn, which is
/// worse than not having one.
///
/// It draws two things and the second matters as much as the first. A ring on
/// the target when they are in shot, and an arrow at the edge of the screen
/// when they are not. A player who cannot see anyone has to be told where to
/// turn, or the game becomes wandering.
///
/// The ring says how good the fix is. With an ultra wideband fix it tightens
/// as the phone comes on axis and the label reads "UWB 2.4 m"; on a GPS
/// estimate it stays looser and the label says "GPS ~12 m", so nobody mistakes
/// a five metre guess for a lock.
struct TargetReticle: View {
    let session: GameSession
    let field: FieldModel
    let heading: Double
    /// Optional so the existing call site keeps compiling. When given, a locked
    /// ring takes the target's faction colour.
    var terms: GameTerms? = nil

    /// Redrawn on a timer rather than on every frame. The positions it draws
    /// from update at about one hertz for GPS and a few hertz for the radio,
    /// so a sixty hertz redraw would be spending frames to show the same thing
    /// and taking them from the renderer that actually needs them.
    @State private var tick = Date()
    private let clock = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()

    var body: some View {
        GeometryReader { geometry in
            let all = targets
            let lockedID = all.first?.id
            ZStack {
                ForEach(all) { target in
                    let locked = target.id == lockedID
                    if let point = field.screenPoint(bearing: target.bearing,
                                                     distance: target.distance,
                                                     elevation: target.elevation),
                       geometry.frame(in: .local).insetBy(dx: -40, dy: -40).contains(point) {
                        Group {
                            if locked { lockRing(for: target) } else { idleRing }
                        }
                        .position(point)
                        .animation(.smooth(duration: 0.18), value: point)
                    } else if locked {
                        edgeArrow(for: target, in: geometry.size)
                    }
                }
            }
            .animation(.snappy(duration: 0.2), value: lockedID)
        }
        .allowsHitTesting(false)
        .overCamera()
        .onReceive(clock) { tick = $0 }
    }

    private var targets: [Targeting.Target] {
        _ = tick                    // redraw with the clock
        return Targeting.candidates(session: session, heading: heading)
    }

    private func colour(for target: Targeting.Target) -> Color {
        guard let terms, let side = session.map[target.id]?.faction,
              let hex = terms.factions.first(where: { $0.name == side })?.color
        else { return Theme.refusal }
        return Theme.faction(hex)
    }

    /// Slow spin for the outer arcs, driven by the redraw clock.
    private var spin: Double {
        (tick.timeIntervalSinceReferenceDate * 60).truncatingRemainder(dividingBy: 360)
    }

    // MARK: - On screen

    /// Someone in shot who is not the one under the crosshair: present, not
    /// shouting.
    private var idleRing: some View {
        ZStack {
            Circle()
                .strokeBorder(.white.opacity(0.4), lineWidth: 1)
                .frame(width: 40, height: 40)
            Circle()
                .fill(.white.opacity(0.6))
                .frame(width: 4, height: 4)
        }
        .shadow(color: .black.opacity(0.4), radius: 3)
        .transition(.opacity.combined(with: .scale(scale: 0.8)))
    }

    private func lockRing(for target: Targeting.Target) -> some View {
        let tint = colour(for: target)
        // Tightens as the aim improves. A radio fix starts tighter than a GPS
        // one because it deserves to; both close in as the phone comes on axis.
        let axis = min(target.offAxis, 35) / 35                  // 0 on axis, 1 at the cone edge
        let base: CGFloat = target.isPrecise ? 58 : 76
        let size = base + CGFloat(axis) * 40
        let tight = target.isPrecise && target.offAxis < 6
        let turn = ((target.bearing - heading) + 540).truncatingRemainder(dividingBy: 360) - 180

        return VStack(spacing: 8) {
            ZStack {
                // Soft glow so the ring reads against a bright sky.
                Circle()
                    .fill(tint.opacity(tight ? 0.18 : 0.08))
                    .frame(width: size, height: size)
                    .blur(radius: 6)
                Circle()
                    .strokeBorder(tint, lineWidth: tight ? 3 : 2)
                    .frame(width: size, height: size)
                // Two spinning arcs: alive without covering the person.
                ForEach(0..<2, id: \.self) { i in
                    Circle()
                        .trim(from: 0, to: 0.16)
                        .stroke(tint.opacity(0.9), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .frame(width: size + 16, height: size + 16)
                        .rotationEffect(.degrees(spin + Double(i) * 180))
                }
                // Four ticks rather than a full second ring: it reads as
                // locked at a glance and leaves the person visible.
                ForEach(0..<4, id: \.self) { quarter in
                    Capsule()
                        .fill(tint)
                        .frame(width: 2.5, height: tight ? 14 : 10)
                        .offset(y: -(size / 2) + (tight ? 9 : 4))
                        .rotationEffect(.degrees(Double(quarter) * 90))
                }
                Circle()
                    .fill(tint)
                    .frame(width: 5, height: 5)
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.75), value: size)
            .animation(.linear(duration: 0.1), value: spin)

            HStack(spacing: 6) {
                Image(systemName: "location.north.fill")
                    .font(.system(size: 10, weight: .bold))
                    .rotationEffect(.degrees(turn))
                Text(target.label)
                    .font(.caption.weight(.bold))
                    .lineLimit(1)
                Text(target.isPrecise
                     ? String(format: "UWB %.1f m", target.distance)
                     : String(format: "GPS ~%.0f m", target.distance))
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(target.isPrecise ? 1 : 0.8))
                if target.isPrecise {
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(Theme.affirm)
                        .symbolEffect(.variableColor.iterative, options: .repeating)
                }
                if abs(target.elevation) > 8 {
                    Image(systemName: target.elevation > 0 ? "arrow.up" : "arrow.down")
                        .font(.system(size: 9, weight: .bold))
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule().fill(.black.opacity(0.5))
                    .overlay(Capsule().strokeBorder(tint.opacity(0.8), lineWidth: 1)))

            if !target.isPrecise, let hint = field.mesh?.convergenceHint {
                Text(hint)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Capsule().fill(.black.opacity(0.4)))
            }
        }
        .shadow(color: .black.opacity(0.45), radius: 4)
        .transition(.scale(scale: 1.4).combined(with: .opacity))
    }

    // MARK: - Off screen

    /// An arrow pinned to the edge of the screen, pointing the way to turn.
    private func edgeArrow(for target: Targeting.Target, in size: CGSize) -> some View {
        let delta = ((target.bearing - heading) + 540)
            .truncatingRemainder(dividingBy: 360) - 180
        let onTheRight = delta > 0
        let tint = colour(for: target)
        return VStack(spacing: 4) {
            Image(systemName: onTheRight ? "chevron.right.2" : "chevron.left.2")
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(tint)
            Text(target.label)
                .font(.caption2.weight(.bold))
                .lineLimit(1)
            Text(target.isPrecise ? String(format: "%.1f m", target.distance)
                                  : String(format: "~%.0f m", target.distance))
                .font(.caption2.monospacedDigit())
        }
        .foregroundStyle(.white)
        .frame(maxWidth: 70)
        .padding(.vertical, 8)
        .padding(.horizontal, 6)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(.black.opacity(0.45)))
        .shadow(color: .black.opacity(0.5), radius: 3)
        .position(x: onTheRight ? size.width - 44 : 44, y: size.height / 2)
        .transition(.opacity)
    }
}
