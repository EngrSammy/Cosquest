import SwiftUI
import UIKit

/// The first minute of the game, as a conversation with the Warden.
///
/// A form (name, avatar, side, permissions) is the traditional onboarding and
/// the reason most onboarding is skipped. This is a character meeting you: one
/// line at a time, written on a clean white page, and every question
/// the game has to ask is asked by the Warden, in its own words, at the moment
/// it matters. There is one thing to look at on screen at any time.
///
/// Only location is asked for here. The camera is asked for when a shrine is
/// first opened in AR, and motion when walking rewards unlock. A prompt that
/// follows the thing it is for is one people allow.
struct OnboardingView: View {
    let store: RoamStore
    var onDone: () -> Void

    fileprivate enum Beat: Int, CaseIterable {
        case wake, hello, shrines, askName, nameAck, askFaction, factionAck, gift, askLocation, farewell
    }

    @State private var beat: Beat = .wake
    @State private var handle = ""
    @State private var picked: String?
    @State private var joined: String?
    @State private var working = false
    @State private var problem: String?
    @State private var speaker = WardenSpeaker()
    @State private var speaks = Preferences.shared.wardenSpeaks
    @State private var lineID = 0
    @State private var revealed = false
    @State private var awake = false
    /// The starter Relic, claimed while the Warden welcomes you to your house.
    @State private var relic: Relic?
    /// The starter Relic's round trips are still in flight.
    @State private var claiming = false
    @State private var waitingForGift = false
    @FocusState private var nameFocused: Bool

    private var tint: Color {
        if let f = joined ?? picked { return RoamStyle.realmColor(f) }
        return Color(red: 0.45, green: 0.62, blue: 1.0)
    }
    private var style: WardenStyle { WardenStyle(faction: joined) }
    private var name: String { handle.trimmingCharacters(in: .whitespaces) }
    /// The keyboard takes half the screen: the Warden steps back to make room
    /// rather than the button disappearing under it.
    private var typing: Bool { nameFocused && beat == .askName }

    var body: some View {
        ZStack {
            WardenDawn(tint: tint, awake: awake)
                .ignoresSafeArea()
                .contentShape(.rect)
                .onTapGesture { tapped() }

            VStack(spacing: 0) {
                topBar
                Spacer(minLength: typing ? 4 : 20)
                presence
                Spacer(minLength: typing ? 8 : 24)
                RevealLine(text: line, id: lineID, revealed: $revealed)
                    .padding(.horizontal, 30)
                    .frame(minHeight: typing ? 60 : 130, alignment: .top)
                    .onTapGesture { tapped() }
                Spacer(minLength: 12)
                interaction
                    .padding(.horizontal, 24)
                    .frame(minHeight: typing ? 0 : 150, alignment: .bottom)
                    .padding(.bottom, typing ? 12 : 26)
            }
        }
        .preferredColorScheme(.light)
        .gameType()
        .animation(.smooth(duration: 0.6), value: beat)
        .animation(.smooth(duration: 1.2), value: tint)
        .animation(.smooth(duration: 0.35), value: typing)
        .onAppear(perform: begin)
        .onDisappear { speaker.stop() }
        .task(id: lineID) { await pace() }
        #if DEBUG
        .onChange(of: revealed) { _, r in if r { autoAnswer() } }
        #endif
    }

    #if DEBUG
    /// -onboardAuto 1: answers every question itself (name "Ada", the house
    /// in -onboardPick or the first), so the whole first run can be watched
    /// in the simulator against a real server.
    private func autoAnswer() {
        guard UserDefaults.standard.bool(forKey: "onboardAuto") else { return }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            switch beat {
            case .askName:
                if name.count < 2 { handle = "Ada" }
                await saveName()
            case .askFaction:
                picked = UserDefaults.standard.string(forKey: "onboardPick") ?? store.config?.factions.first?.id
                try? await Task.sleep(for: .seconds(1))
                await join()
            case .askLocation:
                store.startLocation()
                go(.farewell)
            default: break
            }
        }
    }
    #endif

    // MARK: - What the Warden says

    private var line: String {
        switch beat {
        case .wake:
            return "…oh. You can see me."
        case .hello:
            return "Not many people can. I'm the Warden. I look after the shrines hidden in this city."
        case .shrines:
            return "They sit in cafés, on bridges, under statues. Most people walk straight past them. You won't."
        case .askName:
            return "Before we go anywhere: what should I call you?"
        case .nameAck:
            return "\(name). I'll remember that."
        case .askFaction:
            if let picked { return Self.pitch(picked) }
            return "Every shrine belongs to one of five houses, and the houses are always at war. Who do you stand with?"
        case .factionAck:
            return Self.welcome(joined ?? "", name: name)
        case .gift:
            guard let relic else { return "" }
            return "You'll need this. \(relic.name). It's been waiting for someone from \(store.factionName(joined))."
        case .askLocation:
            return "One last thing. To find shrines around you, I need to know roughly where you are. Only while you play, and no one else ever sees it."
        case .farewell:
            return "There's a Guardian at the shrine right beside you. Your first fight. Let's go."
        }
    }

    /// What each house sounds like, said by the Warden while you are choosing.
    static func pitch(_ id: String) -> String {
        switch id {
        case "anime": return "Anime. Loud, loyal, and they never, ever give up."
        case "marvel": return "Marvel. Quick with a joke, quicker with a comeback."
        case "dc": return "DC. Old legends, and they carry themselves like it."
        case "movies": return "Movies. Every story ever told on a big screen, and they know them all."
        case "gaming": return "Gaming. They see the world as a map with a boss at the end."
        default: return "Choose carefully."
        }
    }

    /// The first thing the Warden says in the house's own voice.
    static func welcome(_ id: String, name: String) -> String {
        switch id {
        case "anime": return "Anime it is! I can feel your fighting spirit already, \(name)!"
        case "marvel": return "Marvel. Good choice. I was hoping you'd have taste, \(name)."
        case "dc": return "Then the legends have a new name among them. Welcome, \(name)."
        case "movies": return "In a city full of shrines, one fan chose Movies. Welcome, \(name)."
        case "gaming": return "Player \(name) has joined Gaming. New quest unlocked."
        default: return "Welcome, \(name)."
        }
    }

    // MARK: - Pieces

    private var topBar: some View {
        HStack {
            if WardenSpeaker.enabled { Button {
                speaks.toggle()
                Preferences.shared.wardenSpeaks = speaks
                if speaks { speaker.speak(line, style: style) } else { speaker.stop() }
            } label: {
                Image(systemName: speaks ? "speaker.wave.2.fill" : "speaker.slash.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(GamePalette.ink.opacity(0.45))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(speaks ? "Mute the Warden" : "Let the Warden speak") }
            Spacer()
            if beat.rawValue < Beat.askName.rawValue {
                Button("Skip") { go(.askName) }
                    .font(GameFont.body(15, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.5))
                    .padding(.horizontal, 16)
                    .frame(height: 44)
            }
        }
        .padding(.horizontal, 8)
    }

    /// The Warden itself, with a halo that breathes in the house colour.
    private var presence: some View {
        ZStack {
            Circle()
                .fill(tint.opacity(awake ? 0.22 : 0.05))
                .frame(width: typing ? 140 : 230, height: typing ? 140 : 230)
                .blur(radius: 40)
                .scaleEffect(1 + 0.12 * speaker.level)
            WardenBadge(tint: tint, size: typing ? 76 : 132, level: speaker.level)
                .opacity(awake ? 1 : 0.25)
                .scaleEffect(awake ? 1 : 0.85)
                .blur(radius: awake ? 0 : 6)
        }
        .animation(.easeInOut(duration: 1.8), value: awake)
        .accessibilityHidden(true)
    }

    @ViewBuilder private var interaction: some View {
        switch beat {
        case .askName where revealed:
            VStack(spacing: 16) {
                TextField("", text: $handle, prompt: Text("Your name").foregroundStyle(GamePalette.ink.opacity(0.25)))
                    .focused($nameFocused)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .onSubmit { Task { await saveName() } }
                    .font(GameFont.display(30))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(GamePalette.ink)
                    .padding(.bottom, 8)
                    .overlay(alignment: .bottom) {
                        Capsule().fill(tint.opacity(0.8)).frame(height: 2)
                    }
                    .padding(.horizontal, 30)
                if let problem { problemText(problem) }
                calmButton(working ? "…" : "That's me", enabled: name.count >= 2 && !working) {
                    Task { await saveName() }
                }
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))
            .onAppear { nameFocused = true }

        case .askFaction where revealed || picked != nil:
            VStack(spacing: 18) {
                HStack(spacing: 12) {
                    ForEach(store.config?.factions ?? []) { f in
                        HouseOrb(id: f.id, name: f.name, chosen: picked == f.id) {
                            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
                            picked = f.id
                            say()
                        }
                    }
                }
                if let problem { problemText(problem) }
                calmButton(working ? "…" : "Stand with \(store.factionName(picked))",
                           enabled: picked != nil && !working) {
                    Task { await join() }
                }
                .opacity(picked == nil ? 0 : 1)
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))

        case .gift:
            if let relic {
                VStack(spacing: 10) {
                    RelicArt(kind: relic.kind, rarity: relic.rarity, size: 120)
                        .shadow(color: RelicLook.rarityColor(relic.rarity).opacity(0.8), radius: 24)
                    Text(relic.rarity.uppercased())
                        .font(GameFont.display(13)).tracking(1.5)
                        .foregroundStyle(RelicLook.rarityColor(relic.rarity))
                    if let a = relic.ability_text {
                        Text(a)
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.65))
                            .multilineTextAlignment(.center)
                    }
                }
                .transition(.scale(scale: 0.3).combined(with: .opacity))
            }

        case .askLocation where revealed:
            calmButton("Show me what's near", enabled: true) {
                store.startLocation()
                go(.farewell)
            }
            .transition(.opacity.combined(with: .move(edge: .bottom)))

        default:
            Text(beat == .farewell ? " " : "Tap to continue")
                .font(GameFont.body(14, weight: .medium))
                .foregroundStyle(GamePalette.ink.opacity(revealed ? 0.4 : 0))
                .animation(.easeIn(duration: 0.8).delay(1.5), value: revealed)
        }
    }

    private func calmButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(GameFont.display(20))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 58)
                .background(Capsule().fill(GamePalette.ink.opacity(enabled ? 1 : 0.2)))
                .shadow(color: tint.opacity(enabled ? 0.45 : 0), radius: 14, y: 4)
        }
        .buttonStyle(CardPress())
        .disabled(!enabled)
        .animation(.smooth, value: enabled)
    }

    private func problemText(_ s: String) -> some View {
        Text(s)
            .font(GameFont.body(14, weight: .semibold))
            .foregroundStyle(GamePalette.berry)
            .multilineTextAlignment(.center)
    }

    // MARK: - Pacing

    private func begin() {
        handle = store.profile?.handle ?? ""
        // A player who got partway last time picks up where they left.
        if store.me?.faction != nil {
            joined = store.me?.faction
            beat = .askLocation
            awake = true
        } else if name.count >= 2 {
            beat = .askFaction
            awake = true
        }
        #if DEBUG
        // -onboardBeat askFaction etc., for screenshots of one beat.
        if let raw = UserDefaults.standard.string(forKey: "onboardBeat"),
           let b = Beat.allCases.first(where: { "\($0)" == raw }) {
            beat = b
            awake = true
            if handle.isEmpty { handle = "Ada" }
            if let pick = UserDefaults.standard.string(forKey: "onboardPick") {
                picked = pick
                if b.rawValue >= Beat.factionAck.rawValue { joined = pick }
            }
        }
        #endif
        say()
        if beat == .wake {
            Task {
                try? await Task.sleep(for: .milliseconds(900))
                awake = true
            }
        }
    }

    private func say() {
        problem = nil
        revealed = false
        lineID += 1
        if speaks && WardenSpeaker.enabled { speaker.speak(line, style: style) }
        UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.5)
    }

    private func go(_ b: Beat) {
        speaker.stop()
        beat = b
        say()
    }

    /// Narrative beats move on by themselves when the Warden has finished,
    /// with a breath after, so the whole thing can be watched hands-free.
    private func pace() async {
        let words = line.split(separator: " ").count
        try? await Task.sleep(for: .seconds(Double(words) * 0.08 + 0.4))
        if speaks && WardenSpeaker.enabled {
            // Wait for the voice to start, then to stop.
            for _ in 0..<20 where !speaker.speaking { try? await Task.sleep(for: .milliseconds(100)) }
            while speaker.speaking, !Task.isCancelled { try? await Task.sleep(for: .milliseconds(120)) }
            try? await Task.sleep(for: .seconds(0.9))
        } else {
            try? await Task.sleep(for: .seconds(Double(words) * 0.25 + 1.2))
        }
        guard !Task.isCancelled else { return }
        advanceIfNarrative()
    }

    private func tapped() {
        if !revealed { revealed = true; return }
        advanceIfNarrative()
    }

    private func advanceIfNarrative() {
        switch beat {
        case .wake: go(.hello)
        case .hello: go(.shrines)
        case .shrines: go(name.count >= 2 ? .nameAck : .askName)
        case .nameAck: go(.askFaction)
        case .factionAck:
            guard !waitingForGift else { return }
            waitingForGift = true
            // The gift takes three round trips; give it a few seconds rather
            // than skip the one present the game hands a new player.
            Task {
                for _ in 0..<40 where claiming && relic == nil {
                    try? await Task.sleep(for: .milliseconds(100))
                }
                waitingForGift = false
                guard beat == .factionAck else { return }
                go(relic == nil ? .askLocation : .gift)
            }
        case .gift: go(.askLocation)
        case .farewell: finish()
        case .askName, .askFaction, .askLocation: break
        }
    }

    private func finish() {
        speaker.stop()
        onDone()
    }

    // MARK: - Doing the things

    private func saveName() async {
        guard name.count >= 2, !working else { return }
        working = true
        defer { working = false }
        do {
            try await store.saveProfile(handle: String(name.prefix(24)),
                                        avatar: store.profile?.avatar ?? Profile.Avatar())
            nameFocused = false
            go(.nameAck)
        } catch {
            problem = "I didn't catch that. \(error.localizedDescription)"
        }
    }

    private func join() async {
        guard let picked, !working else { return }
        working = true
        defer { working = false }
        do {
            try await store.chooseFaction(picked)
            joined = picked
            // Claimed now, handed over once the Warden has said hello: by
            // then the round trip is long finished. No Relic, no gift beat.
            claiming = true
            Task {
                relic = try? await RelicsModel.shared.claimStarter(store)
                claiming = false
            }
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            go(.factionAck)
        } catch {
            problem = error.localizedDescription
        }
    }
}

/// A line the Warden is saying, arriving word by word.
///
/// The words not yet said are laid out but clear, so the text never reflows
/// as it appears: the line is where it will be from the first word.
private struct RevealLine: View {
    let text: String
    let id: Int
    @Binding var revealed: Bool
    @State private var shown = 0

    var body: some View {
        let words = text.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        Text(attributed(words))
            .font(GameFont.display(27))
            .multilineTextAlignment(.center)
            .lineSpacing(4)
            .frame(maxWidth: .infinity)
            .accessibilityLabel(text)
            .task(id: id) {
                shown = 0
                for i in 1...max(1, words.count) {
                    if revealed { break }
                    try? await Task.sleep(for: .milliseconds(85))
                    if Task.isCancelled { return }
                    withAnimation(.easeOut(duration: 0.25)) { shown = i }
                }
                withAnimation(.easeOut(duration: 0.25)) { shown = words.count }
                revealed = true
            }
            .onChange(of: revealed) { _, r in
                if r { withAnimation(.easeOut(duration: 0.2)) { shown = words.count } }
            }
    }

    private func attributed(_ words: [String]) -> AttributedString {
        var out = AttributedString()
        for (i, w) in words.enumerated() {
            var piece = AttributedString(i == 0 ? w : " " + w)
            piece.foregroundColor = i < shown ? UIColor(GamePalette.ink) : .clear
            out += piece
        }
        return out
    }
}

/// One of the five houses, as a glowing orb.
private struct HouseOrb: View {
    let id: String
    let name: String
    let chosen: Bool
    var action: () -> Void

    var body: some View {
        let colour = RoamStyle.realmColor(id)
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: RoamStyle.realmSymbol(id))
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(colour.gradient))
                    .overlay(Circle().strokeBorder(chosen ? GamePalette.ink : .white.opacity(0.6),
                                                   lineWidth: chosen ? 3 : 1.5))
                    .shadow(color: colour.opacity(chosen ? 0.6 : 0.25), radius: chosen ? 12 : 4, y: 3)
                Text(name)
                    .font(GameFont.body(12, weight: .bold))
                    .foregroundStyle(GamePalette.ink.opacity(chosen ? 1 : 0.5))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .scaleEffect(chosen ? 1.12 : 1)
            .animation(.spring(response: 0.35, dampingFraction: 0.6), value: chosen)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(name)
        .accessibilityAddTraits(chosen ? .isSelected : [])
    }
}

/// Morning white, with the house colour drifting upward through it.
struct WardenDawn: View {
    var tint: Color
    var awake: Bool

    var body: some View {
        ZStack {
            LinearGradient(colors: [.white, .white, tint.opacity(awake ? 0.14 : 0.04)],
                           startPoint: .top, endPoint: .bottom)
            TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in
                Canvas { g, size in
                    let t = ctx.date.timeIntervalSinceReferenceDate
                    for i in 0..<38 {
                        // Fixed per mote, so they drift rather than flicker.
                        let seed = Double(i) * 12.9898
                        let x0 = (sin(seed) * 43758.5453).truncatingRemainder(dividingBy: 1)
                        let speed = 0.012 + 0.02 * abs(cos(seed * 1.7))
                        let phase = (abs(x0) + t * speed).truncatingRemainder(dividingBy: 1)
                        let x = size.width * (abs(x0) + 0.03 * sin(t * 0.4 + seed))
                        let y = size.height * (1.05 - phase * 1.1)
                        let r = 1.5 + 2.4 * abs(sin(seed * 3.1))
                        let fade = sin(phase * .pi)
                        g.opacity = 0.4 * fade
                        g.fill(Path(ellipseIn: CGRect(x: x, y: y, width: r, height: r)),
                               with: .color(i % 3 == 0 ? GamePalette.slate : tint))
                    }
                }
            }
            .opacity(awake ? 1 : 0.4)
        }
        .animation(.easeInOut(duration: 2), value: awake)
    }
}
