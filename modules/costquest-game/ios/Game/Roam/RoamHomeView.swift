import CoreLocation
import SwiftUI
import UIKit

/// Where the app opens: the street you are standing in, with something to do
/// on it.
///
/// This is the screen the game was missing. Before it, the app opened on a
/// list of scheduled events, and on any day without one there was nothing to
/// play. Now the world around the player has Quest Points on its real
/// landmarks, the player stands among them with a disc showing their reach,
/// and anything inside the disc can be played.
///
/// Events have not gone anywhere: they are the flag on the right, and they pay
/// into the same level and faction.
struct RoamHomeView: View {
    let store: RoamStore
    let warden: Warden
    var onEvents: () -> Void
    /// Into the Events flow for a Room's game, side preset to the faction.
    var onRoom: (String) -> Void = { _ in }

    @State private var selected: QuestPoint?
    @State private var encounter: QuestPoint?
    @State private var showDailies = false
    @State private var showCoins = false
    @State private var showWar = false
    @State private var showProfile = false
    @State private var banner = GameBannerModel()
    @State private var devOpened = false
    @State private var legend: String?
    @State private var asking = false
    @State private var showRecap = false
    /// Everything that is not on the four-button rail.
    @State private var showMore = false
    /// Guardian Duel: the Trials ladders, and the fight being played.
    @State private var showTrials = false
    @State private var duel: DuelRequest?
    #if DEBUG
    @State private var duelPreview: DuelPreviewBox?
    #endif
    /// First run lives on the world home and nowhere else: a player who opens
    /// a game from a link goes straight to that game, and the event's own
    /// entry screen asks for their side.
    @State private var onboarding = false
    /// Bumped when an unlock is dismissed, so the next one can show.
    @State private var unlockTick = 0
    /// Bumped when a coach step is dealt with: what has been said lives in
    /// UserDefaults, which SwiftUI does not watch.
    @State private var coachTick = 0
    @State private var showRelics = false
    @State private var showBattle = false
    /// A beacon tapped on the map: the Battle sheet opens on that room.
    @State private var battleFocus: String?
    @State private var rooms = RoomsModel()
    /// The Quest Run: the headline loop. While one is live, the map shows its
    /// points and the tray becomes the route.
    @State private var run = RunModel.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var showRunStart = false
    @State private var runPoint: RunPoint?
    /// Debug only: a reward screen with a Relic drop in it.
    @State private var previewVerdict: RoamVerdict?

    private var voice: WardenVoice { warden.voice }

    private var stage: some View {
        ZStack {
            world
            chrome
            if let b = banner.current {
                GameBannerView(banner: b)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 150)
            }
        }
    }

    /// Everything over the map: the top bar, the banners, the lower half and
    /// the rail.
    private var chrome: some View {
        VStack(spacing: 0) {
            topBar
            worldBanners
            Spacer(minLength: 0)
            bottom.transition(.opacity)
        }
        // The card is the one thing to read while it is open; the rail
        // would sit on top of it.
        // High on the right, under the top bar.
        .overlay(alignment: .topTrailing) {
            if showsRail {
                rail.padding(.top, 72)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
    }

    /// The pocket board is full width; the rail would sit on its tiles.
    private var showsRail: Bool {
        let pocket = run.live && run.run?.isPocket == true
        return store.centre != nil && selected == nil && !pocket
    }

    private var worldBanners: some View {
        VStack(spacing: 6) {
            if run.live { RunHUD(store: store, model: run) }
            LiveBanner(store: store)
            if store.unlocked(.raids) { RaidBanner(store: store) { boss in selected = boss } }
        }
        .frame(maxWidth: 560)
        .padding(.leading, 14)
        // The rail's buttons sit on the right; the banners stop short of them.
        .padding(.trailing, showsRail ? 84 : 14)
        .padding(.top, 6)
        .transition(.opacity)
    }

    private var presented: some View {
        stage
        .overlayPreferenceValue(RailAnchorKey.self) { anchors in
            if let step = coachStep {
                WardenCoachOverlay(step: step, tint: factionColor, style: store.wardenStyle,
                                   speaker: voice.speaker, anchors: anchors,
                                   onAction: { coachAct(step) }, onLater: { coachLater(step) })
                    .id(step.id)
                    .transition(.opacity)
            }
        }
        .animation(.smooth(duration: 0.4), value: coachStep?.id)
        .gameType()
        .animation(.smooth(duration: 0.3), value: selected?.id)
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: banner.current)
        .sidePanel(isPresented: $showDailies) { DailiesSheet(store: store) }
        .sidePanel(isPresented: $showMore) { moreSheet }
        .sidePanel(isPresented: $showCoins) { CoinsSheet(store: store) }
        .sidePanel(isPresented: $showRunStart) {
            RunStartSheet(store: store, model: run) {}
        }
        .fullScreenCover(item: $runPoint) { p in
            RunChallengeView(store: store, model: run, point: p) { runPoint = nil }
        }
        .fullScreenCover(isPresented: Binding(get: { run.finished != nil && runPoint == nil },
                                              set: { if !$0 { run.close() } })) {
            if let f = run.finished {
                RunResultsView(store: store, model: run, result: f) { run.close() }
            }
        }
        // Back from the background: the run may have ended, or a lost one be
        // found again (review 14, #10).
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await run.resume(store) } }
        }
        .task {
            await run.resume(store)
            #if DEBUG
            // -runOpen 1: open the run's first playable point.
            if UserDefaults.standard.bool(forKey: "runOpen"),
               let p = run.run?.points.first(where: { !$0.done && !$0.hidden && !$0.forbidden }) {
                runPoint = p
            }
            #endif
        }
        .sidePanel(isPresented: $showWar) { WarSheet(store: store) }
        .sidePanel(isPresented: $showRecap) { RecapSheet(store: store, voice: voice) }
        .sidePanel(isPresented: $showTrials) {
            TrialsSheet(store: store) { request in duel = request }
        }
        #if DEBUG
        .fullScreenCover(item: $duelPreview) { box in
            DuelResultPreview(kind: box.id, store: store) { duelPreview = nil }
        }
        #endif
        .fullScreenCover(item: $duel) { request in
            DuelView(store: store, request: request) { outcome in
                duel = nil
                if outcome?.status == "won", outcome?.mode == "trial" {
                    banner.show("Guardian beaten!", subtitle: outcome?.trial?.name,
                                color: RoamStyle.realmColor(store.me?.faction), sound: .fanfare)
                }
            }
        }
        .sidePanel(isPresented: $showRelics) { RelicdexSheet(store: store) }
        .fullScreenCover(item: Binding(get: { previewVerdict.map(PreviewBox.init) },
                                       set: { previewVerdict = $0?.verdict })) { box in
            RewardView(verdict: box.verdict, pointName: "Big Ben") { previewVerdict = nil }
                .background(GameBackdrop())
        }
        .sidePanel(isPresented: $showBattle, onDismiss: { battleFocus = nil }) {
            BattleSheet(store: store, rooms: rooms, focusGameID: battleFocus) { id in
                // After the sheet has gone, so the Events flow is not
                // presented under a closing sheet.
                Task {
                    try? await Task.sleep(for: .milliseconds(350))
                    onRoom(id)
                }
            }
        }
    }

    var body: some View {
        presented
        .onAppear { if store.needsOnboarding { openOnboarding() } }
        .onChange(of: onboarding) { _, open in
            // A returning player who was never asked for location is asked
            // here, once the home is what they are looking at.
            if !open, store.loadedOnce, !store.needsOnboarding { store.startLocation() }
        }
        .onChange(of: store.loadedOnce) { _, loaded in
            if loaded, !store.needsOnboarding { store.startLocation() }
        }
        // Opened by the server's answer, and closed only by onboarding itself:
        // choosing a house clears `needsOnboarding` halfway through, and
        // following it here closed the cover before the welcome, the starter
        // Relic and the location question were ever seen.
        .onChange(of: store.needsOnboarding) { _, needs in if needs { openOnboarding() } }
        .fullScreenCover(isPresented: $onboarding) {
            OnboardingView(store: store) { onboarding = false }
                .interactiveDismissDisabled()
        }
        .sidePanel(isPresented: $showProfile, width: 620) { ProfileView() }
        .sheet(isPresented: $asking) {
            WardenView(warden: warden,
                       context: Warden.Context(title: "CostQuest", faction: store.me?.faction_name,
                                               isOnline: store.problem == nil))
        }
        .onChange(of: selected?.id) { _, _ in
            legend = nil
            guard let p = selected else { return }
            // The greeting is written while they walk up; the legend while
            // they read the card.
            if store.inReach(p) { voice.prepare(store.arriveMoment(p), priority: .soon) }
            Task {
                let l = await voice.line(for: store.legendMoment(p), wait: .seconds(8))
                if selected?.id == p.id { withAnimation(.smooth) { legend = l.text } }
            }
        }
        .fullScreenCover(item: $encounter) { point in
            if point.source == "raid" {
                if DuelModes.raid(point, store) {
                    // The boss is fought, not quizzed: your damage goes into
                    // the crew's shared pool.
                    DuelView(store: store, request: .raid(point)) { outcome in
                        encounter = nil
                        selected = nil
                        if outcome?.raid?.defeated == true {
                            banner.show("Boss defeated!", subtitle: point.name,
                                        color: RaidLook.color, sound: .fanfare)
                        }
                    }
                } else {
                    RaidView(store: store, point: point, voice: voice) {
                        encounter = nil
                        selected = nil
                    }
                }
            } else if SiegeLook.isSiege(point, store) {
                if store.me?.features?.duel?.siege_mode == "duel" {
                    // A Siege is a real fight against the holder's Guardian
                    // when the server says so; the quiz Siege otherwise.
                    DuelView(store: store, request: .siege(point)) { outcome in
                        encounter = nil
                        selected = nil
                        if outcome?.status == "won" {
                            banner.show("Taken!", subtitle: point.name,
                                        color: RoamStyle.realmColor(store.me?.faction), sound: .fanfare)
                        }
                    }
                } else {
                    SiegeView(store: store, point: point, voice: voice) { won in
                        encounter = nil
                        selected = nil
                        if won {
                            banner.show("Taken!", subtitle: point.name,
                                        color: RoamStyle.realmColor(store.me?.faction), sound: .fanfare)
                        }
                    }
                }
            } else if DuelModes.point(point, store) {
                PointDuelView(store: store, point: point, voice: voice) { outcome in
                    encounter = nil
                    selected = nil
                    if outcome?.status == "won" {
                        banner.show("Guardian beaten!", subtitle: point.name,
                                    color: RoamStyle.realmColor(store.me?.faction), sound: .fanfare)
                    }
                    if outcome?.point?.extras?.contains(where: { $0.kind == "relic" }) == true {
                        RelicsModel.shared.noteDrop(store)
                    }
                }
            } else {
                EncounterView(store: store, point: point, voice: voice) { verdict in
                    encounter = nil
                    selected = nil
                    if let verdict { celebrate(verdict) }
                    if verdict?.extras?.contains(where: { $0.kind == "relic" }) == true {
                        RelicsModel.shared.noteDrop(store)
                    }
                }
            }
        }
        .onChange(of: store.points.count) { _, n in
            if let pick = UserDefaults.standard.string(forKey: "roamSelect"), n > 0, !devOpened {
                devOpened = true
                selected = pick == "far" ? store.nearby.first { !store.inReach($0) }
                                         : store.nearby.first
            }
            if RoamDev.siege, n > 0, encounter == nil, !devOpened,
               let p = store.nearby.first(where: { SiegeLook.isSiege($0, store) && store.inReach($0) })
                    ?? store.nearby.first(where: { SiegeLook.isSiege($0, store) }) {
                devOpened = true
                encounter = p
                return
            }
            guard RoamDev.open, n > 0, encounter == nil, !devOpened else { return }
            if let p = store.nearby.first(where: { store.inReach($0) && !$0.isCooling }) {
                devOpened = true
                encounter = p
            }
        }
        .task { warden.requestModel(wifiOnly: true) }
        .task { await nudgeLoop() }
        .task {
            // Cooldowns run out and the war moves while the phone sits still;
            // a map that only updates on a step goes stale on a bench.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                await store.refreshPoints(force: true)
            }
        }
        .task {
            switch RoamDev.sheet {
            case "dailies": showDailies = true
            case "coins": showCoins = true
            case "war": showWar = true
            case "profile": showProfile = true
            case "recap": showRecap = true
            case "relics": showRelics = true
            case "battle": showBattle = true
            case "trials": showTrials = true
            case "more": showMore = true
            #if DEBUG
            case "drop", "shards":
                previewVerdict = RelicDropPreview.verdict(new: RoamDev.sheet == "drop")
            #endif
            default: break
            }
            #if DEBUG
            // -duelDemo 1: an AI-vs-AI fight in the Duel scene (device only).
            if UserDefaults.standard.bool(forKey: "duelDemo") { duel = .demo }
            if let k = UserDefaults.standard.string(forKey: "duelResult") { duelPreview = DuelPreviewBox(id: k) }
            #endif
        }
        .task {
            // Rooms come and go in minutes, so their beacons are polled on
            // their own, in one loop that is never restarted (a restarted
            // task cancelled the fetch in flight and the beacons never came).
            while !Task.isCancelled {
                // Quickly until the player is known and the first fetch is
                // in, then every half minute.
                guard store.loadedOnce, store.unlocked(.battle) else {
                    try? await Task.sleep(for: .seconds(2))
                    continue
                }
                await rooms.refresh(store)
                try? await Task.sleep(for: .seconds(rooms.loaded ? 30 : 2))
            }
        }
        .onChange(of: store.me?.holds_lost ?? []) { _, lost in noticeLost(lost) }
        // [merged-app] A chat invite or a cosquest://play link: open its point.
        .modifier(GameHostOpenHook(store: store, selected: $selected, banner: banner))
        .onChange(of: showProfile) { _, open in
            if !open { Task { await store.refreshMe() } }
        }
    }


    /// Without the slide up: a new player should meet the Warden, not watch
    /// a map they cannot use yet get covered.
    private func openOnboarding() {
        guard !onboarding else { return }
        var t = Transaction()
        t.disablesAnimations = true
        withTransaction(t) { onboarding = true }
    }

    // MARK: - The world

    @ViewBuilder private var world: some View {
        if let centre = store.centre {
            WorldView(centre: centre,
                      radiusM: 700,
                      playerOffset: offset(of: store.coordinate ?? centre, from: centre),
                      objects: mapPoints.map { object(for: $0, centre: centre) }
                          + (run.live ? [] : roomObjects(centre: centre)),
                      onSelect: { id in
                          if let p = run.point(forObject: id) {
                              if !p.done { runPoint = p }
                              return
                          }
                          if run.live { return }
                          if let game = RoomBeacons.gameID(fromObject: id) {
                              battleFocus = game
                              showBattle = true
                              return
                          }
                          selected = store.points.first { $0.id == id }
                      },
                      player: PlayerPawn(tint: UIColor(factionColor),
                                         reachM: Float(store.reachM)),
                      facing: store.location.trueNorth,
                      initialDolly: 180,
                      buildingScale: 0.18,
                      zoomTilt: true,
                      palette: .meadow)
                .ignoresSafeArea()
        } else {
            ZStack {
                GameBackdrop()
                VStack(spacing: 14) {
                    Image("Logo", bundle: .costQuestGame).shadow(color: .black.opacity(0.3), radius: 8, y: 5)
                    if store.location.denied {
                        // The game is the street you are standing in, so
                        // without location there is nothing to draw.
                        Text("CosQuest needs your location to put the game around you.")
                            .font(GameFont.display(20))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 30)
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                        }
                        .buttonStyle(.game(GamePalette.sun, fullWidth: false))
                        Button("Play an event instead") { onEvents() }
                            .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
                    } else {
                        if store.loadedOnce {
                            Text("Finding where you are…")
                                .font(GameFont.display(20))
                                .foregroundStyle(.white)
                        }
                        ProgressView().tint(.white).controlSize(.large)
                    }
                }
            }
        }
    }

    private func offset(of c: CLLocationCoordinate2D,
                        from o: CLLocationCoordinate2D) -> SIMD2<Float> {
        let x = (c.longitude - o.longitude) * 111_320 * cos(o.latitude * .pi / 180)
        let z = (c.latitude - o.latitude) * 111_320
        return SIMD2(Float(x), Float(z))
    }

    private func object(for p: QuestPoint, centre: CLLocationCoordinate2D) -> SceneObject {
        SceneObject(id: p.id,
                    offset: offset(of: p.coordinate, from: centre),
                    tint: RaidLook.tint(p) ?? HoldLook.tint(p) ?? RoamStyle.tierUIColor(p.tier),
                    style: .shrine(dimmed: p.isCooling),
                    headHeight: 19)
    }

    /// Public rooms nearby, as beacons among the shrines.
    private func roomObjects(centre: CLLocationCoordinate2D) -> [SceneObject] {
        guard store.unlocked(.battle) else { return [] }
        return rooms.nearby.map { r in
            SceneObject(id: RoomBeacons.id(r),
                        offset: offset(of: CLLocationCoordinate2D(latitude: r.lat, longitude: r.lng), from: centre),
                        tint: RoomBeacons.tint, style: .room, headHeight: 33)
        }
    }

    private var factionColor: Color { RoamStyle.realmColor(store.me?.faction) }

    /// During a street run the map shows only the run: ten points and a
    /// route to choose. Everything else is noise against the clock.
    private var mapPoints: [QuestPoint] {
        guard run.live else { return store.visiblePoints }
        // A pocket run is played on its board, not the map: nothing on the
        // map to tap into a regular encounter mid-run (review 14, #20).
        return run.run?.isPocket == false ? run.questPoints() : []
    }

    private func endRun() {
        Task { await run.finish(store) }
    }

    // MARK: - Furniture

    /// One row: who you are on the left, what you hold on the right. It used
    /// to stack the Relic, coins, items and streak down the right edge, which
    /// pushed the rest of the screen down.
    private var topBar: some View {
        HStack(alignment: .center, spacing: 8) {
            Button { showProfile = true } label: {
                PlayerChip(me: store.me, profile: store.profile)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("You")
            Button { asking = true } label: {
                WardenBadge(tint: factionColor, size: 40, level: voice.speaker.level)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ask the Warden")
            Spacer(minLength: 4)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) { coinChip; streakChip }
                coinChip
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
    }

    private var coinChip: some View {
        Button { showCoins = true } label: {
            ResourceChip {
                GameCoin(size: 18)
                Text("\(store.me?.coins ?? 0)")
                    .font(GameFont.display(16).monospacedDigit())
                    .contentTransition(.numericText())
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(store.me?.coins ?? 0) CosCoins")
        .accessibilityHint("Opens your CosCoins")
    }

    @ViewBuilder private var streakChip: some View {
        if let s = store.me?.streak, s.days > 0 {
            ResourceChip {
                Image(systemName: "flame.fill")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(s.played_today ? GamePalette.sun : .white.opacity(0.6))
                Text("\(s.days)").font(GameFont.display(16).monospacedDigit())
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(s.days) day streak")
        }
    }

    /// Four buttons at most, so the hero is not framed by a column of icons:
    /// the daily quests, the Relics, the Trials (or the Codex before Trials
    /// exist), and More for everything else. FIGHT covers the fights.
    private var rail: some View {
        VStack(spacing: 12) {
            railButton("checklist", color: GamePalette.mint, label: "Daily quests",
                       badge: dailiesLeft) { showDailies = true }
                .railAnchor("dailies")
            if store.unlocked(.relics) {
                RelicsButton(store: store) { showRelics = true }.railAnchor("relics")
            }
            if hasTrials {
                railButton("figure.fencing", color: GamePalette.berry, label: "Guardian Trials",
                           badge: nil) { showTrials = true }
                    .railAnchor("trials")
            } else if store.unlocked(.codex) {
                CodexButton(store: store).railAnchor("codex")
            }
            railButton("square.grid.2x2.fill", color: GamePalette.skyDeep, label: "More",
                       badge: nil) { showMore = true }
                // The coach points at More for anything that lives in it.
                .railAnchors(moreAnchors)
        }
        .padding(.trailing, 12)
        .padding(.top, 0)
    }

    private var hasTrials: Bool { store.me?.features?.duel != nil }

    private var moreAnchors: [String] {
        var ids = ["more", "war", "battle", "recap", "events", "friends"]
        if hasTrials { ids.append("codex") }
        return ids
    }

    /// The rest of the game, one tap under More.
    private var moreSheet: some View {
        MoreSheet(tiles: moreTiles)
    }

    private var moreTiles: [MoreTile] {
        var tiles: [MoreTile] = []
        if store.unlocked(.war) {
            tiles.append(MoreTile(id: "war", symbol: "flag.2.crossed.fill", color: factionColor,
                                  title: "Faction war") { fromMore { showWar = true } })
        }
        if store.unlocked(.battle) {
            tiles.append(MoreTile(id: "battle", symbol: "person.3.fill", color: GamePalette.berry,
                                  title: "Rooms", badge: rooms.nearby.isEmpty ? nil : rooms.nearby.count) {
                fromMore { showBattle = true }
            })
        }
        if hasTrials, store.unlocked(.codex) {
            tiles.append(MoreTile(id: "codex", symbol: "rectangle.stack.fill", color: GamePalette.sun,
                                  title: "Codex", embed: AnyView(CodexButton(store: store))))
        }
        if store.unlocked(.friends) {
            tiles.append(MoreTile(id: "friends", symbol: "person.2.fill", color: GamePalette.berry,
                                  title: "Friends", embed: AnyView(FriendsButton(store: store))))
        }
        let items = store.bag.values.reduce(0, +)
        if items > 0 {
            tiles.append(MoreTile(id: "bag", symbol: "bag.fill", color: GamePalette.sky,
                                  title: "Bag", badge: items, action: nil))
        }
        if store.me?.tutorial_done == true {
            tiles.append(MoreTile(id: "recap", symbol: "book.pages.fill", color: GamePalette.skyDeep,
                                  title: "Your day") { fromMore { showRecap = true } })
        }
        tiles.append(MoreTile(id: "events", symbol: "ticket.fill", color: GamePalette.navy,
                              title: "Events") { fromMore { onEvents() } })
        // Always there, so More is never a sheet with one button in it.
        tiles.append(MoreTile(id: "warden", symbol: "questionmark.bubble.fill", color: factionColor,
                              title: "Ask the Warden") { fromMore { asking = true } })
        tiles.append(MoreTile(id: "profile", symbol: "person.crop.circle.fill", color: GamePalette.skyDeep,
                              title: "Profile") { fromMore { showProfile = true } })
        return tiles
    }

    /// Close More first: two sheets cannot be presented from one view at once.
    private func fromMore(_ action: @escaping () -> Void) {
        showMore = false
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(380))
            action()
        }
    }

    private var dailiesLeft: Int? {
        guard let d = store.me?.dailies else { return nil }
        let left = d.filter { !$0.done }.count
        return left > 0 ? left : nil
    }

    private func railButton(_ symbol: String, color: Color, label: String,
                            badge: Int?, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol) }
            .buttonStyle(.gameIcon(color, diameter: 50))
            .overlay(alignment: .topTrailing) {
                if let badge {
                    Text("\(badge)")
                        .font(GameFont.display(13))
                        .foregroundStyle(.white)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(Circle().fill(GamePalette.berry)
                            .overlay(Circle().strokeBorder(.white, lineWidth: 2)))
                        .offset(x: 4, y: -4)
                }
            }
            .accessibilityLabel(label)
    }

    /// The lower half: a chosen point's card, or the nearby
    /// tray under the map, with the Warden's line and the run above it.
    @ViewBuilder private var bottom: some View {
        if let p = selected {
            PointCard(point: p,
                      store: store,
                      distance: store.distance(to: p),
                      inReach: store.inReach(p),
                      legend: legend,
                      onSpin: { spin(p) },
                      onPlay: { encounter = p },
                      onClose: { selected = nil })
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        } else if let problem = store.problem, store.points.isEmpty {
            GameHUDPanel {
                HStack(spacing: 10) {
                    Image(systemName: "wifi.exclamationmark")
                    Text(problem).font(GameFont.body(15, weight: .semibold))
                    Spacer()
                    Button("Retry") { Task { await store.loadBasics() } }
                        .buttonStyle(.game(GamePalette.sky, size: .small, fullWidth: false))
                }
            }
            .padding(14)
        } else {
            VStack(spacing: 8) {
                if store.locationIsRough {
                    GameHUDPanel {
                        HStack(spacing: 10) {
                            Image(systemName: "location.slash.fill").foregroundStyle(GamePalette.sun)
                            Text("Your location is rough. Turn on Precise Location for CosQuest in Settings to play points.")
                                .font(GameFont.body(14, weight: .semibold))
                        }
                    }
                    .padding(.horizontal, 14)
                }
                // One voice at a time at the bottom: the first-run coach line
                // wins over a nudge, and both stay clear of the button rail.
                let coaching = coachStep != nil
                if !coaching, let said = voice.said, ["nudge", "daily_done"].contains(said.moment) {
                    WardenBubble(said: said, tint: factionColor, level: voice.speaker.level,
                                 compact: true,
                                 onClose: { withAnimation { voice.quiet() } })
                        .padding(.leading, 14)
                        .padding(.trailing, 76)
                        .onTapGesture { withAnimation { voice.quiet() } }
                }
                if run.live {
                    RunTray(store: store, model: run, onPick: { runPoint = $0 }, onEnd: { endRun() })
                } else {
                    if store.me?.tutorial_done == true {
                        QuestRunButton { showRunStart = true }
                            .padding(.leading, 14)
                            .padding(.trailing, 76)
                        NearbyRadar(store: store)
                            .padding(.trailing, 62)
                    }
                    NearbyTray(store: store, suggested: suggestedID) { p in selected = p }
                }
            }
            .padding(.bottom, 10)
        }
    }

    /// The card marked NEXT: the starter shrine until the first fight is
    /// done (the Warden has just said it is beside you), then the best move.
    private var suggestedID: String? {
        if store.me?.tutorial_done != true,
           let starter = store.points.first(where: { $0.source == "starter" }) {
            return starter.id
        }
        return store.bestNext()?.point.id
    }

    // MARK: - The Warden's guide

    /// What the Warden has to show the player next, if anything. Nothing
    /// while a card, a sheet or a challenge is up: one voice at a time.
    private var coachStep: CoachStep? {
        _ = coachTick
        // Nor during a run: the clock is running and the route is the screen.
        guard selected == nil, encounter == nil, !onboarding, !run.live, store.centre != nil,
              let me = store.me else { return nil }
        if !me.tutorial_done, !CoachMemory.done("first-shrine") {
            guard let starter = store.points.first(where: { $0.source == "starter" }) else { return nil }
            // The verb as a tap plays it: the server can turn points into duels.
            let kind = DuelModes.point(starter, store) ? "duel" : (starter.challenge == "duel" ? "trivia" : starter.challenge)
            return .firstShrine(name: store.playerName, kind: kind)
        }
        if let u = RoamUnlock.pending(at: store.level) { return .unlock(u) }
        if !CoachMemory.done(CoachStep.siege.id), store.unlocked(.war),
           store.points.contains(where: { SiegeLook.isSiege($0, store) }) {
            return .siege
        }
        return nil
    }

    private func coachAct(_ step: CoachStep) {
        if step.id == "first-shrine" {
            selected = store.points.first { $0.source == "starter" }
            return
        }
        if let u = RoamUnlock.allCases.first(where: { "unlock-\($0.rawValue)" == step.id }) {
            RoamUnlock.markIntroduced(u)
            switch u {
            case .war: showWar = true
            case .relics: showRelics = true
            case .battle: showBattle = true
            default: break
            }
        }
        CoachMemory.mark(step.id)
        coachTick += 1
    }

    private func coachLater(_ step: CoachStep) {
        // "Later" really is later: the unlock stays introduced, and the
        // lit button is still there to find.
        if let u = RoamUnlock.allCases.first(where: { "unlock-\($0.rawValue)" == step.id }) {
            RoamUnlock.markIntroduced(u)
        }
        CoachMemory.mark(step.id)
        coachTick += 1
    }

    // MARK: - After a challenge

    private func celebrate(_ v: RoamVerdict) {
        for q in v.dailies_completed {
            let daily = store.me?.dailies.first { $0.id == q }
            banner.show("Quest done!", subtitle: daily?.title ?? "Daily quest",
                        color: GamePalette.mint, sound: .fanfare)
            if let daily {
                Task {
                    try? await Task.sleep(for: .seconds(1.2))
                    await voice.speak(store.dailyMoment(daily), wait: .seconds(4))
                }
            }
        }
    }

    /// A rival took back a point this player had taken: say so once, with
    /// the way to answer it.
    private func noticeLost(_ lost: [RoamMe.HoldLost]) {
        let key = "cq.holdsLost.seen"
        var seen = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
        guard let fresh = lost.first(where: { !seen.contains($0.point_id + ($0.at ?? "")) }) else { return }
        seen.insert(fresh.point_id + (fresh.at ?? ""))
        UserDefaults.standard.set(Array(seen), forKey: key)
        banner.show("\(fresh.by_faction_name ?? store.factionName(fresh.by_faction)) took it back",
                    subtitle: "\(fresh.point_name ?? "Your point"): go take it back",
                    color: RoamStyle.realmColor(fresh.by_faction), sound: .hit)
    }

    /// Spin: the one-second verb. Items fly into the bag.
    private func spin(_ p: QuestPoint) {
        Task {
            do {
                let r = try await store.spin(p)
                let got = r.items.map { "\($0.value)× \(store.itemNames[$0.key] ?? $0.key)" }
                    .sorted().joined(separator: "  ")
                banner.show(r.streak_bonus ? "Spin streak! ×2" : "+\(r.xp) XP",
                            subtitle: got.isEmpty ? "Bag full" : got,
                            color: GamePalette.sky, sound: .coin)
                selected = store.points.first { $0.id == p.id }
            } catch {
                banner.show("Can't spin", subtitle: error.localizedDescription,
                            color: GamePalette.berry, sound: .hit)
            }
        }
    }

    /// Now and then, on the map, the Warden points somewhere. Shown, not
    /// spoken: a phone that talks unprompted in a pocket is a phone that gets
    /// the game deleted.
    private func nudgeLoop() async {
        try? await Task.sleep(for: .seconds(25))
        while !Task.isCancelled {
            // Not before the first fight (the coach is pointing at the
            // starter), and never over a coach step.
            if encounter == nil, selected == nil, coachStep == nil,
               store.me?.tutorial_done == true, let m = store.nudgeMoment() {
                let s = await voice.line(for: m, wait: .seconds(10))
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) { voice.show(s) }
                try? await Task.sleep(for: .seconds(12))
                if voice.said?.moment == "nudge" { withAnimation { voice.quiet() } }
            }
            try? await Task.sleep(for: .seconds(240))
        }
    }
}

// MARK: - Pieces

/// Identifiable wrapper for presenting a verdict.
private struct PreviewBox: Identifiable {
    let verdict: RoamVerdict
    var id: String { verdict.attempt_id }
}

/// Who you are, at a glance: your avatar in a ring that fills with this
/// level's XP, your level, your rank.
struct PlayerChip: View {
    let me: RoamMe?
    let profile: Profile?

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().stroke(.white.opacity(0.25), lineWidth: 5)
                Circle()
                    .trim(from: 0, to: me?.standing.progress ?? 0)
                    .stroke(GamePalette.sun, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                AvatarView(avatar: profile?.avatar ?? .init(), size: 40)
            }
            .frame(width: 54, height: 54)
            .overlay(alignment: .bottomTrailing) {
                Text("\(me?.standing.level ?? 1)")
                    .font(GameFont.display(14))
                    .foregroundStyle(.white)
                    .frame(minWidth: 22, minHeight: 22)
                    .background(Circle().fill(GamePalette.skyDeep)
                        .overlay(Circle().strokeBorder(.white, lineWidth: 2)))
                    .offset(x: 4, y: 4)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(profile?.handle ?? me?.handle ?? "Player")
                    .font(GameFont.display(18))
                    .lineLimit(1)
                Text(me?.standing.rank ?? "Rookie")
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.8))
            }
            .padding(.trailing, 6)
            // Before the server has answered, shapes rather than a made-up
            // "Player, Rookie" that then changes under the player's eyes.
            .redacted(reason: me == nil && profile == nil ? .placeholder : [])
        }
        .padding(6)
        .background(Capsule().fill(GamePalette.navy.opacity(0.78))
            .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 1.5))
            .shadow(color: .black.opacity(0.3), radius: 6, y: 3))
        .foregroundStyle(.white)
    }
}

/// The top bar's resource chip: smaller than a StatPill, so coins and the
/// streak sit side by side on one row with the player chip.
struct ResourceChip<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        HStack(spacing: 5) { content }
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(Capsule().fill(GamePalette.navy.opacity(0.78))
                .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 1.5)))
            .foregroundStyle(.white)
    }
}

struct StatPill<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        HStack(spacing: 6) { content }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Capsule().fill(GamePalette.navy.opacity(0.78))
                .overlay(Capsule().strokeBorder(.white.opacity(0.18), lineWidth: 1.5)))
            .foregroundStyle(.white)
    }
}

/// The nearest points, as cards you can thumb through. A map is lovely and a
/// finger on a moving phone is imprecise; this is the reliable way in.
struct NearbyTray: View {
    let store: RoamStore
    /// The Warden's best next move, marked on its card and shown first.
    var suggested: String? = nil
    /// Horizontal under a portrait map; vertical as the landscape home's
    /// left column.
    var axis: Axis = .horizontal
    var onPick: (QuestPoint) -> Void

    private var ordered: [QuestPoint] {
        var near = Array(store.nearby.prefix(10))
        if let id = suggested, let i = near.firstIndex(where: { $0.id == id }) {
            near.insert(near.remove(at: i), at: 0)
        }
        return near
    }

    var body: some View {
        let near = ordered
        VStack(alignment: .leading, spacing: 8) {
            if !near.isEmpty {
                HStack(spacing: 6) {
                    Text("NEARBY")
                        .font(GameFont.display(13))
                        .tracking(1.4)
                    let here = store.nearby.filter { store.inReach($0) && !$0.isCooling }.count
                    if here > 0 {
                        Text("·  \(here) in reach")
                            .font(GameFont.display(13).monospacedDigit())
                            .foregroundStyle(GamePalette.mint)
                    }
                }
                .foregroundStyle(.white)
                // On a plate: bare white type vanished over the pale day board.
                .padding(.horizontal, 10)
                .frame(height: 24)
                .background(Capsule().fill(GamePalette.navy.opacity(0.78)))
                .padding(.horizontal, 14)
                .accessibilityElement(children: .combine)
            }
            ScrollView(axis == .horizontal ? .horizontal : .vertical, showsIndicators: false) {
                let stack = axis == .horizontal ? AnyLayout(HStackLayout(spacing: 12)) : AnyLayout(VStackLayout(spacing: 10))
                stack {
                    ForEach(near) { p in
                        Button { onPick(p) } label: {
                            NearbyCard(point: p, distance: store.distance(to: p),
                                       bearing: store.bearing(to: p),
                                       inReach: store.inReach(p),
                                       suggested: p.id == suggested,
                                       newCard: store.unlocked(.codex) && p.extra?["codex"] != "owned"
                                           && p.source != "starter")
                        }
                        .buttonStyle(CardPress())
                        // The Warden's first coach step lights this card.
                        .modifier(StarterAnchor(on: p.source == "starter"))
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 14)
                .padding(.top, axis == .horizontal ? 10 : 4)
                .padding(.bottom, 8)
            }
            .scrollTargetBehavior(.viewAligned)
        }
    }
}

private struct StarterAnchor: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        if on { content.railAnchor("starter") } else { content }
    }
}

/// Cards press in like the game's buttons: a touch you can feel.
struct CardPress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .brightness(configuration.isPressed ? -0.04 : 0)
            .animation(.spring(response: 0.22, dampingFraction: 0.6), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, down in
                guard down else { return }
                GameSound.shared.play(.tap)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
    }
}

struct NearbyCard: View {
    let point: QuestPoint
    let distance: Double?
    /// Degrees clockwise from where the phone faces, or nil without a heading.
    var bearing: Double? = nil
    let inReach: Bool
    var suggested = false
    var newCard = false

    private var tint: Color { RoamStyle.tierColor(point.tier) }
    private var cooling: Bool { point.isCooling }
    private var ready: Bool { inReach && !cooling }
    /// A Guardian fights here: the tier reads as difficulty, not rarity.
    private var isDuel: Bool { point.challenge == "duel" }

    // A printed card, not a glowing panel: flat paper, one colour tile for the
    // tier, a hard edge underneath like the game's buttons, and words only
    // where they carry a fact.
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                tile
                if isDuel {
                    Text(DuelModes.difficulty(point.tier).uppercased())
                        .font(GameFont.display(11)).tracking(0.6)
                        .foregroundStyle(GamePalette.edge(of: tint))
                        .padding(.top, 2)
                }
                Spacer(minLength: 4)
                distanceMark
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(point.name)
                    .font(GameFont.display(17))
                    .foregroundStyle(GamePalette.ink)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                    .minimumScaleFactor(0.85)
                TimelineView(.periodic(from: .now, by: 30)) { _ in
                    subline
                }
            }
        }
        .padding(12)
        .frame(width: 172, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(GamePalette.cream)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(edgeColor)
                        .offset(y: 4)
                )
        )
        .shadow(color: .black.opacity(0.18), radius: 3, y: 3)
        .overlay(alignment: .topLeading) { if suggested { nextTab } }
        .padding(.bottom, 4)
        .saturation(cooling ? 0 : 1)
        .opacity(cooling ? 0.7 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibility)
    }

    /// The hard edge under the card: mint when you can play it now.
    private var edgeColor: Color {
        if ready { return GamePalette.mint }
        if suggested { return GamePalette.sunDeep }
        return GamePalette.slate
    }

    private var tile: some View {
        Image(systemName: RoamStyle.challengeSymbol(point.challenge))
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(.white)
            .frame(width: 34, height: 34)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint))
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: RoamStyle.realmSymbol(point.realm))
                    .font(.system(size: 8, weight: .black))
                    .foregroundStyle(RoamStyle.realmColor(point.realm))
                    .frame(width: 15, height: 15)
                    .background(Circle().fill(GamePalette.cream))
                    .offset(x: 4, y: 4)
            }
    }

    @ViewBuilder private var distanceMark: some View {
        if ready {
            Text("HERE")
                .font(GameFont.display(15)).tracking(0.6)
                .foregroundStyle(GamePalette.mint)
        } else {
            HStack(spacing: 3) {
                if let bearing {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 10, weight: .black))
                        .rotationEffect(.degrees(bearing))
                }
                Text(RoamStyle.distance(distance))
                    .font(GameFont.display(15).monospacedDigit())
            }
            .foregroundStyle(GamePalette.mist)
        }
    }

    // The challenge, then the one fact that matters most right now.
    private var subline: some View {
        let (fact, color) = status
        return HStack(spacing: 0) {
            Text(RoamStyle.challengeName(point.challenge).uppercased())
                .foregroundStyle(GamePalette.ink.opacity(0.5))
            Text("  ·  ").foregroundStyle(GamePalette.ink.opacity(0.3))
            Text(fact.uppercased()).foregroundStyle(color)
        }
        .font(GameFont.body(11, weight: .bold))
        .tracking(0.4)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }

    private var status: (String, Color) {
        if cooling, let until = point.cooling_until.flatMap(RoamDates.parse) {
            return ("Ready in \(Self.minutes(until))", GamePalette.mist)
        } else if let e = point.extra?["expires_at"], let t = RoamDates.parse(e) {
            return ("Gone in \(Self.minutes(t))", GamePalette.skyDeep)
        } else if point.source == "raid" {
            return ("Boss raid", GamePalette.berry)
        } else if let holder = point.extra?["holder"] {
            return (point.extra?["holder_name"] ?? holder.capitalized, RoamStyle.realmColor(holder))
        } else if newCard {
            return ("New card", GamePalette.sunDeep)
        } else if point.source == "starter" {
            return ("Start here", GamePalette.sunDeep)
        } else if isDuel {
            return (DuelModes.guardian(point), GamePalette.ink.opacity(0.7))
        }
        return (RoamStyle.tierName(point.tier), GamePalette.edge(of: tint))
    }

    private var nextTab: some View {
        Text("NEXT")
            .font(GameFont.display(10)).tracking(1)
            .foregroundStyle(GamePalette.ink)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 4).fill(GamePalette.sun))
            .offset(x: 12, y: -8)
    }

    private static func minutes(_ until: Date) -> String {
        let m = Int((until.timeIntervalSinceNow / 60).rounded(.up))
        return m <= 1 ? "1 min" : "\(m) min"
    }

    private var accessibility: String {
        var parts = isDuel
            ? [point.name, "Duel", DuelModes.guardian(point), DuelModes.difficulty(point.tier)]
            : [point.name, RoamStyle.tierName(point.tier), RoamStyle.challengeName(point.challenge)]
        parts.append(inReach ? "in reach" : RoamStyle.distance(distance))
        if cooling { parts.append("recharging") }
        if suggested { parts.append("the Warden's best next move") }
        return parts.joined(separator: ", ")
    }
}

/// A small crystal: the shrine, drawn flat for cards.
struct CrystalGlyph: View {
    var tint: Color
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 3).fill(tint.opacity(0.95))
                .rotationEffect(.degrees(45))
                .padding(3)
            RoundedRectangle(cornerRadius: 2).fill(.white.opacity(0.55))
                .frame(width: 4, height: 4)
                .offset(x: -2, y: -3)
        }
        .shadow(color: .black.opacity(0.25), radius: 1, y: 1)
    }
}

/// One point, opened far enough to decide.
struct PointCard: View {
    let point: QuestPoint
    let store: RoamStore
    let distance: Double?
    let inReach: Bool
    /// The place's legend, from the Warden, once written.
    var legend: String?
    var onSpin: () -> Void = {}
    var onPlay: () -> Void
    var onClose: () -> Void

    var body: some View {
        let tint = RoamStyle.tierColor(point.tier)
        GamePanel {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            GameChip(text: point.challenge == "duel" ? DuelModes.difficulty(point.tier)
                                                                     : RoamStyle.tierName(point.tier),
                                     color: tint)
                            GameChip(text: RoamStyle.challengeName(point.challenge),
                                     color: GamePalette.skyDeep)
                        }
                        Text(point.name)
                            .font(GameFont.display(26))
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                        Text(subtitle)
                            .font(GameFont.body(15, weight: .medium))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                    }
                    Spacer()
                    // [merged-app] Invite people from a chat to this point.
                    if GameHost.shared.embedded {
                        Button { GameHost.shared.shareToChat(point) } label: {
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                        }
                        .buttonStyle(.gameIcon(GamePalette.skyDeep, diameter: 36))
                        .accessibilityLabel("Invite to a chat")
                    }
                    Button(action: onClose) { Image(systemName: "xmark") }
                        .buttonStyle(.gameIcon(GamePalette.ink.opacity(0.55), diameter: 36))
                        .accessibilityLabel("Close")
                }
                SpawnLine(point: point)
                HoldLine(point: point, store: store)
                SiegeLine(point: point, store: store)
                RaidLine(point: point, store: store)
                if let legend {
                    Text(legend)
                        .font(GameFont.body(15, weight: .medium).italic())
                        .foregroundStyle(GamePalette.ink.opacity(0.75))
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.opacity)
                }
                HStack(spacing: 8) {
                    Image(systemName: RoamStyle.realmSymbol(point.realm))
                    if point.challenge == "duel" || point.source == "raid" {
                        Text(point.source == "raid" ? "Boss · fight it with your crew"
                             : "\(store.factionName(point.realm)) Guardian · \(DuelModes.guardian(point))")
                            .lineLimit(1).minimumScaleFactor(0.8)
                    } else {
                        Text("\(point.realm == "dc" ? "DC" : point.realm.capitalized) questions")
                    }
                }
                .font(GameFont.body(14, weight: .semibold))
                .foregroundStyle(RoamStyle.realmColor(point.realm))

                if point.isCooling {
                    Button {} label: { Label(rechargeText, systemImage: "hourglass") }
                        .buttonStyle(.game(Color(white: 0.6)))
                        .disabled(true)
                } else if inReach {
                    HStack(spacing: 10) {
                        Button(action: onSpin) { Label(spinReady ? "Spin" : "Resting", systemImage: "arrow.triangle.2.circlepath") }
                            .buttonStyle(.game(GamePalette.sky, fullWidth: true))
                            .disabled(!spinReady)
                        if SiegeLook.isSiege(point, store) {
                            // A rival holds it: one answer won't take it, its
                            // Guardian has to be beaten.
                            Button(action: onPlay) { Label("Siege", systemImage: "flag.2.crossed.fill") }
                                .buttonStyle(.game(RoamStyle.realmColor(SiegeLook.faction(point))))
                        } else {
                            if point.source == "raid" {
                                Button(action: onPlay) { Label("Fight the boss", systemImage: "crown.fill") }
                                    .buttonStyle(.game(RaidLook.color))
                            } else if point.challenge == "duel" {
                                Button(action: onPlay) { Label("Fight", systemImage: "figure.fencing") }
                                    .buttonStyle(.game(GamePalette.mint))
                            } else {
                                Button(action: onPlay) { Label("Play", systemImage: "play.fill") }
                                    .buttonStyle(.game(GamePalette.mint))
                            }
                        }
                    }
                } else {
                    Button {} label: {
                        Label("\(RoamStyle.distance(distance)) away · walk closer",
                              systemImage: "figure.walk")
                    }
                    .buttonStyle(.game(Color(white: 0.6)))
                    .disabled(true)
                }
            }
        }
    }

    private var spinReady: Bool {
        guard let s = point.extra?["spin_ready_at"], let t = RoamDates.parse(s) else { return true }
        return t <= Date()
    }

    private var rechargeText: String {
        guard let s = point.cooling_until, let until = RoamDates.parse(s) else { return "Recharging" }
        let mins = Int((until.timeIntervalSinceNow / 60).rounded(.up))
        return mins <= 1 ? "Ready in a minute" : "Ready in \(mins) min"
    }

    private var subtitle: String {
        if point.source == "starter" { return "Your first Quest Point. It's right beside you." }
        return RoamStyle.challengeBlurb(point.challenge)
    }
}


/// A feature opening, introduced once, in the Warden's words.
struct UnlockCard: View {
    let unlock: RoamUnlock
    let tint: Color
    var onDone: () -> Void

    var body: some View {
        GameHUDPanel {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: unlock.symbol)
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(tint))
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("NEW").font(GameFont.display(11)).tracking(1)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Capsule().fill(GamePalette.sun))
                            .foregroundStyle(GamePalette.ink)
                        Text(unlock.title).font(GameFont.display(17))
                    }
                    Text(unlock.line).font(GameFont.body(14, weight: .medium)).opacity(0.9)
                        .fixedSize(horizontal: false, vertical: true)
                    Button([.war, .relics, .battle].contains(unlock) ? "Show me" : "Got it", action: onDone)
                        .buttonStyle(.game(GamePalette.sun, size: .small, fullWidth: false))
                        .padding(.top, 2)
                }
            }
        }
        .onAppear {
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }
}
