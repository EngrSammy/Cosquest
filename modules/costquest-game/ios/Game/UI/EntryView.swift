import CoreLocation
import SafariServices
import SwiftUI

/// Where a player arrives: what this game is, what it costs, what they can win,
/// and which side they are on.
///
/// The order of the screen is deliberate. A player is standing at a venue being
/// asked to put money on a card, so the terms come before the join button, the
/// official rules are one tap from the terms rather than buried, and the app
/// says plainly when payments are not live rather than implying money moved.
/// Everything shown is read from the server for this specific game; nothing
/// about the prize or the fee is written into the app.
struct EntryView: View {
    let warden: Warden
    /// Chosen on the map. When this is set the screen opens straight on the
    /// terms, which is the normal path now: typing a code is what a player
    /// does when an organiser hands them one at the door, not how they find
    /// a game.
    var preselected: String?
    @State private var model = EntryModel()
    @State private var showRules = false
    @State private var showProfile = false
    @State private var showWarden = false
    @State private var showCoins = false
    @State private var coins = CoinsModel.shared
    /// Back to the map. Nil hides the button.
    var onBack: (() -> Void)? = nil
    /// A Room: the player's side is their Roam faction, matched against the
    /// game's sides by id or display name, and their Roam handle.
    var presetSide: [String] = []
    var presetHandle: String? = nil
    /// Handed up when the player is in, so the app can switch to the field.
    let onEntered: (GameSession, GameTerms) -> Void

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let onBack { backButton(onBack) }
                    masthead
                    if let terms = model.terms {
                        tiles(terms)
                        card(terms)
                        sides(terms)
                        handleField
                        actions(terms)
                    } else if opensOnGame && model.loadFailed {
                        problem("Couldn't reach the game. Try again.") {
                            Task { await model.loadTerms() }
                        }
                    } else if opensOnGame {
                        skeleton
                    } else {
                        codeField
                    }
                    if let message = model.message {
                        if model.messageIsProblem {
                            // Only reached from joining or paying; a failed
                            // load has its own card above.
                            if model.terms != nil {
                                problem(message) { Task { await model.retry() } }
                            } else if !opensOnGame {
                                problem(message) { Task { await model.loadTerms() } }
                            }
                        } else {
                            Text(message)
                                .font(GameFont.body(14, weight: .semibold))
                                .foregroundStyle(.white)
                                .shadow(color: GamePalette.ink.opacity(0.5), radius: 0, y: 1)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(24)
            }
            .scrollIndicators(.hidden)
            #if DEBUG
            // Screenshots of the entry button without a finger to scroll.
            .defaultScrollAnchor(UserDefaults.standard.string(forKey: "coinsDemo") != nil ? .bottom : .top)
            #endif
        }
        .gameType()
        .sheet(isPresented: $showRules) {
            if let terms = model.terms { RulesView(terms: terms) }
        }
        .sheet(isPresented: $showProfile) { ProfileView() }
        .sheet(isPresented: $showCoins) { CoinsSheet(store: nil) }
        .sheet(isPresented: $showWarden) {
            WardenView(warden: warden,
                       context: Warden.Context(title: model.terms?.title ?? "CostQuest",
                                               venue: model.terms?.venue.map {
                                                   playArea($0.radius_m)
                                               }))
        }
        .sheet(isPresented: $model.showingCheckout) {
            if let url = model.checkoutURL {
                // Stripe Checkout in a Safari view. It has to be a real browser
                // surface: guideline 5.3.3 forbids buying game credit through
                // in-app purchase for real money gaming, so this is not merely
                // allowed, it is the required route.
                SafariSheet(url: url) { Task { await model.checkoutReturned() } }
                    .ignoresSafeArea()
            }
        }
        .task {
            if let preselected {
                await model.load(gameID: preselected)
            } else {
                await model.loadFromLaunchArgument()
            }
            // App Review looks at this screen, and so does the organiser
            // signing off the terms, so it can be opened straight from a
            // launch argument rather than only by tapping through.
            if let terms = model.terms, !presetSide.isEmpty {
                let wanted = Set(presetSide.map { $0.lowercased() })
                if let side = terms.factions.first(where: { wanted.contains($0.name.lowercased()) }) {
                    model.faction = side.name
                }
            }
            if let presetHandle, !presetHandle.isEmpty { model.handle = presetHandle }
            if UserDefaults.standard.bool(forKey: "showRules"), model.terms != nil {
                showRules = true
            }
            if UserDefaults.standard.bool(forKey: "showProfile") { showProfile = true }
            if UserDefaults.standard.bool(forKey: "showWarden") { showWarden = true }
            #if DEBUG
            // Rehearsal only: pick a side and press Enter, so the whole event
            // flow can be walked in the simulator without a finger.
            if let side = UserDefaults.standard.string(forKey: "autoEnter"), let terms = model.terms {
                try? await Task.sleep(for: .seconds(2))
                model.faction = terms.factions.first { $0.name == side }?.name ?? terms.factions.first?.name
                try? await Task.sleep(for: .seconds(1.5))
                _ = await model.enter()
            }
            #endif
        }
        .onChange(of: model.enteredSession?.gameID) { _, id in
            // The paid path returns from Safari rather than from the button,
            // so entering the game is driven by the model landing here, not by
            // the tap that started it.
            guard id != nil, let session = model.enteredSession,
                  let terms = model.terms else { return }
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onEntered(session, terms)
        }
    }

    // MARK: - Pieces

    /// Opened on a particular game, from the map or a launch argument, so the
    /// code form is never the right thing to show while its terms load.
    private var opensOnGame: Bool {
        preselected != nil || !(UserDefaults.standard.string(forKey: "gameID") ?? "").isEmpty
    }

    private func backButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
        }
        .buttonStyle(.gameIcon(GamePalette.navy))
        .accessibilityLabel("Back to the map")
    }

    /// The shape of the terms, while they load. Reads as the screen arriving
    /// rather than as a form the player was not meant to see.
    private var skeleton: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 12) {
                tile(icon: "ticket.fill", value: "₦0,000", label: "Entry", accent: Theme.raised)
                tile(icon: "trophy.fill", value: "₦00,000", label: "In the pot", accent: Theme.raised)
            }
            .redacted(reason: .placeholder)
            GamePanel(padding: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    row("Entry", "₦0,000", emphasise: true)
                    divider
                    row("In the pot", "₦00,000 · winners share", emphasise: true)
                    divider
                    row("Players in", "00")
                    divider
                    row("Venue", "000 m play area")
                }
            }
            .redacted(reason: .placeholder)

            HStack(spacing: 10) {
                ProgressView().tint(.white)
                Text("Loading the game...")
                    .font(GameFont.display(18))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading the game")
    }

    /// Something went wrong, said plainly, with the way forward beside it.
    private func problem(_ text: String, retry: @escaping () -> Void) -> some View {
        GamePanel(padding: 16) {
            HStack(spacing: 12) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 22, weight: .heavy))
                    .foregroundStyle(GamePalette.berry)
                Text(text)
                    .font(GameFont.body(15, weight: .semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button("RETRY", action: retry)
                    .buttonStyle(.game(GamePalette.berry, size: .small, fullWidth: false))
                    .disabled(model.isWorking)
            }
        }
    }

    /// Once the game is known, the game leads. Before that the app does.
    /// A player at a venue came for "Harbour Watch", not for CostQuest, and a
    /// screen that puts the product name where the event name belongs makes
    /// them check they opened the right thing.
    private var masthead: some View {
        VStack(spacing: 8) {
            GameChip(text: "CosQuest", color: GamePalette.skyDeep)
            if let terms = model.terms {
                GameTitle(terms.title, size: 42)
            } else if opensOnGame {
                GameTitle("Harbour Watch", size: 42)
                    .redacted(reason: .placeholder)
                    .opacity(0.5)
            } else {
                GameTitle("Join a game", size: 42)
                Text("Enter the code from your organiser.")
                    .font(GameFont.body(16, weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, onBack == nil ? 16 : 0)
    }

    private var codeField: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Reachable before a game is found too: a player can set their
            // name and avatar up on the way to the venue.
            Button("Your profile") { showProfile = true }
                .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
            TextField("Game code", text: $model.code)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .modifier(ChunkyField())

            Button(model.isWorking ? "Looking..." : "Find game") {
                Task { await model.loadTerms() }
            }
            .buttonStyle(.game(GamePalette.sun))
            .disabled(model.code.isEmpty || model.isWorking)
        }
    }

    /// The two numbers a player decides on, big, like a ticket stub.
    private func tiles(_ terms: GameTerms) -> some View {
        let accent = Theme.faction((terms.factions.first { $0.name == model.faction }
                                    ?? terms.factions.first)?.color)
        return HStack(spacing: 12) {
            tile(icon: terms.isCoinEntry ? "ticket.fill" : (terms.isFree ? "gift.fill" : "ticket.fill"),
                 value: terms.isCoinEntry ? "\((terms.entry_coins ?? 0).formatted())"
                        : (terms.isFree ? "Free" : terms.entryFee),
                 label: terms.isCoinEntry ? "CosCoins to enter" : "Entry", accent: accent)
            if terms.isFree || terms.isCoinEntry {
                tile(icon: "person.3.fill", value: "\(terms.players_joined)",
                     label: terms.players_joined == 1 ? "Player in" : "Players in",
                     accent: Theme.brass)
            } else {
                tile(icon: "trophy.fill", value: terms.pot, label: "In the pot",
                     accent: Theme.brass)
            }
        }
    }

    private func tile(icon: String, value: String, label: String, accent: Color) -> some View {
        GamePanel(padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Group {
                    if icon == "ticket.fill" || icon == "trophy.fill" {
                        GameCoin(size: 34)
                    } else {
                        Image(systemName: icon)
                            .font(.system(size: 16, weight: .heavy))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(accent)
                                .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 2.5)))
                    }
                }
                Text(value)
                    .font(GameFont.display(30))
                    .foregroundStyle(GamePalette.ink)
                    .lineLimit(1).minimumScaleFactor(0.6)
                Text(label.uppercased())
                    .font(GameFont.display(13, relativeTo: .caption)).tracking(0.8)
                    .foregroundStyle(GamePalette.ink.opacity(0.55))
            }
        }
    }

    /// The detail under the tiles. Leads with a divider-free first row so the
    /// card never opens on a hairline.
    private func card(_ terms: GameTerms) -> some View {
        var rows: [(String, String, Bool)] = []
        if !terms.isFree {
            if terms.prize_pool_cents > 0 {
                rows.append(("Winners share", terms.prizePool, false))
            } else if terms.pot_cents == 0 {
                rows.append(("In the pot", "Nothing yet. You would be first in.", true))
            }
            rows.append(("Winners take", terms.splitDescription, true))
            if !terms.prize_pool_note.isEmpty {
                rows.append(("Prize", terms.prize_pool_note, true))
            }
            rows.append(("Players in", "\(terms.players_joined)", false))
        }
        if let venue = terms.venue {
            rows.append(("Venue", playArea(venue.radius_m), false))
        }
        if terms.sponsored, let name = terms.sponsor {
            // Said as sponsorship, never folded into the pot: settlement pays
            // winners out of entry fees only.
            rows.append(("Sponsor", terms.sponsor_cents > 0
                         ? "\(name) is backing this event" : name, true))
        }
        return GamePanel(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                    if i > 0 { divider }
                    row(r.0, r.1, wraps: r.2)
                }
            }
        }
        .opacity(rows.isEmpty ? 0 : 1)
    }

    private func sides(_ terms: GameTerms) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            label("Choose a side")
            // Flowing rather than a fixed grid: a game can have two sides or
            // six, and a six-wide row of chips would be unreadable.
            FlowLayout(spacing: 8) {
                ForEach(terms.factions, id: \.name) { faction in
                    let chosen = model.faction == faction.name
                    Button {
                        model.faction = chosen ? nil : faction.name
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: chosen ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 18, weight: .heavy))
                            Text(faction.name.capitalized)
                            Text("\(faction.players)")
                                .font(GameFont.body(14, weight: .bold))
                                .opacity(0.8)
                        }
                    }
                    .buttonStyle(FactionToggle(color: Theme.faction(faction.color), chosen: chosen))
                    .accessibilityAddTraits(chosen ? .isSelected : [])
                }
            }
            Text("Leave this alone and the game puts you on the smaller side.")
                .font(GameFont.body(13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.9))
        }
    }

    private var handleField: some View {
        VStack(alignment: .leading, spacing: 10) {
            label("Your name in the game")
            TextField("Name", text: $model.handle)
                .modifier(ChunkyField())
        }
    }

    private func actions(_ terms: GameTerms) -> some View {
        let tint = model.faction == nil ? GamePalette.mint
            : Theme.faction(terms.factions.first { $0.name == model.faction }?.color)
        return VStack(spacing: 12) {
            if terms.isCoinEntry {
                CoinEntryPanel(price: terms.entry_coins ?? 0,
                               balance: coins.displayBalance(nil),
                               rewards: terms.coin_rewards ?? [],
                               working: model.isWorking, tint: tint,
                               onEnter: { Task { await model.enterWithCoins() } },
                               onGetCoins: { showCoins = true })
                    .disabled(!model.canEnter && !model.isWorking)
            } else if !terms.isFree && !coins.cashEntryEnabled {
                // The Stripe entry for cash events is kept but switched off:
                // Stripe prohibits paid entry with a prize of value.
                note("Paid entry isn't open for this event.")
            } else {
                Button(model.isWorking ? "Working..." : model.enterTitle(for: terms).uppercased()) {
                    Task { _ = await model.enter() }
                }
                // Tinted with the side the player has chosen, so the button they
                // press to hand over a card is already wearing their colours.
                .buttonStyle(.game(tint))
                .disabled(!model.canEnter)
            }

            HStack(spacing: 8) {
                Button("Rules") { showRules = true }
                    .accessibilityLabel("Official Rules")
                Button("Profile") { showProfile = true }
                    .accessibilityLabel("Your profile")
                Button("Ask") { showWarden = true }
                    .accessibilityLabel("Ask the game")
            }
            .buttonStyle(.game(GamePalette.skyDeep, size: .small))

            if !terms.environment_ready {
                note("This game's world has not been built yet. You can join, but there will be nothing to see until the organiser builds it.")
            }
            if terms.status != "live" {
                note(terms.status == "draft" || terms.status == "scheduled"
                     ? "This game hasn't started yet. Join now and you're in when it does."
                     : "This game is \(terms.status). You can join now and play when it starts.")
            }
        }
        .padding(.top, 4)
    }

    // MARK: - Small parts

    private var divider: some View {
        Rectangle().fill(GamePalette.ink.opacity(0.12)).frame(height: 2).padding(.horizontal, 16)
    }

    private func row(_ title: String, _ value: String,
                     emphasise: Bool = false, wraps: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 16) {
            Text(title)
                .font(GameFont.body(14, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.55))
                .frame(width: 96, alignment: .leading)
            Text(value)
                .font(emphasise ? GameFont.display(18) : GameFont.body(15, weight: .semibold))
                .foregroundStyle(GamePalette.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: wraps)
            Spacer(minLength: 0)
        }
        .padding(16)
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(GameFont.display(18, relativeTo: .headline))
            .tracking(0.8)
            .foregroundStyle(.white)
            .shadow(color: GamePalette.ink.opacity(0.6), radius: 0, y: 2)
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(GameFont.body(13, weight: .semibold))
            .foregroundStyle(.white.opacity(0.9))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Model

@MainActor
@Observable
final class EntryModel {
    var code = ""
    var handle = UIDevice.current.name
    var faction: String?
    var terms: GameTerms?
    var isWorking = false
    var message: String?
    var messageIsProblem = false
    /// The terms could not be fetched. Drives the retry card rather than a
    /// raw error string.
    var loadFailed = false
    var showingCheckout = false
    var checkoutURL: URL?

    private let client = GameClient()
    private var session: GameSession?

    var canEnter: Bool {
        terms != nil && !handle.trimmingCharacters(in: .whitespaces).isEmpty && !isWorking
    }

    func enterTitle(for terms: GameTerms) -> String {
        terms.isFree ? "Enter game" : "Pay \(terms.entryFee) and enter"
    }

    /// Launched straight into a game, which is what a QR code at the venue
    /// will eventually do.
    func loadFromLaunchArgument() async {
        guard terms == nil,
              let id = UserDefaults.standard.string(forKey: "gameID"),
              !id.isEmpty else { return }
        code = id
        await loadTerms()
    }

    /// A game picked on the map. Same path as a code, without the typing.
    func load(gameID: String) async {
        guard terms == nil else { return }
        code = gameID
        await loadTerms()
    }

    func loadTerms() async {
        isWorking = true
        message = nil
        loadFailed = false
        defer { isWorking = false }
        #if DEBUG
        if let demo = CoinsDemo.terms, CoinsDemo.mode == "entry" || CoinsDemo.mode == "short" {
            terms = demo
            await CoinsModel.shared.refresh()
            return
        }
        #endif
        do {
            let loaded = try await client.terms(
                gameID: code.trimmingCharacters(in: .whitespacesAndNewlines))
            terms = loaded
            await CoinsModel.shared.refresh()
            if !loaded.isFree && CoinsModel.shared.cashEntryEnabled {
                let health = try? await client.health()
                if health?.paymentsAreLive == false {
                    // Said out loud. A game with a fee whose payment lane is
                    // not connected takes no money, and a player who thinks
                    // they paid would have a fair complaint later.
                    say("Payments aren't switched on for this event yet, so you won't be charged to enter.",
                        problem: false)
                }
            }
        } catch {
            // The raw description is for a developer ("The server sent
            // something unexpected: GameTerms"), not for a player.
            loadFailed = true
            say(Self.unreachable, problem: true)
        }
    }

    static let unreachable = "Couldn't reach the game. Try again."

    /// Set when the card may have gone through and only the confirmation is
    /// missing, so Retry asks again rather than starting a second checkout.
    private var awaitingPayment = false

    /// Whatever failed last, again.
    func retry() async {
        if awaitingPayment {
            await checkoutReturned()
        } else if terms?.isCoinEntry == true {
            await enterWithCoins()
        } else {
            _ = await enter()
        }
    }

    /// Join, pay if there is a fee, and hand back a live session.
    func enter() async -> (GameSession, GameTerms)? {
        guard let terms else { return nil }
        isWorking = true
        awaitingPayment = false
        defer { isWorking = false }

        let session = self.session ?? GameSession(gameID: terms.game_id, client: client)
        self.session = session
        do {
            try await session.join(handle: handle.trimmingCharacters(in: .whitespaces),
                                   faction: faction)
        } catch {
            say(Self.unreachable, problem: true)
            return nil
        }
        session.adoptEndedStatus(terms.status)
        if session.isOver {
            // Over already: nothing to pay for, the root shows Results.
            message = nil
            enteredSession = session
            return (session, terms)
        }

        do {
            let checkout = try await client.checkout(gameID: terms.game_id)
            if let urlString = checkout.checkout_url, let url = URL(string: urlString) {
                checkoutURL = url
                showingCheckout = true
                return nil                      // resumes in checkoutReturned
            }
            // checkout.note is the server's diagnostic ("dev mode, marked
            // paid, ledgered") and is not shown to players.
        } catch {
            say(Self.unreachable, problem: true)
            return nil
        }
        message = nil
        enteredSession = session
        return (session, terms)
    }

    /// Enter an event priced in CosCoins: join, then spend. The spend is
    /// idempotent on the server per game, so a retry after a dropped reply
    /// never charges twice.
    func enterWithCoins() async {
        guard let terms, terms.isCoinEntry else { return }
        isWorking = true
        defer { isWorking = false }
        let session = self.session ?? GameSession(gameID: terms.game_id, client: client)
        self.session = session
        do {
            try await session.join(handle: handle.trimmingCharacters(in: .whitespaces),
                                   faction: faction)
        } catch {
            say(Self.unreachable, problem: true)
            return
        }
        do {
            _ = try await CoinsModel.shared.spend(gameID: terms.game_id)
        } catch {
            say(error.localizedDescription, problem: true)
            return
        }
        message = nil
        enteredSession = session
    }

    /// Back from Safari. The phone cannot know whether the card went through,
    /// so it asks the server rather than assuming either way.
    func checkoutReturned() async {
        guard let terms, let session else { return }
        showingCheckout = false
        isWorking = true
        defer { isWorking = false }
        // The webhook may land a moment after the browser returns, so give it
        // a few tries before telling the player it did not work.
        for attempt in 0..<8 {
            if let status = try? await client.me(gameID: terms.game_id), status.paid {
                awaitingPayment = false
                message = nil
                enteredSession = session
                return
            }
            try? await Task.sleep(for: .milliseconds(400 * (attempt + 1)))
        }
        awaitingPayment = true
        say("We have not seen your payment yet. If your card went through, give it a moment and try again.",
            problem: true)
    }

    /// Set when the player is in, by either path. The paid path lands here
    /// from Safari rather than from a button press, so the view watches this
    /// instead of only acting on the tap.
    var enteredSession: GameSession?

    private func say(_ text: String, problem: Bool) {
        message = text
        messageIsProblem = problem
    }
}

// MARK: - Helpers

/// A chunky cream text field with a thick ink border, in the display face.
private struct ChunkyField: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(GameFont.display(22))
            .foregroundStyle(GamePalette.ink)
            .tint(GamePalette.skyDeep)
            .padding(.horizontal, 18).padding(.vertical, 14)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(GamePalette.ink).offset(y: 4)
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(GamePalette.cream)
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(GamePalette.ink, lineWidth: 3.5))
                }
            }
            .padding(.bottom, 4)
    }
}

/// A big faction-coloured toggle: raised when free, pressed in with a tick
/// when chosen.
private struct FactionToggle: ButtonStyle {
    let color: Color
    let chosen: Bool

    func makeBody(configuration: Configuration) -> some View {
        let down = chosen || configuration.isPressed
        let depth: CGFloat = 6
        return configuration.label
            .font(GameFont.display(20))
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.3), radius: 0, y: 2)
            .padding(.horizontal, 18).padding(.vertical, 14)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(GamePalette.edge(of: color)).offset(y: depth)
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(color)
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(chosen ? .white : GamePalette.ink.opacity(0.5),
                                          lineWidth: chosen ? 4 : 2.5))
                        .offset(y: down ? depth - 1 : 0)
                }
            }
            .offset(y: down ? 2 : 0)
            .padding(.bottom, depth)
            .opacity(chosen || configuration.isPressed ? 1 : 0.9)
            .scaleEffect(chosen ? 1.03 : 1)
            .animation(.spring(response: 0.22, dampingFraction: 0.55), value: down)
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed {
                    GameSound.shared.play(.tap)
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                }
            }
    }
}

/// Stripe Checkout, in a real browser, with a callback when it closes.
private struct SafariSheet: UIViewControllerRepresentable {
    let url: URL
    let onDismiss: () -> Void

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onDismiss: onDismiss) }

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        let onDismiss: () -> Void
        init(onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            onDismiss()
        }
    }
}

/// Chips that wrap. `LazyVGrid` cannot do this: its columns are fixed, and a
/// faction called "north" and one called "the harbour watch" want different
/// widths.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews,
                      cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                x = 0
                y += lineHeight + spacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize,
                       subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

/// "250 m play area", or "3 km play area" once it is big enough that metres
/// stop reading as a distance.
func playArea(_ metres: Int) -> String {
    metres >= 1000
        ? "\((Double(metres) / 1000).formatted(.number.precision(.fractionLength(0...1)))) km play area"
        : "\(metres) m play area"
}
