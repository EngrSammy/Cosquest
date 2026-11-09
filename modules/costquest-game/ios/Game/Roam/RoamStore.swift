import CoreLocation
import Foundation
import os

private let roamLog = Logger(subsystem: "net.costquest", category: "roam")

/// Everything the always-on game knows, for every Roam screen.
///
/// One object at the root rather than one per screen, because the map, the
/// encounter and the reward screen are three views of the same moment: a
/// player who answers a question expects the map behind them to show the point
/// cooling down and their level having moved, without a reload.
///
/// Nothing here decides an outcome. Distances are shown so a player knows
/// whether to keep walking, and the Play button follows them, but the server
/// is the one that says yes; its refusal is shown in its own words.
@MainActor
@Observable
final class RoamStore {
    let location = PlayerLocation()
    private let client = GameClient()

    private(set) var config: RoamConfig?
    private(set) var me: RoamMe?
    /// Handle and avatar, from the profile the rest of the app already keeps.
    private(set) var profile: Profile?
    private(set) var points: [QuestPoint] = []
    private(set) var war: FactionWar?
    private(set) var leaders: RoamLeaders?
    private(set) var region: String = "world"
    /// Why the world is empty, when it is. Nil while things are fine.
    private(set) var problem: String?
    private(set) var loadedOnce = false
    @ObservationIgnored private var basicsRetry = 0

    /// Where the world was last cut. The ground and points are fetched around
    /// this, and fetched again once the player has walked far enough from it.
    private(set) var centre: CLLocationCoordinate2D?
    private var pointsFetchedAt: CLLocation?
    private var pointsFetchedTime = Date.distantPast
    private var starterAsked = false

    /// How close the server wants a player to be, plus the GPS allowance it
    /// adds. Only for the button: the server judges.
    var reachM: Double { (config?.open_radius_m ?? 40) + min(max(accuracy, 0), 25) }

    /// A good fix when there is one, else a rough one so the world still
    /// draws. The server judges reach from the accuracy either way.
    var coordinate: CLLocationCoordinate2D? { location.coordinate ?? location.roughCoordinate }
    /// Precise Location is off, or the fix is poor: points can't be played.
    var locationIsRough: Bool { location.coordinate == nil && location.roughCoordinate != nil }
    var accuracy: Double { location.coordinate != nil ? location.accuracy : location.roughAccuracy }
    /// Only once the server has actually answered: a failed first call used
    /// to read as "no faction" and open a faction picker with no factions.
    var needsOnboarding: Bool { loadedOnce && me != nil && config != nil && me?.faction == nil }

    func start() {
        location.onUpdate = { [weak self] in self?.locationMoved() }
        // A player who has never been asked is asked during onboarding, with
        // the reason in front of them, not by a system prompt on launch.
        if CLLocationManager().authorizationStatus != .notDetermined { location.start() }
        Task { await loadBasics() }
    }

    /// Start location now (after onboarding explains it, or on the home for a
    /// returning player who was never asked).
    func startLocation() { location.start() }

    func loadBasics() async {
        do {
            async let c = client.roamConfig()
            async let m = client.roamMe()
            let (cfg, mine) = try await (c, m)
            config = cfg
            me = mine
            problem = nil
            profile = try? await client.myProfile()
            await refreshBag()
        } catch {
            roamLog.error("roam basics failed: \(String(describing: error))")
            problem = "Can't reach CosQuest right now."
            // Tried again by itself: a single timed-out request left the
            // player chip blank and onboarding unopened until a relaunch.
            basicsRetry += 1
            let wait = min(30, 2 << min(basicsRetry, 4))
            Task { [weak self] in
                try? await Task.sleep(for: .seconds(wait))
                guard let self, self.me == nil else { return }
                await self.loadBasics()
            }
        }
        if me != nil { basicsRetry = 0 }
        if let f = RoamDev.faction, me?.faction == nil {
            try? await saveProfile(handle: "Tester", avatar: .init(face: 1, mark: 1, tint: "#3FA7D6"))
            try? await chooseFaction(f)
        }
        loadedOnce = true
        await refreshPoints(force: true)
    }

    private func locationMoved() {
        guard let here = coordinate else { return }
        let now = CLLocation(latitude: here.latitude, longitude: here.longitude)
        // Re-cut the world a good way before its edge, so walking never
        // reaches bare ground.
        if let c = centre {
            let from = CLLocation(latitude: c.latitude, longitude: c.longitude)
            if now.distance(from: from) > 300 { centre = here }
        } else {
            centre = here
        }
        let stale = pointsFetchedAt.map { now.distance(from: $0) > 60 } ?? true
        if stale || Date().timeIntervalSince(pointsFetchedTime) > 90 {
            Task { await refreshPoints() }
        }
    }

    func refreshPoints(force: Bool = false) async {
        guard let here = coordinate else { return }
        if !force, Date().timeIntervalSince(pointsFetchedTime) < 5 { return }
        pointsFetchedTime = Date()
        pointsFetchedAt = CLLocation(latitude: here.latitude, longitude: here.longitude)
        if centre == nil { centre = here }
        do {
            let got = try await client.questPoints(lat: here.latitude, lng: here.longitude)
            points = got.points
            #if DEBUG
            // -duelPoints 1: the "everything is a fight" look before the
            // server turns it on (for screenshots).
            if UserDefaults.standard.bool(forKey: "duelPoints") { points = RoamDev.asDuels(points) }
            #endif
            region = got.region
            problem = nil
        } catch {
            roamLog.error("points failed: \(String(describing: error))")
            if points.isEmpty { problem = "Can't find Quest Points right now." }
        }
        await ensureStarter()
        Task { await refreshWar() }
    }

    /// A new player's first point, placed beside them, so the first thing the
    /// game asks is never "walk half a kilometre".
    private func ensureStarter() async {
        guard let me, me.faction != nil, !me.tutorial_done, !starterAsked,
              let here = coordinate else { return }
        guard !points.contains(where: { $0.source == "starter" }) else { return }
        starterAsked = true
        do {
            let s = try await client.starter(lat: here.latitude, lng: here.longitude,
                                             accuracy: accuracy)
            if let p = s.starter { points.insert(p, at: 0) }
        } catch {
            starterAsked = false
            roamLog.error("starter failed: \(String(describing: error))")
        }
    }

    func refreshWar() async {
        guard let here = coordinate else { return }
        async let w = try? client.factionWar(lat: here.latitude, lng: here.longitude)
        async let l = try? client.roamLeaders(lat: here.latitude, lng: here.longitude)
        let (war, leaders) = await (w, l)
        if let war { self.war = war }
        if let leaders { self.leaders = leaders }
    }

    func refreshMe() async {
        if let m = try? await client.roamMe() { me = m }
        if let p = try? await client.myProfile() { profile = p }
    }

    func saveProfile(handle: String, avatar: Profile.Avatar) async throws {
        try await client.saveProfile(handle: handle, avatar: avatar)
        profile = try? await client.myProfile()
        await refreshMe()
    }

    func chooseFaction(_ id: String) async throws {
        me = try await client.chooseFaction(id)
        await refreshPoints(force: true)
    }

    // MARK: - Distances, for the interface only

    func distance(to p: QuestPoint) -> Double? {
        guard let here = coordinate else { return nil }
        return CLLocation(latitude: here.latitude, longitude: here.longitude)
            .distance(from: CLLocation(latitude: p.lat, longitude: p.lng))
    }

    /// Which way a point is from where the phone faces, in degrees clockwise;
    /// nil without a compass heading.
    func bearing(to p: QuestPoint) -> Double? {
        guard let here = coordinate, let heading = location.trueNorth else { return nil }
        let lat1 = here.latitude * .pi / 180, lat2 = p.lat * .pi / 180
        let dLng = (p.lng - here.longitude) * .pi / 180
        let y = sin(dLng) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
        let b = atan2(y, x) * 180 / .pi
        return (b - heading + 360).truncatingRemainder(dividingBy: 360)
    }

    func inReach(_ p: QuestPoint) -> Bool {
        guard let d = distance(to: p) else { return false }
        return d <= reachM
    }

    /// Nearest first. The tray and the map both read this.
    var nearby: [QuestPoint] {
        visiblePoints.sorted { (distance(to: $0) ?? .infinity) < (distance(to: $1) ?? .infinity) }
    }

    // MARK: - Playing

    func open(_ p: QuestPoint) async throws -> RoamAttempt {
        guard let here = coordinate else {
            throw RoamError.noLocation
        }
        return try await client.openPoint(p.id, lat: here.latitude, lng: here.longitude,
                                          accuracy: accuracy)
    }

    func submit(_ attempt: RoamAttempt, answers: [RoamAnswer]) async throws -> RoamVerdict {
        let v = try await client.answer(attempt: attempt.attempt_id, answers: answers)
        if let m = v.me { me = m }
        // The point cools down for this player; show it straight away rather
        // than on the next fetch.
        if let i = points.firstIndex(where: { $0.id == v.point_id }) {
            let old = points[i]
            if old.source == "starter" {
                points.remove(at: i)
            } else {
                points[i] = QuestPoint(id: old.id, name: old.name, lat: old.lat, lng: old.lng,
                                       source: old.source, place_kind: old.place_kind,
                                       tier: old.tier, realm: old.realm,
                                       challenge: old.challenge, distance_m: old.distance_m,
                                       cooling_until: v.cooling_until)
            }
        }
        Task { await refreshWar() }
        return v
    }

    /// Buy help with an open challenge. The coin balance is the server's.
    func hint(_ attempt: RoamAttempt, kind: String, question: Int) async throws -> RoamHint {
        let h = try await client.hint(attempt: attempt.attempt_id, kind: kind, question: question)
        me?.coins = h.coins
        noteBag(h.bag)
        return h
    }

    var hintPrices: RoamConfig.Hints? { config?.hints }

    // MARK: - Items

    private(set) var bag: [String: Int] = [:]
    private(set) var itemNames: [String: String] = [:]

    func refreshBag() async {
        if let b = try? await client.bag() { bag = b.bag; itemNames = b.names }
    }

    func spin(_ p: QuestPoint) async throws -> RoamSpin {
        guard let here = coordinate else { throw RoamError.noLocation }
        let r = try await client.spin(p.id, lat: here.latitude, lng: here.longitude, accuracy: accuracy)
        bag = r.bag
        itemNames = r.names
        if let i = points.firstIndex(where: { $0.id == p.id }) {
            var e = points[i].extra ?? [:]
            e["spin_ready_at"] = r.spin_ready_at
            points[i].extra = e
        }
        Task { await refreshMe() }
        return r
    }

    func retry(_ attempt: RoamAttempt) async throws -> RoamAttempt {
        guard let here = coordinate else { throw RoamError.noLocation }
        let a = try await client.retry(attempt: attempt.attempt_id, lat: here.latitude,
                                       lng: here.longitude, accuracy: accuracy)
        bag["retry", default: 1] -= 1
        return a
    }

    /// Hint results carry the bag, so the counts stay honest.
    func noteBag(_ b: [String: Int]?) { if let b { bag = b } }

    /// A feature that knows a point just changed (a siege flipped it) shows
    /// it at once, ahead of the next fetch.
    func patchPoint(_ id: String, _ change: (inout [String: String]) -> Void) {
        guard let i = points.firstIndex(where: { $0.id == id }) else { return }
        var e = points[i].extra ?? [:]
        change(&e)
        points[i].extra = e
    }

    /// Features call this after their own writes to pull fresh standing.
    func featureChanged() { Task { await refreshMe(); await refreshPoints(force: true) } }

    let api = GameClient()

    func factionName(_ id: String?) -> String {
        guard let id else { return "No faction" }
        return config?.factions.first { $0.id == id }?.name ?? id.capitalized
    }
}

enum RoamError: LocalizedError {
    case noLocation
    var errorDescription: String? {
        switch self {
        case .noLocation: return "Waiting for your location."
        }
    }
}
