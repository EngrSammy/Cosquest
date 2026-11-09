import Foundation

/// What a line must pass before the Warden says it.
///
/// The same rules the training data was held to (costquest-qlm/warden/
/// validate.py), applied to what the model actually wrote on this phone. The
/// important one is facts: a 1.7B model will cheerfully tell a player they
/// are "four in a row" when they have a four-day streak, and a game that gets
/// your own numbers wrong has lost the thing that made the line worth writing.
enum WardenCheck {
    private static let wordNumbers: [String: Int] = {
        let words = "zero one two three four five six seven eight nine ten eleven twelve thirteen "
            + "fourteen fifteen sixteen seventeen eighteen nineteen twenty"
        var out: [String: Int] = [:]
        for (i, w) in words.split(separator: " ").enumerated() { out[String(w)] = i }
        out["thirty"] = 30; out["forty"] = 40; out["fifty"] = 50; out["hundred"] = 100
        return out
    }()

    /// Trim what the model wrote to the line itself.
    static func clean(_ raw: String, moment: String) -> String {
        var s = raw
        for stop in ["<|im_end|>", "<|im_start|>", "\n"] {
            if let r = s.range(of: stop) { s = String(s[..<r.lowerBound]) }
        }
        s = s.trimmingCharacters(in: .whitespacesAndNewlines)
        // A stray pair of quotes around the whole line.
        if s.hasPrefix("\""), s.hasSuffix("\""), s.count > 2 {
            s = String(s.dropFirst().dropLast())
        }
        return s
    }

    static func numbers(in text: String) -> Set<Int> {
        var out = Set<Int>()
        let cleaned = text.replacingOccurrences(of: ",", with: "")
        var digits = ""
        for ch in cleaned + " " {
            if ch.isNumber { digits.append(ch) } else if !digits.isEmpty {
                if let n = Int(digits) { out.insert(n) }
                digits = ""
            }
        }
        for word in cleaned.lowercased().split(whereSeparator: { !$0.isLetter }) {
            if let n = wordNumbers[String(word)] { out.insert(n) }
        }
        return out
    }

    /// [merged-app] The small model's other voice. The 0.5B variant (phones
    /// under 6 GB) was not tuned on the Warden data and answers like a
    /// generic assistant: "I'm ada, an assistant built for the Crest of
    /// London. I run on your device." or "I won't be able to help you with
    /// that." Lines that talk about being an assistant, a model or a device,
    /// or that refuse or apologise, are never the Warden, so they fall back
    /// to the authored lines. None of the 1,500 Warden training and held-out
    /// lines trips it. Same list as app/features/game/wardenCheck.ts.
    static let offVoicePhrases = [
        // Talking about itself.
        "assistant", "language model", "as an ai", "i'm an ai", "i am an ai", " an ai ", "ai model", "chatbot",
        "artificial intelligence", "openai", "qwen", "alibaba", "trained by", "i was trained", "my training",
        "your device", "this device", "i run on",
        // Refusing, apologising, offering help.
        "can't help", "cannot help", "can not help", "unable to help", "won't be able to", "not able to help",
        "can't assist", "cannot assist", "i'm sorry", "i am sorry", "i apologi", "i'm unable", "i am unable",
        "i cannot", "i'm not able", "i am not able", "help you with", "how can i help", "how may i help",
        "here to help", "let me know", "feel free", "i don't have", "i do not have", "anything else", "is there anything",
    ]

    /// The off-voice phrase a line contains, or nil. Curly apostrophes count as straight.
    static func offVoice(_ text: String) -> String? {
        let lower = " " + text.lowercased().replacingOccurrences(of: "\u{2019}", with: "'") + " "
        return offVoicePhrases.first { lower.contains($0) }
    }

    /// Nil when the line may be said; otherwise why not.
    static func problem(_ text: String, for m: WardenMoment) -> String? {
        let words = text.split(whereSeparator: \.isWhitespace)
        let limit = m.kind == "recap" ? 45 : (m.kind == "legend" ? 32 : 18)
        guard words.count >= 4 else { return "too short" }
        guard words.count <= limit else { return "too long (\(words.count))" }
        if text.contains("\"") || text.contains("#") || text.contains("*") { return "markup" }
        if text.unicodeScalars.contains(where: { $0.properties.isEmojiPresentation }) { return "emoji" }
        // Qwen is bilingual underneath, and now and then a line ends in
        // Chinese. Anything beyond Latin letters and punctuation is refused.
        if text.unicodeScalars.contains(where: { $0.value > 0x24F && !(0x2000...0x206F).contains($0.value) }) {
            return "non-Latin script"
        }
        let allowed = numbers(in: m.input).union([1, 2, 3, 4, 5])
        let invented = numbers(in: text).subtracting(allowed)
        if !invented.isEmpty { return "invented numbers \(invented.sorted())" }
        let lower = text.lowercased()
        for bad in ["prize", "money", "cash", "bet ", "$", "<think", "as an ai", "i'm an ai"] where lower.contains(bad) {
            return "banned: \(bad)"
        }
        if let off = offVoice(text) {
            return "off voice: \(off.trimmingCharacters(in: .whitespaces))"
        }
        if m.kind == "arrive", let place = m.fact("place"),
           let head = place.split(separator: " ").first,
           !text.localizedCaseInsensitiveContains(head) {
            return "arrive without the place"
        }
        return nil
    }
}
