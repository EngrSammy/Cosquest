import Foundation
import OSLog

private let voiceLog = Logger(subsystem: "net.costquest", category: "warden-voice")

/// The Warden's voice: the on-device model writing the game's character, live.
///
/// This is Milestone 1 doing the job it was built for. The model is fine-tuned
/// on the Warden's voice (costquest-qlm/warden), and here it writes the line
/// for each moment of play: arriving at a shrine, a right answer, a streak, a
/// level, the legend of a place, the story of your day.
///
/// Four rules make a 1.7B model trustworthy at this, and each exists because
/// the naive version failed:
///
/// 1. **It is given facts, never asked for them.** Every line is written from
///    a fact row the app assembles from the server's numbers. A small model
///    asked what it knows invents; one told what is true phrases it.
/// 2. **Every line is checked before anyone sees it.** `WardenCheck` rejects a
///    line with a number or name that is not in its facts, the wrong length, or
///    anything else outside the voice. One retry, then the authored line.
/// 3. **Lines are written before they are needed.** Reading a prompt is the
///    slow part on a phone, so the greeting is written while the player walks
///    up and both reactions while they read the question. The moment itself
///    only picks.
/// 4. **There is always an authored line.** With no model yet, a slow model or
///    a rejected line, `WardenLines` answers instantly. The game never waits on
///    the model; the model only makes it better.
@MainActor
@Observable
final class WardenVoice {
    /// What the Warden is saying now, for the speech bubble.
    struct Said: Equatable, Identifiable {
        let id = UUID()
        let text: String
        let moment: String
        /// Written on this phone just now, rather than an authored fallback.
        let fromModel: Bool
    }

    private(set) var said: Said?
    /// Lines written by the model this session, and how many it rejected. For
    /// the stats sheet: measured, not claimed.
    private(set) var written = 0
    private(set) var rejected = 0
    private(set) var lastFirstWord: Double?
    private(set) var lastTokensPerSecond: Double?

    @ObservationIgnored private unowned let warden: Warden
    let speaker = WardenSpeaker()

    private var cache: [String: String] = [:]
    private var inFlight: [String: Task<String?, Never>] = [:]
    /// One generation at a time, highest priority first.
    private var queue: [Job] = []
    private var running: Job?
    private var worker: Task<Void, Never>?
    /// Set when a running line is stopped for a more urgent one, so what it
    /// had written so far is thrown away rather than kept as if complete.
    private var preempted = false

    init(warden: Warden) {
        self.warden = warden
        // Legends belong to the place and never change, so they are kept.
        if let saved = UserDefaults.standard.dictionary(forKey: Self.legendsKey) as? [String: String] {
            cache.merge(saved) { a, _ in a }
        }
    }

    private static let legendsKey = "cq.warden.legends"

    private func remember(_ key: String, _ text: String, kind: String) {
        cache[key] = text
        guard kind == "legend" else { return }
        var saved = UserDefaults.standard.dictionary(forKey: Self.legendsKey) as? [String: String] ?? [:]
        if saved.count > 400 { saved.removeAll() }
        saved[key] = text
        UserDefaults.standard.set(saved, forKey: Self.legendsKey)
    }

    /// A line already written, if there is one, without asking for it.
    func cached(_ m: WardenMoment) -> String? { cache[m.key] }

    enum Priority: Int, Comparable {
        case background = 0, soon = 1, now = 2
        static func < (a: Priority, b: Priority) -> Bool { a.rawValue < b.rawValue }
    }

    private struct Job {
        let key: String
        let moment: WardenMoment
        let priority: Priority
        let done: (String?) -> Void
    }

    var hasModel: Bool { warden.loadedEngine != nil }

    // MARK: - Asking for lines

    /// Start writing a line now so it is ready when wanted. Idempotent.
    func prepare(_ m: WardenMoment, priority: Priority = .background) {
        let key = m.key
        guard cache[key] == nil, inFlight[key] == nil, hasModel else { return }
        let task = Task<String?, Never> { [weak self] in
            await withCheckedContinuation { cont in
                guard let self else { cont.resume(returning: nil); return }
                self.enqueue(Job(key: key, moment: m, priority: priority,
                                 done: { cont.resume(returning: $0) }))
            }
        }
        inFlight[key] = task
        Task { [weak self] in
            let text = await task.value
            guard let self else { return }
            self.inFlight[key] = nil
            if let text { self.remember(key, text, kind: m.kind) }
        }
    }

    /// The line for a moment: the model's if it is ready within `wait`, the
    /// authored one otherwise.
    func line(for m: WardenMoment, wait: Duration = .seconds(2.5)) async -> Said {
        if let text = cache[m.key] {
            return Said(text: text, moment: m.kind, fromModel: true)
        }
        if hasModel {
            prepare(m, priority: .now)
            promote(m.key)
            if let task = inFlight[m.key] {
                let got = await withTaskGroup(of: String?.self) { group in
                    group.addTask { await task.value }
                    group.addTask {
                        try? await Task.sleep(for: wait)
                        return nil
                    }
                    let first = await group.next() ?? nil
                    group.cancelAll()
                    return first
                }
                if let got { return Said(text: got, moment: m.kind, fromModel: true) }
            }
        }
        return Said(text: WardenLines.fallback(m), moment: m.kind, fromModel: false)
    }

    /// Say it: into the bubble, and aloud if the player wants that.
    func say(_ s: Said, style: WardenStyle) {
        said = s
        if Preferences.shared.wardenSpeaks {
            speaker.speak(s.text, style: style)
        }
    }

    /// Show a line without speaking it.
    func show(_ s: Said) { said = s }

    func quiet() {
        speaker.stop()
        said = nil
    }

    /// The whole moment in one call: fetch the line and say it.
    func speak(_ m: WardenMoment, wait: Duration = .seconds(2.5)) async {
        let s = await line(for: m, wait: wait)
        say(s, style: m.style)
    }

    // MARK: - The worker

    private func enqueue(_ job: Job) {
        queue.append(job)
        queue.sort { $0.priority > $1.priority }
        // Something more urgent than what is running: stop the running line
        // and put it back. A legend can wait; a greeting cannot.
        if let running, job.priority > running.priority {
            preempted = true
            warden.loadedEngine?.stop()
        }
        if worker == nil {
            worker = Task { [weak self] in await self?.drain() }
        }
    }

    private func promote(_ key: String) {
        guard let i = queue.firstIndex(where: { $0.key == key }) else { return }
        let job = queue.remove(at: i)
        queue.insert(Job(key: job.key, moment: job.moment, priority: .now, done: job.done), at: 0)
        if let running, running.priority < .now {
            preempted = true
            warden.loadedEngine?.stop()
        }
    }

    private func drain() async {
        while !queue.isEmpty {
            let job = queue.removeFirst()
            running = job
            let text = await write(job.moment)
            // Stopped for something more urgent: requeue rather than answer.
            if text == nil, let next = queue.first, next.priority > job.priority {
                queue.append(job)
                queue.sort { $0.priority > $1.priority }
                running = nil
                continue
            }
            running = nil
            job.done(text)
        }
        worker = nil
    }

    /// Two attempts at a line that passes the check.
    private func write(_ m: WardenMoment) async -> String? {
        guard let engine = warden.loadedEngine else { return nil }
        for attempt in 0..<2 {
            let started = Date()
            var first: Date?
            var raw = ""
            var count = 0
            let stream = engine.answer(m.prompt, temperature: attempt == 0 ? 0.75 : 0.9,
                                       maxTokens: m.maxTokens)
            for await piece in stream {
                if first == nil { first = Date() }
                count += 1
                raw += piece
                // One line is the whole job; stop at the first newline.
                if raw.contains("\n") || raw.contains("<|im_end|>") { engine.stop() }
            }
            if preempted {
                preempted = false
                return nil
            }
            if let first {
                lastFirstWord = first.timeIntervalSince(started)
                let gen = Date().timeIntervalSince(first)
                if count > 1, gen > 0 { lastTokensPerSecond = Double(count - 1) / gen }
            }
            let text = WardenCheck.clean(raw, moment: m.kind)
            if let why = WardenCheck.problem(text, for: m) {
                rejected += 1
                voiceLog.notice("rejected \(m.kind, privacy: .public): \(why, privacy: .public) :: \(text, privacy: .public)")
                continue
            }
            written += 1
            return text
        }
        return nil
    }
}

/// How the Warden talks, from the player's faction.
enum WardenStyle: String, Sendable {
    case arcade, mythic, hype, trailer, quippy, neutral

    init(faction: String?) {
        switch faction {
        case "gaming": self = .arcade
        case "dc": self = .mythic
        case "anime": self = .hype
        case "movies": self = .trailer
        case "marvel": self = .quippy
        default: self = .neutral
        }
    }
}

/// One moment of play and the facts the Warden may use for it.
///
/// The input line is the exact shape the model was fine-tuned on
/// (`costquest-qlm/warden/make_inputs.py`), so the phone asks the question
/// the way the weights learned it.
struct WardenMoment: Sendable {
    let kind: String
    let style: WardenStyle
    let facts: [(String, String)]
    /// Distinguishes two moments with the same facts (e.g. the same point on
    /// two days). Part of the cache key, not of the prompt.
    var salt: String = ""

    init(_ kind: String, style: WardenStyle, _ facts: [(String, String?)], salt: String = "") {
        self.kind = kind
        self.style = style
        self.facts = facts.compactMap { k, v in
            guard let v, !v.isEmpty else { return nil }
            return (k, v)
        }
        self.salt = salt
    }

    var input: String {
        ([("moment", kind), ("style", style.rawValue)] + facts)
            .map { "\($0.0): \($0.1)" }.joined(separator: " | ")
    }

    var key: String { input + "#" + salt }

    func fact(_ k: String) -> String? { facts.first { $0.0 == k }?.1 }

    var maxTokens: Int { kind == "recap" ? 80 : (kind == "legend" ? 64 : 40) }

    static let system = "You are the Warden, the voice of CostQuest. Speak one line in the given style, using only the given facts."

    /// The prompt, in the Qwen3 chat format with thinking switched off, which
    /// is how the voice was trained.
    var prompt: String {
        "<|im_start|>system\n\(Self.system)<|im_end|>\n"
            + "<|im_start|>user\n\(input)<|im_end|>\n"
            + "<|im_start|>assistant\n<think>\n\n</think>\n\n"
    }
}
