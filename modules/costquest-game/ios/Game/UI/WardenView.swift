import SwiftUI

/// Asking the game a question, with the network off.
///
/// The model runs on the phone, so this works in a field with one bar or none,
/// which is the only reason it is worth shipping 300 MB for. It is framed as an
/// assistant and never as the referee: the server judges the game, and a screen
/// that let a player think otherwise would be setting up an argument at a venue
/// where real money is involved.
struct WardenView: View {
    @Bindable var warden: Warden
    let context: Warden.Context
    @State private var question = ""
    @Environment(\.dismiss) private var dismiss

    /// What a player standing in a field actually wants to ask, offered as
    /// taps. Typing on a phone held at arm's length outdoors is miserable, and
    /// most questions at a venue are one of these four.
    private let openers = [
        "Why was that refused?",
        "How do I score?",
        "What should I do next?",
        "What is around me?",
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            if warden.turns.isEmpty { intro } else { conversation }
            composer
        }
        .background(LinearGradient(colors: [GamePalette.navy, GamePalette.navyEdge],
                                   startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        .overCamera()
        // Start loading the on-device model while the player reads the
        // suggestions, not on their first question.
        .onAppear { warden.requestModel() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Button { dismiss() } label: { Image(systemName: "xmark") }
                .buttonStyle(.gameIcon(GamePalette.berry, diameter: 40))
                .accessibilityLabel("Close")
            Spacer()
            GameHeading("ASK THE GAME", size: 26)
            Spacer()
            if warden.isAnswering {
                Button { warden.stop() } label: { Image(systemName: "stop.fill") }
                    .buttonStyle(.gameIcon(GamePalette.berry, diameter: 40))
                    .accessibilityLabel("Stop")
            } else if !warden.turns.isEmpty {
                Button { warden.clear() } label: { Image(systemName: "arrow.counterclockwise") }
                    .buttonStyle(.gameIcon(GamePalette.skyDeep, diameter: 40))
                    .accessibilityLabel("Clear")
            } else {
                Color.clear.frame(width: 40, height: 40)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    private var intro: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "antenna.radiowaves.left.and.right.slash")
                .font(.system(size: 34))
                .foregroundStyle(GamePalette.sun)
            VStack(spacing: 6) {
                Text(warden.usesModel ? "This runs on your phone"
                                       : "Straight from the rulebook")
                    .font(GameFont.display(24))
                    .foregroundStyle(.white)
                Text(warden.usesModel
                     ? "It answers with no network at all, so it still works when the venue's signal does not. The server still judges the game; this only explains it."
                     : "Answers come from the game's own rules while the assistant finishes downloading. The server still judges the game; this only explains it.")
                    .font(GameFont.body(15))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.dim)
                    .padding(.horizontal, 34)
            }
            VStack(spacing: 6) {
                ForEach(Array(openers.enumerated()), id: \.offset) { index, opener in
                    Button(opener) { send(opener) }
                        .buttonStyle(.game([GamePalette.skyDeep, GamePalette.berry,
                                            GamePalette.sunDeep, GamePalette.mint][index % 4],
                                           size: .medium))
                }
            }
            .padding(.horizontal, 24)
            Spacer()
        }
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(warden.turns) { turn in
                        VStack(alignment: turn.fromPlayer ? .trailing : .leading, spacing: 6) {
                            if let rule = turn.rule {
                                // On screen the instant the question is asked,
                                // and still there afterwards. The model
                                // paraphrases; this is the rule itself.
                                HStack(alignment: .top, spacing: 7) {
                                    Image(systemName: "text.book.closed")
                                        .font(.caption2)
                                    Text(rule)
                                        .font(.caption)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .foregroundStyle(Theme.brass)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 9)
                                .background(RoundedRectangle(cornerRadius: 12)
                                    .fill(Theme.brass.opacity(0.10)))
                            }
                            if !turn.text.isEmpty || turn.rule == nil {
                                Text(turn.text.isEmpty ? "…" : turn.text)
                                    .font(GameFont.body(16))
                                    .foregroundStyle(turn.fromPlayer ? GamePalette.ink : .white)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 10)
                                    .background(RoundedRectangle(cornerRadius: 14)
                                        .fill(turn.fromPlayer ? GamePalette.sun : GamePalette.navy.opacity(0.9))
                                        .overlay(RoundedRectangle(cornerRadius: 14)
                                            .strokeBorder(.white.opacity(0.18), lineWidth: 1.5)))
                                    .textSelection(.enabled)
                            }
                        }
                        .frame(maxWidth: .infinity,
                               alignment: turn.fromPlayer ? .trailing : .leading)
                        .padding(turn.fromPlayer ? .leading : .trailing, 40)
                        .id(turn.id)
                    }
                    if UserDefaults.standard.bool(forKey: "showBenchmark"),
                       let rate = warden.tokensPerSecond {
                        // Hidden from players; pass -showBenchmark YES to see
                        // it when checking the speed floor. Measured, and shown. The agreement fixes a floor of
                        // twelve tokens a second on the target device, so the
                        // number is the one actually achieved rather than a
                        // claim off a spec sheet.
                        Text(String(format: "%.0f tokens a second on this phone%@", rate,
                                    warden.secondsToFirstWord.map {
                                        String(format: ", first word after %.1fs", $0)
                                    } ?? ""))
                            .font(.caption2)
                            .foregroundStyle(Theme.dim)
                    }
                }
                .padding(20)
            }
            .onChange(of: warden.turns.last?.text) { _, _ in
                // Without animation while streaming. A per-token animated
                // scroll saturates the main thread and the app is killed by the
                // watchdog, which is exactly how this failed once before.
                if let last = warden.turns.last?.id { proxy.scrollTo(last, anchor: .bottom) }
            }
        }
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Ask about the game", text: $question, axis: .vertical)
                .lineLimit(1...4)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 12).fill(Theme.surface))
                .foregroundStyle(Theme.text)
                .onSubmit { send(question) }
            Button {
                send(question)
            } label: {
                Image(systemName: "arrow.up")
            }
            .buttonStyle(.gameIcon(canSend ? GamePalette.mint : Color(white: 0.45), diameter: 44))
            .disabled(!canSend)
        }
        .font(GameFont.body(16))
        .padding(16)
    }

    private var canSend: Bool {
        !question.trimmingCharacters(in: .whitespaces).isEmpty && !warden.isAnswering
    }

    private func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !warden.isAnswering else { return }
        question = ""
        // The proctor role by default: at a venue, nearly every question is
        // about a rule or a refusal, which is what that role was tuned for.
        warden.ask(trimmed, role: .proctor, context: context)
    }
}
