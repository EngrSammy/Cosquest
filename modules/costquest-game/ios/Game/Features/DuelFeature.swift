import SwiftUI
import UIKit

// FEATURE: duel. Guardian Duel, the battle: a side-on 3D 1v1 action fight
// against an AI copy of another player's hero.
//
// The fight itself runs in Unity (the Duel scene), on the deterministic
// engine in costquest-duel, so latency never touches it. This file is the
// rest of it: asking the server for a fight, handing its setup to Unity,
// taking the result back, and letting the server judge and pay it. Spec:
// costquest-research/18_guardian_duel_spec.md; API: backend docs/API.md §11.
//
// The server decides everything that matters: both fighters' stats, the seed,
// whether the result adds up. The phone only reports what happened.

// MARK: - Wire

/// `me.features.duel`.
struct DuelMe: Decodable, Sendable, Equatable {
    struct Fighter: Decodable, Sendable, Equatable {
        var weapon_class: String?
        var level: Int?
        var max_hp: Int?
        var attack: Int?
        var defence_bp: Int?
    }
    struct Live: Decodable, Sendable, Equatable {
        let duel_id: String
        var mode: String?
        var target: String?
        var expires_at: String?
    }
    struct Trial: Decodable, Sendable, Equatable {
        struct Next: Decodable, Sendable, Equatable {
            let rung: Int
            let name: String
            let level: Int
        }
        var cleared: Int
        var rungs: Int
        var next: Next?
    }
    var stance: String?
    var stance_is_default: Bool?
    var fighter: Fighter?
    /// duel | quiz: how a Siege is fought on this server.
    var siege_mode: String?
    /// duel | quiz: how Quest Points, boss raids and Quest Run points are
    /// fought (docs 22_everything_is_a_fight). Absent on older servers, where
    /// each point's own `challenge` decides.
    var point_mode: String?
    var raid_mode: String?
    var run_mode: String?
    var live: Live?
    var trials: [String: Trial]?
}

/// One side of the fight, as the server set it up.
struct DuelFighter: Decodable, Sendable, Equatable {
    struct RelicInfo: Decodable, Sendable, Equatable {
        var name: String?
        var kind: String?
    }
    struct AI: Decodable, Sendable, Equatable {
        var stance: String?
        var personality: String?
    }
    let name: String
    var faction: String?
    var weapon_class: String?
    var level: Int?
    var max_hp: Int?
    var attack: Int?
    var relic: RelicInfo?
    var ai: AI?
}

struct DuelSiegeInfo: Decodable, Sendable, Equatable {
    var siege_id: String?
    var point_id: String?
    var point_name: String?
    var faction_attacked: String?
    var faction_attacked_name: String?
    var hold_strength: Int?
}

/// What a fight pays, in whichever shape the mode sends it (a Roam reward,
/// a siege's, a raid's). CosCoins are bought, not earned, so coins are never
/// shown even if an older server sends them.
struct DuelPay: Decodable, Sendable, Equatable {
    struct Line: Decodable, Sendable, Equatable, Hashable {
        let label: String
        var xp: Int?
        var faction_points: Int?
    }
    var xp: Int?
    var faction_points: Int?
    var lines: [Line]?

    var isEmpty: Bool { (xp ?? 0) <= 0 && (faction_points ?? 0) <= 0 }
}

/// A Quest Point fought as a duel: `setup.point` at the start.
struct DuelPointInfo: Decodable, Sendable, Equatable {
    var point_id: String?
    var point_name: String?
    var tier: String?
    var realm: String?
    var guardian: String?
}

/// The point's side of the verdict.
struct DuelPointOutcome: Decodable, Sendable, Equatable {
    var point_id: String?
    var won: Bool?
    var reward: DuelPay?
    var leveled_up: Bool?
    var cooling_until: String?
    /// What features added (a Codex card, a hold taken, a Relic).
    var extras: [RoamExtra]?
}

/// A boss raid: `setup.raid` at the start.
struct DuelRaidInfo: Decodable, Sendable, Equatable {
    var raid_id: String?
    var boss_name: String?
    var hp_max: Int?
    var hp_left: Int?
    var ends_at: String?
    var fighters: Int?
}

/// The raid's side of the verdict: your damage into the shared pool.
struct DuelRaidOutcome: Decodable, Sendable, Equatable {
    var damage: Int?
    var hp_left: Int?
    var hp_max: Int?
    var defeated: Bool?
    var reward: DuelPay?
}

/// The run's side of the verdict: the points the fight earned.
struct DuelRunOutcome: Decodable, Sendable, Equatable {
    var earned: Int?
    var speed_mult: Double?
    var surged: Bool?
    var stake_result: RunAnswerResult.Stake?
    var run: RunState?
}

struct DuelTrialInfo: Decodable, Sendable, Equatable {
    let faction: String
    var faction_name: String?
    let rung: Int
    var rungs: Int?
    var name: String?
    var cleared: Int?
    var first_clear: Bool?
}

/// Any JSON value, carried through unchanged. The fight's setup goes to
/// Unity exactly as the server wrote it: the engine reads it, not this app,
/// and re-typing it here would be one more place for a field to drift.
indirect enum DuelJSON: Codable, Sendable, Equatable {
    case int(Int), double(Double), string(String), bool(Bool)
    case object([String: DuelJSON]), array([DuelJSON]), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        // Int before Double: the seed and the stats are integers, and the
        // engine is integer-only.
        else if let i = try? c.decode(Int.self) { self = .int(i) }
        else if let d = try? c.decode(Double.self) { self = .double(d) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let o = try? c.decode([String: DuelJSON].self) { self = .object(o) }
        else { self = .array(try c.decode([DuelJSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }

    var jsonString: String {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return (try? enc.encode(self)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}

struct DuelStart: Decodable, Sendable, Equatable {
    struct Peek: Decodable, Sendable, Equatable {
        let p1: DuelFighter
        let p2: DuelFighter
    }
    let duel_id: String
    let mode: String
    let target: String
    let seed: Int
    /// Handed to Unity as it came.
    let setup: DuelJSON
    /// The same setup, read for the VS screen.
    let fighters: Peek?
    let siege: DuelSiegeInfo?
    let trial: DuelTrialInfo?
    let point: DuelPointInfo?
    let raid: DuelRaidInfo?
    let expires_at: String?
    let resumed: Bool

    enum CodingKeys: String, CodingKey {
        case duel_id, mode, target, seed, setup, siege, trial, point, raid, expires_at, resumed
    }

    /// `point` and `raid` ride in the setup (and, on some servers, beside it).
    private struct SetupExtras: Decodable {
        var point: DuelPointInfo?
        var raid: DuelRaidInfo?
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        duel_id = try c.decode(String.self, forKey: .duel_id)
        mode = try c.decode(String.self, forKey: .mode)
        target = try c.decode(String.self, forKey: .target)
        seed = try c.decode(Int.self, forKey: .seed)
        setup = try c.decode(DuelJSON.self, forKey: .setup)
        fighters = try? c.decode(Peek.self, forKey: .setup)
        siege = try? c.decodeIfPresent(DuelSiegeInfo.self, forKey: .siege)
        trial = try? c.decodeIfPresent(DuelTrialInfo.self, forKey: .trial)
        let inSetup = try? c.decode(SetupExtras.self, forKey: .setup)
        point = (try? c.decodeIfPresent(DuelPointInfo.self, forKey: .point)) ?? inSetup?.point
        raid = (try? c.decodeIfPresent(DuelRaidInfo.self, forKey: .raid)) ?? inSetup?.raid
        expires_at = try? c.decodeIfPresent(String.self, forKey: .expires_at)
        resumed = (try? c.decodeIfPresent(Bool.self, forKey: .resumed)) ?? false
    }
}

struct DuelResult: Codable, Sendable, Equatable {
    /// 1 the player, 2 the Guardian, 0 a draw (a loss for the player).
    let winner: Int
    let ticks: Int
    let p1_hp: Int
    let p2_hp: Int
    /// The fantasy battle's own words (GuardianDefeated | HeroDefeated | Timeout | none);
    /// the side-on duel leaves them out.
    var end_reason: String? = nil
    var kills: Int? = nil
}

/// What the Duel scene reports at the end: exactly the finish body's payload.
struct DuelFinished: Decodable, Sendable, Equatable {
    let result: DuelResult
    /// [tick, code] or [tick, code, arg], in tick order.
    let inputs: [[Int]]
    let hash: String
}

struct DuelOutcome: Decodable, Sendable, Equatable {
    let duel_id: String
    let mode: String
    /// won | lost | held
    let status: String
    var `repeat`: Bool?
    var result: DuelResult?
    /// A siege's reward (with any Relic drop) or a first trial clear's.
    var reward: SiegeReward?
    var siege: DuelSiegeInfo?
    var trial: DuelTrialInfo?
    var point: DuelPointOutcome?
    var raid: DuelRaidOutcome?
    var run: DuelRunOutcome?
    var message: String?

    /// Whatever this fight paid, from whichever part of the verdict carries it.
    var pay: DuelPay? {
        if let r = reward { return DuelPay(xp: r.xp, faction_points: r.faction_points) }
        return point?.reward ?? raid?.reward
    }
}

private struct DuelStartBody: Encodable, Sendable {
    let device_key: String
    let mode: String
    let target: String
    let lat: Double?
    let lng: Double?
    let accuracy_m: Double?
    /// A Quest Run's Forbidden Zone: stake half the score on this fight.
    var stake: Bool? = nil
    /// This build can play the fantasy battle scene; the server sends it for a
    /// point fight when its point_battle switch is on (research 29).
    var battle: Bool? = nil
}

private struct DuelFinishBody: Encodable, Sendable {
    let device_key: String
    let duel_id: String
    let inputs: [[Int]]
    let result: DuelResult
    let hash: String
}

private struct DuelStanceBody: Encodable, Sendable {
    let device_key: String
    let stance: String
}

private struct DuelStanceReply: Decodable, Sendable { let stance: String }

// MARK: - Model

enum DuelRequest: Equatable, Identifiable {
    case siege(QuestPoint)
    /// A Quest Point's Guardian.
    case point(QuestPoint)
    /// A boss raid: your damage goes into the shared pool.
    case raid(QuestPoint)
    /// A Quest Run point: a 30 second fight for the point's value.
    case run(runID: String, idx: Int, stake: Bool, name: String, value: Int)
    /// A ladder: the faction's next rung, or `rung` to replay one.
    case trial(faction: String, rung: Int?)
    /// AI against AI with the showcase camera, for a demo. Nothing is sent.
    case demo

    var id: String {
        switch self {
        case .siege(let p): return "siege:\(p.id)"
        case .point(let p): return "point:\(p.id)"
        case .raid(let p): return "raid:\(p.id)"
        case .run(let r, let i, _, _, _): return "run:\(r):\(i)"
        case .trial(let f, let r): return "trial:\(f):\(r.map(String.init) ?? "next")"
        case .demo: return "demo"
        }
    }
}

@MainActor
enum DuelModel {
    static func start(_ store: RoamStore, _ request: DuelRequest) async throws -> DuelStart {
        let key = try await store.api.deviceKey()
        var body: DuelStartBody
        switch request {
        case .siege(let p):
            guard let here = store.coordinate else { throw RoamError.noLocation }
            body = DuelStartBody(device_key: key, mode: "siege", target: p.id,
                                 lat: here.latitude, lng: here.longitude,
                                 accuracy_m: max(0, store.accuracy))
        case .point(let p), .raid(let p):
            guard let here = store.coordinate else { throw RoamError.noLocation }
            let mode = { if case .raid = request { return "raid" } else { return "point" } }()
            body = DuelStartBody(device_key: key, mode: mode, target: p.id,
                                 lat: here.latitude, lng: here.longitude,
                                 accuracy_m: max(0, store.accuracy))
            #if !NO_UNITY
            if mode == "point" { body.battle = true }
            #endif
        case .run(let runID, let idx, let stake, _, _):
            // A pocket run has no location; a daily run is judged for reach.
            let here = store.coordinate
            body = DuelStartBody(device_key: key, mode: "run", target: "\(runID):\(idx)",
                                 lat: here?.latitude, lng: here?.longitude,
                                 accuracy_m: here == nil ? nil : max(0, store.accuracy),
                                 stake: stake)
        case .trial(let faction, let rung):
            body = DuelStartBody(device_key: key, mode: "trial",
                                 target: rung.map { "\(faction):\($0)" } ?? faction,
                                 lat: nil, lng: nil, accuracy_m: nil)
        case .demo:
            throw DuelError.demoHasNoServer
        }
        return try await store.api.roamPost("v1/duel/start", body: body, as: DuelStart.self)
    }

    static func finish(_ store: RoamStore, _ start: DuelStart, _ f: DuelFinished) async throws -> DuelOutcome {
        let key = try await store.api.deviceKey()
        let out = try await store.api.roamPost("v1/duel/finish", body: DuelFinishBody(
            device_key: key, duel_id: start.duel_id, inputs: f.inputs, result: f.result,
            hash: f.hash), as: DuelOutcome.self)
        store.featureChanged()
        return out
    }

    static func setStance(_ api: GameClient, _ stance: String) async throws -> String {
        let key = try await api.deviceKey()
        return try await api.roamPut("v1/duel/stance", body: DuelStanceBody(
            device_key: key, stance: stance), as: DuelStanceReply.self).stance
    }
}

enum DuelError: LocalizedError {
    case demoHasNoServer
    case sceneTimeout
    var errorDescription: String? {
        switch self {
        case .demoHasNoServer: return "A demo fight has nothing to report."
        case .sceneTimeout: return "The arena didn't open. Close CosQuest and try again."
        }
    }
}

// MARK: - The host (where the fight is drawn)

/// What the Duel scene says while it runs.
enum DuelHostEvent: Equatable {
    case ready
    case sfx(String)
    case finished(DuelFinished)
    /// The player left mid-fight. The scene's state at that moment, if it sent it.
    case quit(DuelFinished?)
}

/// Where a fight runs. On the device, the Unity Duel scene; in the simulator
/// build, which has no Unity, a stand-in that says so.
@MainActor
protocol DuelHost: AnyObject {
    /// False where no fight can run (the simulator build).
    var canFight: Bool { get }
    var onEvent: ((DuelHostEvent) -> Void)? { get set }
    /// Starts a fight from the server's setup, as JSON.
    func begin(setupJSON: String)
    /// AI against AI, for a demo.
    func demo()
    /// Asks the scene to stop the fight (it answers with `quit`).
    func quit()
    /// The fight is over and its result is in: stop drawing.
    func close()
    func makeView() -> AnyView
    /// True where the scene can be frozen behind a pause page (the battle).
    var supportsPause: Bool { get }
    /// Freezes or resumes the fight.
    func setPaused(_ paused: Bool)
}

extension DuelHost {
    var supportsPause: Bool { false }
    func setPaused(_ paused: Bool) {}
}

@MainActor
enum DuelHosts {
    static func make() -> DuelHost {
        #if NO_UNITY
        return UnavailableDuelHost()
        #else
        return UnityDuelHost()
        #endif
    }

    /// The fantasy action battle, for a setup whose `kind` is "battle".
    static func makeBattle() -> DuelHost {
        #if NO_UNITY
        return UnavailableDuelHost()
        #else
        return UnityBattleHost()
        #endif
    }
}

/// The simulator build's host: no Unity, so no fight.
@MainActor
final class UnavailableDuelHost: DuelHost {
    var canFight: Bool { false }
    var onEvent: ((DuelHostEvent) -> Void)?
    func begin(setupJSON: String) {}
    func demo() {}
    func quit() { onEvent?(.quit(nil)) }
    func close() {}
    func makeView() -> AnyView {
        AnyView(
            VStack(spacing: 10) {
                Image(systemName: "iphone.gen3")
                    .font(.system(size: 34, weight: .bold))
                Text("Duels run on the device build")
                    .font(GameFont.display(22))
                Text("The fight is drawn by the Unity engine, which this simulator build leaves out.")
                    .font(GameFont.body(14, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .opacity(0.75)
            }
            .foregroundStyle(.white)
            .padding(30)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        )
    }
}

/// Maps the scene's sound cues onto the game's own sounds and haptics.
/// Substring matches, so a cue the scene adds later still lands somewhere
/// sensible rather than in silence.
enum DuelSFX {
    @MainActor static func play(_ cue: String) {
        let c = cue.lowercased()
        if c.contains("ko") || c.contains("victory") {
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } else if c.contains("special") {
            GameSound.shared.play(.whoosh)
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        } else if c.contains("heavy") || c.contains("break") {
            GameSound.shared.play(.hit)
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        } else if c.contains("hit") {
            GameSound.shared.play(.hit)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } else if c.contains("block") {
            GameSound.shared.play(.tap)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } else if c.contains("dash") || c.contains("dodge") || c.contains("swing") || c.contains("whoosh") {
            GameSound.shared.play(.whoosh)
        } else if c.contains("defeat") {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        } else {
            GameSound.shared.play(.tap)
        }
    }
}

// MARK: - Look

enum DuelLook {
    static let stage = LinearGradient(colors: [GamePalette.navy, GamePalette.navyEdge],
                                      startPoint: .top, endPoint: .bottom)

    static func weaponName(_ w: String?) -> String {
        switch w {
        case "fists": return "Fists"
        case "polearm": return "Polearm"
        case "blaster": return "Blaster"
        case "arcane": return "Arcane"
        default: return "Blade"
        }
    }

    static func weaponSymbol(_ w: String?) -> String {
        switch w {
        case "fists": return "hand.raised.fill"
        case "polearm": return "line.diagonal"
        case "blaster": return "scope"
        case "arcane": return "wand.and.rays"
        default: return "shield.lefthalf.filled"
        }
    }

    static let stances: [(id: String, name: String, line: String)] = [
        ("aggressive", "Aggressive", "Presses forward and swings first."),
        ("counter", "Counter", "Waits for your mistake, then punishes it."),
        ("turtle", "Turtle", "Blocks, dodges and makes you work for it."),
    ]

    static func stanceName(_ id: String?) -> String {
        stances.first { $0.id == id }?.name ?? "Default"
    }
}

/// Which fights this server has made into duels. A point, a raid or a run
/// point is a duel when the server says so for that mode, or when the thing
/// itself says `challenge: "duel"`.
@MainActor
enum DuelModes {
    static func point(_ p: QuestPoint, _ store: RoamStore) -> Bool {
        p.challenge == "duel" || store.me?.features?.duel?.point_mode == "duel"
    }

    static func raid(_ p: QuestPoint, _ store: RoamStore) -> Bool {
        p.source == "raid" && (p.challenge == "duel" || store.me?.features?.duel?.raid_mode == "duel")
    }

    static func run(_ kind: String?, _ store: RoamStore) -> Bool {
        kind == "duel" || store.me?.features?.duel?.run_mode == "duel"
    }

    /// Difficulty, from the point's tier: its Guardian is below, level with or
    /// above you.
    nonisolated static func difficulty(_ tier: String) -> String {
        switch tier {
        case "epic": return "Hard"
        case "rare": return "Even"
        default: return "Easy"
        }
    }

    /// The Guardian a point announces, or a fair name for one.
    nonisolated static func guardian(_ p: QuestPoint) -> String {
        p.extra?["guardian"] ?? "Keeper of \(p.name)"
    }
}

// MARK: - The fight, start to finish

/// Full screen, from "VS" to the verdict. The server is asked for the fight,
/// Unity plays it, the server judges it.
struct DuelView: View {
    let store: RoamStore
    let request: DuelRequest
    /// The verdict, or nil if the player left before there was one.
    var onDone: (DuelOutcome?) -> Void

    private enum Phase: Equatable {
        case starting, versus, fighting, judging, result(DuelOutcome), failed(String)
    }

    @State private var phase: Phase = .starting
    @State private var start: DuelStart?
    @State private var host: DuelHost = DuelHosts.make()
    @State private var sceneReady = false
    @State private var confirmLeave = false
    @State private var paused = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            DuelLook.stage.ignoresSafeArea()
            switch phase {
            case .fighting, .judging:
                host.makeView().ignoresSafeArea()
            default:
                EmptyView()
            }
            content
            if paused, phase == .fighting {
                BattlePauseView(title: pauseTitle, place: start?.point?.point_name,
                                tint: RoamStyle.realmColor(start?.point?.realm),
                                onResume: { setPaused(false) },
                                onLeave: { paused = false; host.setPaused(false); host.quit() })
                    .zIndex(2)
            }
        }
        // Coming back from another app, or a call, lands on the pause page, not mid-blow.
        .onChange(of: scenePhase) { _, now in
            if now != .active, phase == .fighting, host.supportsPause { setPaused(true) }
        }
        .onChange(of: phase) { _, now in if now != .fighting, paused { paused = false } }
        .gameType()
        .statusBarHidden(phase == .fighting)
        .task { await begin() }
        .confirmationDialog("Leave the fight?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave (counts as a loss)", role: .destructive) { host.quit() }
            Button("Keep fighting", role: .cancel) {}
        }
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .starting:
            VStack(spacing: 14) {
                ProgressView().tint(.white)
                Text("Finding your opponent…").font(GameFont.display(20)).foregroundStyle(.white)
            }
        case .versus:
            if let start { VersusCard(start: start, store: store) }
        case .fighting:
            VStack {
                HStack {
                    Spacer()
                    if host.canFight {
                        Button { if host.supportsPause { setPaused(true) } else { confirmLeave = true } } label: {
                            Image(systemName: "pause.fill")
                                .font(.system(size: 14, weight: .black))
                                .frame(width: 40, height: 40)
                                .background(Circle().fill(.black.opacity(0.35)))
                                .foregroundStyle(.white)
                        }
                        .accessibilityLabel(host.supportsPause ? "Pause" : "Leave the fight")
                        .padding(.trailing, 14)
                    } else {
                        Button("Back") { onDone(nil) }
                            .buttonStyle(.game(GamePalette.sky, size: .small, fullWidth: false))
                            .padding(.trailing, 14)
                    }
                }
                Spacer()
            }
        case .judging:
            VStack(spacing: 12) {
                ProgressView().tint(.white)
                Text("Counting the blows…").font(GameFont.display(20)).foregroundStyle(.white)
            }
            .padding(24)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(.black.opacity(0.55)))
        case .result(let o):
            DuelResultView(outcome: o, start: start, store: store,
                           onAgain: again(after: o), onDone: { onDone(o) })
        case .failed(let why):
            VStack(spacing: 16) {
                Text(why)
                    .font(GameFont.display(22))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                Button("Back") { onDone(nil) }.buttonStyle(.game(GamePalette.sun))
            }
            .padding(30)
        }
    }

    private var pauseTitle: String {
        start?.point?.guardian ?? start?.point?.point_name ?? "The fight"
    }

    private func setPaused(_ on: Bool) {
        withAnimation(.smooth(duration: 0.2)) { paused = on }
        host.setPaused(on)
    }

    /// "Next rung" or "Try again" after a trial; nothing after a siege, which
    /// cools down either way.
    private func again(after o: DuelOutcome) -> (() -> Void)? {
        guard case .trial(let faction, _) = request, o.mode == "trial" else { return nil }
        let ladder = store.me?.features?.duel?.trials?[faction]
        if o.status == "won", ladder?.next == nil { return nil }
        return {
            phase = .starting
            start = nil
            sceneReady = false
            Task { await begin() }
        }
    }

    // MARK: Flow

    private func begin() async {
        host.onEvent = { event in handle(event) }
        if request == .demo {
            withAnimation { phase = .fighting }
            host.demo()
            return
        }
        do {
            let s = try await DuelModel.start(store, request)
            start = s
            // A setup of kind "battle" is the fantasy action fight, played by
            // its own Unity scene (research 29); anything else is the duel.
            if let data = s.setup.jsonString.data(using: .utf8),
               (try? JSONDecoder().decode(BattleSetupPeek.self, from: data))?.isBattle == true {
                host = DuelHosts.makeBattle()
                host.onEvent = { event in handle(event) }
            }
            withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { phase = .versus }
            GameSound.shared.play(.whoosh)
            // The VS card holds for a beat while the arena loads behind it.
            host.begin(setupJSON: s.setup.jsonString)
            try? await Task.sleep(for: .milliseconds(1800))
            withAnimation(.smooth(duration: 0.35)) { phase = .fighting }
            await watchForScene()
        } catch {
            withAnimation { phase = .failed(error.localizedDescription) }
        }
    }

    /// The scene says `ready` once it's drawing. If it never does, say so
    /// rather than leave the player looking at an empty arena.
    private func watchForScene() async {
        guard host.canFight else { return }
        for _ in 0..<40 where !sceneReady {
            try? await Task.sleep(for: .milliseconds(250))
        }
        if !sceneReady, phase == .fighting {
            host.close()
            withAnimation { phase = .failed(DuelError.sceneTimeout.localizedDescription) }
        }
    }

    private func handle(_ event: DuelHostEvent) {
        switch event {
        case .ready:
            sceneReady = true
        case .sfx(let cue):
            DuelSFX.play(cue)
        case .finished(let f):
            report(f)
        case .quit(let f):
            if request == .demo || start == nil {
                host.close()
                onDone(nil)
            } else if let f {
                // The fight as it stood when they walked away: the server
                // judges it like any other.
                report(f)
            } else {
                // Nothing to report. The server forfeits a fight left
                // running once its time is up.
                host.close()
                onDone(nil)
            }
        }
    }

    private func report(_ f: DuelFinished) {
        guard let start, phase == .fighting else { return }
        withAnimation { phase = .judging }
        Task {
            do {
                let o = try await DuelModel.finish(store, start, f)
                host.close()
                withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { phase = .result(o) }
                switch o.status {
                case "won":
                    GameSound.shared.play(.fanfare)
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                case "lost":
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                default: break
                }
            } catch {
                host.close()
                withAnimation { phase = .failed(error.localizedDescription) }
            }
        }
    }
}

/// Who is fighting whom, while the arena loads.
private struct VersusCard: View {
    let start: DuelStart
    let store: RoamStore

    var body: some View {
        VStack(spacing: 18) {
            Text(title.uppercased())
                .font(GameFont.display(14)).tracking(1.6)
                .foregroundStyle(.white.opacity(0.7))
            if let f = start.fighters {
                side(f.p1, you: true)
                Text("VS")
                    .font(GameFont.display(44))
                    .foregroundStyle(GamePalette.sun)
                side(f.p2, you: false)
            }
        }
        .padding(24)
        .transition(.scale(scale: 0.9).combined(with: .opacity))
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        if let s = start.siege {
            return "Siege · \(s.point_name ?? "Quest Point")"
        }
        if let t = start.trial {
            return "Guardian Trials · \(t.faction_name ?? store.factionName(t.faction)) · rung \(t.rung)"
        }
        if let r = start.raid {
            return "Boss raid · \(r.boss_name ?? "The boss")"
        }
        if let p = start.point {
            return "Duel · \(p.point_name ?? "Quest Point")"
        }
        if start.mode == "run" { return "Quest Run · fight for the point" }
        return "Duel"
    }

    /// One fighter, face to face with the other: a big portrait in a frame of
    /// the house colour (your avatar; the Guardian's weapon), a weapon badge on
    /// it, the name and the subline. The Guardian's card is mirrored.
    private func side(_ f: DuelFighter, you: Bool) -> some View {
        let tint = RoamStyle.realmColor(f.faction)
        return HStack(spacing: 16) {
            if you {
                portrait(f, you: true, tint: tint)
                words(f, you: true, tint: tint)
            } else {
                words(f, you: false, tint: tint)
                portrait(f, you: false, tint: tint)
            }
        }
        .padding(14)
        .frame(maxWidth: 380)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(GamePalette.cream)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(tint).offset(y: 4))
        )
    }

    private func portrait(_ f: DuelFighter, you: Bool, tint: Color) -> some View {
        let size: CGFloat = 104
        return ZStack(alignment: you ? .bottomTrailing : .bottomLeading) {
            Group {
                if you {
                    AvatarView(avatar: store.profile?.avatar ?? .init(), size: size * 0.7)
                } else {
                    Image(systemName: DuelLook.weaponSymbol(f.weapon_class))
                        .font(.system(size: size * 0.4, weight: .heavy))
                        .foregroundStyle(.white.opacity(0.9))
                }
            }
            .frame(width: size - 6, height: size - 6)
            .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(tint))
            .padding(3)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(tint, lineWidth: 3))
            Image(systemName: DuelLook.weaponSymbol(f.weapon_class))
                .font(.system(size: 17, weight: .heavy))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(tint))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(GamePalette.cream, lineWidth: 2))
                .offset(x: you ? 10 : -10, y: 8)
        }
        .frame(width: size, height: size)
    }

    private func words(_ f: DuelFighter, you: Bool, tint: Color) -> some View {
        VStack(alignment: you ? .leading : .trailing, spacing: 3) {
            Text(you ? "YOU" : "OPPONENT")
                .font(GameFont.display(12)).tracking(1.4)
                .foregroundStyle(tint)
            Text(f.name)
                .font(GameFont.display(22))
                .foregroundStyle(GamePalette.ink)
                .multilineTextAlignment(you ? .leading : .trailing)
                .lineLimit(2).minimumScaleFactor(0.7)
            Text(subline(f).uppercased())
                .font(GameFont.body(11, weight: .heavy)).tracking(0.4)
                .foregroundStyle(GamePalette.ink.opacity(0.55))
                .multilineTextAlignment(you ? .leading : .trailing)
                .lineLimit(2).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: you ? .leading : .trailing)
    }

    private func subline(_ f: DuelFighter) -> String {
        var parts = ["Level \(f.level ?? 1)", DuelLook.weaponName(f.weapon_class)]
        if let s = f.ai?.stance { parts.append(DuelLook.stanceName(s)) }
        if let r = f.relic?.name { parts.append(r) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - The verdict

struct DuelResultView: View {
    let outcome: DuelOutcome
    let start: DuelStart?
    let store: RoamStore
    var onAgain: (() -> Void)?
    var onDone: () -> Void

    private var won: Bool { outcome.status == "won" }
    private var held: Bool { outcome.status == "held" }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text(title)
                    .font(GameFont.display(56))
                    .foregroundStyle(won ? GamePalette.sun : .white)
                    .padding(.top, 50)
                if let line = subtitle {
                    Text(line)
                        .font(GameFont.body(16, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                }
                if let r = outcome.result, let f = start?.fighters { hpCard(r, f) }
                if let run = outcome.run, !held { runPanel(run) }
                if let raid = outcome.raid, !held { raidPanel(raid) }
                if let pay = outcome.pay, !held, !pay.isEmpty {
                    rewardRow(pay)
                }
                ForEach(extraLines, id: \.self) { line in
                    Label(line, systemImage: "rosette")
                        .font(GameFont.body(15, weight: .bold))
                        .foregroundStyle(.white)
                }
                if let drop = outcome.reward?.drop ?? outcome.point?.extras?.first(where: { $0.kind == "relic" }),
                   let relic = drop.relic {
                    HStack(spacing: 12) {
                        RelicArt(kind: relic.kind, rarity: relic.rarity, size: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(drop.new == true ? "NEW RELIC" : "RELIC")
                                .font(GameFont.display(12)).tracking(1)
                                .foregroundStyle(GamePalette.sunDeep)
                            Text(relic.name).font(GameFont.display(18)).foregroundStyle(GamePalette.ink)
                        }
                        Spacer()
                    }
                    .padding(14)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(GamePalette.cream))
                }
                if let onAgain {
                    Button(won ? "Next rung" : "Try again", action: onAgain)
                        .buttonStyle(.game(GamePalette.sun))
                }
                Button(outcome.mode == "run" ? "Back to the run" : "Back to the map", action: onDone)
                    .buttonStyle(.game(onAgain == nil ? GamePalette.sun : GamePalette.skyDeep))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .transition(.scale(scale: 0.92).combined(with: .opacity))
    }

    private var title: String {
        switch outcome.status {
        case "won": return "VICTORY"
        case "held": return "CHECKING"
        default: return "DEFEAT"
        }
    }

    private var subtitle: String? {
        // The server's held message reads as an accusation: the client's own words.
        if held { return "Result on its way. We are confirming the score." }
        if outcome.mode == "point" {
            let place = start?.point?.point_name ?? "this place"
            let guardian = start?.point?.guardian ?? "Its Guardian"
            return won ? "\(guardian) is beaten. \(place) answers to your faction."
                       : "\(guardian) holds \(place). It rests for 10 minutes, then you can go again."
        }
        if outcome.mode == "raid" {
            let boss = start?.raid?.boss_name ?? "The boss"
            if outcome.raid?.defeated == true { return "\(boss) is down. Everyone who landed a hit is paid." }
            return "Every hit you landed counts toward the crew's. Bring \(boss) down before it leaves."
        }
        if outcome.mode == "run" {
            return won ? "Point taken at full value." : "The Guardian held, but every hit still scored."
        }
        if let s = outcome.siege, let place = s.point_name {
            return won ? "\(place) is yours. Your faction holds it now."
                       : "\(place) stands. Its Guardian is on guard for 10 minutes."
        }
        if let t = outcome.trial {
            let name = t.faction_name ?? store.factionName(t.faction)
            let cleared = t.cleared ?? 0
            let rungs = t.rungs ?? 8
            if won, t.first_clear == false || outcome.reward == nil {
                return "\(name) Trials · rung \(t.rung) beaten again."
            }
            return won ? "\(name) Trials · \(cleared) of \(rungs) cleared."
                       : "\(t.name ?? "The Guardian") holds rung \(t.rung). Study it and go again."
        }
        return nil
    }

    private func hpCard(_ r: DuelResult, _ f: DuelStart.Peek) -> some View {
        VStack(spacing: 10) {
            // Says what the bars measure: "ada 0%" alone read as a score.
            Text("HEALTH LEFT")
                .font(GameFont.display(12)).tracking(1.2)
                .foregroundStyle(GamePalette.mist)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)
            hpRow("\(f.p1.name) (you)", hp: r.p1_hp, max: f.p1.max_hp ?? max(1, r.p1_hp), faction: f.p1.faction)
            hpRow(f.p2.name, hp: r.p2_hp, max: f.p2.max_hp ?? max(1, r.p2_hp), faction: f.p2.faction)
            Text("Fight time \(max(0, r.ticks) / 60) s")
                .font(GameFont.body(12, weight: .heavy))
                .foregroundStyle(GamePalette.mist)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(GamePalette.cream))
    }

    private func hpRow(_ name: String, hp: Int, max: Int, faction: String?) -> some View {
        let share = Double(Swift.max(0, hp)) / Double(Swift.max(1, max))
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(name).font(GameFont.display(15)).foregroundStyle(GamePalette.ink).lineLimit(1)
                Spacer()
                Text("\(Int((share * 100).rounded()))% health")
                    .font(GameFont.display(15).monospacedDigit())
                    .foregroundStyle(GamePalette.ink)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(GamePalette.track)
                    Capsule().fill(RoamStyle.realmColor(faction)).frame(width: g.size.width * share)
                }
            }
            .frame(height: 10)
        }
    }

    /// A Codex card, a hold taken: what features added to the fight, in words.
    private var extraLines: [String] {
        (outcome.point?.extras ?? outcome.reward?.extras ?? [])
            .filter { $0.kind != "relic" }
            .map { [$0.title, $0.subtitle].compactMap { $0 }.joined(separator: " · ") }
    }

    private func runPanel(_ r: DuelRunOutcome) -> some View {
        VStack(spacing: 8) {
            Text("+\(r.earned ?? 0)")
                .font(GameFont.display(46).monospacedDigit())
                .foregroundStyle((r.earned ?? 0) > 0 ? GamePalette.mint : .white)
            Text("POINTS")
                .font(GameFont.body(12, weight: .heavy)).tracking(1.2)
                .foregroundStyle(.white.opacity(0.7))
            HStack(spacing: 10) {
                if let m = r.speed_mult, m > 1.01 { chip(String(format: "Speed ×%.2f", m)) }
                if r.surged == true { chip("Surge ×1.5") }
            }
            if let s = r.stake_result {
                Text(s.won ? "Stake won: +\(s.stake)" : "Stake lost: −\(s.stake)")
                    .font(GameFont.display(18))
                    .foregroundStyle(s.won ? RunLook.gold : GamePalette.berry)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func raidPanel(_ r: DuelRaidOutcome) -> some View {
        VStack(spacing: 10) {
            Text("You dealt \(r.damage ?? 0) damage")
                .font(GameFont.display(22))
                .foregroundStyle(.white)
            RaidHPBar(hp: r.hp_left ?? 0, maxHP: r.hp_max ?? start?.raid?.hp_max ?? max(1, r.hp_left ?? 1))
            if r.defeated == true {
                Label("Boss defeated", systemImage: "crown.fill")
                    .font(GameFont.display(18))
                    .foregroundStyle(GamePalette.sun)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.10)))
    }

    private func chip(_ s: String) -> some View {
        Text(s).font(GameFont.body(13, weight: .heavy)).foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Capsule().fill(.white.opacity(0.16)))
    }

    private func rewardRow(_ r: DuelPay) -> some View {
        HStack(spacing: 18) {
            if (r.xp ?? 0) > 0 { stat(r.xp ?? 0, "XP") }
            if (r.faction_points ?? 0) > 0 { stat(r.faction_points ?? 0, "Faction") }
        }
        .padding(.vertical, 12).padding(.horizontal, 20)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.12)))
    }

    private func stat(_ n: Int, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text("+\(n)").font(GameFont.display(24).monospacedDigit()).foregroundStyle(.white)
            Text(label.uppercased()).font(GameFont.body(11, weight: .heavy)).foregroundStyle(.white.opacity(0.7))
        }
    }
}

// MARK: - Guardian Trials

/// Five ladders of faction bosses, playable anywhere.
struct TrialsSheet: View {
    let store: RoamStore
    var onFight: (DuelRequest) -> Void
    @Environment(\.dismiss) private var dismiss

    private var trials: [String: DuelMe.Trial] { store.me?.features?.duel?.trials ?? [:] }
    private var order: [String] {
        let known = (store.config?.factions ?? []).map(\.id).filter { trials[$0] != nil }
        return known + trials.keys.filter { !known.contains($0) }.sorted()
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Beat each faction's Guardians in a real fight, one rung at a time. "
                         + "Each rung pays the first time you clear it.")
                        .font(GameFont.body(14, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.65))
                        .fixedSize(horizontal: false, vertical: true)
                    if order.isEmpty {
                        Text("The Trials aren't open on this server yet.")
                            .font(GameFont.body(15, weight: .semibold))
                            .foregroundStyle(GamePalette.mist)
                            .padding(.top, 20)
                    }
                    ForEach(order, id: \.self) { f in
                        if let t = trials[f] { ladder(f, t) }
                    }
                }
                .padding(18)
            }
            .background(GamePalette.ice.opacity(0.35).ignoresSafeArea())
            .navigationTitle("Guardian Trials")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.font(GameFont.body(16, weight: .bold))
                }
            }
        }
        .gameType()
    }

    private func ladder(_ faction: String, _ t: DuelMe.Trial) -> some View {
        let tint = RoamStyle.realmColor(faction)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: RoamStyle.realmSymbol(faction))
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(tint))
                VStack(alignment: .leading, spacing: 1) {
                    Text(store.factionName(faction)).font(GameFont.display(19)).foregroundStyle(GamePalette.ink)
                    Text("\(t.cleared) of \(t.rungs) cleared".uppercased())
                        .font(GameFont.body(11, weight: .heavy)).tracking(0.4)
                        .foregroundStyle(GamePalette.ink.opacity(0.5))
                }
                Spacer()
            }
            // One pip per rung: the ladder at a glance.
            HStack(spacing: 5) {
                ForEach(1...max(1, t.rungs), id: \.self) { r in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(r <= t.cleared ? tint : GamePalette.track)
                        .frame(height: 8)
                }
            }
            .accessibilityHidden(true)
            HStack(spacing: 10) {
                if let next = t.next {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("NEXT · RUNG \(next.rung)")
                            .font(GameFont.body(10, weight: .heavy)).tracking(0.5)
                            .foregroundStyle(GamePalette.mist)
                        Text(next.name).font(GameFont.display(16)).foregroundStyle(GamePalette.ink)
                            .lineLimit(1).minimumScaleFactor(0.8)
                        Text("Level \(next.level)").font(GameFont.body(12, weight: .bold))
                            .foregroundStyle(GamePalette.ink.opacity(0.6))
                    }
                    Spacer(minLength: 4)
                    if t.cleared > 0 {
                        Button("Replay") { fight(.trial(faction: faction, rung: t.cleared)) }
                            .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
                    }
                    Button("Fight") { fight(.trial(faction: faction, rung: nil)) }
                        .buttonStyle(.game(tint, size: .small, fullWidth: false))
                } else {
                    Text("Every Guardian beaten.")
                        .font(GameFont.display(16)).foregroundStyle(GamePalette.ink)
                    Spacer()
                    Button("Replay") { fight(.trial(faction: faction, rung: t.rungs)) }
                        .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(GamePalette.cream)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(GamePalette.slate).offset(y: 4))
        )
        .padding(.bottom, 4)
        .accessibilityElement(children: .contain)
    }

    private func fight(_ r: DuelRequest) {
        dismiss()
        // After the sheet has gone, so the fight isn't presented under it.
        Task {
            try? await Task.sleep(for: .milliseconds(350))
            onFight(r)
        }
    }
}

// MARK: - Your Guardian's stance

/// How your hero fights when a rival sieges a point you took. On the Hero tab.
struct GuardianStancePicker: View {
    let duel: DuelMe
    let api: GameClient
    var onChanged: (String) -> Void

    @State private var picked: String?
    @State private var saving = false
    @State private var problem: String?

    private var current: String? { picked ?? duel.stance }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("GUARDIAN STANCE")
                .font(GameFont.display(13)).tracking(0.8)
                .foregroundStyle(GamePalette.mist)
            Text("How your hero fights when a rival sieges a point you hold."
                 + (duel.stance_is_default == true && picked == nil ? " Your faction's default for now." : ""))
                .font(GameFont.body(13, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
            ForEach(DuelLook.stances, id: \.id) { s in
                Button { choose(s.id) } label: {
                    HStack(spacing: 12) {
                        Image(systemName: current == s.id ? "largecircle.fill.circle" : "circle")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(current == s.id ? GamePalette.sunDeep : GamePalette.mist)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.name).font(GameFont.display(16)).foregroundStyle(GamePalette.ink)
                            Text(s.line).font(GameFont.body(12, weight: .semibold))
                                .foregroundStyle(GamePalette.ink.opacity(0.6))
                        }
                        Spacer()
                        if saving, picked == s.id { ProgressView() }
                    }
                    .padding(.vertical, 8).padding(.horizontal, 12)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(current == s.id ? GamePalette.sun.opacity(0.14) : GamePalette.ice.opacity(0.35)))
                }
                .buttonStyle(.plain)
                .disabled(saving)
                .accessibilityAddTraits(current == s.id ? .isSelected : [])
            }
            if let problem {
                Text(problem).font(GameFont.body(13, weight: .semibold)).foregroundStyle(GamePalette.berry)
            }
        }
    }

    private func choose(_ id: String) {
        guard id != current, !saving else { return }
        let before = picked
        picked = id
        saving = true
        problem = nil
        Task {
            do {
                let s = try await DuelModel.setStance(api, id)
                picked = s
                onChanged(s)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } catch {
                picked = before
                problem = error.localizedDescription
            }
            saving = false
        }
    }
}

#if DEBUG
// MARK: - Previews for checking screens (-duelResult won|lost|held)

/// The result screen with a made-up fight, for the simulator build, where no
/// real fight can run.
struct DuelResultPreview: View {
    let kind: String
    let store: RoamStore
    var onDone: () -> Void

    var body: some View {
        ZStack {
            DuelLook.stage.ignoresSafeArea()
            if kind == "stance", let duel = store.me?.features?.duel {
                // The Hero tab's picker, on its own, for a screenshot.
                GuardianStancePicker(duel: duel, api: store.api) { _ in store.featureChanged() }
                    .padding(20)
                    .background(RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(GamePalette.cream))
                    .padding(18)
            } else if kind == "pause" {
                BattlePauseView(title: "Final Guard of Big Ben", place: "Big Ben",
                                tint: RoamStyle.realmColor("gaming"), onResume: onDone, onLeave: onDone)
            } else if let (outcome, start) = Self.sample(kind) {
                DuelResultView(outcome: outcome, start: start, store: store,
                               onAgain: kind == "lost" ? {} : nil, onDone: onDone)
            }
        }
        .gameType()
    }

    static func sample(_ kind: String) -> (DuelOutcome, DuelStart)? {
        let setup = """
        {"duel_id":"preview","mode":"siege","target":"L1","status":"live","seed":7,"tick_hz":60,
         "setup":{"seed":7,"round_ticks":3600,"tick_hz":60,
           "p1":{"name":"Tester","faction":"gaming","weapon_class":"blade","level":6,"max_hp":1200,"attack":240,"defence_bp":250,"relic":null,"ai":null},
           "p2":{"name":"Guardian of Anime","faction":"anime","weapon_class":"fists","level":7,"max_hp":1380,"attack":248,"defence_bp":300,"relic":null,
                 "ai":{"stance":"aggressive","personality":"anime","reaction_ticks":16,"aggression":0.7,"block_bias":0.3,"dodge_bias":0.3,"special_use":"greedy"}}},
         "siege":{"siege_id":"s1","point_id":"L1","point_name":"Big Ben","faction_attacked":"anime","faction_attacked_name":"Anime","hold_strength":60},
         "started_at":"2026-09-28T12:00:00+00:00","expires_at":"2026-09-28T12:05:00+00:00","expires_in_s":300,"resumed":false}
        """
        let status = ["won", "lost", "held"].contains(kind) ? kind : "won"
        let result = status == "won" ? #"{"winner":1,"ticks":2280,"p1_hp":430,"p2_hp":0}"#
                                     : #"{"winner":2,"ticks":2610,"p1_hp":0,"p2_hp":510}"#
        let reward = status == "won"
            ? #"{"xp":180,"coins":25,"faction_points":40,"lines":[]}"#
            : status == "lost" ? #"{"xp":20,"coins":0,"faction_points":0,"lines":[]}"# : "null"
        let outcome = """
        {"duel_id":"preview","mode":"siege","status":"\(status)","repeat":false,"result":\(result),"reward":\(reward),
         "siege":{"siege_id":"s1","point_id":"L1","point_name":"Big Ben","faction_attacked":"anime","faction_attacked_name":"Anime","hold_strength":60}
         \(status == "held" ? #","message":"This fight is being checked. If it was fair, it will count.""# : "")}
        """
        let d = JSONDecoder()
        guard let s = try? d.decode(DuelStart.self, from: Data(setup.utf8)),
              let o = try? d.decode(DuelOutcome.self, from: Data(outcome.utf8)) else { return nil }
        return (o, s)
    }
}

struct DuelPreviewBox: Identifiable { let id: String }
#endif
