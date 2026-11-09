import AVFoundation
import Foundation
import Speech

/// Answer by saying it.
///
/// Speech recognition runs ON the phone (`requiresOnDeviceRecognition`), so a
/// player's voice never leaves it and it works with one bar of signal. What
/// they said is matched to one of the four choices here, and only the choice's
/// index is sent: the server marks it exactly as if it had been tapped.
///
/// The matching is deliberately not the language model. Picking which of four
/// known strings someone said is a string problem with a right answer, and a
/// deterministic matcher is right every time and instant; "the second one",
/// "the blue one" and "B" are handled as well as the words themselves.
@MainActor
@Observable
final class VoiceAnswer {
    enum State: Equatable {
        case idle, listening, matched(Int), unsure, unavailable(String)
    }

    private(set) var state: State = .idle
    private(set) var heard = ""

    @ObservationIgnored private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-GB"))
        ?? SFSpeechRecognizer()
    @ObservationIgnored private let audio = AVAudioEngine()
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private var choices: [String] = []
    @ObservationIgnored private var onMatch: ((Int) -> Void)?
    @ObservationIgnored private var timeout: Task<Void, Never>?

    var available: Bool { recognizer?.supportsOnDeviceRecognition == true }

    @ObservationIgnored private var starting = false

    func listen(for choices: [String], onMatch: @escaping (Int) -> Void) {
        guard state != .listening else { stop(); return }
        // A second tap while permission is being asked would start a second
        // capture, and a second input tap is an exception, not an error.
        guard !starting else { return }
        starting = true
        self.choices = choices
        self.onMatch = onMatch
        heard = ""
        Task {
            defer { starting = false }
            guard await Self.authorised() else {
                state = .unavailable("Allow the microphone and speech recognition in Settings to answer by voice.")
                return
            }
            do { try start() } catch {
                stop()
                state = .unavailable("Voice answers aren't available right now.")
            }
        }
    }

    func stop() {
        timeout?.cancel()
        audio.stop()
        audio.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        if state == .listening { state = .idle }
        GameAudio.play()
    }

    private func start() throws {
        // [merged-app] The microphone belongs to the ongoing CosQuest call.
        if GameHost.shared.callActive {
            state = .unavailable("Your call is using the microphone. Tap your answer instead.")
            return
        }
        guard let recognizer, recognizer.isAvailable else {
            state = .unavailable("Voice answers aren't available on this phone.")
            return
        }
        // On the phone or not at all: the app promises a player's voice never
        // leaves it, and a server fallback would quietly break that.
        guard recognizer.supportsOnDeviceRecognition else {
            state = .unavailable("This phone can't recognise speech offline, so voice answers are off.")
            return
        }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default,
                                options: [.duckOthers, .defaultToSpeaker])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        // The game's playback session is no longer the one in force.
        GameAudio.invalidate()

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = true
        // The choices are the likeliest words; telling the recogniser so is
        // the difference between "Alfred" and "all fred".
        req.contextualStrings = choices
        request = req

        let input = audio.inputNode
        input.removeTap(onBus: 0)
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            state = .unavailable("No microphone is available right now.")
            return
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { @Sendable [weak req] buffer, _ in
            req?.append(buffer)
        }
        audio.prepare()
        try audio.start()
        state = .listening

        task = recognizer.recognitionTask(with: req) { @Sendable [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let final = result?.isFinal ?? (error != nil)
            Task { @MainActor in self?.handle(text: text, final: final) }
        }
        // A player who taps the mic and says nothing should not be left with
        // a hot microphone.
        timeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard let self, self.state == .listening else { return }
            self.finish()
        }
    }

    private func handle(text: String?, final: Bool) {
        guard state == .listening else { return }
        if let text { heard = text }
        // Act on a confident match as soon as it is heard, rather than
        // waiting for the player to stop talking.
        if let i = Self.match(heard, choices: choices, strict: true) {
            succeed(i)
        } else if final {
            finish()
        }
    }

    private func finish() {
        if let i = Self.match(heard, choices: choices, strict: false) {
            succeed(i)
        } else {
            stop()
            state = heard.isEmpty ? .idle : .unsure
        }
    }

    private func succeed(_ i: Int) {
        stop()
        state = .matched(i)
        onMatch?(i)
    }

    private static func authorised() async -> Bool {
        let speech = await withCheckedContinuation { c in
            // @Sendable: Speech calls this off the main queue, and a closure
            // that inherits main-actor isolation traps when it is.
            SFSpeechRecognizer.requestAuthorization { @Sendable status in
                c.resume(returning: status == .authorized)
            }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }

    // MARK: - Matching

    private static let ordinals: [[String]] = [
        ["first", "one", "number one", "a", "blue", "top"],
        ["second", "two", "number two", "b", "red"],
        ["third", "three", "number three", "c", "orange", "yellow"],
        ["fourth", "four", "number four", "d", "green", "last", "bottom"],
    ]

    private static func words(_ s: String) -> [String] {
        s.lowercased()
            .folding(options: .diacriticInsensitive, locale: nil)
            .split { !$0.isLetter && !$0.isNumber }
            .map(String.init)
    }

    /// Which choice was said, or nil. `strict` is for partial results: act
    /// only when one choice clearly wins.
    static func match(_ said: String, choices: [String], strict: Bool) -> Int? {
        let heard = words(said)
        guard !heard.isEmpty else { return nil }
        let joined = heard.joined(separator: " ")

        // "the second one", "B", "the green one".
        let fillers: Set<String> = ["the", "its", "it", "is", "um", "uh", "answer", "option", "one", "i", "think", "say"]
        let meaningful = heard.filter { !fillers.contains($0) }
        if meaningful.count <= 2 {
            for (i, forms) in ordinals.enumerated() where i < choices.count {
                // [merged-app] Another choice's own words block the ordinal,
                // but fillers do not: "the" in "The Shard" must not block
                // "the second one".
                if forms.contains(where: { f in f.contains(" ") ? joined.contains(f) : meaningful.contains(f) }),
                   !choices.enumerated().contains(where: { j, c in j != i && words(c).contains(where: { meaningful.contains($0) && $0.count > 2 }) }) {
                    return i
                }
            }
        }

        // The words themselves. Score by overlap on the words that matter.
        var scores: [(Int, Double)] = []
        for (i, c) in choices.enumerated() {
            let target = words(c).filter { $0.count > 2 || Int($0) != nil }
            guard !target.isEmpty else { continue }
            let hits = target.filter { t in heard.contains { h in h == t || (t.count > 4 && h.hasPrefix(t.prefix(5))) } }
            var score = Double(hits.count) / Double(target.count)
            if joined.contains(target.joined(separator: " ")) { score = 1 }
            // "starlord" for Star-Lord: the recogniser often runs words together.
            if heard.joined().contains(words(c).joined()) { score = 1 }
            scores.append((i, score))
        }
        scores.sort { $0.1 > $1.1 }
        guard let best = scores.first, best.1 > 0 else { return nil }
        let second = scores.dropFirst().first?.1 ?? 0
        let needed = strict ? 0.99 : 0.5
        return best.1 >= needed && best.1 - second >= (strict ? 0.5 : 0.25) ? best.0 : nil
    }
}
