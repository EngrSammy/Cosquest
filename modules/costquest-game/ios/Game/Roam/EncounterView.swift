import ARKit
import AVFoundation
import SwiftUI
import UIKit

/// Arriving at a Quest Point, from the camera opening to the reward.
///
/// Four beats, each one short: the shrine appears in front of you; you tap it
/// and the challenge starts against the server's clock; you answer and the
/// shrine breaks open while the answers are shown; then the reward counts up.
/// The server marks the answers and pays; this screen only stages it.
struct EncounterView: View {
    let store: RoamStore
    let point: QuestPoint
    let voice: WardenVoice
    var onDone: (RoamVerdict?) -> Void

    private enum Phase: Equatable {
        case approach, opening, playing, submitting, reveal, reward
        case failed(String)
    }

    @State private var phase: Phase = .approach
    @State private var placed = false
    @State private var scene: ShrineScene
    @State private var attempt: RoamAttempt?
    @State private var verdict: RoamVerdict?
    // Answers in progress, by kind.
    @State private var picked: Int?
    @State private var order: [String] = []
    @State private var blitz: [Int] = []
    @State private var confirmLeave = false
    /// The camera prompt comes before the AR view, not during its placement.
    @State private var cameraAsked = false
    @State private var snapshot: UIImage?
    @State private var blitzShowing = 0
    /// Question index -> choices a 50/50 removed.
    @State private var removed: [Int: [Int]] = [:]
    /// The deadline on THIS phone's clock: when the answer arrived plus the
    /// seconds the server said were left. The server's own timestamp compared
    /// against a phone clock that is wrong by twenty seconds either
    /// auto-submitted a blank the moment the question appeared or lost the
    /// answer to the grace window.
    @State private var localDeadline: Date?
    @State private var boughtTime = false
    @State private var hinting = false
    @State private var hintProblem: String?

    init(store: RoamStore, point: QuestPoint, voice: WardenVoice,
         onDone: @escaping (RoamVerdict?) -> Void) {
        self.store = store
        self.point = point
        self.voice = voice
        self.onDone = onDone
        _scene = State(initialValue: ShrineScene(
            tint: RoamStyle.tierUIColor(point.tier),
            wardenTint: UIColor(RoamStyle.realmColor(store.me?.faction))))
    }

    var body: some View {
        ZStack {
            if cameraAsked {
            ShrineStage(scene: scene, useAR: Preferences.shared.shrineAR) {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) { placed = true }
                Task { await voice.speak(store.arriveMoment(point), wait: .seconds(1.5)) }
                if RoamDev.autoPlay {
                    Task {
                        try? await Task.sleep(for: .seconds(1.5))
                        begin()
                    }
                }
            }
            .overlay {
                if phase == .approach && placed {
                    Color.clear.contentShape(.rect).onTapGesture { begin() }
                }
            }
            } else {
                GameBackdrop()
            }
            // A scrim under the question, so it reads over any floor.
            LinearGradient(colors: [.black.opacity(0), .black.opacity(scrim)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .animation(.smooth(duration: 0.3), value: phase)

            VStack(spacing: 0) {
                header
                if let said = voice.said, phase != .reward {
                    WardenBubble(said: said, tint: RoamStyle.realmColor(store.me?.faction),
                                 level: voice.speaker.level, compact: phase == .playing,
                                 onClose: { withAnimation { voice.quiet() } })
                        .padding(.top, 10)
                        .id(said.id)
                }
                Spacer()
                content
            }
            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: voice.said?.id)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            if phase == .reward, let verdict {
                RewardView(verdict: verdict, pointName: point.name) { onDone(verdict) }
                    .transition(.opacity)
                    .task {
                        guard verdict.leveled_up else { return }
                        // Lands with the ceremony, which starts once the XP has counted.
                        try? await Task.sleep(for: .seconds(2.4))
                        await voice.speak(store.levelMoment(verdict), wait: .seconds(2))
                    }
            }
        }
        .gameType()
        .statusBarHidden()
        .onChange(of: voice.speaker.level) { _, l in scene.setSpeaking(l) }
        .task {
            // Only when the camera is actually going to be used: asking on a
            // device that cannot run AR (or with AR switched off) is a prompt
            // for nothing.
            if Preferences.shared.shrineAR, ARWorldTrackingConfiguration.isSupported,
               AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
                _ = await AVCaptureDevice.requestAccess(for: .video)
            }
            cameraAsked = true
        }
        .onDisappear { voice.quiet() }
        .sheet(isPresented: Binding(get: { snapshot != nil }, set: { if !$0 { snapshot = nil } })) {
            if let snapshot {
                VStack(spacing: 16) {
                    Image(uiImage: snapshot).resizable().scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 20))
                    ShareLink(item: Image(uiImage: snapshot),
                              preview: SharePreview("CosQuest at \(point.name)", image: Image(uiImage: snapshot))) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.game(GamePalette.sun))
                }
                .padding(20)
                .presentationDetents([.large])
            }
        }
        .confirmationDialog("Leave this challenge?", isPresented: $confirmLeave,
                            titleVisibility: .visible) {
            Button("Leave", role: .destructive) { onDone(nil) }
            Button("Keep playing", role: .cancel) {}
        } message: {
            Text("The clock keeps running. You can come back while it does.")
        }
    }

    private var scrim: Double {
        switch phase {
        case .approach, .opening: return 0.25
        default: return 0.7
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top) {
            Button {
                if phase == .playing { confirmLeave = true } else { onDone(verdict) }
            } label: { Image(systemName: "xmark") }
                .buttonStyle(.gameIcon(GamePalette.navy.opacity(0.8), diameter: 42))
                .accessibilityLabel("Leave")
            if phase == .approach {
                Button {
                    Preferences.shared.shrineAR.toggle()
                    placed = false
                } label: {
                    Text(Preferences.shared.shrineAR ? "AR" : "3D").font(GameFont.display(15))
                }
                .buttonStyle(.gameIcon(GamePalette.skyDeep.opacity(0.9), diameter: 42))
                .accessibilityLabel(Preferences.shared.shrineAR ? "Switch to 3D view" : "Switch to camera view")
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 6) {
                Text(point.name)
                    .font(GameFont.display(20))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 3)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    GameChip(text: RoamStyle.tierName(point.tier),
                             color: RoamStyle.tierColor(point.tier))
                    GameChip(text: attempt?.realm_name ?? RoamStyle.challengeName(point.challenge),
                             color: RoamStyle.realmColor(attempt?.realm ?? point.realm))
                }
            }
        }
        .padding(.top, 8)
    }

    // MARK: - Content by phase

    @ViewBuilder private var content: some View {
        switch phase {
        case .approach:
            approach
        case .opening:
            ProgressView().tint(.white).controlSize(.large).padding(.bottom, 80)
        case .failed(let why):
            GamePanel {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Not this time").font(GameFont.display(24))
                    Text(why).font(GameFont.body(16, weight: .medium))
                    Button("Back to the map") { onDone(nil) }
                        .buttonStyle(.game(GamePalette.sky))
                }
            }
        case .playing, .submitting, .reveal:
            if let attempt { challenge(attempt) }
        case .reward:
            EmptyView()
        }
    }

    private var approach: some View {
        VStack(spacing: 14) {
            if placed {
                VStack(spacing: 6) {
                    Image(systemName: "hand.tap.fill")
                        .font(.system(size: 34, weight: .heavy))
                        .symbolEffect(.bounce, options: .repeating)
                    Text("Tap the shrine")
                        .font(GameFont.display(30))
                    Text(RoamStyle.challengeBlurb(point.challenge))
                        .font(GameFont.body(16, weight: .semibold))
                        .opacity(0.9)
                }
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.5), radius: 4)
                .transition(.scale.combined(with: .opacity))
            } else {
                VStack(spacing: 8) {
                    ProgressView().tint(.white)
                    Text(Preferences.shared.shrineAR ? "Point your camera at the ground" : "The shrine is rising…")
                        .font(GameFont.display(20))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.5), radius: 4)
                }
            }
        }
        .padding(.bottom, 60)
    }

    @ViewBuilder private func challenge(_ a: RoamAttempt) -> some View {
        let reveal = phase == .reveal ? verdict?.reveal : nil
        VStack(alignment: .leading, spacing: 14) {
            if phase != .reveal {
                DeadlineBar(deadline: localDeadline ?? Date().addingTimeInterval(Double(a.seconds)),
                            total: Double(a.seconds) + (boughtTime ? Double(store.hintPrices?.time_s ?? 10) : 0))
                if phase == .playing, let prices = store.hintPrices {
                    HintBar(coins: store.me?.coins ?? 0, prices: prices, bag: store.bag,
                            canFifty: a.kind != "sequence" && removed[currentQuestion] == nil,
                            canTime: !boughtTime, busy: hinting,
                            onFifty: { buy("fifty", a) }, onTime: { buy("time", a) })
                }
                if let hintProblem {
                    Text(hintProblem).font(GameFont.body(13, weight: .semibold))
                        .foregroundStyle(GamePalette.sun)
                }
            } else if let v = verdict {
                resultLine(v)
            }
            switch a.kind {
            case "sequence":
                SequenceCard(prompt: a.challenge.prompt ?? "",
                             beats: a.challenge.beats ?? [],
                             order: $order, reveal: reveal)
                if phase == .playing {
                    Button("Lock it in") { submit() }
                        .buttonStyle(.game(GamePalette.mint))
                        .disabled(order.count < (a.challenge.beats?.count ?? 4))
                }
            case "blitz":
                BlitzCard(questions: a.challenge.questions ?? [], answers: $blitz,
                          showing: $blitzShowing, removed: removed,
                          reveal: reveal) { submit() }
            default:
                if let q = a.challenge.questions?.first {
                    TriviaCard(question: q, picked: picked, removed: removed[0] ?? [],
                               reveal: reveal) { i in
                        picked = i
                        submit()
                    }
                }
            }
            if phase == .submitting {
                HStack { Spacer(); ProgressView().tint(.white); Spacer() }
            }
            if phase == .reveal, verdict?.can_retry == true, let a = attempt {
                Button {
                    retry(a)
                } label: {
                    Label("Second chance (\(store.bag["retry", default: 0]) left)", systemImage: "arrow.counterclockwise")
                }
                .buttonStyle(.game(Color(red: 0.55, green: 0.36, blue: 0.95)))
            }
            if phase == .reveal, scene.arView != nil {
                Button {
                    Task {
                        // The moment, as a photo: the shrine and the Warden
                        // standing in the player's own street.
                        GameSound.shared.play(.tap)
                        snapshot = await scene.photo()
                    }
                } label: { Label("Photo", systemImage: "camera.fill") }
                .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
            }
            if phase == .reveal {
                Button("Collect") {
                    withAnimation(.smooth(duration: 0.3)) { phase = .reward }
                }
                .buttonStyle(.game(GamePalette.sun))
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .task(id: "\(a.attempt_id)-\(boughtTime)") { await watchClock(a) }
    }

    private func resultLine(_ v: RoamVerdict) -> some View {
        let win = v.correct > 0 && !v.late
        let title: String = v.late ? "Time's up!"
            : v.kind == "blitz" ? "\(v.correct) of \(v.total)!"
            : (win ? "Correct!" : "The crystal resisted")
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                GameTitle(title, size: win ? 38 : 30,
                          outline: GamePalette.edge(of: win ? GamePalette.mint : GamePalette.berry))
                Spacer()
            }
            // The throw grade: speed as skill.
            if let g = v.grade {
                GameChip(text: g, color: g == "Flawless" ? GamePalette.sun
                         : (g == "Brilliant" ? GamePalette.mint : GamePalette.sky))
                    .transition(.scale(scale: 0.3).combined(with: .opacity))
            }
        }
        .transition(.scale(scale: 0.5).combined(with: .opacity))
    }

    /// A miss, a Second chance item, and a new set of questions at half pay.
    private func retry(_ a: RoamAttempt) {
        Task {
            do {
                let n = try await store.retry(a)
                scene.reset()
                verdict = nil
                picked = nil
                order = []
                blitz = Array(repeating: -1, count: n.challenge.questions?.count ?? 0)
                blitzShowing = 0
                removed = [:]
                boughtTime = false
                localDeadline = Date().addingTimeInterval(n.remaining_s ?? Double(n.seconds))
                attempt = n
                withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { phase = .playing }
            } catch {
                hintProblem = error.localizedDescription
            }
        }
    }

    // MARK: - Actions

    private func begin() {
        guard phase == .approach else { return }
        phase = .opening
        GameSound.shared.play(.whoosh)
        Task {
            do {
                let a = try await store.open(point)
                localDeadline = Date().addingTimeInterval(a.remaining_s ?? Double(a.seconds))
                attempt = a
                blitz = Array(repeating: -1, count: a.challenge.questions?.count ?? 0)
                withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { phase = .playing }
                // Both reactions, written while the question is read. Blitz
                // waits for its score.
                if a.kind != "blitz" {
                    voice.prepare(store.reactionMoment(correct: true, point: point, kind: a.kind), priority: .soon)
                    voice.prepare(store.reactionMoment(correct: false, point: point, kind: a.kind), priority: .soon)
                }
                if RoamDev.autoPlay { await devAnswer(a) }
            } catch {
                withAnimation { phase = .failed(error.localizedDescription) }
            }
        }
    }

    private func devAnswer(_ a: RoamAttempt) async {
        try? await Task.sleep(for: .seconds(2))
        if UserDefaults.standard.bool(forKey: "roamHint"), a.kind != "sequence" {
            buy("fifty", a)
            try? await Task.sleep(for: .seconds(3))
        }
        switch a.kind {
        case "sequence": order = (a.challenge.beats ?? []).map(\.id)
        case "blitz": blitz = blitz.map { _ in 0 }
        default: picked = 0
        }
        submit()
        try? await Task.sleep(for: .seconds(3))
        if phase == .reveal { withAnimation { phase = .reward } }
    }

    /// When the server's clock runs out, send whatever was answered. The
    /// server would refuse anything later anyway; this just stops the player
    /// staring at a question that no longer counts.
    private var currentQuestion: Int { attempt?.kind == "blitz" ? blitzShowing : 0 }

    private func buy(_ kind: String, _ a: RoamAttempt) {
        hinting = true
        hintProblem = nil
        let q = currentQuestion
        Task {
            defer { hinting = false }
            do {
                let h = try await store.hint(a, kind: kind, question: q)
                GameSound.shared.play(.coin)
                Task { await voice.speak(store.hintMoment(kind), wait: .seconds(0.8)) }
                withAnimation(.smooth(duration: 0.3)) {
                    if let r = h.removed { removed[q] = r }
                    if kind == "time" {
                        boughtTime = true
                        if let r = h.remaining_s { localDeadline = Date().addingTimeInterval(r) }
                    }
                }
            } catch {
                hintProblem = error.localizedDescription
            }
        }
    }

    private func watchClock(_ a: RoamAttempt) async {
        let wait = (localDeadline ?? Date().addingTimeInterval(Double(a.seconds))).timeIntervalSinceNow
        // A cancelled sleep is NOT the clock running out. `try?` swallowed the
        // cancellation, so buying time or leaving submitted blank answers.
        if wait > 0 {
            do { try await Task.sleep(for: .seconds(wait)) } catch { return }
        }
        guard !Task.isCancelled else { return }
        if phase == .playing { submit() }
    }

    private func submit() {
        guard phase == .playing, let a = attempt else { return }
        let answers: [RoamAnswer]
        switch a.kind {
        case "sequence": answers = order.map { .beat($0) }
        case "blitz": answers = blitz.map { .index($0) }
        default: answers = [.index(picked ?? -1)]
        }
        phase = .submitting
        // The Strike: three rising pulses start the moment the answer is
        // given and run while the server marks it, so the wait IS the
        // suspense, like the ball's shakes before the click.
        let strike = Task { @MainActor in
            for i in 0..<3 {
                scene.pulse(i)
                GameSound.shared.play([.pulse1, .pulse2, .pulse3][i])
                StrikeHaptics.shared.pulse(i)
                try? await Task.sleep(for: .milliseconds(420))
            }
        }
        Task {
            do {
                let v = try await store.submit(a, answers: answers)
                await strike.value
                verdict = v
                let win = v.correct > 0 && !v.late
                scene.resolve(correct: win)
                GameSound.shared.play(win ? .reward : .hit)
                StrikeHaptics.shared.resolve(win: win)
                withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) { phase = .reveal }
                if v.leveled_up { voice.prepare(store.levelMoment(v), priority: .soon) }
                let m = v.late ? store.lateMoment(point)
                    : store.reactionMoment(correct: win, point: point, kind: a.kind,
                                           verdict: a.kind == "blitz" ? v : nil)
                Task { await voice.speak(m, wait: .seconds(1.2)) }
            } catch {
                // The answer is safe to send again; say so rather than
                // dropping the player's work.
                phase = .playing
                withAnimation { phase = .failed("Couldn't send your answer: \(error.localizedDescription). Open the point again to retry.") }
            }
        }
    }
}
