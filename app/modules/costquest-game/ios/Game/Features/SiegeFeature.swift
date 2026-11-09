import SwiftUI
import UIKit

// FEATURE: siege. Taking a rival faction's hold by beating its Guardian.
//
// A point a rival holds can't be taken with one right answer any more: the
// server marks it with `extra.siege` (the Guardian's HP and faction), the
// point card shows Siege instead of Play, and this screen runs the fight.
// Every number is the server's: damage, the Guardian's strikes, the focus
// left, the flip at the end (costquest-backend app/roam_siege.py). The phone
// stages it: the Strike's three pulses while the answer is judged, the Relic
// swinging for a hit, the screen shaking when the Guardian hits back.

// MARK: - Wire

struct SiegeQuestion: Decodable, Sendable, Equatable {
    var id: String?
    let q: String
    let choices: [String]
    var clue: String?
    /// Choices Insight took away.
    var removed: [Int]?
    /// The round's full window, and what is left of it by the server's clock.
    var seconds: Double?
    var remaining_s: Double?
    /// 0-based.
    var round: Int?
}

struct SiegeReward: Decodable, Sendable, Equatable {
    var xp: Int?
    var coins: Int?
    var faction_points: Int?
    var lines: [RoamVerdict.Line]?
    var relic: RoamExtra?
    var extras: [RoamExtra]?

    /// Wherever the server put the drop.
    var drop: RoamExtra? { relic ?? extras?.first { $0.kind == "relic" } }
}

struct SiegeState: Decodable, Sendable, Equatable {
    let siege_id: String
    var point_id: String?
    var point_name: String?
    var faction_attacked: String?
    var faction_attacked_name: String?
    var ability: String?
    var resumed: Bool?
    var cooldown_until: String?
    var relic_id: String?
    var relic: Relic?
    var relic_power: Double?
    var guardian_hp: Int
    var max_hp: Int
    var focus: Int
    /// 0-based: the question being asked now.
    var round: Int
    var rounds: Int?
    var max_rounds: Int?
    /// fight | won | lost
    var phase: String
    var question: SiegeQuestion?
    var seconds: Double?
    var remaining_s: Double?
    var deadline: String?
    var reward: SiegeReward?
    var extras: [RoamExtra]?

    var totalRounds: Int { rounds ?? max_rounds ?? 7 }
}

struct SiegeAnswerResult: Decodable, Sendable, Equatable {
    let correct: Bool
    var grade: String?
    var damage: Double?
    let guardian_hp: Int
    let focus: Int
    var struck: Bool?
    var blocked: Bool?
    let phase: String
    var next: SiegeQuestion?
    var answer_index: Int?
    /// The round just answered, 0-based.
    var round: Int?
    var late: Bool?
    var cooldown_until: String?
    var reward: SiegeReward?
    var extras: [RoamExtra]?
    /// Ability effects that fired on this answer ("cleave", "surge").
    var effects: [String]?
    var remaining_s: Double?
    var seconds: Double?
    var me: RoamMe?
}

private struct SiegeStartBody: Encodable, Sendable {
    let device_key: String
    let point_id: String
    let lat: Double
    let lng: Double
    let accuracy_m: Double
}

private struct SiegeAnswerBody: Encodable, Sendable {
    let device_key: String
    let siege_id: String
    let round: Int
    let choice: Int
    let elapsed_ms: Int
}

// MARK: - Look

@MainActor
enum SiegeLook {
    /// The Guardian's HP when the server says this point can be sieged.
    static func guardianHP(_ p: QuestPoint) -> Int? {
        let e = p.extra ?? [:]
        let raw = e["siege_guardian_hp"] ?? e["siege.guardian_hp"] ?? e["guardian_hp"]
        if let raw, let n = Int(raw) { return n }
        return nil
    }

    /// A rival's Guardian stands here. An unsigned read tags every held
    /// point, so the player's own faction is checked here too.
    static func isSiege(_ p: QuestPoint, _ store: RoamStore) -> Bool {
        guard guardianHP(p) != nil, p.source != "raid", p.source != "starter" else { return false }
        guard let mine = store.me?.faction else { return true }
        return faction(p) != mine
    }

    /// Whose Guardian stands here.
    static func faction(_ p: QuestPoint) -> String? {
        p.extra?["siege_faction"] ?? p.extra?["siege.faction"] ?? HoldLook.holder(p)
    }

    static func factionName(_ p: QuestPoint, _ store: RoamStore) -> String {
        p.extra?["siege_faction_name"] ?? p.extra?["siege.faction_name"] ?? p.extra?["holder_name"] ?? store.factionName(faction(p))
    }

    static func gradeColor(_ g: String?) -> Color {
        switch g {
        case "Flawless": return GamePalette.sun
        case "Brilliant": return GamePalette.mint
        default: return GamePalette.sky
        }
    }
}

extension RoamStore {
    func siegeWonMoment(_ place: String, from faction: String, rounds: Int) -> WardenMoment {
        WardenMoment("siege_won", style: wardenStyle,
                     [("name", playerName), ("place", place), ("taken_from", faction),
                      ("rounds", String(rounds)), ("faction", me?.faction_name)])
    }

    func siegeLostMoment(_ place: String, holder faction: String) -> WardenMoment {
        WardenMoment("siege_lost", style: wardenStyle,
                     [("name", playerName), ("place", place), ("holder", faction)])
    }
}

/// On the point card: the Guardian standing on a rival's hold.
struct SiegeLine: View {
    let point: QuestPoint
    let store: RoamStore

    var body: some View {
        if SiegeLook.isSiege(point, store), let hp = SiegeLook.guardianHP(point) {
            let colour = RoamStyle.realmColor(SiegeLook.faction(point))
            HStack(spacing: 8) {
                Image(systemName: "shield.lefthalf.filled")
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(.white)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(GamePalette.ink))
                Text("A \(SiegeLook.factionName(point, store)) Guardian stands here")
                    .font(GameFont.body(14, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.8))
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 4)
                Label("\(hp)", systemImage: "heart.fill")
                    .font(GameFont.display(15))
                    .foregroundStyle(colour)
            }
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - The siege screen

struct SiegeView: View {
    let store: RoamStore
    let point: QuestPoint
    let voice: WardenVoice
    /// True when the point was taken.
    var onDone: (Bool) -> Void

    private enum Phase: Equatable { case intro, starting, fight, judging, result, failed(String) }

    @State private var phase: Phase = .intro
    @State private var state: SiegeState?
    @State private var question: SiegeQuestion?
    /// 0-based, as the server counts; shown +1.
    @State private var round = 0
    /// Right answers in a row, for naming the Surge when it fires.
    @State private var run = 0
    @State private var hp = 0
    @State private var maxHP = 1
    @State private var focus = 100
    @State private var picked: Int?
    @State private var reveal: Int?
    @State private var asked = Date()
    @State private var localDeadline = Date()
    @State private var seconds: Double = 15
    @State private var won = false
    @State private var reward: SiegeReward?
    @State private var lastResult: SiegeAnswerResult?
    // Staging.
    @State private var swing = 0
    @State private var shake = 0
    @State private var vignette = 0.0
    @State private var popups: [DamagePop] = []
    @State private var blockedFlash = false
    @State private var hitTick = 0
    @State private var strikeTick = 0
    /// The Relic swung in this siege: the server's, else the equipped one.
    @State private var heldRelic: Relic?
    @State private var confirmLeave = false
    @State private var roundsUsed = 0

    private var relics: RelicsModel { .shared }
    private var holder: String? { SiegeLook.faction(point) }
    private var holderColor: Color { RoamStyle.realmColor(state?.faction_attacked ?? holder) }
    private var holderName: String { state?.faction_attacked_name ?? SiegeLook.factionName(point, store) }
    private var myColor: Color { RoamStyle.realmColor(store.me?.faction) }
    private var relic: Relic? { state?.relic ?? heldRelic ?? relics.equipped(store) }

    struct DamagePop: Identifiable, Equatable {
        let id = UUID()
        let text: String
        let color: Color
        let x: CGFloat
    }

    init(store: RoamStore, point: QuestPoint, voice: WardenVoice, onDone: @escaping (Bool) -> Void) {
        self.store = store
        self.point = point
        self.voice = voice
        self.onDone = onDone
        let g = SiegeLook.guardianHP(point) ?? 40
        _hp = State(initialValue: g)
        _maxHP = State(initialValue: g)
    }

    var body: some View {
        ZStack {
            GameBackdrop()
            // Dusk over the arena, tinted with whoever holds it.
            LinearGradient(colors: [GamePalette.navy.opacity(0.75), holderColor.opacity(0.25), GamePalette.navyEdge.opacity(0.6)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            LinearGradient(colors: [.black.opacity(0), .black.opacity(0), .black.opacity(phase == .intro ? 0.3 : 0.6)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            // The Guardian's strike: red at the edges of the screen.
            RadialGradient(colors: [.clear, GamePalette.berry.opacity(0.85)], center: .center,
                           startRadius: 140, endRadius: 520)
                .ignoresSafeArea()
                .opacity(vignette)
                .allowsHitTesting(false)

            VStack(spacing: 0) {
                header
                guardianBar
                    .padding(.top, 10)
                ZStack {
                    GuardianView(color: holderColor,
                                 symbol: RoamStyle.realmSymbol(state?.faction_attacked ?? holder),
                                 share: Double(max(0, hp)) / Double(max(1, maxHP)),
                                 hitTick: hitTick, strikeTick: strikeTick,
                                 defeated: phase == .result && won)
                        .scaleEffect(phase == .intro ? 1 : 0.62)
                    ForEach(popups) { p in DamageText(pop: p) }
                    if blockedFlash {
                        Label("BLOCKED", systemImage: "shield.fill")
                            .font(GameFont.display(30))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16).padding(.vertical, 8)
                            .background(Capsule().fill(GamePalette.skyDeep)
                                .overlay(Capsule().strokeBorder(.white, lineWidth: 3)))
                            .transition(.scale(scale: 0.4).combined(with: .opacity))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: phase == .intro ? 280 : (phase == .result ? (won ? 60 : 190) : 170))
                if let said = voice.said, phase == .intro || phase == .result {
                    WardenBubble(said: said, tint: myColor, level: voice.speaker.level, compact: true,
                                 onClose: { withAnimation { voice.quiet() } })
                        .id(said.id)
                        .padding(.bottom, 8)
                }
                Spacer(minLength: 0)
                content
                if phase != .result { playerBar.padding(.top, 12) }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 10)
            .modifier(ShakeEffect(shakes: CGFloat(shake)))
            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: voice.said?.id)

            if phase != .result {
                // The Relic, swung at the Guardian on a hit.
                swingingRelic
            }
        }
        .gameType()
        .statusBarHidden()
        .animation(.spring(response: 0.45, dampingFraction: 0.8), value: phase)
        .onDisappear { voice.quiet() }
        .task {
            heldRelic = relics.equipped(store)
            await relics.refresh(store)
            heldRelic = relics.equipped(store)
            if RoamDev.autoPlay {
                try? await Task.sleep(for: .seconds(1.5))
                begin()
            }
        }
        .confirmationDialog("Leave the siege?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Retreat", role: .destructive) { onDone(false) }
            Button("Keep fighting", role: .cancel) {}
        } message: {
            Text("The clock keeps running, and a siege left unfinished is lost.")
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(alignment: .top) {
            Button {
                if phase == .fight || phase == .judging { confirmLeave = true } else { onDone(won) }
            } label: { Image(systemName: "xmark") }
                .buttonStyle(.gameIcon(GamePalette.navy.opacity(0.8), diameter: 42))
                .accessibilityLabel("Leave")
            Spacer()
            VStack(alignment: .trailing, spacing: 6) {
                Text(point.name)
                    .font(GameFont.display(20))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 3)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    GameChip(text: "Siege", color: holderColor)
                    if phase == .fight || phase == .judging {
                        GameChip(text: "Round \(round + 1)/\(state?.totalRounds ?? 7)", color: GamePalette.navy)
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    private var guardianBar: some View {
        let share = Double(max(0, hp)) / Double(max(1, maxHP))
        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
                Image(systemName: RoamStyle.realmSymbol(state?.faction_attacked ?? holder))
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(holderColor).overlay(Circle().strokeBorder(.white, lineWidth: 2)))
                Text("\(holderName) Guardian")
                    .font(GameFont.display(19))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.5), radius: 0, y: 2)
                Spacer()
                Text("\(max(0, hp))")
                    .font(GameFont.display(22).monospacedDigit())
                    .foregroundStyle(.white)
                    .contentTransition(.numericText(countsDown: true))
                    .shadow(color: .black.opacity(0.5), radius: 0, y: 2)
                Text("/ \(maxHP)")
                    .font(GameFont.display(15).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.7))
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(GamePalette.navyEdge.opacity(0.75))
                    // The drained part lingers a moment, the way fighting
                    // games show the hit you just landed.
                    Capsule().fill(.white.opacity(0.85))
                        .frame(width: max(share > 0 ? 18 : 0, g.size.width * share))
                        .animation(.easeOut(duration: 0.9).delay(0.35), value: hp)
                    Capsule()
                        .fill(LinearGradient(colors: [holderColor.opacity(0.85), holderColor],
                                             startPoint: .top, endPoint: .bottom))
                        .frame(width: max(share > 0 ? 18 : 0, g.size.width * share))
                        .overlay(alignment: .top) {
                            Capsule().fill(.white.opacity(0.35)).frame(height: 6)
                                .padding(.horizontal, 8).padding(.top, 3)
                        }
                        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: hp)
                }
                .overlay(Capsule().strokeBorder(GamePalette.ink, lineWidth: 3))
                .overlay(Capsule().strokeBorder(.white.opacity(0.5), lineWidth: 1).padding(3))
            }
            .frame(height: 26)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(GamePalette.navy.opacity(0.72))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(holderColor.opacity(0.7), lineWidth: 2)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(holderName) Guardian, \(max(0, hp)) of \(maxHP) health")
    }

    private var playerBar: some View {
        HStack(spacing: 12) {
            if let r = relic {
                RelicArt(kind: r.kind, rarity: r.rarity, size: 46)
            }
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text("FOCUS").font(GameFont.display(13)).tracking(1.2)
                    Text("\(focus)")
                        .font(GameFont.display(16).monospacedDigit())
                        .contentTransition(.numericText(countsDown: true))
                    Spacer()
                    if let r = relic {
                        statChip(RelicLook.abilityName(r.ability), RelicLook.abilitySymbol(r.ability), GamePalette.skyDeep)
                        statChip("\(r.powerNow)", "burst.fill", GamePalette.berry)
                    }
                }
                FocusBar(value: Double(focus) / 100)
            }
        }
        .foregroundStyle(.white)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(GamePalette.navy.opacity(0.82))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(myColor.opacity(0.7), lineWidth: 2)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your focus \(focus) of 100")
    }

    private func statChip(_ text: String, _ symbol: String, _ color: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(GameFont.display(13))
            .labelStyle(.titleAndIcon)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(color))
    }

    /// Up from the bottom corner, a turn through the air, and back.
    private var swingingRelic: some View {
        GeometryReader { g in
            if let r = relic {
                RelicArt(kind: r.kind, rarity: r.rarity, size: 110)
                    .keyframeAnimator(initialValue: SwingFrame(), trigger: swing) { v, f in
                        v.scaleEffect(f.scale)
                            .rotationEffect(.degrees(f.angle))
                            .offset(x: f.x, y: f.y)
                            .opacity(f.opacity)
                    } keyframes: { _ in
                        KeyframeTrack(\.opacity) {
                            LinearKeyframe(1, duration: 0.05)
                            LinearKeyframe(1, duration: 0.55)
                            LinearKeyframe(0, duration: 0.2)
                        }
                        KeyframeTrack(\.y) {
                            SpringKeyframe(-g.size.height * 0.42, duration: 0.3, spring: .snappy)
                            LinearKeyframe(-g.size.height * 0.40, duration: 0.3)
                            LinearKeyframe(0, duration: 0.2)
                        }
                        KeyframeTrack(\.x) {
                            SpringKeyframe(-g.size.width * 0.3, duration: 0.3, spring: .snappy)
                            LinearKeyframe(-g.size.width * 0.34, duration: 0.3)
                            LinearKeyframe(0, duration: 0.2)
                        }
                        KeyframeTrack(\.angle) {
                            LinearKeyframe(-70, duration: 0.3)
                            SpringKeyframe(60, duration: 0.18, spring: .bouncy)
                            LinearKeyframe(20, duration: 0.32)
                        }
                        KeyframeTrack(\.scale) {
                            SpringKeyframe(1.5, duration: 0.3)
                            SpringKeyframe(1.8, duration: 0.15)
                            LinearKeyframe(1.0, duration: 0.35)
                        }
                    }
                    .position(x: g.size.width * 0.82, y: g.size.height * 0.9)
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }

    // MARK: Content by phase

    @ViewBuilder private var content: some View {
        switch phase {
        case .intro, .starting: intro
        case .failed(let why):
            GamePanel {
                VStack(alignment: .leading, spacing: 12) {
                    Text("The Guardian waits").font(GameFont.display(24))
                    Text(why).font(GameFont.body(16, weight: .medium))
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Back to the map") { onDone(false) }
                        .buttonStyle(.game(GamePalette.sky))
                }
            }
        case .fight, .judging:
            if let q = question { questionCard(q) }
        case .result: result
        }
    }

    private var intro: some View {
        VStack(spacing: 14) {
            VStack(spacing: 6) {
                GameTitle("SIEGE!", size: 52, outline: GamePalette.edge(of: holderColor))
                Text("\(holderName) holds \(point.name). Beat its Guardian and it's yours.")
                    .font(GameFont.body(16, weight: .semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .shadow(color: .black.opacity(0.5), radius: 3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                ruleChip("heart.fill", "\(maxHP) HP", holderColor)
                ruleChip("timer", "15 s a round", GamePalette.skyDeep)
                ruleChip("list.number", "Up to 7", GamePalette.navy)
            }
            Text("Right answers hit with your Relic, faster hits harder. Wrong or late, the Guardian strikes your focus.")
                .font(GameFont.body(14, weight: .medium))
                .foregroundStyle(.white.opacity(0.9))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: begin) {
                if phase == .starting {
                    ProgressView().tint(.white)
                } else {
                    Label("Attack", systemImage: "flag.2.crossed.fill")
                }
            }
            .buttonStyle(.game(holderColor))
            .disabled(phase == .starting)
        }
    }

    private func ruleChip(_ symbol: String, _ text: String, _ color: Color) -> some View {
        Label(text, systemImage: symbol)
            .font(GameFont.display(14))
            .foregroundStyle(.white)
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(Capsule().fill(color).overlay(Capsule().strokeBorder(.white.opacity(0.5), lineWidth: 1.5)))
    }

    private func questionCard(_ q: SiegeQuestion) -> some View {
        let removed = round == 0 ? (q.removed ?? []) : []
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                RingTimer(deadline: localDeadline, total: seconds, paused: phase != .fight)
                    .frame(width: 58, height: 58)
                VStack(alignment: .leading, spacing: 4) {
                    if let clue = q.clue {
                        Text(clue).font(.system(size: 34))
                    }
                    Text(q.q)
                        .font(GameFont.display(22))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                        .minimumScaleFactor(0.8)
                        .shadow(color: .black.opacity(0.35), radius: 0, y: 2)
                }
            }
            ForEach(Array(q.choices.enumerated()), id: \.offset) { i, choice in
                ChoiceButton(text: choice, index: i,
                             reveal: reveal.map { $0 == i },
                             chosen: picked == i) { answer(i) }
                    .opacity(removed.contains(i) && reveal == nil ? 0.22 : 1)
                    .disabled(removed.contains(i) && reveal == nil)
                    // Not .disabled: a disabled button goes grey and the
                    // reveal's green and red would be lost.
                    .allowsHitTesting(phase == .fight)
            }
        }
        .id("q\(round)")
        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
        .task(id: "clock\(round)") { await watchClock() }
    }

    private var result: some View {
        VStack(spacing: 14) {
            if won {
                VStack(spacing: 6) {
                        Image(systemName: "flag.fill")
                            .font(.system(size: 40, weight: .heavy))
                            .foregroundStyle(.white)
                            .frame(width: 84, height: 84)
                            .background(Circle().fill(myColor).overlay(Circle().strokeBorder(.white, lineWidth: 4)))
                            .shadow(color: GamePalette.edge(of: myColor), radius: 0, y: 5)
                        GameTitle("TAKEN!", size: 56, outline: GamePalette.edge(of: myColor))
                        Text("\(point.name) flies \(store.me?.faction_name ?? "your") colours now.")
                            .font(GameFont.display(18))
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.center)
                            .shadow(color: .black.opacity(0.4), radius: 0, y: 2)
                }
                .frame(maxWidth: .infinity)
                .background {
                    Sunburst(colour: myColor).frame(width: 420, height: 420).opacity(0.55)
                        .allowsHitTesting(false)
                }
            } else {
                VStack(spacing: 6) {
                    GameTitle("REPELLED", size: 50, outline: GamePalette.edge(of: holderColor))
                    Text("The \(holderName) Guardian held. Rest up: you can go again in 10 minutes.")
                        .font(GameFont.body(16, weight: .semibold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            GamePanel {
                VStack(alignment: .leading, spacing: 10) {
                    if let lines = reward?.lines, !lines.isEmpty {
                        ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                            HStack {
                                Text(l.label).font(GameFont.body(16, weight: .semibold))
                                Spacer()
                                Text("+\(l.xp) XP").font(GameFont.display(18)).foregroundStyle(GamePalette.skyDeep)
                            }
                        }
                    } else if let xp = reward?.xp {
                        HStack {
                            Text(won ? "Hold taken" : "For trying").font(GameFont.body(16, weight: .semibold))
                            Spacer()
                            Text("+\(xp) XP").font(GameFont.display(20)).foregroundStyle(GamePalette.skyDeep)
                        }
                    }
                    if let fp = reward?.faction_points, fp > 0 {
                        Label("+\(fp) for your faction", systemImage: "flag.2.crossed.fill")
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                    }
                    if let d = reward?.drop, let r = d.relic {
                        RelicDropCard(relic: r, isNew: d.new ?? true, shards: d.shards)
                    }
                    Text("\(roundsUsed) \(roundsUsed == 1 ? "round" : "rounds") · \(focus) focus left")
                        .font(GameFont.body(13, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.55))
                }
            }
            Button(won ? "Back to the map" : "Retreat") { onDone(won) }
                .buttonStyle(.game(won ? GamePalette.mint : GamePalette.sky))
        }
        .transition(.scale(scale: 0.9).combined(with: .opacity))
    }

    // MARK: Actions

    private func begin() {
        guard phase == .intro else { return }
        phase = .starting
        GameSound.shared.play(.whoosh)
        Task {
            do {
                guard let here = store.coordinate else { throw RoamError.noLocation }
                let key = try await store.api.deviceKey()
                let s = try await store.api.roamPost("v1/roam/siege/start", body: SiegeStartBody(
                    device_key: key, point_id: point.id, lat: here.latitude, lng: here.longitude,
                    accuracy_m: max(0, store.accuracy)), as: SiegeState.self)
                state = s
                hp = s.guardian_hp
                maxHP = max(1, s.max_hp)
                focus = s.focus
                round = s.question?.round ?? s.round
                if s.phase != "fight" {
                    finish(won: s.phase == "won", reward: s.reward)
                    return
                }
                present(s.question)
                voice.prepare(store.siegeWonMoment(point.name, from: holderName, rounds: 3), priority: .soon)
            } catch {
                withAnimation { phase = .failed(error.localizedDescription) }
            }
        }
    }

    private func present(_ q: SiegeQuestion?) {
        guard let q else { return }
        picked = nil
        reveal = nil
        if let r = q.round { round = r }
        seconds = max(1, q.seconds ?? 15)
        asked = Date()
        // Seconds left by the server's clock, laid on this phone's: a phone
        // whose clock is wrong still gets the whole window.
        localDeadline = Date().addingTimeInterval(q.remaining_s ?? seconds)
        withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) {
            question = q
            phase = .fight
        }
        if RoamDev.autoPlay {
            let r = round
            Task {
                try? await Task.sleep(for: .seconds(1.6))
                if phase == .fight, round == r { answer(0) }
            }
        }
    }

    private func watchClock() async {
        let wait = localDeadline.timeIntervalSinceNow
        if wait > 0 {
            do { try await Task.sleep(for: .seconds(wait)) } catch { return }
        }
        guard !Task.isCancelled, phase == .fight else { return }
        answer(-1)
    }

    private func answer(_ choice: Int) {
        guard phase == .fight, let s = state else { return }
        picked = choice >= 0 ? choice : nil
        phase = .judging
        let elapsed = Int(Date().timeIntervalSince(asked) * 1000)
        let thisRound = round
        // The Strike: the same three rising pulses as any point, while the
        // server judges.
        let strike = Task { @MainActor in
            for i in 0..<3 {
                GameSound.shared.play([.pulse1, .pulse2, .pulse3][i])
                StrikeHaptics.shared.pulse(i)
                try? await Task.sleep(for: .milliseconds(360))
            }
        }
        Task {
            do {
                let key = try await store.api.deviceKey()
                let r = try await store.api.roamPost("v1/roam/siege/answer", body: SiegeAnswerBody(
                    device_key: key, siege_id: s.siege_id, round: thisRound, choice: choice,
                    elapsed_ms: elapsed), as: SiegeAnswerResult.self)
                await strike.value
                await land(r)
            } catch {
                await strike.value
                withAnimation { phase = .failed("Couldn't send your answer: \(error.localizedDescription)") }
            }
        }
    }

    /// One exchange, staged: the answer shown, then the hit or the strike,
    /// then the next question or the end.
    private func land(_ r: SiegeAnswerResult) async {
        lastResult = r
        roundsUsed = (r.round ?? round) + 1
        withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { reveal = r.answer_index }
        if r.correct {
            swing += 1
            GameSound.shared.play(.whoosh)
            try? await Task.sleep(for: .milliseconds(320))
            hitTick += 1
            StrikeHaptics.shared.resolve(win: true)
            GameSound.shared.play(.hit)
            let dmg = Int((r.damage ?? 0).rounded())
            var label = "-\(dmg)"
            if let g = r.grade { label += "  \(g.uppercased())!" }
            pop(label, color: SiegeLook.gradeColor(r.grade))
            run += 1
            var effects = r.effects ?? []
            let ability = state?.ability ?? relic?.ability
            if effects.isEmpty, ability == "cleave", r.grade == "Flawless" { effects = ["cleave"] }
            if effects.isEmpty, ability == "surge", run >= 3 { effects = ["surge"] }
            for e in effects {
                try? await Task.sleep(for: .milliseconds(160))
                pop(e == "surge" ? "SURGE ×2" : RelicLook.abilityName(e).uppercased(), color: GamePalette.berry)
            }
            withAnimation { hp = r.guardian_hp }
        } else if r.blocked == true {
            run = 0
            GameSound.shared.play(.coin)
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { blockedFlash = true }
            try? await Task.sleep(for: .milliseconds(900))
            withAnimation { blockedFlash = false }
        } else {
            // The Guardian hits back: the screen shakes, the edges go red.
            run = 0
            GameSound.shared.play(.hit)
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            strikeTick += 1
            try? await Task.sleep(for: .milliseconds(200))
            withAnimation(.linear(duration: 0.45)) { shake += 1 }
            withAnimation(.easeOut(duration: 0.12)) { vignette = 1 }
            withAnimation(.spring) { focus = r.focus }
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(.easeIn(duration: 0.7)) { vignette = 0 }
        }
        if r.correct { focus = r.focus }
        try? await Task.sleep(for: .milliseconds(1100))

        if r.phase == "fight", r.next != nil {
            present(r.next)
        } else {
            finish(won: r.phase == "won", reward: r.reward ?? SiegeReward(extras: r.extras))
        }
    }

    private func finish(won w: Bool, reward rw: SiegeReward?) {
        won = w
        reward = rw
        if w {
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if let mine = store.me?.faction {
                store.patchPoint(point.id) { e in
                    e["holder"] = mine
                    e["holder_name"] = store.me?.faction_name ?? store.factionName(mine)
                    e["hold_strength"] = "60"
                    for k in e.keys where k.hasPrefix("siege") { e[k] = nil }
                }
            }
        } else {
            StrikeHaptics.shared.resolve(win: false)
        }
        withAnimation(.spring(response: 0.5, dampingFraction: 0.75)) { phase = .result }
        let m = w ? store.siegeWonMoment(point.name, from: holderName, rounds: roundsUsed)
                  : store.siegeLostMoment(point.name, holder: holderName)
        Task { await voice.speak(m, wait: .seconds(1.5)) }
        relics.noteDrop(store)
        store.featureChanged()
    }

    private func pop(_ text: String, color: Color) {
        let p = DamagePop(text: text, color: color, x: CGFloat.random(in: -50...50))
        popups.append(p)
        Task {
            try? await Task.sleep(for: .seconds(1.4))
            popups.removeAll { $0.id == p.id }
        }
    }
}

private struct SwingFrame {
    var x: CGFloat = 0
    var y: CGFloat = 0
    var angle: Double = 0
    var scale: CGFloat = 1
    var opacity: Double = 0
}

/// A damage number: pops, rises and fades.
private struct DamageText: View {
    let pop: SiegeView.DamagePop
    @State private var up = false

    var body: some View {
        GameTitle(pop.text, size: 40, fill: pop.color == GamePalette.sun ? GamePalette.sun : .white,
                  outline: GamePalette.edge(of: pop.color))
            .scaleEffect(up ? 1 : 0.3)
            .offset(x: pop.x, y: up ? -40 : 20)
            .opacity(up ? 1 : 0)
            .onAppear {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.5)) { up = true }
                withAnimation(.easeIn(duration: 0.4).delay(0.9)) { up = false }
            }
            .allowsHitTesting(false)
    }
}

/// The player's focus: mint when full, going to berry as it drains.
private struct FocusBar: View {
    let value: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.15))
                Capsule()
                    .fill(LinearGradient(colors: value > 0.5 ? [GamePalette.mint, GamePalette.grass]
                                                   : (value > 0.25 ? [GamePalette.sun, GamePalette.sunDeep]
                                                                   : [GamePalette.berry, GamePalette.edge(of: GamePalette.berry)]),
                                         startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(value > 0 ? 12 : 0, g.size.width * min(1, max(0, value))))
                    .overlay(alignment: .top) {
                        Capsule().fill(.white.opacity(0.3)).frame(height: 4).padding(.horizontal, 6).padding(.top, 2)
                    }
            }
            .overlay(Capsule().strokeBorder(GamePalette.ink.opacity(0.8), lineWidth: 2))
        }
        .frame(height: 16)
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: value)
    }
}

/// A countdown ring with the seconds in the middle, red for the last five.
struct RingTimer: View {
    let deadline: Date
    let total: Double
    var paused = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 0.05, paused: paused)) { t in
            let left = max(0, deadline.timeIntervalSince(t.date))
            let frac = total > 0 ? left / total : 0
            let hot = left < 5
            ZStack {
                Circle().fill(GamePalette.navy.opacity(0.85))
                Circle().stroke(.white.opacity(0.18), lineWidth: 6).padding(4)
                Circle()
                    .trim(from: 0, to: frac)
                    .stroke(hot ? GamePalette.berry : GamePalette.sun,
                            style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(4)
                Text("\(Int(left.rounded(.up)))")
                    .font(GameFont.display(22).monospacedDigit())
                    .foregroundStyle(hot ? GamePalette.berry : .white)
                    .scaleEffect(hot && Int(left * 2) % 2 == 0 ? 1.12 : 1)
            }
            .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 2.5))
        }
        .accessibilityLabel("Time left")
    }
}

/// Side to side, fast and short: the Guardian's blow landing.
struct ShakeEffect: GeometryEffect {
    var shakes: CGFloat
    var animatableData: CGFloat {
        get { shakes }
        set { shakes = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: sin(shakes * .pi * 6) * 14, y: 0))
    }
}

// MARK: - The Guardian, drawn

/// The hold's Guardian: a crystal in the holder's colour with a scowl. It
/// bobs while it waits, flinches white when hit, lunges when it strikes,
/// cracks as its HP goes, and shatters when it falls.
struct GuardianView: View {
    let color: Color
    let symbol: String
    /// 0...1 of its HP left.
    let share: Double
    let hitTick: Int
    let strikeTick: Int
    let defeated: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            // Its glow on the ground, and a shadow that breathes with the bob.
            Ellipse().fill(.black.opacity(0.25))
                .frame(width: 150, height: 26)
                .offset(y: 118)
                .opacity(defeated ? 0 : 1)
            TimelineView(.animation(paused: reduceMotion || defeated)) { t in
                let bob = reduceMotion ? 0 : sin(t.date.timeIntervalSinceReferenceDate * 2.2) * 8
                figure(bob: bob)
            }
            if defeated { Shards(color: color) }
        }
        .frame(height: 260)
        .accessibilityHidden(true)
    }

    private func figure(bob: Double) -> some View {
        crystal
            .keyframeAnimator(initialValue: HitFrame(), trigger: hitTick) { v, f in
                v.scaleEffect(x: f.squashX, y: f.squashY, anchor: .bottom)
                    .offset(x: f.jolt)
                    .overlay { CrystalFrame().fill(.white.opacity(f.flash)).frame(width: 150, height: 170) }
            } keyframes: { _ in
                KeyframeTrack(\.flash) {
                    LinearKeyframe(0.9, duration: 0.05)
                    LinearKeyframe(0, duration: 0.3)
                }
                KeyframeTrack(\.squashX) {
                    SpringKeyframe(1.18, duration: 0.1)
                    SpringKeyframe(1, duration: 0.4, spring: .bouncy)
                }
                KeyframeTrack(\.squashY) {
                    SpringKeyframe(0.82, duration: 0.1)
                    SpringKeyframe(1, duration: 0.4, spring: .bouncy)
                }
                KeyframeTrack(\.jolt) {
                    LinearKeyframe(14, duration: 0.05)
                    LinearKeyframe(-10, duration: 0.07)
                    LinearKeyframe(6, duration: 0.07)
                    LinearKeyframe(0, duration: 0.1)
                }
            }
            .keyframeAnimator(initialValue: 1.0, trigger: strikeTick) { v, s in
                v.scaleEffect(s)
            } keyframes: { _ in
                SpringKeyframe(0.9, duration: 0.12)
                SpringKeyframe(1.45, duration: 0.14, spring: .snappy)
                SpringKeyframe(1.0, duration: 0.45)
            }
            .offset(y: bob)
            .scaleEffect(defeated ? 0.01 : 1)
            .opacity(defeated ? 0 : 1)
            .animation(.easeIn(duration: 0.35), value: defeated)
    }

    private var crystal: some View {
        ZStack {
            CrystalFrame().fill(GamePalette.edge(of: color)).offset(y: 9)
            CrystalFrame().fill(LinearGradient(colors: [color.opacity(0.8), color, GamePalette.edge(of: color)],
                                               startPoint: .top, endPoint: .bottom))
            // A lit face and a shadowed one, like the Relic crystals.
            CrystalFrame().fill(.white.opacity(0.18))
                .mask(Rectangle().frame(width: 75).offset(x: -37))
            CrystalFrame().stroke(.white.opacity(0.6), lineWidth: 3).padding(9)
            Cracks(level: share < 0.34 ? 2 : (share < 0.67 ? 1 : 0))
                .stroke(GamePalette.ink.opacity(0.75), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
            face.offset(y: -14)
            Frown()
                .stroke(GamePalette.ink, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .frame(width: 40, height: 14)
                .offset(y: 30)
            CrystalFrame().stroke(GamePalette.ink, lineWidth: 5)
        }
        .frame(width: 150, height: 170)
    }

    /// Two eyes under hard brows: not scary, just not having it.
    private var face: some View {
        HStack(spacing: 22) {
            eye(tilt: 16)
            eye(tilt: -16)
        }
    }

    private func eye(tilt: Double) -> some View {
        ZStack {
            Ellipse().fill(.white).frame(width: 30, height: 34)
                .overlay(Ellipse().stroke(GamePalette.ink, lineWidth: 3))
            Circle().fill(GamePalette.ink).frame(width: 14, height: 14).offset(x: tilt > 0 ? 4 : -4, y: 4)
            Capsule().fill(GamePalette.ink).frame(width: 38, height: 8)
                .rotationEffect(.degrees(tilt))
                .offset(y: -19)
        }
    }
}

private struct Frown: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY))
        p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.maxY), control: CGPoint(x: r.midX, y: r.minY - r.height * 0.6))
        return p
    }
}

private struct HitFrame {
    var flash = 0.0
    var squashX: CGFloat = 1
    var squashY: CGFloat = 1
    var jolt: CGFloat = 0
}

/// Cracks across the crystal, more of them as its HP goes.
private struct Cracks: Shape {
    let level: Int
    func path(in r: CGRect) -> Path {
        var p = Path()
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * r.width, y: r.minY + y * r.height) }
        if level >= 1 {
            p.move(to: pt(0.78, 0.22)); p.addLine(to: pt(0.66, 0.36)); p.addLine(to: pt(0.72, 0.46)); p.addLine(to: pt(0.62, 0.58))
            p.move(to: pt(0.66, 0.36)); p.addLine(to: pt(0.84, 0.40))
        }
        if level >= 2 {
            p.move(to: pt(0.20, 0.66)); p.addLine(to: pt(0.34, 0.60)); p.addLine(to: pt(0.30, 0.74)); p.addLine(to: pt(0.44, 0.84))
            p.move(to: pt(0.34, 0.60)); p.addLine(to: pt(0.40, 0.50))
            p.move(to: pt(0.52, 0.06)); p.addLine(to: pt(0.48, 0.18)); p.addLine(to: pt(0.56, 0.24))
        }
        return p
    }
}

/// The Guardian breaking: its crystal flies apart in pieces.
private struct Shards: View {
    let color: Color
    @State private var out = false

    var body: some View {
        ZStack {
            ForEach(0..<12, id: \.self) { i in
                let a = Double(i) / 12 * 2 * .pi
                CrystalFrame()
                    .fill(i % 3 == 0 ? .white : color)
                    .overlay(CrystalFrame().stroke(GamePalette.ink, lineWidth: 2))
                    .frame(width: 22 + CGFloat(i % 3) * 8, height: 26 + CGFloat(i % 3) * 8)
                    .rotationEffect(.degrees(out ? Double(i) * 70 : 0))
                    .offset(x: out ? cos(a) * 170 : 0, y: out ? sin(a) * 150 + 60 : 0)
                    .opacity(out ? 0 : 1)
            }
        }
        .onAppear { withAnimation(.easeOut(duration: 0.9)) { out = true } }
        .allowsHitTesting(false)
    }
}
