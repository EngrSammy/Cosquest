import SwiftUI
import UIKit

/// The countdown every challenge runs against: the server's deadline, not a
/// local timer, so a slow network or a backgrounded app cannot buy time.
struct DeadlineBar: View {
    let deadline: Date
    let total: Double

    var body: some View {
        TimelineView(.animation(minimumInterval: 0.1)) { t in
            let left = max(0, deadline.timeIntervalSince(t.date))
            let frac = total > 0 ? left / total : 0
            let hot = left < 6
            HStack(spacing: 8) {
                Image(systemName: "timer")
                    .font(.system(size: 15, weight: .heavy))
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.18))
                        Capsule()
                            .fill(hot ? GamePalette.berry : GamePalette.sun)
                            .frame(width: g.size.width * frac)
                    }
                }
                .frame(height: 12)
                Text("\(Int(left.rounded(.up)))")
                    .font(GameFont.display(18).monospacedDigit())
                    .frame(width: 30, alignment: .trailing)
            }
            .foregroundStyle(hot ? GamePalette.berry : .white)
        }
    }
}

/// One answer button, in one of four fixed colours, so "the blue one" means
/// the same thing to every player.
private let choiceColors: [Color] = [
    Color(red: 0.16, green: 0.45, blue: 0.93),
    Color(red: 0.93, green: 0.27, blue: 0.36),
    Color(red: 0.96, green: 0.62, blue: 0.13),
    Color(red: 0.20, green: 0.72, blue: 0.45),
]

struct ChoiceButton: View {
    let text: String
    let index: Int
    /// nil while answering; after the verdict, whether this is the right one.
    var reveal: Bool? = nil
    var chosen = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(text)
                    .font(GameFont.display(20))
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                if let reveal {
                    Image(systemName: reveal ? "checkmark.circle.fill"
                          : (chosen ? "xmark.circle.fill" : "circle"))
                        .font(.system(size: 22, weight: .heavy))
                        .opacity(reveal || chosen ? 1 : 0)
                } else if chosen {
                    Image(systemName: "checkmark").font(.system(size: 18, weight: .heavy))
                }
            }
        }
        .buttonStyle(GameButtonStyle(color: face, size: .medium))
        .opacity(dimmed ? 0.45 : 1)
        .scaleEffect(reveal == true ? 1.03 : 1)
        .animation(.spring(response: 0.35, dampingFraction: 0.6), value: reveal)
    }

    private var face: Color {
        if let reveal { return reveal ? GamePalette.mint : (chosen ? GamePalette.berry : Color(white: 0.55)) }
        return choiceColors[index % choiceColors.count]
    }

    private var dimmed: Bool { reveal == false && !chosen }
}

// MARK: - Trivia

struct TriviaCard: View {
    let question: RoamAttempt.Question
    var picked: Int?
    /// Choices a 50/50 took away.
    var removed: [Int] = []
    var reveal: RoamVerdict.Reveal?
    var questionIndex = 0
    var onPick: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let clue = question.clue {
                Text(clue)
                    .font(.system(size: 64))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(GamePalette.cream)
                        .shadow(color: GamePalette.edge(of: GamePalette.cream), radius: 0, y: 5))
                    .accessibilityLabel("Emoji clue")
            }
            Text(question.q)
                .font(GameFont.display(26))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .shadow(color: .black.opacity(0.35), radius: 0, y: 2)
            if reveal == nil, picked == nil { SayItButton(choices: question.choices, removed: removed, onPick: onPick) }
            ForEach(Array(question.choices.enumerated()), id: \.offset) { i, choice in
                ChoiceButton(text: choice, index: i,
                             reveal: revealFor(i),
                             chosen: picked == i) {
                    guard picked == nil, reveal == nil, !removed.contains(i) else { return }
                    onPick(i)
                }
                .opacity(removed.contains(i) && reveal == nil ? 0.22 : 1)
                .disabled(removed.contains(i) && reveal == nil)
                .animation(.smooth(duration: 0.3), value: removed)
            }
        }
    }

    private func revealFor(_ i: Int) -> Bool? {
        guard let right = reveal?.correct, questionIndex < right.count else { return nil }
        return right[questionIndex] == i
    }
}

// MARK: - Sequence

/// Tap the moments in the order they happened. Tapping is more reliable than
/// dragging on a phone held up in the street, and tapping a numbered one
/// again takes it back.
struct SequenceCard: View {
    let prompt: String
    let beats: [RoamAttempt.Beat]
    @Binding var order: [String]
    var reveal: RoamVerdict.Reveal?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(prompt)
                .font(GameFont.display(24))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
                .shadow(color: .black.opacity(0.35), radius: 0, y: 2)
            Text(reveal == nil ? "Tap them in order, first to last." : "The right order:")
                .font(GameFont.body(15, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
            ForEach(shown) { beat in
                Button { tap(beat) } label: { row(beat) }
                    .buttonStyle(.plain)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: order)
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: reveal)
    }

    /// After the verdict, the beats rearrange themselves into the right order.
    private var shown: [RoamAttempt.Beat] {
        guard let right = reveal?.correct_order else { return beats }
        return right.compactMap { id in beats.first { $0.id == id } }
    }

    private func tap(_ beat: RoamAttempt.Beat) {
        guard reveal == nil else { return }
        if let i = order.firstIndex(of: beat.id) {
            order.removeSubrange(i...)
        } else {
            order.append(beat.id)
        }
        GameSound.shared.play(.tap)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func row(_ beat: RoamAttempt.Beat) -> some View {
        let n = order.firstIndex(of: beat.id).map { $0 + 1 }
        let right = reveal?.correct_order?.firstIndex(of: beat.id).map { $0 + 1 }
        let wasRight = reveal != nil && n == right
        return HStack(spacing: 12) {
            ZStack {
                Circle().fill(badgeColor(n: n, revealed: reveal != nil, wasRight: wasRight))
                Text(reveal != nil ? "\(right ?? 0)" : (n.map(String.init) ?? ""))
                    .font(GameFont.display(20))
                    .foregroundStyle(.white)
            }
            .frame(width: 38, height: 38)
            .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: 2))
            Text(beat.text)
                .font(GameFont.body(17, weight: .semibold))
                .foregroundStyle(GamePalette.ink)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            if reveal != nil {
                Image(systemName: wasRight ? "checkmark.circle.fill" : "arrow.uturn.right.circle.fill")
                    .foregroundStyle(wasRight ? GamePalette.mint : GamePalette.sunDeep)
                    .font(.system(size: 20, weight: .heavy))
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(GamePalette.cream)
            .shadow(color: GamePalette.edge(of: GamePalette.cream), radius: 0, y: 4))
        .padding(.bottom, 4)
    }

    private func badgeColor(n: Int?, revealed: Bool, wasRight: Bool) -> Color {
        if revealed { return wasRight ? GamePalette.mint : GamePalette.sunDeep }
        return n == nil ? Color(white: 0.7) : GamePalette.skyDeep
    }
}

// MARK: - Blitz

/// Five questions, one clock. The answers go to the server together at the
/// end, which is the only way the key never has to be on the phone.
struct BlitzCard: View {
    let questions: [RoamAttempt.Question]
    @Binding var answers: [Int]
    /// Which question is up. Owned by the encounter, so a 50/50 knows which
    /// question it is for.
    @Binding var showing: Int
    var removed: [Int: [Int]] = [:]
    var reveal: RoamVerdict.Reveal?
    var onFinished: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                ForEach(0..<questions.count, id: \.self) { i in
                    Capsule()
                        .fill(pipColor(i))
                        .frame(height: 8)
                }
            }
            if let reveal {
                summary(reveal)
            } else if showing < questions.count {
                TriviaCard(question: questions[showing],
                           picked: nil, removed: removed[showing] ?? [],
                           reveal: nil) { choice in
                    answers[showing] = choice
                    if showing + 1 < questions.count {
                        withAnimation(.smooth(duration: 0.25)) { showing += 1 }
                    } else {
                        onFinished()
                    }
                }
                .id(showing)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                        removal: .move(edge: .leading).combined(with: .opacity)))
            }
        }
    }

    private func pipColor(_ i: Int) -> Color {
        if let marks = reveal?.marks, i < marks.count {
            return marks[i] ? GamePalette.mint : GamePalette.berry
        }
        if i < showing || answers[i] >= 0 { return GamePalette.sun }
        return .white.opacity(i == showing ? 0.7 : 0.25)
    }

    private func summary(_ reveal: RoamVerdict.Reveal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(questions.enumerated()), id: \.offset) { i, q in
                let ok = reveal.marks.map { i < $0.count && $0[i] } ?? false
                let right = reveal.correct.flatMap { i < $0.count && $0[i] >= 0 && $0[i] < q.choices.count ? q.choices[$0[i]] : nil }
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(ok ? GamePalette.mint : GamePalette.berry)
                        .font(.system(size: 20, weight: .heavy))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(q.q).font(GameFont.body(14, weight: .semibold))
                        if let right {
                            Text(right).font(GameFont.display(15))
                                .foregroundStyle(ok ? GamePalette.mint : GamePalette.sun)
                        }
                    }
                }
                .foregroundStyle(.white)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 18).fill(GamePalette.navy.opacity(0.7)))
    }
}


/// Help, for coins. Shown only while a question is open.
struct HintBar: View {
    let coins: Int
    let prices: RoamConfig.Hints
    /// Items in the bag, by id ("fifty", "time"). An item is spent first.
    var bag: [String: Int] = [:]
    var canFifty: Bool
    var canTime: Bool
    var busy: Bool
    var onFifty: () -> Void
    var onTime: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            hint("50/50", item: bag["fifty", default: 0], cost: prices.fifty, enabled: canFifty, action: onFifty)
            hint("+\(prices.time_s)s", item: bag["time", default: 0], cost: prices.time, enabled: canTime, action: onTime)
            Spacer()
            HStack(spacing: 4) {
                GameCoin(size: 18)
                Text("\(coins)").font(GameFont.display(16).monospacedDigit())
                    .contentTransition(.numericText())
            }
            .foregroundStyle(.white)
        }
        .opacity(busy ? 0.6 : 1)
    }

    private func hint(_ label: String, item: Int, cost: Int, enabled: Bool,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(label)
                if item > 0 {
                    Image(systemName: "bag.fill").font(.system(size: 12, weight: .heavy))
                    Text("×\(item)")
                } else {
                    GameCoin(size: 16)
                    Text("\(cost)")
                }
            }
        }
        .buttonStyle(.game(Color(red: 0.55, green: 0.36, blue: 0.95), size: .small,
                           fullWidth: false))
        .disabled(!enabled || (item == 0 && coins < cost) || busy)
    }
}


/// Tap, then say the answer. Recognised on the phone; the server marks the
/// index it maps to, exactly as a tap.
struct SayItButton: View {
    let choices: [String]
    var removed: [Int] = []
    var onPick: (Int) -> Void
    @State private var listener = VoiceAnswer()

    var body: some View {
        HStack(spacing: 10) {
            Button {
                let live = choices.enumerated().map { removed.contains($0.offset) ? "" : $0.element }
                listener.listen(for: live) { i in
                    guard !removed.contains(i) else { return }
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    onPick(i)
                }
            } label: {
                Image(systemName: listener.state == .listening ? "waveform" : "mic.fill")
                    .symbolEffect(.variableColor.iterative, isActive: listener.state == .listening)
            }
            .buttonStyle(.gameIcon(listener.state == .listening ? GamePalette.berry : GamePalette.skyDeep,
                                   diameter: 44))
            .accessibilityLabel(listener.state == .listening ? "Stop listening" : "Say your answer")
            Group {
                switch listener.state {
                case .listening:
                    Text(listener.heard.isEmpty ? "Listening…" : "\u{201C}\(listener.heard)\u{201D}")
                case .unsure:
                    Text("Didn't catch that. Tap and say it again, or tap an answer.")
                case .unavailable(let why):
                    Text(why)
                default:
                    Text("Say it: tap the mic and speak your answer.")
                        .opacity(0.8)
                }
            }
            .font(GameFont.body(14, weight: .semibold))
            .foregroundStyle(.white)
            .lineLimit(2)
            Spacer(minLength: 0)
        }
        .onDisappear { listener.stop() }
    }
}
