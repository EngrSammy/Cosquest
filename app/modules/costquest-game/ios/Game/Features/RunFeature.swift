import CoreLocation
import SwiftUI
import UIKit

// FEATURE: run. The Quest Run, the core loop from Mark's product overview:
// "the real world is the game board, your phone is the scorecard".
//
// A run is fifteen minutes and ten Quest Points of different value. Near
// trivia is worth 100, a comic-scene puzzle three streets away is worth 400,
// and the route you choose between them is the game. Everyone in a city races
// the same clock and the same score budget on the day's Bounty Board, without
// having to be online at the same moment, so a 200 ms round trip to the
// server never decides anything.
//
// Pocket runs are the same ten challenges with no walking, for a sofa or a
// bus: XP only, not on the board.
//
// Spec: costquest-research/11_quest_run.md. The server deals, times, marks
// and pays; this file stages it.

// MARK: - Wire

struct RunPoint: Decodable, Sendable, Equatable, Identifiable {
    let idx: Int
    let id: String
    let name: String
    let lat: Double?
    let lng: Double?
    let value: Int
    let kind: String?
    let tier: String?
    let realm: String?
    let done: Bool
    let earned: Int
    let hidden: Bool
    let forbidden: Bool
}

struct RunPowers: Decodable, Sendable, Equatable {
    let radar: Int
    let surge: Int
}

struct RunState: Decodable, Sendable, Equatable {
    let run_id: String
    /// daily | pocket
    let mode: String
    let region: String
    let day: String
    let started_at: String
    let ends_at: String
    let remaining_s: Double
    let score: Int
    let finished: Bool
    let powers: RunPowers
    let surge_armed: Bool
    let points: [RunPoint]

    var isPocket: Bool { mode == "pocket" }
    var doneCount: Int { points.filter(\.done).count }
}

struct RunCurrent: Decodable, Sendable {
    let run: RunState?
    /// The finish, when this call settled a run that ran out while the app
    /// was closed: the player still gets their results screen.
    let settled: RunFinish?
}

struct RunAnswerResult: Decodable, Sendable, Equatable {
    struct Stake: Decodable, Sendable, Equatable { let stake: Int; let won: Bool }
    let correct: Int
    let total: Int
    let reveal: RoamVerdict.Reveal
    let late: Bool
    let earned: Int
    let speed_mult: Double
    let surged: Bool
    let stake_result: Stake?
    let run: RunState
}

struct RunFinish: Decodable, Sendable, Equatable {
    let run: RunState
    let reward: RoamVerdict.Reward
    let before: RoamStanding
    let after: RoamStanding
    let leveled_up: Bool
    let rank_up: Bool
    let board_place: Int?
    /// The UTC day the run belongs to: the day it started, even if it
    /// finished after midnight. The board is asked for this day.
    var board_day: String?
}

/// /run/open's reply: the challenge (the same shape as a Roam attempt), plus
/// the stake the server holds for it, which is the truth for a resumed one.
struct RunOpened: Decodable, Sendable {
    let attempt: RoamAttempt
    let stake: Int

    private enum Keys: String, CodingKey { case stake }

    init(from decoder: Decoder) throws {
        attempt = try RoamAttempt(from: decoder)
        stake = try decoder.container(keyedBy: Keys.self).decodeIfPresent(Int.self, forKey: .stake) ?? 0
    }
}

struct RunBoard: Decodable, Sendable, Equatable {
    struct Entry: Decodable, Sendable, Equatable, Identifiable {
        let place: Int
        let handle: String
        let faction: String?
        let score: Int
        let points_done: Int
        let you: Bool
        var id: Int { place }
    }
    struct Faction: Decodable, Sendable, Equatable, Identifiable {
        let faction: String
        let name: String
        let total: Int
        var id: String { faction }
    }
    struct You: Decodable, Sendable, Equatable {
        let place: Int
        let score: Int
        /// Deep in the crowd the server estimates the place from a cached
        /// count rather than counting everyone above (review 17, N4).
        var approx: Bool?
    }
    let region: String
    let day: String
    let entries: [Entry]
    let factions: [Faction]
    let you: You?
    /// When this board closes: 00:00 UTC the next day.
    var resets_at: String?

    /// Everyone outside a mapped city shares one board.
    var isWorld: Bool { region == "world" }
}

private struct RunStartBody: Encodable, Sendable {
    let device_key: String
    let mode: String
    let lat: Double?
    let lng: Double?
    let accuracy_m: Double?
}

private struct RunOpenBody: Encodable, Sendable {
    let device_key: String
    let run_id: String
    let idx: Int
    let lat: Double?
    let lng: Double?
    let accuracy_m: Double?
    let stake: Bool
}

private struct RunAnswerBody: Encodable, Sendable {
    let device_key: String
    let run_id: String
    let attempt_id: String
    let answers: [RoamAnswer]
}

private struct RunPowerBody: Encodable, Sendable {
    let device_key: String
    let run_id: String
    let power: String
}

private struct RunIDBody: Encodable, Sendable {
    let device_key: String
    let run_id: String
}

// MARK: - Model

@MainActor
@Observable
final class RunModel {
    static let shared = RunModel()

    private(set) var run: RunState?
    private(set) var board: RunBoard?
    /// Set when a run settles; the results screen reads it.
    var finished: RunFinish?
    /// Why the last start failed: shown on the start sheet.
    var problem: String?
    /// Something that went wrong mid-run (a power, a finish, a point): shown
    /// on the HUD for a few seconds, where the player is looking.
    private(set) var notice: String?
    /// The stake the server holds per opened point, so re-entering a
    /// Forbidden Zone that is already open does not ask again.
    private(set) var openedStakes: [Int: Int] = [:]
    private(set) var busy = false
    /// The deadline on this phone's clock, from the server's seconds left,
    /// for the same reason the challenge clock does it (see EncounterView).
    private(set) var localEnd: Date?

    var live: Bool { run.map { !$0.finished } ?? false }

    /// The server's view of the run: picked up again after the app was
    /// killed or backgrounded, and asked at 0:00 so the SERVER settles it.
    /// False when the server could not be reached; the caller retries.
    @discardableResult
    func resume(_ store: RoamStore) async -> Bool {
        guard let key = try? await store.api.deviceKey(),
              let got = try? await store.api.roamGet(
                "v1/roam/run/current", query: [URLQueryItem(name: "device_key", value: key)],
                as: RunCurrent.self) else { return false }
        if let s = got.settled {
            run = s.run
            localEnd = nil
            finished = s
            GameSound.shared.play(.fanfare)
            if !s.run.isPocket { await loadBoard(store, day: s.board_day) }
            store.featureChanged()
        } else if let held = run, finished == nil, got.run?.run_id != held.run_id || got.run?.finished == true {
            // The run this phone was holding was settled by someone else: the
            // board's sweep, or a call that closed it. /current no longer
            // knows it, but /finish is idempotent and hands back the stored
            // result, so the player still gets their results screen (review
            // 17, N1). A different live run (started elsewhere) comes after.
            await finish(store)
            if finished == nil, let other = got.run, other.run_id != held.run_id { apply(other) }
        } else if got.run != nil || finished == nil {
            apply(got.run)
        }
        #if DEBUG
        // -runStart daily|pocket: start a run on launch, for checking screens.
        if run == nil, let mode = UserDefaults.standard.string(forKey: "runStart") {
            _ = await start(store, mode: mode)
        }
        #endif
        return true
    }

    /// A daily run is dealt around the phone's fix, so it needs a good one:
    /// the server refuses worse than this, and the button says why first.
    static let dailyAccuracyM = 50.0

    func canRunDaily(_ store: RoamStore) -> String? {
        if store.coordinate == nil { return "Turn on location to run the streets." }
        if store.locationIsRough || store.accuracy > Self.dailyAccuracyM {
            return "Waiting for a precise location (turn on Precise Location, or step outside)."
        }
        return nil
    }

    func start(_ store: RoamStore, mode: String) async -> Bool {
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        problem = nil
        let here = store.coordinate
        if mode == "daily", let why = canRunDaily(store) {
            problem = why
            return false
        }
        do {
            let key = try await store.api.deviceKey()
            let r = try await store.api.roamPost("v1/roam/run/start", body: RunStartBody(
                device_key: key, mode: mode, lat: here?.latitude, lng: here?.longitude,
                accuracy_m: here == nil ? nil : store.accuracy), as: RunState.self)
            apply(r)
            finished = nil
            openedStakes = [:]
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return true
        } catch GameClient.ClientError.http(status: 409, _) {
            // A run is already on (another tap, or one this phone lost track
            // of): take it up rather than show a dead end.
            if await resume(store), live { return true }
            problem = "A run is already on. Try again in a moment."
            return false
        } catch {
            problem = error.localizedDescription
            return false
        }
    }

    func open(_ store: RoamStore, _ p: RunPoint, stake: Bool) async throws -> RunOpened {
        guard let run else { throw RoamError.noLocation }
        let here = store.coordinate
        let key = try await store.api.deviceKey()
        do {
            let o = try await store.api.roamPost("v1/roam/run/open", body: RunOpenBody(
                device_key: key, run_id: run.run_id, idx: p.idx,
                lat: here?.latitude, lng: here?.longitude,
                accuracy_m: here == nil ? nil : store.accuracy, stake: stake), as: RunOpened.self)
            openedStakes[p.idx] = o.stake
            return o
        } catch {
            // A refused open ("that point's done", "the run is over") means
            // the tray is out of date: ask the server what the run looks like.
            Task { await resume(store) }
            throw error
        }
    }

    func answer(_ store: RoamStore, _ a: RoamAttempt, _ answers: [RoamAnswer]) async throws -> RunAnswerResult {
        guard let run else { throw RoamError.noLocation }
        let key = try await store.api.deviceKey()
        let r = try await store.api.roamPost("v1/roam/run/answer", body: RunAnswerBody(
            device_key: key, run_id: run.run_id, attempt_id: a.attempt_id, answers: answers),
            as: RunAnswerResult.self)
        apply(r.run)
        // This answer's call settled the run: fetch the results now, because
        // watchEnd stops once the run reads finished (review 17, N1).
        if r.run.finished, finished == nil { Task { await finish(store) } }
        return r
    }

    func use(_ store: RoamStore, _ power: String) async {
        guard let run, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            apply(try await store.api.roamPost("v1/roam/run/power", body: RunPowerBody(
                device_key: key, run_id: run.run_id, power: power), as: RunState.self))
            GameSound.shared.play(.tap)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        } catch {
            flash(error.localizedDescription)
            await resume(store)
        }
    }

    func finish(_ store: RoamStore) async {
        guard let run, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            let f = try await store.api.roamPost("v1/roam/run/finish", body: RunIDBody(
                device_key: key, run_id: run.run_id), as: RunFinish.self)
            self.run = f.run
            finished = f
            localEnd = nil
            GameSound.shared.play(.fanfare)
            if !f.run.isPocket { await loadBoard(store, day: f.board_day) }
            store.featureChanged()
        } catch {
            flash("Couldn't end the run: \(error.localizedDescription)")
        }
    }

    /// The run's end, level-triggered: wait out the clock plus the server's
    /// answer grace (4 s, knob grace_s) and a second more, then ask the
    /// server, which settles it. Ending it from the phone at 0:00 cut off an
    /// answer still in flight, stake and all (review 14, #7). Loops until the
    /// run is over, so a failed ask or a busy moment never leaves the clock
    /// stuck at 0:00 (#11).
    func watchEnd(_ store: RoamStore) async {
        while live, !Task.isCancelled {
            let wait = (localEnd ?? Date()).timeIntervalSinceNow + Self.serverGraceS + 1
            if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
            guard !Task.isCancelled, live else { return }
            if !(await resume(store)) { try? await Task.sleep(for: .seconds(3)) }
        }
    }

    static let serverGraceS = 4.0

    /// Today's runs left, from /me's `features.run`, for the start sheet.
    private(set) var pocketRunsLeft: Int?
    private(set) var dailyRunsLeft: Int?

    private struct MeRuns: Decodable {
        struct Features: Decodable {
            struct Run: Decodable { let daily_runs_left: Int?; let pocket_runs_left: Int? }
            let run: Run?
        }
        let features: Features?
    }

    func loadAllowance(_ store: RoamStore) async {
        guard let key = try? await store.api.deviceKey(),
              let me = try? await store.api.roamGet(
                "v1/roam/me", query: [URLQueryItem(name: "device_key", value: key)],
                as: MeRuns.self) else { return }
        pocketRunsLeft = me.features?.run?.pocket_runs_left
        dailyRunsLeft = me.features?.run?.daily_runs_left
    }

    func loadBoard(_ store: RoamStore, day: String? = nil) async {
        guard let here = store.coordinate else { return }
        let key = try? await store.api.deviceKey()
        var query = [URLQueryItem(name: "lat", value: "\(here.latitude)"),
                     URLQueryItem(name: "lng", value: "\(here.longitude)"),
                     URLQueryItem(name: "device_key", value: key)]
        if let day { query.append(URLQueryItem(name: "day", value: day)) }
        board = try? await store.api.roamGet("v1/roam/run/board", query: query, as: RunBoard.self)
    }

    private var noticeTask: Task<Void, Never>?

    func flash(_ text: String) {
        notice = text
        noticeTask?.cancel()
        noticeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            self?.notice = nil
        }
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    /// Once the results are closed, the run is over for the phone too.
    func close() {
        finished = nil
        run = nil
        localEnd = nil
        openedStakes = [:]
    }

    /// A run point fought as a duel comes back with the run as the server now
    /// has it: the score, the point done, the powers used.
    func adopt(_ r: RunState) { apply(r) }

    private func apply(_ r: RunState?) {
        run = r
        localEnd = r.map { Date().addingTimeInterval($0.remaining_s) }
    }

    // MARK: Map

    /// Run points as map objects, for the home world. Hidden and pocket
    /// points have no place on a map.
    func questPoints() -> [QuestPoint] {
        guard let run, !run.isPocket else { return [] }
        return run.points.compactMap { p in
            guard let lat = p.lat, let lng = p.lng, !p.hidden else { return nil }
            return QuestPoint(id: Self.objectID(p), name: p.name, lat: lat, lng: lng,
                              source: "run", place_kind: "", tier: RunLook.tier(p.value),
                              realm: p.realm ?? "", challenge: p.kind ?? "trivia",
                              distance_m: nil,
                              // A played point shows as spent, the way a
                              // recharging shrine does.
                              cooling_until: p.done ? "9999-12-31T00:00:00Z" : nil)
        }
    }

    static func objectID(_ p: RunPoint) -> String { "run:\(p.idx)" }

    func point(forObject id: String) -> RunPoint? {
        guard id.hasPrefix("run:"), let i = Int(id.dropFirst(4)) else { return nil }
        return run?.points.first { $0.idx == i }
    }
}

// MARK: - Look

enum RunLook {
    static let gold = Color(red: 0.98, green: 0.74, blue: 0.16)
    static let forbidden = Color(red: 0.62, green: 0.16, blue: 0.86)
    static let stage = LinearGradient(colors: [GamePalette.navy, GamePalette.navyEdge],
                                      startPoint: .top, endPoint: .bottom)

    /// Value to tier colour, so a 400 reads as rare from across the map.
    static func tier(_ value: Int) -> String {
        value >= 300 ? "epic" : value >= 200 ? "rare" : "common"
    }

    /// 00:00 UTC, when the day's runs and board reset, in the phone's time.
    static func resetTime() -> String {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let next = utc.nextDate(after: Date(), matching: DateComponents(hour: 0, minute: 0),
                                matchingPolicy: .nextTime) ?? Date()
        return next.formatted(date: .omitted, time: .shortened)
    }

    /// "+240", or "−150" for a stake lost.
    static func signed(_ n: Int) -> String { n < 0 ? "\u{2212}\(abs(n))" : "+\(n)" }

    static func clock(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded(.up)))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

// MARK: - Start

/// The headline button on the home screen.
struct QuestRunButton: View {
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: "flag.checkered")
                    .font(.system(size: 20, weight: .heavy))
                VStack(alignment: .leading, spacing: 0) {
                    Text("QUEST RUN").font(GameFont.display(20)).tracking(0.8)
                    Text("15 minutes. Ten points. Pick your route.")
                        .font(GameFont.body(12, weight: .bold))
                        .opacity(0.8)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 15, weight: .heavy))
            }
        }
        .buttonStyle(.game(GamePalette.sun))
        .accessibilityLabel("Start a Quest Run")
    }
}

/// Daily or Pocket, then the countdown.
struct RunStartSheet: View {
    let store: RoamStore
    let model: RunModel
    var onStarted: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var counting: Int?

    var body: some View {
        Group {
            if let n = counting {
                countdown(n)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Quest Run").font(GameFont.display(30)).foregroundStyle(GamePalette.ink)
                        Text("Ten Quest Points appear around you, each with its value on it. "
                             + "Close ones are quick. Far ones pay more. You have 15 minutes.")
                            .font(GameFont.body(15, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                            .fixedSize(horizontal: false, vertical: true)
                        let dailyOut = model.dailyRunsLeft == 0
                        let dailyBlock = dailyOut ? "That's today's runs done. Back tomorrow."
                            : model.canRunDaily(store)
                        modeButton("Daily Run", "figure.walk",
                                   dailyBlock ?? "Walk to points nearby. On today's Bounty Board."
                                       + Self.left(model.dailyRunsLeft),
                                   GamePalette.sun, mode: "daily")
                            .disabled(dailyBlock != nil)
                        let pocketOut = model.pocketRunsLeft == 0
                        modeButton("Pocket Run", "sofa.fill",
                                   pocketOut ? "That's today's Pocket Runs done. Back tomorrow."
                                       : "Indoors, no walking. XP only." + Self.left(model.pocketRunsLeft),
                                   GamePalette.skyDeep, mode: "pocket")
                            .disabled(pocketOut)
                        if let p = model.problem {
                            Text(p).font(GameFont.body(14, weight: .semibold))
                                .foregroundStyle(GamePalette.berry)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Text("Days reset at \(RunLook.resetTime()) your time.")
                            .font(GameFont.body(12, weight: .semibold))
                            .foregroundStyle(GamePalette.mist)
                    }
                    .padding(22)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(GamePalette.cream.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .gameType()
        .onAppear { model.problem = nil }
        .task { await model.loadAllowance(store) }
    }

    private static func left(_ n: Int?) -> String {
        guard let n else { return "" }
        return n == 1 ? " 1 left today." : " \(n) left today."
    }

    private func modeButton(_ title: String, _ symbol: String, _ sub: String, _ color: Color,
                            mode: String) -> some View {
        Button {
            Task {
                guard await model.start(store, mode: mode) else { return }
                for n in [3, 2, 1] {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) { counting = n }
                    AccessibilityNotification.Announcement("\(n)").post()
                    GameSound.shared.play(.tap)
                    UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                    try? await Task.sleep(for: .milliseconds(650))
                }
                withAnimation { counting = 0 }
                AccessibilityNotification.Announcement("Go!").post()
                try? await Task.sleep(for: .milliseconds(450))
                dismiss()
                onStarted()
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol).font(.system(size: 22, weight: .heavy)).frame(width: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(GameFont.display(20))
                    Text(sub).font(GameFont.body(12, weight: .bold)).opacity(0.85)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.game(color))
        .disabled(model.busy)
    }

    private func countdown(_ n: Int) -> some View {
        Text(n == 0 ? "GO!" : "\(n)")
            .font(GameFont.display(120))
            .foregroundStyle(n == 0 ? GamePalette.mint : GamePalette.ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .id(n)
            .transition(.scale(scale: 1.8).combined(with: .opacity))
    }
}

// MARK: - In a run

/// The clock, the score and the two powers, under the top bar.
struct RunHUD: View {
    let store: RoamStore
    let model: RunModel

    var body: some View {
        if let run = model.run {
            VStack(spacing: 6) {
                // One row when it fits; clock and score over the powers when
                // big text or a small phone would clip it (review 14, #21).
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) {
                        stats(run)
                        Spacer(minLength: 0)
                        powers(run)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 10) { stats(run) }
                        HStack(spacing: 8) { powers(run) }
                    }
                }
                if let n = model.notice {
                    Label(n, systemImage: "exclamationmark.triangle.fill")
                        .font(GameFont.body(13, weight: .bold))
                        .foregroundStyle(GamePalette.berry)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity)
                        .accessibilityAddTraits(.updatesFrequently)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(GamePalette.cream)
                .shadow(color: .black.opacity(0.2), radius: 4, y: 3))
            .animation(.smooth, value: model.notice)
            .accessibilityElement(children: .contain)
            .task(id: run.run_id) { await model.watchEnd(store) }
        }
    }

    @ViewBuilder private func stats(_ run: RunState) -> some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { t in
            let left = model.localEnd.map { $0.timeIntervalSince(t.date) } ?? run.remaining_s
            Label(left > 0 ? RunLook.clock(left) : "Time!", systemImage: "timer")
                .font(GameFont.display(20).monospacedDigit())
                .foregroundStyle(left < 60 ? GamePalette.berry : GamePalette.ink)
                .lineLimit(1)
                .accessibilityLabel(left > 0 ? "\(Int(left.rounded(.up)) / 60) minutes "
                                    + "\(Int(left.rounded(.up)) % 60) seconds left" : "Time's up")
        }
        Divider().frame(height: 22)
        Text("\(run.score)")
            .font(GameFont.display(22).monospacedDigit())
            .foregroundStyle(GamePalette.ink)
            .contentTransition(.numericText())
            .animation(.smooth, value: run.score)
            .lineLimit(1)
            .accessibilityLabel("Score \(run.score)")
        Text("\(run.doneCount)/\(run.points.count)")
            .font(GameFont.body(12, weight: .bold))
            .foregroundStyle(GamePalette.mist)
            .lineLimit(1)
            .accessibilityLabel("\(run.doneCount) of \(run.points.count) points played")
    }

    @ViewBuilder private func powers(_ run: RunState) -> some View {
        power("dot.radiowaves.left.and.right", "Radar", left: run.powers.radar,
              hint: "Reveals the hidden bonus point") {
            Task { await model.use(store, "radar") }
        }
        power("bolt.fill", run.surge_armed ? "Armed" : "Surge", left: run.powers.surge,
              lit: run.surge_armed, hint: "Your next answer counts one and a half times") {
            Task { await model.use(store, "surge") }
        }
    }

    private func power(_ symbol: String, _ label: String, left: Int, lit: Bool = false,
                       hint: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 1) {
                Image(systemName: symbol).font(.system(size: 14, weight: .heavy))
                Text(label).font(GameFont.body(10, weight: .heavy))
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(lit ? .white : (left > 0 ? GamePalette.ink : GamePalette.mist.opacity(0.5)))
            .padding(.horizontal, 6)
            .frame(minWidth: 50, minHeight: 38)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(lit ? RunLook.gold : GamePalette.ice.opacity(left > 0 ? 1 : 0.4)))
        }
        .buttonStyle(CardPress())
        .disabled(left == 0 || model.busy)
        .accessibilityLabel(label)
        .accessibilityValue(lit ? "armed" : (left > 0 ? "1 left" : "used"))
        .accessibilityHint(hint)
    }
}

/// The run's points as cards, best value per metre first, so the route
/// decision is in front of the player all the time.
struct RunTray: View {
    let store: RoamStore
    let model: RunModel
    var onPick: (RunPoint) -> Void
    var onEnd: () -> Void
    @State private var confirming = false

    var body: some View {
        if let run = model.run {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(run.isPocket ? "POCKET RUN" : "YOUR ROUTE")
                        .font(GameFont.display(13)).tracking(1.4)
                    Spacer()
                    // One stray tap used to end a daily run, and a daily run
                    // is one of three a day (review 14, #13).
                    Button("End run") { confirming = true }
                        .font(GameFont.body(13, weight: .heavy))
                        .confirmationDialog("End this run now?", isPresented: $confirming,
                                            titleVisibility: .visible) {
                            Button("End run", role: .destructive, action: onEnd)
                            Button("Keep running", role: .cancel) {}
                        } message: {
                            Text("You keep the \(run.score) points you have."
                                 + (run.isPocket ? "" : " It counts as one of today's runs."))
                        }
                }
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.55), radius: 2, y: 1)
                .padding(.horizontal, 18)
                if run.isPocket {
                    // A Pocket Run is a board of ten tiles, not a route: no
                    // map, nothing to walk to (spec; review 14, #20).
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)],
                                  spacing: 12) {
                            ForEach(ordered(run)) { p in card(p, run, width: nil) }
                        }
                        .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 8)
                    }
                    .frame(maxHeight: 460)
                    .background(RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(GamePalette.navy.opacity(0.55)))
                    .padding(.horizontal, 8)
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(ordered(run)) { p in card(p, run, width: 150) }
                        }
                        .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 8)
                    }
                }
            }
        }
    }

    private func card(_ p: RunPoint, _ run: RunState, width: CGFloat?) -> some View {
        Button { onPick(p) } label: {
            RunCard(point: p, distance: distance(p, run),
                    inReach: run.isPocket || inReach(p), pocket: run.isPocket, width: width)
        }
        .buttonStyle(CardPress())
        .disabled(p.done || p.hidden)
    }

    private func ordered(_ run: RunState) -> [RunPoint] {
        run.points.sorted { a, b in
            if a.done != b.done { return !a.done }
            if a.hidden != b.hidden { return !a.hidden }
            return worth(a, run) > worth(b, run)
        }
    }

    /// Points per 100 m of walking: the sum a runner does in their head.
    private func worth(_ p: RunPoint, _ run: RunState) -> Double {
        guard let d = distance(p, run) else { return Double(p.value) }
        return Double(p.value) / max(1, d / 100 + 0.5)
    }

    private func distance(_ p: RunPoint, _ run: RunState) -> Double? {
        guard !run.isPocket, let lat = p.lat, let lng = p.lng, let here = store.coordinate else { return nil }
        return CLLocation(latitude: here.latitude, longitude: here.longitude)
            .distance(from: CLLocation(latitude: lat, longitude: lng))
    }

    private func inReach(_ p: RunPoint) -> Bool {
        guard let run = model.run, let d = distance(p, run) else { return false }
        return d <= store.reachM
    }
}

struct RunCard: View {
    let point: RunPoint
    let distance: Double?
    let inReach: Bool
    var pocket = false
    /// Fixed in the route tray; nil fills a grid cell on the pocket board.
    var width: CGFloat? = 150

    private var tint: Color {
        point.forbidden ? RunLook.forbidden : RoamStyle.tierColor(RunLook.tier(point.value))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(point.done ? RunLook.signed(point.earned) : "\(point.value)")
                    .font(GameFont.display(26).monospacedDigit())
                    .foregroundStyle(point.done ? (point.earned < 0 ? GamePalette.berry : GamePalette.mint) : tint)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                if point.hidden {
                    Image(systemName: "questionmark.circle.fill").foregroundStyle(GamePalette.mist)
                } else if !point.done {
                    Text(inReach ? "HERE" : RoamStyle.distance(distance))
                        .font(GameFont.display(13).monospacedDigit())
                        .foregroundStyle(inReach ? GamePalette.mint : GamePalette.mist)
                }
            }
            Text(point.hidden ? "Hidden bonus" : point.name)
                .font(GameFont.display(15))
                .foregroundStyle(GamePalette.ink)
                .lineLimit(2, reservesSpace: true)
            Text(subline.uppercased())
                .font(GameFont.body(10, weight: .heavy)).tracking(0.4)
                .foregroundStyle(point.forbidden ? RunLook.forbidden : GamePalette.ink.opacity(0.5))
                .lineLimit(1)
        }
        .padding(12)
        .frame(width: width, alignment: .leading)
        .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(GamePalette.cream)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(inReach && !point.done ? GamePalette.mint : GamePalette.slate)
                    .offset(y: 4))
        )
        .shadow(color: .black.opacity(0.18), radius: 3, y: 3)
        .padding(.bottom, 4)
        .opacity(point.done ? 0.6 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    private var accessibility: String {
        var parts = [point.hidden ? "Hidden bonus" : point.name]
        if point.done {
            parts.append("done, \(point.earned < 0 ? "lost" : "scored") \(abs(point.earned)) points")
        } else {
            parts.append("\(point.value) points")
            parts.append(subline)
            if !point.hidden {
                parts.append(inReach ? (pocket ? "ready to play" : "in reach")
                             : RoamStyle.distance(distance) + " away")
            }
        }
        return parts.joined(separator: ", ")
    }

    private var subline: String {
        if point.done { return "Done" }
        if point.hidden { return "Use Radar to find it" }
        if point.forbidden { return "Forbidden Zone" }
        return RoamStyle.challengeName(point.kind ?? "duel")
    }
}

// MARK: - One point

/// A run's challenge: quick, no shrine ceremony, because the clock is running.
struct RunChallengeView: View {
    let store: RoamStore
    let model: RunModel
    let point: RunPoint
    var onDone: () -> Void

    private enum Phase: Equatable { case stake, opening, playing, submitting, result, failed(String) }

    @State private var phase: Phase = .opening
    @State private var attempt: RoamAttempt?
    @State private var result: RunAnswerResult?
    @State private var localDeadline: Date?
    @State private var picked: Int?
    @State private var order: [String] = []
    @State private var blitz: [Int] = []
    @State private var blitzShowing = 0
    @State private var staked = false
    /// Set when this point is fought (the server's `run_duel`), not quizzed.
    @State private var duel: DuelRequest?

    private var useDuel: Bool { DuelModes.run(point.kind, store) }

    var body: some View {
        if let duel {
            DuelView(store: store, request: duel) { outcome in
                if let run = outcome?.run?.run { model.adopt(run) }
                onDone()
            }
        } else {
            quizBody
        }
    }

    /// Opens the point: a 30 second duel where the server fights run points,
    /// the quiz challenge otherwise.
    private func go() async {
        if useDuel, let runID = model.run?.run_id {
            duel = .run(runID: runID, idx: point.idx, stake: staked, name: point.name, value: point.value)
        } else {
            await open()
        }
    }

    private var quizBody: some View {
        ZStack {
            // Dark, like the shrine stage: the challenge cards are drawn in
            // white, and the clock is running, so nothing competes with them.
            RunLook.stage.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                header
                switch phase {
                case .stake: stakeChoice
                case .opening: Spacer(); HStack { Spacer(); ProgressView().tint(.white); Spacer() }; Spacer()
                case .failed(let why): failed(why)
                case .playing, .submitting, .result:
                    if let a = attempt { ScrollView { challenge(a) }.scrollIndicators(.hidden) }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
        }
        .gameType()
        .task {
            // Re-entering a Forbidden Zone already open: the server holds its
            // stake, so there is nothing to choose (review 14, #18).
            if let held = model.openedStakes[point.idx] {
                staked = held > 0
                await go()
            } else if point.forbidden {
                phase = .stake
            } else {
                await go()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(point.name).font(GameFont.display(22)).foregroundStyle(.white).lineLimit(2)
                Text("\(RoamStyle.challengeName(useDuel ? "duel" : (point.kind ?? "trivia"))) · \(point.value) points"
                     + (staked ? " · STAKED" : ""))
                    .font(GameFont.body(13, weight: .heavy))
                    .foregroundStyle(.white.opacity(0.75))
            }
            Spacer()
            if phase != .submitting {
                Button { onDone() } label: {
                    Image(systemName: phase == .result ? "checkmark" : "xmark")
                        .font(.system(size: 15, weight: .black))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(.white.opacity(0.18)))
                        .foregroundStyle(.white)
                }
                .accessibilityLabel(phase == .result ? "Back to the run" : "Leave")
            }
        }
    }

    private var stakeChoice: some View {
        let stake = (model.run?.score ?? 0) / 2
        return VStack(alignment: .leading, spacing: 14) {
            Spacer()
            Text("Forbidden Zone").font(GameFont.display(34)).foregroundStyle(.white)
            Text(stake > 0
                 ? (useDuel ? "Stake \(stake) of your points. Win the fight and win \(stake) more. Lose it and lose them."
                            : "Stake \(stake) of your points. Get it all right and win \(stake) more. Miss anything and lose them.")
                 : "Nothing to stake yet. Score somewhere else first, or play it for its 200.")
                .font(GameFont.body(17, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
            if stake > 0 {
                Button("Stake \(stake)") { staked = true; Task { await go() } }
                    .buttonStyle(.game(RunLook.forbidden))
            }
            Button("Play it safe") { Task { await go() } }
                .buttonStyle(.game(GamePalette.skyDeep))
            Spacer()
        }
    }

    private func failed(_ why: String) -> some View {
        VStack(spacing: 16) {
            Spacer()
            Text(why).font(GameFont.display(22)).foregroundStyle(.white).multilineTextAlignment(.center)
            Button("Back to the run") { onDone() }.buttonStyle(.game(GamePalette.sun))
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    /// A run's verdict says right or wrong, not which choice was right (the
    /// server keeps the key: review 14, #3). The cards draw a reveal from
    /// `correct`, so right lights the pick green and wrong marks only the
    /// pick, with no answer shown.
    private func shownReveal(_ a: RoamAttempt) -> RoamVerdict.Reveal? {
        guard phase == .result, let r = result?.reveal else { return nil }
        switch a.kind {
        case "blitz":
            let marks = r.marks ?? []
            return RoamVerdict.Reveal(correct: blitz.enumerated().map { i, pick in
                i < marks.count && marks[i] ? pick : -1 }, marks: marks)
        case "sequence":
            return nil
        default:
            let right = r.marks?.first ?? false
            return RoamVerdict.Reveal(correct: [right ? (picked ?? -1) : -1], marks: r.marks)
        }
    }

    @ViewBuilder private func challenge(_ a: RoamAttempt) -> some View {
        let reveal = shownReveal(a)
        VStack(alignment: .leading, spacing: 14) {
            if phase == .result, let r = result {
                resultPanel(r)
            } else {
                DeadlineBar(deadline: localDeadline ?? Date().addingTimeInterval(Double(a.seconds)),
                            total: Double(a.seconds))
            }
            switch a.kind {
            case "sequence" where phase == .result:
                let right = result?.reveal.positions_right ?? 0
                let n = a.challenge.beats?.count ?? 4
                Text(right == n ? "All \(n) in the right order." : "\(right) of \(n) in the right place.")
                    .font(GameFont.display(22))
                    .foregroundStyle(right == n ? GamePalette.mint : .white)
            case "sequence":
                SequenceCard(prompt: a.challenge.prompt ?? "", beats: a.challenge.beats ?? [],
                             order: $order, reveal: reveal)
                if phase == .playing {
                    Button("Lock it in") { submit(a) }
                        .buttonStyle(.game(GamePalette.mint))
                        .disabled(order.count < (a.challenge.beats?.count ?? 4))
                }
            case "blitz":
                BlitzCard(questions: a.challenge.questions ?? [], answers: $blitz,
                          showing: $blitzShowing, reveal: reveal) { submit(a) }
            default:
                if a.kind == "quote" {
                    Text((a.challenge.prompt ?? "Who said it?").uppercased())
                        .font(GameFont.display(13)).tracking(1.2)
                        .foregroundStyle(RunLook.gold)
                }
                if let q = a.challenge.questions?.first {
                    TriviaCard(question: a.kind == "quote" ? quoted(q) : q,
                               picked: picked, reveal: reveal) { i in
                        picked = i
                        submit(a)
                    }
                }
            }
            if phase == .submitting { HStack { Spacer(); ProgressView().tint(.white); Spacer() } }
            if phase == .result {
                Button("Next point") { onDone() }.buttonStyle(.game(GamePalette.sun))
            }
        }
        .padding(.bottom, 40)
        .task(id: a.attempt_id) { await watchClock(a) }
    }

    private func quoted(_ q: RoamAttempt.Question) -> RoamAttempt.Question {
        RoamAttempt.Question(id: q.id, q: "\u{201C}\(q.q)\u{201D}", choices: q.choices,
                             difficulty: q.difficulty, clue: q.clue)
    }

    private func resultPanel(_ r: RunAnswerResult) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(r.late ? "Time's up" : r.earned > 0 ? "+\(r.earned)" : "No points")
                .font(GameFont.display(44).monospacedDigit())
                .foregroundStyle(r.earned > 0 ? GamePalette.mint : .white)
            HStack(spacing: 12) {
                if r.total > 1 { chip("\(r.correct) of \(r.total)") }
                if r.earned > 0, r.speed_mult > 1.01 { chip(String(format: "Speed ×%.2f", r.speed_mult)) }
                if r.surged { chip("Surge ×1.5") }
            }
            if let s = r.stake_result {
                Text(s.won ? "Stake won: +\(s.stake)" : "Stake lost: −\(s.stake)")
                    .font(GameFont.display(20))
                    .foregroundStyle(s.won ? RunLook.gold : GamePalette.berry)
            }
        }
    }

    private func chip(_ s: String) -> some View {
        Text(s).font(GameFont.body(13, weight: .heavy)).foregroundStyle(.white)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Capsule().fill(.white.opacity(0.16)))
    }

    private func open() async {
        phase = .opening
        do {
            let o = try await model.open(store, point, stake: staked)
            let a = o.attempt
            staked = o.stake > 0
            attempt = a
            localDeadline = Date().addingTimeInterval(a.remaining_s ?? Double(a.seconds))
            blitz = Array(repeating: -1, count: a.challenge.questions?.count ?? 0)
            phase = .playing
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    /// Submits when the clock runs out, with whatever is chosen. The server
    /// marks a late answer as lapsed either way.
    private func watchClock(_ a: RoamAttempt) async {
        guard let end = localDeadline else { return }
        let wait = end.timeIntervalSinceNow
        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
        guard !Task.isCancelled, phase == .playing else { return }
        submit(a)
    }

    private func submit(_ a: RoamAttempt) {
        guard phase == .playing else { return }
        phase = .submitting
        let answers: [RoamAnswer]
        switch a.kind {
        case "sequence": answers = order.map { .beat($0) }
        case "blitz": answers = blitz.map { .index($0) }
        default: answers = [.index(picked ?? -1)]
        }
        Task {
            do {
                let r = try await model.answer(store, a, answers)
                result = r
                withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { phase = .result }
                if r.earned > 0 {
                    GameSound.shared.play(.fanfare)
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                } else {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            } catch {
                phase = .failed(error.localizedDescription)
            }
        }
    }
}

// MARK: - The end

/// The final score, what it paid, and where it put you on today's board.
struct RunResultsView: View {
    let store: RoamStore
    let model: RunModel
    let result: RunFinish
    var onClose: () -> Void

    @State private var shown = 0

    var body: some View {
        ZStack {
            RunLook.stage.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 18) {
                    Text(result.run.isPocket ? "POCKET RUN" : "RUN COMPLETE")
                        .font(GameFont.display(15)).tracking(1.6)
                        .foregroundStyle(.white.opacity(0.8))
                        .padding(.top, 30)
                    Text("\(shown)")
                        .font(GameFont.display(84).monospacedDigit())
                        .foregroundStyle(.white)
                        .contentTransition(.numericText())
                    Text("\(result.run.doneCount) of \(result.run.points.count) points")
                        .font(GameFont.body(15, weight: .bold))
                        .foregroundStyle(.white.opacity(0.8))
                    if let place = result.board_place {
                        // Places from 1,000 down are estimated on the server
                        // (a cached count), so they're said as such.
                        let shown = (model.board?.you?.approx ?? (place >= 1000))
                            ? "about #\(place.formatted())" : "#\(place.formatted())"
                        Text(model.board?.isWorld == true || result.run.region == "world"
                             ? "\(shown) worldwide today" : "\(shown) today in your city")
                            .font(GameFont.display(22))
                            .foregroundStyle(RunLook.gold)
                    }
                    rewards
                    if result.leveled_up {
                        Text("Level \(result.after.level)!")
                            .font(GameFont.display(28)).foregroundStyle(GamePalette.sun)
                    }
                    if !result.run.isPocket, let board = model.board { BountyBoard(board: board) }
                    Button("Done", action: onClose)
                        .buttonStyle(.game(GamePalette.sun))
                        .padding(.top, 6)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 40)
            }
        }
        .gameType()
        .task {
            let target = result.run.score
            let steps = 30
            for i in 1...steps {
                try? await Task.sleep(for: .milliseconds(28))
                withAnimation(.linear(duration: 0.03)) { shown = target * i / steps }
            }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private var rewards: some View {
        HStack(spacing: 18) {
            stat("\(result.reward.xp)", "XP")
            if result.reward.faction_points > 0 { stat("\(result.reward.faction_points)", "Faction") }
        }
        .padding(.vertical, 12).padding(.horizontal, 20)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(.white.opacity(0.14)))
    }

    private func stat(_ n: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(n).font(GameFont.display(24).monospacedDigit()).foregroundStyle(.white)
            Text(label.uppercased()).font(GameFont.body(11, weight: .heavy)).foregroundStyle(.white.opacity(0.7))
        }
    }
}

/// Today's Bounty Board: the day's best runs in this city.
struct BountyBoard: View {
    let board: RunBoard

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("BOUNTY BOARD").font(GameFont.display(15)).tracking(1.4)
                .foregroundStyle(GamePalette.ink)
            footer
            if board.entries.isEmpty {
                Text("No runs on the board yet today.")
                    .font(GameFont.body(14, weight: .semibold)).foregroundStyle(GamePalette.mist)
            }
            ForEach(board.entries.prefix(10)) { e in
                HStack(spacing: 10) {
                    Text("\(e.place)").font(GameFont.display(16).monospacedDigit())
                        .frame(width: 26, alignment: .leading)
                        .foregroundStyle(e.place <= 3 ? RunLook.gold : GamePalette.mist)
                    Circle().fill(RoamStyle.realmColor(e.faction)).frame(width: 10, height: 10)
                    Text(e.you ? "\(e.handle) (you)" : e.handle)
                        .font(GameFont.body(15, weight: e.you ? .heavy : .semibold))
                        .lineLimit(1)
                    Spacer()
                    Text("\(e.score)").font(GameFont.display(16).monospacedDigit())
                }
                .foregroundStyle(GamePalette.ink)
            }
            if !board.factions.isEmpty {
                Divider()
                HStack(spacing: 12) {
                    ForEach(board.factions.prefix(5)) { f in
                        VStack(spacing: 2) {
                            Circle().fill(RoamStyle.realmColor(f.faction)).frame(width: 12, height: 12)
                            Text("\(f.total)").font(GameFont.display(13).monospacedDigit())
                            Text(f.name).font(GameFont.body(9, weight: .heavy)).lineLimit(1)
                        }
                        .foregroundStyle(GamePalette.ink)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(GamePalette.cream))
    }

    private var footer: some View {
        Text((board.isWorld ? "Everyone outside a mapped city shares this board. " : "")
             + "Resets at \(RunLook.resetTime()) your time.")
            .font(GameFont.body(11, weight: .semibold))
            .foregroundStyle(GamePalette.mist)
            .fixedSize(horizontal: false, vertical: true)
    }
}
