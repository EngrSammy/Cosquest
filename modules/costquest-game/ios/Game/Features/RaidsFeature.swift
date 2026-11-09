import SwiftUI
import UIKit

// FEATURE: raids. Co-op Boss Trivia raids at boss points (source "raid").
//
// This file is the whole iOS side of the feature. The views below are
// already placed in the app (RoamHomeView, PointCard, DailiesSheet...), so
// the feature only fills them in here. Keep every name and signature that is
// used elsewhere; add anything else you need in THIS file (more types, views,
// calls via `store.api.roamGet/roamPost`). Stay stateless where you can and
// hold state in an @Observable you create here.
//
// A boss is out for the first half of every hour. The crew standing at it
// joins one lobby, anyone starts, and everyone gets the same five questions
// and 45 seconds. The server marks every swing and keeps the HP; the phone
// polls once a second and draws what it is told. Nothing here decides a hit.

// MARK: - Wire

struct RaidPlayer: Decodable, Sendable, Equatable {
    let handle: String
    let damage: Int
    let you: Bool
}

struct RaidQuestion: Decodable, Sendable, Equatable {
    let id: String
    let q: String
    let choices: [String]
    let clue: String?
}

struct RaidReward: Decodable, Sendable, Equatable {
    let xp: Int
    let coins: Int
    let faction_points: Int
    let items: [String: Int]
}

struct RaidYou: Decodable, Sendable, Equatable {
    let member: Bool
    let damage: Int
    let answered: [Int]
    let answered_count: Int
}

struct RaidReveal: Decodable, Sendable, Equatable {
    let correct: [Int]
}

struct RaidState: Decodable, Sendable, Equatable {
    let lobby_id: String
    let boss_name: String
    let realm: String
    /// lobby | fight | won | lost
    let phase: String
    let hp: Int
    let max_hp: Int
    let players: [RaidPlayer]
    let max_players: Int
    let window_ends_at: String
    let fight_seconds: Int
    let seconds_left: Double
    let damage_per_hit: Int
    let questions: [RaidQuestion]
    let reveal: RaidReveal?
    let reward: RaidReward?
    let you: RaidYou

    var isOver: Bool { phase == "won" || phase == "lost" }
}

struct RaidAnswerResult: Decodable, Sendable {
    let accepted: Bool
    let hit: Bool
    let damage: Int
    let state: RaidState
}

private struct RaidJoinBody: Encodable, Sendable {
    let device_key: String
    let point_id: String
    let lat: Double
    let lng: Double
    let accuracy_m: Double
}

private struct RaidLobbyBody: Encodable, Sendable {
    let device_key: String
    let lobby_id: String
}

private struct RaidAnswerBody: Encodable, Sendable {
    let device_key: String
    let lobby_id: String
    let question: Int
    let choice: Int
}

// MARK: - Look

/// The map colour of a boss point, or nil.
enum RaidLook {
    /// Magenta-purple: no tier, realm or faction uses it, so a boss reads as
    /// a boss from across the map.
    static let color = Color(red: 0.76, green: 0.13, blue: 0.84)

    static func tint(_ point: QuestPoint) -> UIColor? {
        point.source == "raid" ? UIColor(red: 0.76, green: 0.13, blue: 0.84, alpha: 1) : nil
    }

    /// When the boss leaves the map, from the point's extra.
    static func until(_ point: QuestPoint) -> Date? {
        point.extra?["raid_until"].flatMap(RoamDates.parse)
    }

    /// The boss's live health, when the server puts it on the point.
    static func hp(_ point: QuestPoint) -> (left: Int, max: Int)? {
        let e = point.extra ?? [:]
        guard let left = (e["raid_hp"] ?? e["hp_left"]).flatMap(Int.init),
              let max = (e["raid_hp_max"] ?? e["hp_max"]).flatMap(Int.init), max > 0 else { return nil }
        return (left, max)
    }

    static func minutesLeft(until end: Date, from now: Date = Date()) -> String {
        let mins = Int((end.timeIntervalSince(now) / 60).rounded(.up))
        return mins <= 1 ? "1 min left" : "\(mins) min left"
    }
}

// MARK: - Map pieces

/// A banner under the top bar about the next or current Boss Hour.
struct RaidBanner: View {
    let store: RoamStore
    /// "Fight the boss": opens the boss point's card, where reach is judged.
    var onFight: ((QuestPoint) -> Void)? = nil

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { tl in
            if let boss = nearestBoss(at: tl.date) {
                GameHUDPanel(padding: 10) {
                    HStack(spacing: 10) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 18, weight: .heavy))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(RaidLook.color))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("A boss has appeared: \(boss.name)")
                                .font(GameFont.display(16))
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                            if let hp = RaidLook.hp(boss) {
                                GeometryReader { g in
                                    ZStack(alignment: .leading) {
                                        Capsule().fill(.white.opacity(0.2))
                                        Capsule().fill(RaidLook.color)
                                            .frame(width: g.size.width * Double(max(0, hp.left)) / Double(hp.max))
                                    }
                                }
                                .frame(height: 6)
                                .accessibilityLabel("Boss health \(max(0, hp.left)) of \(hp.max)")
                            }
                            Text(RoamStyle.distance(store.distance(to: boss)))
                                .font(GameFont.body(13, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.8))
                        }
                        Spacer(minLength: 0)
                        if let onFight {
                            Button { onFight(boss) } label: {
                                Text("Fight the boss").font(GameFont.display(14))
                            }
                            .buttonStyle(.game(RaidLook.color, size: .small, fullWidth: false))
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private func nearestBoss(at now: Date) -> QuestPoint? {
        store.nearby.first { p in
            p.source == "raid" && (RaidLook.until(p).map { $0 > now } ?? true)
        }
    }
}

/// A line on the point card of a boss point (time, lobby size).
struct RaidLine: View {
    let point: QuestPoint
    let store: RoamStore

    var body: some View {
        if point.source == "raid" {
            TimelineView(.periodic(from: .now, by: 30)) { tl in
                HStack(spacing: 6) {
                    Image(systemName: "crown.fill")
                    Text(text(at: tl.date))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .font(GameFont.body(14, weight: .bold))
                .foregroundStyle(RaidLook.color)
            }
        }
    }

    private func text(at now: Date) -> String {
        var parts = ["BOSS RAID"]
        if let n = point.extra?["raid_players"].flatMap(Int.init) {
            parts.append(n == 1 ? "1 player" : "\(n) players")
        }
        if let end = RaidLook.until(point) {
            parts.append(end > now ? RaidLook.minutesLeft(until: end, from: now) : "leaving now")
        }
        return parts.joined(separator: " · ")
    }
}

// MARK: - State

@MainActor @Observable
final class RaidModel {
    private(set) var state: RaidState?
    /// Why the raid can't go on (too far, boss gone, full...), in the server's words.
    private(set) var failure: String?
    /// A refused tap mid-raid, shown briefly without leaving the screen.
    private(set) var notice: String?
    private(set) var busy = false
    /// The last swing: true hit, false miss, nil nothing to show.
    private(set) var lastHit: Bool?
    private(set) var lastDamage = 0
    /// When the fight ends by the phone's clock, rebased on every state the
    /// server sends, so a wrong phone clock still counts down right.
    private(set) var fightEnd: Date?
    /// Questions answered locally but not yet confirmed, so a double tap
    /// never sends two swings at one question.
    private var sent: Set<Int> = []

    var answered: Set<Int> { Set(state?.you.answered ?? []).union(sent) }

    /// The next question for this player, or nil when all five are in.
    var current: Int? {
        guard let s = state else { return nil }
        return s.questions.indices.first { !answered.contains($0) }
    }

    private func apply(_ s: RaidState) {
        state = s
        fightEnd = s.phase == "fight" ? Date().addingTimeInterval(s.seconds_left) : nil
    }

    func join(_ store: RoamStore, point: QuestPoint) async {
        failure = nil
        guard let here = store.coordinate else {
            failure = "Waiting for your location."
            return
        }
        do {
            let key = try await store.api.deviceKey()
            let s = try await store.api.roamPost(
                "v1/roam/raids/join",
                body: RaidJoinBody(device_key: key, point_id: point.id, lat: here.latitude,
                                   lng: here.longitude, accuracy_m: store.accuracy),
                as: RaidState.self)
            apply(s)
        } catch {
            failure = error.localizedDescription
        }
    }

    func start(_ store: RoamStore) async {
        guard let s = state, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            apply(try await store.api.roamPost("v1/roam/raids/start",
                                               body: RaidLobbyBody(device_key: key, lobby_id: s.lobby_id),
                                               as: RaidState.self))
            GameSound.shared.play(.whoosh)
        } catch {
            notice = error.localizedDescription
        }
    }

    func answer(_ store: RoamStore, question: Int, choice: Int) async {
        guard let s = state, s.phase == "fight", !answered.contains(question) else { return }
        sent.insert(question)
        do {
            let key = try await store.api.deviceKey()
            let r = try await store.api.roamPost(
                "v1/roam/raids/answer",
                body: RaidAnswerBody(device_key: key, lobby_id: s.lobby_id,
                                     question: question, choice: choice),
                as: RaidAnswerResult.self)
            apply(r.state)
            if r.accepted {
                lastHit = r.hit
                lastDamage = r.damage
                GameSound.shared.play(r.hit ? .hit : .tap)
                UINotificationFeedbackGenerator().notificationOccurred(r.hit ? .success : .error)
            }
        } catch {
            // The server never saw it: let the player try that question again.
            sent.remove(question)
            notice = error.localizedDescription
        }
    }

    func refresh(_ store: RoamStore) async {
        guard let s = state else { return }
        do {
            let key = try await store.api.deviceKey()
            let fresh = try await store.api.roamGet(
                "v1/roam/raids/state",
                query: [URLQueryItem(name: "lobby_id", value: s.lobby_id),
                        URLQueryItem(name: "device_key", value: key)],
                as: RaidState.self)
            let finished = !s.isOver && fresh.isOver
            apply(fresh)
            notice = nil
            if finished {
                GameSound.shared.play(fresh.phase == "won" ? .fanfare : .whoosh)
                store.featureChanged()
            }
        } catch {
            // One dropped poll is not a failure: the next one a second later
            // usually lands. Say so only if it keeps happening.
            notice = "Connection is shaky…"
        }
    }

    /// Join, then poll once a second while the lobby or fight is on.
    func run(_ store: RoamStore, point: QuestPoint) async {
        if state == nil { await join(store, point: point) }
        while !Task.isCancelled, let s = state, !s.isOver {
            try? await Task.sleep(for: .seconds(1))
            await refresh(store)
        }
    }
}

// MARK: - The raid screen

/// The raid itself, presented full screen when a boss point is played.
struct RaidView: View {
    let store: RoamStore
    let point: QuestPoint
    let voice: WardenVoice
    var onDone: () -> Void

    @State private var model = RaidModel()
    @State private var runs = 0

    var body: some View {
        ZStack {
            GameBackdrop()
            VStack(spacing: 0) {
                header
                ScrollView {
                    VStack(spacing: 18) { content }
                        .padding(.horizontal, 18)
                        .padding(.bottom, 30)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
        .gameType()
        .task(id: runs) { await model.run(store, point: point) }
        .animation(.smooth(duration: 0.3), value: model.state?.phase)
    }

    private var header: some View {
        HStack {
            GameChip(text: "Boss raid", color: RaidLook.color)
            Spacer()
            Button(action: leave) { Image(systemName: "xmark") }
                .buttonStyle(.gameIcon(GamePalette.ink.opacity(0.55), diameter: 40))
                .accessibilityLabel("Leave the raid")
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    @ViewBuilder private var content: some View {
        if let failure = model.failure {
            failed(failure)
        } else if let s = model.state {
            switch s.phase {
            case "lobby": lobby(s)
            case "fight": fight(s)
            default: result(s)
            }
        } else {
            VStack(spacing: 14) {
                GameTitle(point.name, size: 34)
                ProgressView().tint(.white).scaleEffect(1.4)
                Text("Joining the raid…")
                    .font(GameFont.display(20))
                    .foregroundStyle(.white)
            }
            .padding(.top, 80)
        }
        if let notice = model.notice {
            Text(notice)
                .font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Capsule().fill(GamePalette.navy.opacity(0.75)))
        }
    }

    // MARK: Phases

    private func failed(_ why: String) -> some View {
        VStack(spacing: 16) {
            GameTitle(point.name, size: 32)
            GamePanel {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Can't join this raid", systemImage: "exclamationmark.triangle.fill")
                        .font(GameFont.display(20))
                        .foregroundStyle(GamePalette.berry)
                    Text(why)
                        .font(GameFont.body(17))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button { runs += 1 } label: { Label("Try again", systemImage: "arrow.clockwise") }
                .buttonStyle(.game(RaidLook.color))
            Button("Back to the map", action: leave)
                .buttonStyle(.game(GamePalette.sky))
        }
        .padding(.top, 30)
    }

    private func lobby(_ s: RaidState) -> some View {
        VStack(spacing: 16) {
            bossTitle(s)
            TimelineView(.periodic(from: .now, by: 15)) { tl in
                if let end = RoamDates.parse(s.window_ends_at) {
                    Text(end > tl.date ? "The boss leaves in \(RaidLook.minutesLeft(until: end, from: tl.date).replacingOccurrences(of: " left", with: ""))"
                                        : "The boss is leaving: start now!")
                        .font(GameFont.body(16, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            GamePanel {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Crew").font(GameFont.display(22))
                        Spacer()
                        Text("\(s.players.count)/\(s.max_players)")
                            .font(GameFont.display(20))
                            .foregroundStyle(RaidLook.color)
                    }
                    ForEach(Array(s.players.enumerated()), id: \.offset) { _, p in
                        HStack(spacing: 10) {
                            Image(systemName: p.you ? "person.fill" : "person")
                                .foregroundStyle(p.you ? RaidLook.color : GamePalette.ink.opacity(0.6))
                            Text(p.you ? "\(p.handle) (you)" : p.handle)
                                .font(GameFont.body(17, weight: p.you ? .bold : .medium))
                            Spacer()
                        }
                    }
                    Text("Bosses need a crew, or try it solo. Everyone standing here can join before you start.")
                        .font(GameFont.body(14))
                        .foregroundStyle(GamePalette.ink.opacity(0.7))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Text("5 questions · 45 seconds · each right answer hits for \(s.damage_per_hit)")
                .font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
            Button {
                Task { await model.start(store) }
            } label: {
                Label(model.busy ? "Starting…" : "START", systemImage: "bolt.fill")
            }
            .buttonStyle(.game(RaidLook.color))
            .disabled(model.busy)
        }
    }

    private func fight(_ s: RaidState) -> some View {
        VStack(spacing: 16) {
            bossTitle(s)
            RaidHPBar(hp: s.hp, maxHP: s.max_hp)
            HStack {
                TimelineView(.periodic(from: .now, by: 0.25)) { tl in
                    let left = max(0, Int((model.fightEnd ?? tl.date).timeIntervalSince(tl.date).rounded(.up)))
                    Label("\(left) s", systemImage: "timer")
                        .font(GameFont.display(24))
                        .foregroundStyle(left <= 10 ? GamePalette.sun : .white)
                        .monospacedDigit()
                        .accessibilityLabel("\(left) seconds left")
                }
                Spacer()
                Label("Your damage \(s.you.damage)", systemImage: "burst.fill")
                    .font(GameFont.display(20))
                    .foregroundStyle(.white)
            }
            if let hit = model.lastHit {
                Text(hit ? "HIT! −\(model.lastDamage)" : "Miss!")
                    .font(GameFont.display(26))
                    .foregroundStyle(hit ? GamePalette.sun : .white.opacity(0.85))
                    .id("\(model.answered.count)")
                    .transition(.scale.combined(with: .opacity))
            }
            if let i = model.current, i < s.questions.count {
                question(s.questions[i], index: i, of: s.questions.count)
            } else {
                GamePanel {
                    VStack(spacing: 8) {
                        Text("All your swings are in!")
                            .font(GameFont.display(22))
                        Text("Waiting for the crew and the clock…")
                            .font(GameFont.body(16))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            crewDamage(s)
        }
    }

    private static let choiceColors: [Color] = [GamePalette.sky, GamePalette.berry,
                                                GamePalette.sunDeep, GamePalette.mint]

    private func question(_ q: RaidQuestion, index: Int, of total: Int) -> some View {
        VStack(spacing: 12) {
            GamePanel {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Question \(index + 1) of \(total)")
                        .font(GameFont.display(15))
                        .foregroundStyle(RaidLook.color)
                    if let clue = q.clue {
                        Text(clue).font(.system(size: 44))
                            .frame(maxWidth: .infinity)
                    }
                    Text(q.q)
                        .font(GameFont.display(22))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            ForEach(Array(q.choices.enumerated()), id: \.offset) { c, text in
                Button {
                    Task { await model.answer(store, question: index, choice: c) }
                } label: {
                    Text(text)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
                .buttonStyle(.game(Self.choiceColors[c % Self.choiceColors.count], size: .medium))
            }
        }
        .id(q.id)
        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                removal: .opacity))
    }

    private func crewDamage(_ s: RaidState) -> some View {
        GamePanel(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Crew damage").font(GameFont.display(18))
                ForEach(Array(s.players.sorted { $0.damage > $1.damage }.enumerated()),
                        id: \.offset) { _, p in
                    HStack {
                        Text(p.you ? "\(p.handle) (you)" : p.handle)
                            .font(GameFont.body(15, weight: p.you ? .bold : .medium))
                        Spacer()
                        Text("\(p.damage)")
                            .font(GameFont.display(17))
                            .foregroundStyle(RaidLook.color)
                    }
                }
            }
        }
    }

    private func result(_ s: RaidState) -> some View {
        let won = s.phase == "won"
        return VStack(spacing: 16) {
            GameTitle(won ? "VICTORY!" : "DEFEATED", size: 50,
                      fill: won ? GamePalette.sun : .white,
                      outline: won ? GamePalette.sunDeep : GamePalette.ink)
                .padding(.top, 20)
            Text(won ? "\(s.boss_name) is down!" : "\(s.boss_name) got away.")
                .font(GameFont.display(22))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
            GamePanel {
                VStack(alignment: .leading, spacing: 10) {
                    if let r = s.reward {
                        Text("Your reward").font(GameFont.display(22))
                        rewardRow("star.fill", "\(r.xp) XP", GamePalette.skyDeep)
                        if r.faction_points > 0 {
                            rewardRow("flag.fill", "\(r.faction_points) faction points", GamePalette.berry)
                        }
                        ForEach(r.items.sorted { $0.key < $1.key }, id: \.key) { item, n in
                            rewardRow("shippingbox.fill",
                                      "\(n) × \(store.itemNames[item] ?? item.capitalized)",
                                      GamePalette.mint)
                        }
                    } else {
                        Text("No reward this time")
                            .font(GameFont.display(20))
                        Text("Only players who land a swing are paid. Next boss at the top of the hour.")
                            .font(GameFont.body(15))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text("You dealt \(s.you.damage) damage · crew of \(s.players.count)")
                        .font(GameFont.body(15, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.7))
                }
            }
            if let reveal = s.reveal, !s.questions.isEmpty {
                GamePanel(padding: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("The answers").font(GameFont.display(18))
                        ForEach(Array(s.questions.enumerated()), id: \.offset) { i, q in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(q.q)
                                    .font(GameFont.body(14, weight: .medium))
                                    .foregroundStyle(GamePalette.ink.opacity(0.75))
                                    .fixedSize(horizontal: false, vertical: true)
                                if i < reveal.correct.count, reveal.correct[i] < q.choices.count {
                                    Text(q.choices[reveal.correct[i]])
                                        .font(GameFont.body(16, weight: .bold))
                                        .foregroundStyle(GamePalette.grass)
                                }
                            }
                        }
                    }
                }
            }
            Button("Back to the map", action: leave)
                .buttonStyle(.game(GamePalette.sky))
        }
    }

    // MARK: Pieces

    private func bossTitle(_ s: RaidState) -> some View {
        VStack(spacing: 4) {
            Image(systemName: "crown.fill")
                .font(.system(size: 34, weight: .heavy))
                .foregroundStyle(GamePalette.sun)
                .accessibilityHidden(true)
            GameTitle(s.boss_name, size: 36, outline: GamePalette.edge(of: RaidLook.color))
            Text("\(store.factionName(s.realm)) questions")
                .font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
        }
    }

    private func rewardRow(_ icon: String, _ text: String, _ color: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 24)
            Text(text).font(GameFont.display(19))
        }
    }

    private func leave() {
        store.featureChanged()
        onDone()
    }
}

/// The boss's health: a big bar that drains as the crew lands hits.
struct RaidHPBar: View {
    let hp: Int
    let maxHP: Int

    private var share: Double { Double(max(0, hp)) / Double(max(1, maxHP)) }

    var body: some View {
        VStack(spacing: 6) {
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(GamePalette.navy.opacity(0.6))
                    Capsule()
                        .fill(LinearGradient(colors: [GamePalette.berry, RaidLook.color],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(share > 0 ? 18 : 0, g.size.width * share))
                        .overlay(alignment: .top) {
                            Capsule().fill(.white.opacity(0.3)).frame(height: 6)
                                .padding(.horizontal, 8).padding(.top, 3)
                        }
                }
                .overlay(Capsule().strokeBorder(.white.opacity(0.7), lineWidth: 3))
            }
            .frame(height: 30)
            .animation(.spring(response: 0.45, dampingFraction: 0.7), value: hp)
            Text("HP \(max(0, hp)) / \(maxHP)")
                .font(GameFont.display(18))
                .foregroundStyle(.white)
                .monospacedDigit()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Boss health \(max(0, hp)) of \(maxHP)")
    }
}
