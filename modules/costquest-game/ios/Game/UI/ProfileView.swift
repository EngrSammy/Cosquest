import SwiftUI

/// Who a player is, what they have won, and how they want the app to behave.
///
/// Rebuilt as a real settings screen rather than one long custom scroll. Three
/// reasons, and only the first is cosmetic.
///
/// A List with sections is the shape iOS has taught everyone to read: you know
/// where to look for "my record" and where to look for "change the theme"
/// without being told. The previous version painted its own surfaces from the
/// Theme palette, which meant it had to be kept in step with the system by
/// hand and never quite matched a real settings screen.
///
/// Second, this is where a player deals with MONEY and with the key that IS
/// their account. Both deserve their own headed section with an explanation,
/// not a row in a stack of cards.
///
/// Third, it is the only screen that persists between games, so it is the only
/// sensible home for preferences.
struct ProfileView: View {
    @State private var model = ProfileModel()
    @State private var editing = false
    @Environment(\.dismiss) private var dismiss

    private var prefs: Preferences { Preferences.shared }

    private enum Tab: String, CaseIterable { case hero = "Hero", record = "Record", settings = "Settings" }
    /// `-profileTab Record` opens on the wall, for screenshots.
    @State private var tab: Tab = Tab(rawValue: UserDefaults.standard.string(forKey: "profileTab") ?? "") ?? .hero

    var body: some View {
        NavigationStack {
            ZStack {
                GameBackdrop()
                VStack(spacing: 12) {
                    topBar
                    tabs
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            switch tab {
                            case .hero:
                                heroTab
                            case .record:
                                if let roam = model.roam { progressSection(roam) }
                                recordSection
                                if !model.inProgress.isEmpty { inProgressSection }
                                if !model.wall.isEmpty { wallSection }
                            case .settings:
                                identitySection
                                worldSection
                                aboutSection
                            }
                        }
                        .padding(.horizontal, tab == .hero ? 0 : 18)
                        .padding(.bottom, 30)
                    }
                    .scrollIndicators(.hidden)
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .gameType()
            .animation(.smooth(duration: 0.3), value: tab)
            .sheet(isPresented: $editing) {
                ProfileEditor(model: model)
            }
        }
        .task { await model.load() }
    }

    // MARK: - The hero screen

    private var houseTint: Color { RoamStyle.realmColor(model.roam?.faction) }
    private var equipped: Relic? { model.roam?.features?.relics?.equipped }

    private var topBar: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: { Image(systemName: "arrow.left") }
                .buttonStyle(.gameIcon(GamePalette.slate, diameter: 42))
                .accessibilityLabel("Back")
            GameHeading("PROFILE", size: 28)
            Spacer()
            if let r = model.roam {
                HStack(spacing: 5) {
                    Image(systemName: "circle.hexagongrid.fill").foregroundStyle(GamePalette.sun)
                    Text("\(r.coins)").font(GameFont.display(15))
                }
                .foregroundStyle(GamePalette.ink)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Capsule().fill(.white.opacity(0.6)))
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
    }

    private var tabs: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases, id: \.self) { t in
                Button { tab = t } label: {
                    HStack(spacing: 6) {
                        Circle().fill(tab == t ? GamePalette.sun : GamePalette.mist.opacity(0.6))
                            .frame(width: 6, height: 6)
                        Text(t.rawValue.uppercased()).font(GameFont.display(14)).tracking(0.8)
                    }
                    .foregroundStyle(tab == t ? GamePalette.ink : GamePalette.mist)
                    .padding(.horizontal, 16).padding(.vertical, 9)
                    .background {
                        if tab == t {
                            Capsule().fill(.white)
                                .shadow(color: GamePalette.navy.opacity(0.12), radius: 6, y: 3)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == t ? .isSelected : [])
            }
        }
        .frame(maxWidth: .infinity)
    }

    /// A single number for how strong this hero is, like the reference's
    /// "FCE": level, the equipped Relic and the best streak, weighted so
    /// that levelling is the main road and a good Relic a real step.
    private var power: Int {
        guard let r = model.roam else { return 0 }
        return r.standing.level * 12 + Int((equipped?.power_now ?? equipped?.power ?? 0) * 5)
            + r.streak.best * 2
    }

    private var heroTab: some View {
        VStack(spacing: 0) {
            HeroStage(tint: houseTint, height: 330)
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Button { editing = true } label: {
                        HStack(spacing: 8) {
                            Text((model.handle.isEmpty ? "Your hero" : model.handle).uppercased())
                                .font(GameFont.display(36))
                                .lineLimit(1).minimumScaleFactor(0.5)
                            Image(systemName: "pencil")
                                .font(.system(size: 14, weight: .heavy))
                                .foregroundStyle(GamePalette.mist)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit name and emblem")
                    Spacer()
                    Text("POWER:").font(GameFont.display(13)).foregroundStyle(GamePalette.mist)
                    Text("\(power)").font(GameFont.display(24)).foregroundStyle(GamePalette.sun)
                }
                .foregroundStyle(GamePalette.ink)
                Rectangle().fill(GamePalette.track).frame(height: 1)
                Text(heroTitle)
                    .font(GameFont.body(14, weight: .bold)).tracking(0.5)
                    .foregroundStyle(GamePalette.mist)
                if let r = model.roam { stats(r) }
                Rectangle().fill(GamePalette.track).frame(height: 1).padding(.top, 4)
                Text("CURRENT EQUIPMENT")
                    .font(GameFont.display(13)).tracking(0.8)
                    .foregroundStyle(GamePalette.mist)
                HStack(spacing: 12) {
                    HeroSlot(label: "Relic", locked: equipped == nil) {
                        if let e = equipped {
                            RelicArt(kind: e.kind, rarity: e.rarity, size: 52)
                        } else {
                            Image(systemName: "diamond").font(.system(size: 24, weight: .bold))
                                .foregroundStyle(GamePalette.mist)
                        }
                    }
                    HeroSlot(label: "Outfit", locked: true) { slotIcon("tshirt.fill") }
                    HeroSlot(label: "Charm", locked: true) { slotIcon("sparkle") }
                    HeroSlot(label: "Emote", locked: true) { slotIcon("face.smiling") }
                }
                .frame(maxWidth: .infinity)
                if let duel = model.roam?.features?.duel {
                    Rectangle().fill(GamePalette.track).frame(height: 1).padding(.top, 4)
                    GuardianStancePicker(duel: duel, api: GameClient()) { _ in
                        Task { await model.load() }
                    }
                }
            }
            .padding(20)
            .background {
                UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous)
                    .fill(GamePalette.cream.opacity(0.94))
                    .shadow(color: GamePalette.navy.opacity(0.10), radius: 14, y: -4)
                    .ignoresSafeArea(edges: .bottom)
            }
        }
    }

    private var heroTitle: String {
        guard let r = model.roam else { return "A NEW HERO" }
        let house = r.faction_name ?? r.faction?.capitalized
        return house.map { "\(r.standing.rank.uppercased()) OF HOUSE \($0.uppercased())" }
            ?? r.standing.rank.uppercased()
    }

    @ViewBuilder private func stats(_ r: RoamMe) -> some View {
        let s = r.standing
        HeroStatBar(symbol: "bolt.heart", name: "Level \(s.level)",
                    value: s.max_level ? "MAX" : "\(s.into_level)",
                    extra: s.max_level ? nil : "/\(s.level_span) XP",
                    progress: s.max_level ? 1 : s.progress)
        let p = equipped?.power_now ?? equipped?.power ?? 0
        HeroStatBar(symbol: "burst", name: "Relic power",
                    value: equipped == nil ? "-" : "\(Int(p.rounded()))",
                    extra: equipped.map { "Lv \($0.level ?? 1)" },
                    progress: p / 42)
        let played = r.today?.points_played ?? 0
        let right = r.today?.correct ?? 0
        HeroStatBar(symbol: "scope", name: "Accuracy today",
                    value: played == 0 ? "-" : "\(Int((Double(right) / Double(played) * 100).rounded()))%",
                    progress: played == 0 ? 0 : Double(right) / Double(played))
        HeroStatBar(symbol: "flame", name: "Best streak",
                    value: "\(r.streak.best)", extra: r.streak.best == 1 ? "day" : "days",
                    progress: Double(r.streak.best) / 30)
    }

    private func slotIcon(_ name: String) -> some View {
        Image(systemName: name).font(.system(size: 24, weight: .bold)).foregroundStyle(GamePalette.mist)
    }

    // MARK: - Who you are

    private var identitySection: some View {
        Button { editing = true } label: {
            GamePanel(padding: 16) {
                HStack(spacing: 14) {
                    AvatarView(avatar: model.avatar, size: 72)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.handle.isEmpty ? "Set up your profile" : model.handle)
                            .font(GameFont.display(26))
                            .lineLimit(1).minimumScaleFactor(0.6)
                        HStack(spacing: 6) {
                            GameChip(text: "Lv \(model.roam?.standing.level ?? 1)",
                                     color: GamePalette.skyDeep)
                            Text(model.handle.isEmpty
                                 ? "Pick a name and an emblem"
                                 : "Tap to edit")
                                .font(GameFont.body(13, weight: .semibold))
                                .foregroundStyle(GamePalette.ink.opacity(0.55))
                        }
                    }
                    Spacer()
                    Image(systemName: "pencil")
                        .font(.system(size: 16, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(GamePalette.sun)
                            .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 2.5)))
                }
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Where you stand

    private func progressSection(_ r: RoamMe) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ProfileSectionLabel("Your progress")
            GamePanel(padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Level \(r.standing.level)").font(GameFont.display(26))
                        Text(r.standing.rank)
                            .font(GameFont.body(16, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.6))
                        Spacer()
                        if let f = r.faction {
                            GameChip(text: r.faction_name ?? f, color: RoamStyle.realmColor(f))
                        }
                    }
                    XPBar(progress: r.standing.progress)
                    Text(r.standing.max_level
                         ? "Top level. Legend."
                         : "\(r.standing.level_span - r.standing.into_level) XP to level \(r.standing.level + 1)")
                        .font(GameFont.body(14, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                }
            }
            HStack(spacing: 10) {
                stat("\(r.coins)", "Coins", icon: "circle.hexagongrid.fill", color: GamePalette.sunDeep)
                stat("\(r.streak.best)", "Best streak", icon: "flame.fill", color: GamePalette.berry)
            }
            stat("\(r.faction_points)", "For your faction", icon: "flag.2.crossed.fill",
                 color: RoamStyle.realmColor(r.faction))
        }
    }

    // MARK: - What you have done

    private var recordSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProfileSectionLabel("Your events")
            HStack(spacing: 10) {
                stat("\(model.profile?.games_played ?? 0)", "Played", icon: "gamecontroller.fill",
                     color: GamePalette.skyDeep)
                stat("\(model.profile?.games_won ?? 0)", "Won", icon: "crown.fill",
                     color: GamePalette.berry)
            }
            HStack(spacing: 10) {
                GamePanel(padding: 12) {
                    HStack(spacing: 8) {
                        GameCoin(size: 32)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("\(model.profile?.tokens_total ?? 0)").font(GameFont.display(24))
                            Text("TOKENS").font(GameFont.display(12)).opacity(0.55)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                // Prizes are shown even at zero, because "you have won nothing
                // yet" is information a player wants.
                stat(Money.text(model.profile?.prizes_cents ?? 0, model.currency), "Prizes",
                     icon: "trophy.fill", color: GamePalette.sunDeep)
            }
        }
    }

    private func stat(_ value: String, _ label: String, icon: String, color: Color) -> some View {
        GamePanel(padding: 12) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(color)
                        .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 2.5)))
                VStack(alignment: .leading, spacing: 0) {
                    Text(value).font(GameFont.display(24)).lineLimit(1).minimumScaleFactor(0.5)
                    Text(label.uppercased()).font(GameFont.display(12)).opacity(0.55)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var inProgressSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProfileSectionLabel("Playing now")
            GamePanel(padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(model.inProgress) { game in
                        HStack {
                            GameChip(text: "Live")
                            Text(game.title).font(GameFont.display(18))
                            Spacer()
                            GameCoin(size: 20)
                            Text("\(game.tokens)").font(GameFont.display(18))
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    private var wallSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProfileSectionLabel("Your wall")
            GamePanel(padding: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(model.wall.prefix(4)) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(r.title).font(GameFont.display(18))
                                Spacer()
                                if let prize = r.prize {
                                    Text(prize).font(GameFont.display(18))
                                        .foregroundStyle(GamePalette.sunDeep)
                                }
                            }
                            HStack(spacing: 6) {
                                if let placing = r.placing {
                                    GameChip(text: placed(placing),
                                             color: placing == 1 ? GamePalette.sunDeep : GamePalette.skyDeep)
                                }
                                if let faction = r.faction {
                                    Text(faction.capitalized)
                                        .font(GameFont.body(13, weight: .semibold)).opacity(0.6)
                                }
                                GameCoin(size: 16)
                                Text("\(r.tokens)").font(GameFont.body(13, weight: .bold)).opacity(0.7)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if model.wall.count > 4 {
                        NavigationLink {
                            WallList(results: model.wall)
                        } label: {
                            Text("All \(model.wall.count) results")
                        }
                        .buttonStyle(.game(GamePalette.skyDeep, size: .small))
                    }
                }
            }
            Text("Every game you have finished. This survives the game being deleted.")
                .font(GameFont.body(12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
                .padding(.horizontal, 6)
        }
    }

    private func placed(_ n: Int) -> String {
        switch n {
        case 1: "1st"
        case 2: "2nd"
        case 3: "3rd"
        default:
            (11...13).contains(n % 100) ? "\(n)th"
                : n % 10 == 1 ? "\(n)st" : n % 10 == 2 ? "\(n)nd"
                : n % 10 == 3 ? "\(n)rd" : "\(n)th"
        }
    }

    // MARK: - How the app behaves

    private var worldSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProfileSectionLabel("The world")
            GamePanel(padding: 14) {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Appearance").font(GameFont.display(17))
                    ChoiceRow(options: Preferences.Appearance.allCases.map { ($0, $0.label) },
                              selected: prefs.appearance) { prefs.appearance = $0 }
                    Text("Time in town").font(GameFont.display(17))
                    ChoiceRow(options: Preferences.WorldClock.allCases.map { ($0, $0.label) },
                              selected: prefs.worldClock) { prefs.worldClock = $0 }
                    HStack {
                        Text("Haptics").font(GameFont.display(17))
                        Spacer()
                        Button(prefs.haptics ? "ON" : "OFF") { prefs.haptics.toggle() }
                            .buttonStyle(.game(prefs.haptics ? GamePalette.mint : Color(white: 0.55),
                                               size: .small, fullWidth: false))
                            .accessibilityLabel("Haptics")
                            .accessibilityValue(prefs.haptics ? "On" : "Off")
                    }
                    if WardenSpeaker.enabled { HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("The Warden speaks").font(GameFont.display(17))
                            Text("Its lines are written on your phone either way.")
                                .font(GameFont.body(12, weight: .semibold))
                                .foregroundStyle(GamePalette.ink.opacity(0.55))
                        }
                        Spacer()
                        Button(prefs.wardenSpeaks ? "ON" : "OFF") { prefs.wardenSpeaks.toggle() }
                            .buttonStyle(.game(prefs.wardenSpeaks ? GamePalette.mint : Color(white: 0.55),
                                               size: .small, fullWidth: false))
                            .accessibilityLabel("The Warden speaks")
                            .accessibilityValue(prefs.wardenSpeaks ? "On" : "Off")
                    } }
                }
            }
            Text("The town is lit for the hour you are playing in. Fix it to a "
                 + "time if you would rather not wait until dark to see it that way.")
                .font(GameFont.body(12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
                .padding(.horizontal, 6)
        }
    }

    private var aboutSection: some View {
        GamePanel(padding: 14) {
            HStack {
                Text("Version").font(GameFont.display(16))
                Spacer()
                Text(Self.version).font(GameFont.body(15, weight: .semibold)).opacity(0.6)
            }
        }
        .overlay(alignment: .bottom) {
            Text("The world is built by CosQuest.")
                .font(GameFont.body(12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
                .offset(y: 26)
        }
        .padding(.bottom, 26)
    }

    private static var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }
}

// MARK: - Game-style pieces for this screen

private struct ProfileHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        ZStack {
            GameHeading(title, size: 36)
            HStack { Spacer(); trailing }
        }
        .padding(.top, 14)
    }
}

private struct ProfileSectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased())
            .font(GameFont.display(18, relativeTo: .headline))
            .tracking(0.8)
            .foregroundStyle(.white)
            .shadow(color: GamePalette.ink.opacity(0.6), radius: 0, y: 2)
            .padding(.leading, 6)
    }
}

/// Chunky pick-one buttons, in place of a system Picker.
private struct ChoiceRow<T: Hashable>: View {
    let options: [(T, String)]
    let selected: T
    let onPick: (T) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(options, id: \.0) { option in
                Button(option.1) { onPick(option.0) }
                    .buttonStyle(.game(option.0 == selected ? GamePalette.skyDeep : Color(white: 0.6),
                                       size: .small, fullWidth: false))
                    .accessibilityAddTraits(option.0 == selected ? .isSelected : [])
            }
        }
    }
}

/// The whole results list, when the wall is longer than the profile shows.
private struct WallList: View {
    let results: [Profile.Result]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ZStack {
                        GameHeading("Your wall", size: 34)
                        HStack {
                            Button { dismiss() } label: { Image(systemName: "chevron.left") }
                                .buttonStyle(.gameIcon(GamePalette.navy, diameter: 42))
                                .accessibilityLabel("Back")
                            Spacer()
                        }
                    }
                    .padding(.top, 14)
                    ForEach(results) { r in
                        GamePanel(padding: 14) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(r.title).font(GameFont.display(18))
                                    Spacer()
                                    if let prize = r.prize {
                                        Text(prize).font(GameFont.display(18))
                                            .foregroundStyle(GamePalette.sunDeep)
                                    }
                                }
                                Text("\(r.tokens) tokens" + (r.faction.map { " · \($0.capitalized)" } ?? ""))
                                    .font(GameFont.body(13, weight: .semibold)).opacity(0.6)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 30)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

/// Name and emblem, on its own screen.
///
/// A sheet with its own Cancel and Save is both simpler to read and simpler
/// to reason about than an edit mode on the profile.
private struct ProfileEditor: View {
    @Bindable var model: ProfileModel
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false

    private var canSave: Bool {
        !(saving || model.handle.trimmingCharacters(in: .whitespaces).count < 2)
    }

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ZStack {
                        GameHeading("Your profile", size: 32)
                        HStack {
                            Button { dismiss() } label: { Image(systemName: "xmark") }
                                .buttonStyle(.gameIcon(GamePalette.navy, diameter: 42))
                                .accessibilityLabel("Cancel")
                            Spacer()
                        }
                    }
                    .padding(.top, 14)

                    GamePanel(padding: 16) {
                        VStack(spacing: 14) {
                            AvatarView(avatar: model.avatar, size: 104)
                                .frame(maxWidth: .infinity)
                            TextField("Your name", text: $model.handle)
                                .textInputAutocapitalization(.words)
                                .font(GameFont.display(22))
                                .foregroundStyle(GamePalette.ink)
                                .padding(.horizontal, 16).padding(.vertical, 12)
                                .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(.white)
                                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .strokeBorder(GamePalette.ink, lineWidth: 3.5)))
                        }
                    }

                    ProfileSectionLabel("Emblem")
                    GamePanel(padding: 14) {
                        FlowLayout(spacing: 10) {
                            ForEach(Array(AvatarView.marks.enumerated()), id: \.offset) { i, mark in
                                let on = model.avatar.mark == i
                                Button { model.avatar.mark = i } label: {
                                    Image(systemName: mark)
                                }
                                .buttonStyle(.gameIcon(on ? Theme.faction(model.avatar.tint)
                                                          : Color(white: 0.6), diameter: 50))
                                .accessibilityLabel(mark)
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                    }

                    ProfileSectionLabel("Colour")
                    GamePanel(padding: 14) {
                        FlowLayout(spacing: 12) {
                            ForEach(ProfileModel.palette, id: \.self) { hex in
                                let on = model.avatar.tint == hex
                                Button { model.avatar.tint = hex } label: {
                                    if on { Image(systemName: "checkmark") } else { Color.clear }
                                }
                                .buttonStyle(.gameIcon(Theme.faction(hex), diameter: 44))
                                .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: on ? 3.5 : 0)
                                    .padding(.bottom, 4))
                                .accessibilityLabel(hex)
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                    }

                    if let message = model.message {
                        Text(message)
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 14).fill(GamePalette.berry))
                    }

                    Button(saving ? "Saving..." : "SAVE") {
                        saving = true
                        Task {
                            await model.save()
                            saving = false
                            if model.message == nil {
                                GameSound.shared.play(.coin)
                                dismiss()
                            }
                        }
                    }
                    .buttonStyle(.game(GamePalette.mint))
                    .disabled(!canSave)
                    .accessibilityLabel("Save")
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
        }
        .gameType()
    }
}

@MainActor
@Observable
final class ProfileModel {
    /// Colours a player can pick, chosen to stay distinguishable on a small
    /// avatar in sunlight rather than to fill a colour wheel.
    static let palette = ["#E8B33A", "#3FA7D6", "#59C28B", "#E5484D",
                          "#A78BFA", "#F4F4F5"]

    var handle = ""
    var avatar = Profile.Avatar()
    /// Level, rank, faction and the rest of the always-on game.
    var roam: RoamMe?
    var message: String?
    private(set) var profile: Profile?

    var wall: [Profile.Result] { profile?.wall ?? [] }
    var inProgress: [Profile.InProgress] { profile?.in_progress ?? [] }

    private let client = GameClient()

    func load() async {
        roam = try? await client.roamMe()
        do {
            let loaded = try await client.myProfile()
            profile = loaded
            handle = loaded.handle ?? ""
            avatar = loaded.avatar
        } catch {
            // A 404 is the normal state for a player who has never set one
            // up, not a failure. The device's own name is a better first
            // suggestion than an empty field, and the identity row says
            // "Set up your profile" either way.
            handle = UIDevice.current.name
        }
    }

    /// Saves the name and emblem.
    ///
    /// Replaces toggleEditing, which both flipped a mode and wrote to the
    /// server depending on which way it was flipping. Editing now has its own
    /// screen, so saving can just save, and a failure leaves the editor open
    /// with the reason on it rather than dropping the player back to a profile
    /// that silently did not change.
    func save() async {
        do {
            try await client.saveProfile(
                handle: handle.trimmingCharacters(in: .whitespaces), avatar: avatar)
            message = nil
            await load()
        } catch {
            message = "Couldn't save your profile. Check your connection and try again."
        }
    }

    /// The currency prizes are shown in: the game's own, from the most
    /// recent result that says, rather than a hardcoded dollar sign.
    var currency: String? {
        wall.first(where: { $0.currency != nil })?.currency
    }
}
