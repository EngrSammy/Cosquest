import Foundation

/// Launch arguments that drive Roam without a finger, for checking screens
/// in the simulator. Debug builds only.
///
///     -roamFaction gaming    finish onboarding as "Tester" in that faction
///     -roamOpen 1            open the nearest playable point on launch
///     -roamAutoPlay 1        tap the shrine, then answer choice 0
///     -roamSheet dailies|war|profile|recap|relics|battle|trials|more|drop|shards   open a sheet (drop/shards: a reward with a Relic)
///     -roamSiege 1           open a siege on the nearest rival-held point
///     -roamRelic <id>|equipped   with -roamSheet relics, open that Relic
///     -forgeWeapon <id>|first    with -roamSheet relics, open that Forge weapon
///     -forgeCatalogue NO     hide Forge weapons (any build; see ForgeFlags)
///     -roamRoom start|join   with -roamSheet battle, start a private room, or join the nearest
enum RoamDev {
    #if DEBUG
    static var faction: String? { UserDefaults.standard.string(forKey: "roamFaction") }
    static var open: Bool { UserDefaults.standard.bool(forKey: "roamOpen") }
    static var autoPlay: Bool { UserDefaults.standard.bool(forKey: "roamAutoPlay") }
    static var sheet: String? { UserDefaults.standard.string(forKey: "roamSheet") }
    static var siege: Bool { UserDefaults.standard.bool(forKey: "roamSiege") }
    #else
    static let faction: String? = nil
    static let open = false
    static let autoPlay = false
    static let sheet: String? = nil
    static let siege = false
    #endif
}

#if DEBUG
extension RoamDev {
    /// Every point as a Guardian duel, and the nearest turned into a boss with
    /// live HP, for `-duelPoints 1` screenshots.
    static func asDuels(_ pts: [QuestPoint]) -> [QuestPoint] {
        pts.enumerated().map { i, p in
            var extra = p.extra ?? [:]
            extra["guardian"] = "Keeper of \(p.name)"
            var source = p.source
            if i == 0 {
                source = "raid"
                extra["raid_hp"] = "6200"; extra["raid_hp_max"] = "10000"; extra["raid_players"] = "4"
                extra["raid_until"] = ISO8601DateFormatter().string(from: Date().addingTimeInterval(1500))
            }
            return QuestPoint(id: p.id, name: p.name, lat: p.lat, lng: p.lng, source: source,
                              place_kind: p.place_kind, tier: p.tier, realm: p.realm,
                              challenge: "duel", distance_m: p.distance_m,
                              cooling_until: p.cooling_until, extra: extra)
        }
    }
}
#endif
