import SwiftUI
import UIKit

// FEATURE: holds. Faction holds on Quest Points.
//
// This file is the whole iOS side of the feature. The views below are
// already placed in the app (RoamHomeView, PointCard, DailiesSheet...), so
// the feature only fills them in here. Keep every name and signature that is
// used elsewhere; add anything else you need in THIS file (more types, views,
// calls via `store.api.roamGet/roamPost`). Stay stateless where you can and
// hold state in an @Observable you create here.
//
// The server decides who holds what; the point's `extra` carries the answer
// ("holder", "holder_name", "hold_strength", "held_since", all strings), and
// a point with no "holder" is unclaimed or has faded to nothing.

/// The colour a held point is drawn in on the map, or nil for its tier colour.
enum HoldLook {
    static func tint(_ point: QuestPoint) -> UIColor? {
        guard let holder = holder(point) else { return nil }
        return UIColor(RoamStyle.realmColor(holder))
    }

    /// The holding faction's id, if the point is held right now.
    static func holder(_ point: QuestPoint) -> String? {
        guard let h = point.extra?["holder"], !h.isEmpty else { return nil }
        return h
    }

    /// 0...100. A missing or garbled number reads as full rather than
    /// hiding a flag the server says is there.
    static func strength(_ point: QuestPoint) -> Int {
        guard let s = point.extra?["hold_strength"], let n = Int(s) else { return 100 }
        return min(100, max(0, n))
    }
}

/// A line on the point card: who holds it and until when.
struct HoldLine: View {
    let point: QuestPoint
    let store: RoamStore

    var body: some View {
        if let holder = HoldLook.holder(point) {
            held(by: holder)
        } else if point.source != "starter", let mine = store.me?.faction {
            // The starter is one new player's alone and is never held.
            unclaimed(for: mine)
        }
    }

    private func held(by holder: String) -> some View {
        let color = RoamStyle.realmColor(holder)
        let strength = HoldLook.strength(point)
        let ours = holder == store.me?.faction
        let name = point.extra?["holder_name"] ?? store.factionName(holder)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                flag(color)
                Text(ours ? "Held by your faction: defend it" : "Held by \(name)")
                    .font(GameFont.body(15, weight: .bold))
                    .foregroundStyle(GamePalette.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Text("\(strength)")
                    .font(GameFont.display(17))
                    .foregroundStyle(color)
            }
            HoldBar(fraction: Double(strength) / 100, color: color)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ours
            ? "Held by your faction, strength \(strength) of 100. Play it to defend it."
            : "Held by \(name), strength \(strength) of 100.")
    }

    private func unclaimed(for mine: String) -> some View {
        let color = RoamStyle.realmColor(mine)
        return HStack(spacing: 8) {
            flag(GamePalette.ink.opacity(0.35))
            Text("Unclaimed: take it for \(store.factionName(mine))")
                .font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(color)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .accessibilityElement(children: .combine)
    }

    private func flag(_ color: Color) -> some View {
        Image(systemName: "flag.fill")
            .font(.system(size: 13, weight: .black))
            .foregroundStyle(.white)
            .frame(width: 26, height: 26)
            .background(Circle().fill(color))
            .accessibilityHidden(true)
    }
}

/// A chunky strength bar in the holder's colour.
private struct HoldBar: View {
    let fraction: Double
    let color: Color

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(GamePalette.ink.opacity(0.12))
                Capsule().fill(color)
                    .frame(width: max(8, geo.size.width * min(1, max(0, fraction))))
            }
        }
        .frame(height: 8)
    }
}
