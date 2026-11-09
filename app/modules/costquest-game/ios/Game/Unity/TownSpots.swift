import Foundation

/// The named places in the town a game can stand at.
///
/// The world is authored now, so a game's latitude means nothing in it. What
/// means something is "the mall" or "the old church": a landmark two players
/// can both navigate to and both describe the same way.
///
/// **The order here is a contract with `TownGenerator.AnchorSpots` on the Unity
/// side.** Index N in this list must be index N in that one, or the label the
/// card shows and the beacon Unity plants will disagree. Unity logs its own
/// list at startup so a drift is visible rather than silent.
///
/// The host resolves the assignment rather than Unity, because the host is what
/// holds the full set of games and the labels have to match exactly. Unity is
/// told the answer.
enum TownSpots {
    /// In the same order as the Unity side's AnchorSpots.
    static let names = [
        "The market square",
        "The mall",
        "The park",
        "The old church",
        "The tower",
        "The school",
        "The high street",
        "The station yard",
        "The lake",
        "The north gate",
        "The west meadow",
        "The retail row",
    ]

    /// A stable slot for an id.
    ///
    /// FNV-1a rather than `hashValue`: Swift seeds its hasher per process, so
    /// the same game would land at a different landmark on every launch. That
    /// is precisely the bug this exists to prevent, and it would have looked
    /// like the world reshuffling itself for no reason.
    static func stableIndex(_ id: String, slots: Int) -> Int {
        guard slots > 0 else { return 0 }
        var h: UInt32 = 2_166_136_261
        for byte in id.utf8 {
            h ^= UInt32(byte)
            h = h &* 16_777_619
        }
        return Int(h % UInt32(slots))
    }

    /// The landmark a game stands at.
    ///
    /// Depends on the game's id and NOTHING else. That matters: the field map
    /// knows only the game it is in, so any rule that depended on which other
    /// games happened to be listed would put the beacon at one landmark and
    /// the in-game camera at another.
    ///
    /// Two games can therefore share a landmark, and that is allowed. They both
    /// really are at the mall; the world stands them a few metres apart. The
    /// earlier design probed to the next free landmark instead, which kept them
    /// separate at the cost of making a game's place depend on its neighbours.
    static func spot(for gameID: String) -> Int {
        stableIndex(gameID, slots: names.count)
    }

    static func place(for gameID: String) -> String {
        name(for: spot(for: gameID))
    }

    static func name(for slot: Int) -> String {
        guard slot >= 0, slot < names.count else { return "Somewhere in town" }
        return names[slot]
    }
}
