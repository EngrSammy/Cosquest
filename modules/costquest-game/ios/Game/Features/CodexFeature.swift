import SwiftUI
import UIKit

// FEATURE: codex. The collection of cards earned by playing points.
//
// This file is the whole iOS side of the feature. The views below are
// already placed in the app (RoamHomeView, PointCard, DailiesSheet...), so
// the feature only fills them in here. Keep every name and signature that is
// used elsewhere; add anything else you need in THIS file (more types, views,
// calls via `store.api.roamGet/roamPost`). Stay stateless where you can and
// hold state in an @Observable you create here.
//
// The server decides every card, foil and set (on the answer); the phone only
// reads GET v1/roam/codex and draws it.

// MARK: - Wire

struct CodexCard: Decodable, Sendable, Equatable, Identifiable {
    let point_id: String
    let point_name: String
    let realm: String
    let realm_name: String?
    let tier: String
    let region: String
    let region_name: String?
    let foil: Bool
    let first_at: String
    let times: Int

    var id: String { point_id }
}

struct CodexSet: Decodable, Sendable, Equatable, Identifiable {
    let id: String
    let title: String
    let progress: Int
    let target: Int
    let done: Bool

    var fraction: Double { target > 0 ? Double(progress) / Double(target) : 0 }
}

struct CodexCounts: Decodable, Sendable, Equatable {
    let by_realm: [String: Int]
    let total: Int
    let foils: Int
}

struct CodexPayload: Decodable, Sendable, Equatable {
    let cards: [CodexCard]
    let counts: CodexCounts
    let sets: [CodexSet]
}

// MARK: - State

/// The player's Codex, fetched on demand. One per button: the sheet shares
/// it, so the badge and the grid never disagree.
@MainActor @Observable
final class CodexModel {
    private(set) var codex: CodexPayload?
    private(set) var failed = false
    private(set) var loading = false

    func refresh(_ store: RoamStore) async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        do {
            let key = try await store.api.deviceKey()
            codex = try await store.api.roamGet(
                "v1/roam/codex", query: [URLQueryItem(name: "device_key", value: key)],
                as: CodexPayload.self)
            failed = false
        } catch {
            // Keep what we had: a flaky network should not empty a collection.
            failed = true
        }
    }
}

// MARK: - Rail button

/// A button on the home rail that opens the Codex.
struct CodexButton: View {
    let store: RoamStore
    @State private var model = CodexModel()
    @State private var open = false

    var body: some View {
        Button { open = true } label: { Image(systemName: "rectangle.stack.fill") }
            .buttonStyle(.gameIcon(GamePalette.sun, diameter: 50))
            .overlay(alignment: .topTrailing) {
                if let n = model.codex?.counts.total, n > 0 {
                    Text(n > 999 ? "999+" : "\(n)")
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
            .accessibilityLabel("Codex")
            .accessibilityValue(model.codex.map { "\($0.counts.total) cards" } ?? "")
            .task { await model.refresh(store) }
            // A new card arrives with an answer, and every answer refreshes
            // `me`: follow it so the badge counts the card just won.
            .onChange(of: store.me) { _, _ in Task { await model.refresh(store) } }
            .sheet(isPresented: $open) { CodexSheet(store: store, model: model) }
    }
}

// MARK: - Sheet

struct CodexSheet: View {
    let store: RoamStore
    let model: CodexModel
    @Environment(\.dismiss) private var dismiss
    @State private var picked: CodexCard?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "Codex") { dismiss() }
                    content
                }
                .padding(18)
            }
            if let card = picked {
                Color.black.opacity(0.45)
                    .ignoresSafeArea()
                    .onTapGesture { picked = nil }
                    .accessibilityHidden(true)
                CodexDetail(card: card) { picked = nil }
                    .padding(24)
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .animation(.spring(duration: 0.3), value: picked)
        .gameType()
        .presentationDragIndicator(.visible)
        .task { await model.refresh(store) }
    }

    @ViewBuilder private var content: some View {
        if let codex = model.codex {
            summary(codex.counts)
            if !codex.sets.isEmpty { setsPanel(codex.sets) }
            if codex.cards.isEmpty {
                GamePanel {
                    VStack(spacing: 10) {
                        Image(systemName: "rectangle.stack.badge.plus")
                            .font(.system(size: 40, weight: .heavy))
                            .foregroundStyle(GamePalette.sunDeep)
                        Text("Play a Quest Point to earn your first card.")
                            .font(GameFont.body(17, weight: .bold))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                }
            } else {
                ForEach(groups(codex.cards), id: \.realm) { g in realmSection(g.realm, g.cards) }
            }
        } else if model.failed {
            GamePanel {
                VStack(spacing: 12) {
                    Text("Couldn't load your Codex.")
                        .font(GameFont.body(17, weight: .bold))
                    Button("Try again") { Task { await model.refresh(store) } }
                        .buttonStyle(.game(GamePalette.sky, size: .small))
                }
                .frame(maxWidth: .infinity)
            }
        } else {
            ProgressView().tint(.white).frame(maxWidth: .infinity).padding(.top, 40)
        }
    }

    private func summary(_ c: CodexCounts) -> some View {
        HStack(spacing: 10) {
            GameChip(text: "\(c.total) card\(c.total == 1 ? "" : "s")", color: GamePalette.skyDeep)
            if c.foils > 0 {
                GameChip(text: "\(c.foils) foil\(c.foils == 1 ? "" : "s")", color: GamePalette.sunDeep)
            }
            Spacer()
        }
    }

    private func setsPanel(_ sets: [CodexSet]) -> some View {
        // The nearest unfinished sets first: they are what the next walk is for.
        let ordered = sets.sorted {
            if $0.done != $1.done { return !$0.done }
            return $0.fraction > $1.fraction
        }
        return GamePanel {
            VStack(alignment: .leading, spacing: 12) {
                Text("Sets")
                    .font(GameFont.display(22))
                ForEach(ordered) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            if s.done {
                                Image(systemName: "checkmark.seal.fill")
                                    .foregroundStyle(GamePalette.mint)
                            }
                            Text(s.title).font(GameFont.body(15, weight: .bold))
                            Spacer()
                            Text("\(s.progress)/\(s.target)")
                                .font(GameFont.body(14, weight: .bold).monospacedDigit())
                                .foregroundStyle(GamePalette.ink.opacity(0.7))
                        }
                        CodexBar(progress: s.fraction, done: s.done)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(s.title), \(s.progress) of \(s.target)\(s.done ? ", complete" : "")")
                }
            }
        }
    }

    private func realmSection(_ realm: String, _ cards: [CodexCard]) -> some View {
        let colour = RoamStyle.realmColor(realm)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: RoamStyle.realmSymbol(realm))
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(colour))
                GameHeading(cards.first?.realm_name ?? realm.capitalized, size: 24)
                Text("\(cards.count)")
                    .font(GameFont.display(18).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.9))
                Spacer()
            }
            .accessibilityElement(children: .combine)
            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(cards) { card in
                    Button { picked = card } label: { CodexTile(card: card) }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(card.foil ? "Foil card, " : "")\(card.point_name), \(RoamStyle.tierName(card.tier))")
                        .accessibilityHint("Shows the card")
                }
            }
        }
    }

    private func groups(_ cards: [CodexCard]) -> [(realm: String, cards: [CodexCard])] {
        let order = ["anime", "marvel", "dc", "movies", "gaming"]
        let byRealm = Dictionary(grouping: cards, by: \.realm)
        let realms = byRealm.keys.sorted {
            (order.firstIndex(of: $0) ?? order.count, $0) < (order.firstIndex(of: $1) ?? order.count, $1)
        }
        // The server sends newest first; grouping keeps that order inside a realm.
        return realms.map { ($0, byRealm[$0] ?? []) }
    }
}

/// XPBar's shape, gold once a set is done.
private struct CodexBar: View {
    let progress: Double
    let done: Bool

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(GamePalette.ink.opacity(0.12))
                Capsule()
                    .fill(LinearGradient(colors: done ? [GamePalette.sun, GamePalette.sunDeep]
                                                      : [GamePalette.mint, GamePalette.grass],
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(12, g.size.width * min(1, max(0, progress))))
                    .overlay(alignment: .top) {
                        Capsule().fill(.white.opacity(0.3)).frame(height: 4).padding(.horizontal, 6)
                            .padding(.top, 2)
                    }
            }
        }
        .frame(height: 14)
    }
}

// MARK: - Cards

/// One card in the grid: the realm's colour, its symbol, the place, the tier.
private struct CodexTile: View {
    let card: CodexCard

    var body: some View {
        let colour = RoamStyle.realmColor(card.realm)
        VStack(spacing: 6) {
            Image(systemName: RoamStyle.realmSymbol(card.realm))
                .font(.system(size: 26, weight: .heavy))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(colour))
            Text(card.point_name)
                .font(GameFont.body(13, weight: .bold))
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 34)
            HStack(spacing: 4) {
                Text(RoamStyle.tierName(card.tier).uppercased())
                    .font(GameFont.display(10, relativeTo: .caption))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Capsule().fill(RoamStyle.tierColor(card.tier)))
                if card.times > 1 {
                    Text("×\(card.times)")
                        .font(GameFont.body(11, weight: .heavy).monospacedDigit())
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                }
            }
        }
        .foregroundStyle(GamePalette.ink)
        .padding(8)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(GamePalette.edge(of: colour)).offset(y: 4)
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(GamePalette.cream)
            }
        }
        .overlay {
            if card.foil {
                FoilBorder(cornerRadius: 16, lineWidth: 4)
            } else {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(colour.opacity(0.6), lineWidth: 2)
            }
        }
        .padding(.bottom, 4)
    }
}

/// The foil's rainbow edge, turning slowly. Still when Reduce Motion is on:
/// the colours alone say "foil".
private struct FoilBorder: View {
    let cornerRadius: CGFloat
    let lineWidth: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let colours: [Color] = [
        GamePalette.sun, .white, GamePalette.berry, Color(red: 0.60, green: 0.38, blue: 0.97),
        GamePalette.sky, .white, GamePalette.mint, GamePalette.sun,
    ]

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { t in
            let turn = reduceMotion ? 0 : t.date.timeIntervalSinceReferenceDate
                .truncatingRemainder(dividingBy: 3) / 3 * 360
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(AngularGradient(colors: Self.colours, center: .center,
                                              angle: .degrees(turn)),
                              lineWidth: lineWidth)
                .shadow(color: GamePalette.sun.opacity(0.6), radius: 4)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The card, big, over the grid.
private struct CodexDetail: View {
    let card: CodexCard
    var onClose: () -> Void

    var body: some View {
        let colour = RoamStyle.realmColor(card.realm)
        GamePanel {
            VStack(spacing: 14) {
                HStack {
                    if card.foil { GameChip(text: "Foil", color: GamePalette.sunDeep) }
                    GameChip(text: RoamStyle.tierName(card.tier), color: RoamStyle.tierColor(card.tier))
                    Spacer()
                    Button(action: onClose) { Image(systemName: "xmark") }
                        .buttonStyle(.gameIcon(GamePalette.berry, diameter: 38))
                        .accessibilityLabel("Close card")
                }
                Image(systemName: RoamStyle.realmSymbol(card.realm))
                    .font(.system(size: 64, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 130)
                    .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(colour))
                    .overlay {
                        if card.foil { FoilBorder(cornerRadius: 20, lineWidth: 5) }
                    }
                    .accessibilityHidden(true)
                Text(card.point_name)
                    .font(GameFont.display(26))
                    .multilineTextAlignment(.center)
                VStack(spacing: 6) {
                    row("Fandom", card.realm_name ?? card.realm.capitalized)
                    row("City", card.region_name ?? card.region.capitalized)
                    row("Played", card.times == 1 ? "Once" : "\(card.times) times")
                    if let first = firstWon { row("First won", first) }
                }
            }
        }
        .frame(maxWidth: 360)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.65))
            Spacer()
            Text(value).font(GameFont.body(15, weight: .bold))
        }
        .accessibilityElement(children: .combine)
    }

    private var firstWon: String? {
        // Python's isoformat carries microseconds; try with and without.
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: card.first_at) { return d.formatted(date: .abbreviated, time: .omitted) }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: card.first_at) { return d.formatted(date: .abbreviated, time: .omitted) }
        return nil
    }
}
