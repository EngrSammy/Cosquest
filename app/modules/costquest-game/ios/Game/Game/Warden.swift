import Foundation
import OSLog

/// The game's own AI, answering on the phone with the network switched off.
///
/// This is Milestone 1 arriving inside Milestone 3. The agreement's M1 scope
/// ends with "design and configure the game AI roles (orchestrator, game
/// warden, research, and proctor), including their prompts", and those four
/// roles are the system prompts the model was fine-tuned under, reproduced
/// here verbatim from the training set so the app asks the model the way the
/// model was taught.
///
/// The thing that makes it useful rather than a novelty is the context. A
/// small model knows nothing about this game: asked cold why a hit was
/// refused, it will invent a confident answer about message queues, which is
/// exactly what a 0.5B model does. So every question is answered against the
/// rules and the live state, written into the prompt, and the model is told
/// plainly that it is not the referee. The server judges the game. This
/// explains it.
@MainActor
@Observable
final class Warden {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "warden")

    /// The four roles, with the exact prompts the model was trained under.
    /// Changing the wording here changes what the weights recognise, so they
    /// are copied rather than rewritten.
    enum Role: String, CaseIterable {
        case orchestrator, gameWarden, proctor, research

        var systemPrompt: String {
            switch self {
            case .orchestrator:
                "You are the CostQuest Orchestrator. You route player intent to the right game AI and keep session state coherent."
            case .gameWarden:
                "You are the CostQuest Game Warden. You design and tune scavenger-hunt and faction-battle games for a specific real-world locale. Be concrete and playable."
            case .proctor:
                "You are the CostQuest Proctor. You referee a live session: validate captures, call fouls, resolve disputes by the rules. Be decisive and fair."
            case .research:
                "You are the CostQuest Research AI. You produce accurate, locale-specific trivia for a geotagged point. Be factual and concise."
            }
        }
    }

    struct Turn: Identifiable, Equatable {
        let id = UUID()
        let fromPlayer: Bool
        var text: String
        /// The rule this answer is built on, shown with it.
        ///
        /// It appears the moment the question is asked, before the model has
        /// written a word, which matters because reading the prompt takes a
        /// couple of seconds and a player is standing in a field. It also stays
        /// there afterwards: the model paraphrases, the rule is the rule, and
        /// in a game paying cash prizes the player should be able to see the
        /// thing the paraphrase came from.
        var rule: String?
    }

    private(set) var turns: [Turn] = []
    private(set) var isAnswering = false
    /// Measured on this device, not claimed. Prefill and generation are
    /// separated because they are different costs and mixing them hides both:
    /// a long prompt makes a fast model look slow, which is exactly the mistake
    /// that sent the first version of this down the wrong path.
    private(set) var tokensPerSecond: Double?
    private(set) var secondsToFirstWord: Double?
    private(set) var modelSummary: String?

    private var engine: MoteEngine?
    private var generation: Task<Void, Never>?

    /// The loaded engine, for the Warden's voice. One model in memory, shared.
    var loadedEngine: MoteEngine? { engine }

    /// The Warden's voice: the same model, writing the game's character.
    @ObservationIgnored private(set) var voice: WardenVoice!

    /// Whether the fetch was asked for by the game (Wi-Fi only) or by the
    /// player typing a question (any network).
    private(set) var wifiOnly = true

    init() {
        voice = WardenVoice(warden: self)
    }

    /// The model is a better answer, not the only one. Every rules question has
    /// a correct answer written into the rulebook, so the assistant works
    /// before the model has downloaded, on a phone too small to run it, and if
    /// it fails to load. In a game paying cash prizes an answer that is short
    /// and right beats one that is fluent and wrong.
    var usesModel: Bool { engine != nil }

    /// Set the first time anyone actually wants the assistant. The ~300 MB
    /// model is NOT loaded at launch any more: mapping it beside ARKit and
    /// Unity raised memory pressure for every player, including the ones who
    /// never open the assistant. AppRoot watches this and prepares the model
    /// when it flips. The rulebook answers in the meantime.
    private(set) var wantsModel = false

    /// Ask for the model to be fetched and loaded, off the main thread. Cheap
    /// and idempotent: call it when the assistant's sheet appears.
    func requestModel(wifiOnly: Bool = false) {
        if !wifiOnly { self.wifiOnly = false }
        if !wantsModel { wantsModel = true }
        // Counted, so a request after a failed download starts another one:
        // `wantsModel` only changes once.
        requests += 1
    }

    private(set) var requests = 0

    func load(modelPath: String, tokenizerPath: String) {
        guard engine == nil else { return }
        // Off the main actor: loading mmaps a 300 MB file and reads its header,
        // and doing that on the main thread stutters whatever is on screen.
        Task.detached(priority: .userInitiated) {
            let engine = MoteEngine(modelPath: modelPath, tokenizerPath: tokenizerPath)
            await MainActor.run {
                self.engine = engine
                self.modelSummary = engine?.info.summary
                if engine == nil {
                    self.log.error("the on-device model did not load")
                }
            }
        }
    }

    /// Ask the game something. The answer streams into `turns`.
    func ask(_ question: String, role: Role = .proctor, context: Context) {
        guard !isAnswering else { return }
        requestModel()
        turns.append(Turn(fromPlayer: true, text: question))

        let rule = Self.plainAnswer(to: question, context: context)

        guard let engine else {
            // No model on this phone. The rulebook still answers, instantly and
            // correctly, which is most of the value.
            turns.append(Turn(fromPlayer: false, text: rule))
            return
        }

        // Seeded with the rule, so something true is on screen immediately
        // rather than an empty bubble for the seconds the prompt takes to read.
        turns.append(Turn(fromPlayer: false, text: "", rule: rule))
        isAnswering = true
        tokensPerSecond = nil
        secondsToFirstWord = nil

        let prompt = Self.prompt(role: role, context: context,
                                 history: turns.dropLast(2), question: question)
        let started = Date()
        var first: Date?
        var count = 0

        generation = Task {
            for await piece in engine.answer(prompt) {
                if first == nil { first = Date() }
                count += 1
                // Appended to the last turn rather than replacing it, so the
                // answer appears as it is written. The first word takes a
                // couple of seconds while the prompt is read; the rest arrive
                // in tens of milliseconds, and a spinner for the whole time
                // reads as a hang.
                if !turns.isEmpty { turns[turns.count - 1].text += piece }
            }
            if let first {
                secondsToFirstWord = first.timeIntervalSince(started)
                let generating = Date().timeIntervalSince(first)
                tokensPerSecond = generating > 0 && count > 1
                    ? Double(count - 1) / generating : nil
            }
            // A model that produced nothing useful falls back to the rulebook
            // rather than leaving the player looking at an empty bubble.
            if turns.last?.text.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0 < 8 {
                turns[turns.count - 1].text = rule
                turns[turns.count - 1].rule = nil
            }
            isAnswering = false
        }
    }

    func stop() {
        engine?.stop()
        generation?.cancel()
        isAnswering = false
    }

    func clear() {
        stop()
        turns.removeAll()
    }

    // MARK: - The prompt

    /// What the model is told about the game before it is asked anything.
    ///
    /// Assembled rather than stored, because it has to be true right now: the
    /// rules of THIS game with the organiser's knob settings, and the player's
    /// own state as the server last reported it.
    struct Context: Sendable {
        var title: String = ""
        var faction: String?
        var tokens: Int = 0
        var state: String = "active"
        var weapon: String?
        var venue: String?
        var nearby: [String] = []
        var lastRefusal: String?
        var isOnline: Bool = true

        var lines: [String] {
            var out = ["The game is \"\(title)\"."]
            if let venue { out.append("It is being played at \(venue).") }
            out.append("You are talking to a player who is on the \(faction ?? "no") side, "
                       + "holds \(tokens) tokens, and is \(state).")
            out.append(weapon.map { "They are carrying a \($0)." }
                       ?? "They are not carrying a weapon.")
            if !nearby.isEmpty {
                out.append("Nearby points they could use: \(nearby.joined(separator: ", ")).")
            }
            if let lastRefusal {
                out.append("The server just refused something with the reason: \"\(lastRefusal)\".")
            }
            if !isOnline {
                out.append("Their phone currently has no connection to the game server.")
            }
            return out
        }
    }

    /// The rulebook, one rule at a time.
    ///
    /// The first version put all nine rules in front of the model on every
    /// question. Measured, that was the wrong call twice over. It cost 6.0 s of
    /// prefill before the first word appeared, because the engine reads a
    /// prompt token by token; and it made the answers worse, because a small
    /// model given nine rules and one question blends them. The same model
    /// given the one rule that applies answered correctly in 2.1 s.
    ///
    /// So the app chooses the rule and the model writes the sentence. Which is
    /// the right division: choosing is something a keyword table does perfectly
    /// and a 0.5B model does not.
    struct Rule {
        let topic: String
        let text: String
        /// What a player says when they mean this. Matched literally, because
        /// a literal match is predictable and this is a game paying real money.
        let triggers: [String]
    }

    static let rulebook: [Rule] = [
        Rule(topic: "cooldown",
             text: "Hits have a cooldown. A hit made before the cooldown has finished is refused. That is the rule working, not a fault.",
             triggers: ["cooldown", "too soon", "again", "wait", "refused"]),
        Rule(topic: "friendly fire",
             text: "You cannot hit a player on your own side. That is refused as friendly fire.",
             triggers: ["own side", "my side", "team", "teammate", "friendly", "same faction"]),
        Rule(topic: "range",
             text: "A hit beyond the game's range limit is refused. The phones measure the range and the server checks it.",
             triggers: ["range", "how far", "distance", "too far", "reach"]),
        Rule(topic: "weapons",
             text: "You must be carrying a weapon before you can hit anyone. Weapons are picked up at marked points on the field.",
             triggers: ["weapon", "harpoon", "pick up", "carrying", "no weapon", "armed"]),
        Rule(topic: "scoring",
             text: "Tokens are the score. You take them from players on other sides by hitting them, by capturing points, and by answering trivia at the marked stops.",
             triggers: ["score", "scoring", "points", "tokens", "win", "how do i", "earn"]),
        Rule(topic: "being downed",
             text: "Losing all your tokens puts you down. The server holds the respawn timer and lets you back in when it has run.",
             triggers: ["down", "downed", "respawn", "died", "out of tokens", "back in"]),
        Rule(topic: "the venue boundary",
             text: "Everything must happen inside the venue. Anything reported from outside the boundary is refused.",
             triggers: ["outside", "boundary", "geofence", "venue", "car park", "leave", "away"]),
        Rule(topic: "trivia",
             text: "Each trivia stop is answered once. The server marks the answer; the phone never knows which choice was right.",
             triggers: ["trivia", "question", "answer", "quiz", "stop"]),
    ]

    /// The rule that applies, or the two closest when nothing matches cleanly.
    ///
    /// Deliberately not a model call. The obvious idea is to embed the question
    /// and match it against the rules, and it was tried: on this model the
    /// geofence rule won almost every question, with margins around 0.02, and
    /// "what is the capital of France" scored as high as a real question. The
    /// engine's own notes say why, that mean-pooled embeddings from a small
    /// decoder are much better at topic than at polarity. A keyword table has
    /// none of that charm and is right every time.
    static func rules(for question: String, refusal: String?) -> [Rule] {
        let haystack = (question + " " + (refusal ?? "")).lowercased()
        let hits = rulebook.filter { rule in
            rule.triggers.contains { haystack.contains($0) }
        }
        if !hits.isEmpty { return Array(hits.prefix(2)) }
        // Nothing matched. Rather than guess, the model is given the two rules
        // that answer most questions and told to say when it does not know.
        return [rulebook[4], rulebook[0]]
    }

    private static func prompt(role: Role, context: Context,
                               history: ArraySlice<Turn>, question: String) -> String {
        let chosen = rules(for: question, refusal: context.lastRefusal)
        var out = "<|im_start|>system\n\(role.systemPrompt)\n\n"
        out += chosen.map(\.text).joined(separator: " ")
        out += " The server judges every action and its record is final.\n\n"
        out += context.lines.joined(separator: " ")
        out += "\n\nAnswer the player directly, in two short sentences, using only "
        out += "what is above. If it does not cover the question, say you do not "
        out += "know rather than guessing.<|im_end|>\n"

        // Only the last exchange. Every token of history is more prefill before
        // the first word appears, and prefill is what this model is slow at:
        // roughly two seconds for a short prompt and six for a long one.
        for turn in history.suffix(2) {
            out += "<|im_start|>\(turn.fromPlayer ? "user" : "assistant")\n"
            out += turn.text + "<|im_end|>\n"
        }
        // Qwen3 reasons out loud unless told not to, and a rules answer that
        // opens with a paragraph of "Okay, the user is asking..." is worse
        // than none. The empty think block is what `/no_think` produces.
        out += "<|im_start|>user\n\(question) /no_think<|im_end|>\n"
        out += "<|im_start|>assistant\n<think>\n\n</think>\n\n"
        return out
    }

    /// What the app would answer with no model at all.
    ///
    /// Shown while the model is writing, and used verbatim when it is not
    /// available. It is always correct, because we wrote it, which is the point:
    /// in a game paying cash prizes a rules answer that might be wrong is worse
    /// than a rules answer that is short.
    static func plainAnswer(to question: String, context: Context) -> String {
        rules(for: question, refusal: context.lastRefusal)
            .map(\.text).joined(separator: " ")
    }
}
