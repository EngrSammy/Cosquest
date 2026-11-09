import Foundation

/// The Warden's written lines, for when the model is not there to write one.
///
/// Not a lesser path: this is what a player hears before the model has
/// downloaded, on a phone that cannot hold it, and whenever a generated line
/// fails its check. So it keeps the character. The choice among variants is
/// seeded by the facts, so the same moment gets the same line and a different
/// moment usually a different one.
enum WardenLines {
    static func fallback(_ m: WardenMoment) -> String {
        let name = m.fact("name") ?? "traveller"
        let place = m.fact("place") ?? m.fact("nearest") ?? "this place"
        let options: [String]
        switch (m.kind, m.style) {
        case ("arrive", .arcade):
            options = ["Player one, \(name)! \(place) is live. Ready up.",
                       "New stage unlocked: \(place). Show it what you've got, \(name)."]
        case ("arrive", .mythic):
            options = ["\(place) has waited for you, \(name). Its shrine wakes.",
                       "The stones of \(place) remember every seeker. Now they know you."]
        case ("arrive", .hype):
            options = ["\(place)! This is it, \(name). Give it everything!",
                       "You made it to \(place)! I knew you would. Let's go!"]
        case ("arrive", .trailer):
            options = ["One city. One shrine. \(place). And \(name), ready.",
                       "This summer, \(name) arrives at \(place). Nothing will be the same."]
        case ("arrive", .quippy):
            options = ["\(place), \(name). Try not to make it look too easy.",
                       "Oh good, \(place). It's been dying to meet you, \(name)."]
        case ("arrive", _):
            options = ["Welcome to \(place), \(name). The shrine is listening.",
                       "\(place). A good place for a challenge, \(name)."]

        case ("correct", .arcade): options = ["Clean hit, \(name)! Combo continues.", "GG, \(name). That's how it's done."]
        case ("correct", .mythic): options = ["The shrine yields to you, \(name).", "Rightly answered. The legend of \(name) grows."]
        case ("correct", .hype): options = ["YES! That's the spirit, \(name)!", "You got it, \(name)! I never doubted you!"]
        case ("correct", .trailer): options = ["And against all odds, \(name) gets it right.", "One answer. One hero. Correct."]
        case ("correct", .quippy): options = ["Nailed it, \(name). Obviously.", "Correct. Try to stay humble, \(name)."]
        case ("correct", _): options = ["Right answer, \(name). Nicely done.", "That's it exactly, \(name)."]

        case ("wrong", .arcade): options = ["Missed that one, \(name). Respawn and go again.", "Not this round. Next point, new run."]
        case ("wrong", .mythic): options = ["Even legends stumble, \(name). The city will test you again.", "The shrine keeps its secret. For now."]
        case ("wrong", .hype): options = ["Not yet, \(name)! Get back up, we go again!", "That one got away, but you're only getting stronger!"]
        case ("wrong", .trailer): options = ["A setback. But this story isn't over, \(name).", "Every hero has that scene. This was yours."]
        case ("wrong", .quippy): options = ["Close. Well, not close. But brave, \(name).", "That one's on the question, \(name). Probably."]
        case ("wrong", _): options = ["Not this time, \(name). The next point is waiting.", "That one slipped away. Plenty more out there."]

        case ("siege_won", let style):
            let from = m.fact("taken_from") ?? "the rival"
            switch style {
            case .arcade: options = ["Boss down! \(place) is yours, \(name). New high score.",
                                     "Guardian K.O.! \(from) loses \(place). GG, \(name)."]
            case .mythic: options = ["The \(from) Guardian falls. \(place) bows to you, \(name).",
                                     "Sing it in the old halls: \(name) took \(place) from \(from)."]
            case .hype: options = ["YOU TOOK \(place.uppercased()), \(name)! \(from) never saw it coming!",
                                   "That's our flag on \(place) now! Incredible, \(name)!"]
            case .trailer: options = ["They said \(place) would never fall. \(name) had other plans.",
                                      "One Guardian. One challenger. \(place) changes hands tonight."]
            case .quippy: options = ["\(place) is yours. \(from) will want that back. Let them try.",
                                     "Nice siege, \(name). \(from) is drafting a strongly worded letter."]
            default: options = ["\(place) is yours, \(name). Hold it well.",
                                "The Guardian yields. \(place) flies your colours now."]
            }
        case ("siege_lost", let style):
            let holder = m.fact("holder") ?? "the rival"
            switch style {
            case .arcade: options = ["Game over at \(place), \(name). Power up and hit continue.",
                                     "The \(holder) Guardian wins this round. Level that Relic and rematch."]
            case .mythic: options = ["\(place) holds, for now. Even stone tires, \(name).",
                                     "The Guardian of \(holder) stands. Return stronger, seeker."]
            case .hype: options = ["So close, \(name)! Shake it off, we're coming back for \(place)!",
                                   "The Guardian got lucky. Next time \(place) is ours!"]
            case .trailer: options = ["\(place) holds. But \(name) will be back.",
                                      "The first siege failed. The second one won't."]
            case .quippy: options = ["\(holder) keeps \(place). Enjoy it while it lasts, \(holder).",
                                     "The Guardian won. Don't tell it, it'll get smug."]
            default: options = ["\(place) holds this time, \(name). Rest, then try again.",
                                "The Guardian held. Level up your Relic and come back."]
            }
        case ("late", _): options = ["Time ran out, \(name). The clock is a harsh judge.", "Too slow this time, \(name). Next one, faster."]
        case ("levelup", _):
            let level = m.fact("level") ?? "up"
            options = ["Level \(level), \(name)! The city takes notice.", "You've reached level \(level), \(name). Onward."]
        case ("rankup", _):
            let rank = m.fact("rank") ?? "a new rank"
            options = ["\(name), you are now \(rank). Wear it well.", "A new title for \(name): \(rank)."]
        case ("streak", _):
            let s = m.fact("streak") ?? "another day"
            options = ["\(s) and counting, \(name). Don't break it now."]
        case ("daily_done", _):
            let q = m.fact("quest") ?? "Today's quest"
            options = ["\(q): done. Nicely handled, \(name).", "Quest complete, \(name). \(q), ticked off."]
        case ("hint", _): options = ["A little help never hurt anyone, \(name).", "Spent wisely, \(name). Now finish it."]
        case ("legend", _):
            options = ["I felt this shrine wake the night the city first dreamed. It still hums when someone like you comes close.",
                       "People pass \(place) every day. Very few notice the shrine. You did.",
                       "Nobody remembers who first marked \(place). I do. Keep coming back and I might tell you.",
                       "The shrine at \(place) is older than the street around it. It does not like to be rushed."]
        case ("recap", _):
            let played = m.fact("points_played") ?? "a few"
            let xp = m.fact("xp_today") ?? "some"
            options = ["\(played) points played, \(xp) XP earned. Not a bad day's work, \(name)."]
        case ("nudge", _):
            let d = m.fact("distance") ?? "not far"
            options = ["The shrine at \(place) is awake, \(d) from here.",
                       "\(place), \(d) away. I think it wants to meet you, \(name).",
                       "Try \(place) next. It's \(d) away."]
        default:
            options = ["I'm right here, \(name)."]
        }
        let seed = m.input.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0x7fffffff }
        return options[seed % options.count]
    }
}
