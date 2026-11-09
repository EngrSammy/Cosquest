import Foundation

// What the fantasy action battle speaks (costquest-research/29_battle_connect.md):
// its finish payload, and the peek DuelView uses to tell it from a duel.

/// What Unity's Battle scene reports at the end (BattleBridge "finished").
/// Different from DuelFinished: the fight is one hero against waves and a
/// Guardian, not two fighters, and its inputs are the engine's wire rows
/// (8 numbers per row, engine wire v2).
struct BattleFinished: Decodable, Sendable, Equatable {
    struct Result: Decodable, Sendable, Equatable {
        let won: Bool
        /// GuardianDefeated | HeroDefeated | Timeout
        let end_reason: String
        let ticks: Int
        let hero_hp: Int
        let kills: Int
    }
    let result: Result
    let inputs: [[Int]]
    /// 16 hex digits: the engine's final state hash.
    let hash: String
}

/// The bits of a battle setup the app reads itself (the rest goes to Unity
/// untouched). `kind` is how DuelView will tell a battle from a duel.
struct BattleSetupPeek: Decodable, Sendable, Equatable {
    struct Hero: Decodable, Sendable, Equatable {
        let name: String?
        let `class`: String?
        let level: Int?
        let faction: String?
    }
    let kind: String?
    let hero: Hero?
    let guardian_name: String?

    var isBattle: Bool { kind == "battle" }
}

extension BattleFinished {
    /// The finish body the server takes: the same shape as a duel's, with the
    /// battle's end reason and kill count added. 1 is the player, 2 the Guardian.
    var asDuelFinished: DuelFinished {
        DuelFinished(result: DuelResult(winner: result.won ? 1 : 2, ticks: result.ticks,
                                        p1_hp: result.hero_hp, p2_hp: result.won ? 0 : 1,
                                        end_reason: result.end_reason, kills: result.kills),
                     inputs: inputs, hash: hash)
    }
}
