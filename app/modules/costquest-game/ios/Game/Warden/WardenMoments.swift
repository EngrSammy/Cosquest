import Foundation

/// The facts for each moment, from what the game actually knows.
///
/// Only what the server reported goes in. The model can only be as right as
/// its facts, and these are the player's real numbers.
extension RoamStore {
    var wardenStyle: WardenStyle { WardenStyle(faction: me?.faction) }
    var playerName: String { profile?.handle ?? me?.handle ?? "traveller" }

    func arriveMoment(_ p: QuestPoint) -> WardenMoment {
        let s = me?.standing
        var facts: [(String, String?)] = [
            ("name", playerName), ("place", p.name), ("tier", p.tier),
            ("challenge", p.challenge), ("questions", p.realm),
            ("level", s.map { String($0.level) }),
        ]
        if let s, !s.max_level, s.level_span - s.into_level < 200 {
            facts.append(("to_next", "\(s.level_span - s.into_level) XP"))
        }
        if let st = me?.streak, st.days >= 2 { facts.append(("streak", "\(st.days) days")) }
        if me?.streak.played_today == false { facts.append(("first_point_today", "yes")) }
        return WardenMoment("arrive", style: wardenStyle, facts, salt: me?.day ?? "")
    }

    /// Written while the player reads the question, so the reaction is ready
    /// the instant the verdict lands.
    func reactionMoment(correct: Bool, point: QuestPoint, kind: String,
                        verdict: RoamVerdict? = nil) -> WardenMoment {
        var facts: [(String, String?)] = [("name", playerName), ("place", point.name),
                                          ("challenge", kind)]
        if let v = verdict {
            if kind == "blitz" { facts.append(("score", "\(v.correct) of \(v.total)")) }
            if correct, v.answer_run >= 2 { facts.append(("run", "\(v.answer_run) right in a row")) }
            if correct { facts.append(("xp_gained", String(v.reward.xp))) }
        }
        return WardenMoment(correct ? "correct" : "wrong", style: wardenStyle, facts,
                            salt: verdict?.attempt_id ?? "")
    }

    func lateMoment(_ point: QuestPoint) -> WardenMoment {
        WardenMoment("late", style: wardenStyle, [("name", playerName), ("place", point.name)])
    }

    func levelMoment(_ v: RoamVerdict) -> WardenMoment {
        if v.rank_up {
            return WardenMoment("rankup", style: wardenStyle,
                                [("name", playerName), ("rank", v.after.rank),
                                 ("level", String(v.after.level))])
        }
        return WardenMoment("levelup", style: wardenStyle,
                            [("name", playerName), ("level", String(v.after.level)),
                             ("rank", v.after.rank)])
    }

    func dailyMoment(_ d: RoamDaily) -> WardenMoment {
        WardenMoment("daily_done", style: wardenStyle,
                     [("name", playerName), ("quest", d.title), ("reward", "\(d.reward.xp) XP")])
    }

    func hintMoment(_ kind: String) -> WardenMoment {
        WardenMoment("hint", style: wardenStyle,
                     [("name", playerName), ("hint", kind == "fifty" ? "50/50" : "extra time")])
    }

    /// A place's legend belongs to the place, not the player: the same for
    /// everyone in a faction, so it is cached for good.
    func legendMoment(_ p: QuestPoint) -> WardenMoment {
        WardenMoment("legend", style: wardenStyle,
                     [("place", p.name), ("tier", p.tier), ("realm", p.realm)])
    }

    func nudgeMoment() -> WardenMoment? {
        // The best next move, not merely the nearest: a rare point with your
        // Blitz daily beats a café across the road.
        guard let pick = bestNext() ?? nearby.first(where: { !$0.isCooling && !inReach($0) }).map({ ($0, nil) }),
              let d = distance(to: pick.0) else { return nil }
        let near = pick.0
        var facts: [(String, String?)] = [("name", playerName), ("nearest", near.name),
                                          ("distance", "\(Int((d / 10).rounded() * 10)) m"),
                                          ("tier", near.tier)]
        if let why = pick.1 {
            facts.append(("daily_left", why))
        } else if let left = me?.dailies.first(where: { !$0.done }) {
            facts.append(("daily_left", left.title))
        }
        if let war, let mine = me?.faction,
           let i = war.standings.firstIndex(where: { $0.faction == mine }), war.total > 0 {
            let where_ = i == 0 ? "leads" : (i == 1 ? "is 2nd" : "trails")
            facts.append(("faction_standing", "\(war.standings[i].name) \(where_) this week"))
        }
        return WardenMoment("nudge", style: wardenStyle, facts,
                            salt: "\(Int(Date().timeIntervalSince1970 / 600))")
    }

    func recapMoment() -> WardenMoment? {
        guard let me, let t = me.today, t.points_played > 0 else { return nil }
        var facts: [(String, String?)] = [
            ("name", playerName), ("points_played", String(t.points_played)),
            ("correct", String(t.correct)), ("xp_today", String(t.xp)),
            ("faction", me.faction_name), ("best_place", t.best_place),
            ("level_now", String(me.standing.level)),
        ]
        if let war, let mine = me.faction,
           let i = war.standings.firstIndex(where: { $0.faction == mine }), war.total > 0 {
            facts.append(("faction_rank_this_week", ["1st", "2nd", "3rd", "4th", "5th"][min(i, 4)]))
        }
        return WardenMoment("recap", style: wardenStyle, facts,
                            salt: "\(t.points_played)-\(t.xp)")
    }
}
