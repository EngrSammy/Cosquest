import SafariServices
import StoreKit
import SwiftUI
import UIKit

// FEATURE: coins. CosCoins bought on the web through Stripe, spent in the app.
//
// No Apple in-app purchase: Subomi and Mark chose Stripe-hosted checkout
// instead (spec: costquest-research/21_coin_shop_spec.md). Two rules shape
// everything here:
//
//  1. The app may point a player at a web purchase only where Apple allows it,
//     which today is the US storefront. Elsewhere the packs and buy buttons
//     are not shown at all and the sheet says where CosCoins are sold. The
//     server decides from the region the app reports; staging builds report
//     the US so the flow can be tested from anywhere.
//
// CosCoins are only bought, never earned (Subomi, 28 Sep): no gameplay path
// pays them, so nothing here suggests one does.
//  2. Coins are for use in CosQuest. They have no cash value and cannot be
//     withdrawn, and an event you enter with coins rewards in-game things
//     only. The words on these screens say exactly that and nothing looser.
//
// The phone never decides it has been paid. Stripe tells the server, the
// server credits the coins, and the app only asks the server what happened.

// MARK: - Wire

struct CoinPack: Decodable, Sendable, Equatable, Identifiable {
    let id: String
    var name: String?
    let coins: Int
    var bonus: Int?
    /// Display price from the server, e.g. "$4.99". The app never works out
    /// a price itself.
    var price: String?
    var price_cents: Int?
    var currency: String?
    /// "best_value", "popular"…
    var tag: String?
    /// The server's names for the same facts (docs/API.md §12).
    var amount_cents: Int?
    var best_value: Bool?

    /// `coins` is what the player receives, bonus included (docs/API.md §12);
    /// `bonus` is only how much of it to call out.
    var total: Int { coins }
    var base: Int { coins - max(0, bonus ?? 0) }
    var priceText: String {
        if let price { return price }
        if let cents = price_cents ?? amount_cents { return Money.text(cents, currency ?? "USD") }
        return ""
    }
}

struct CoinsConfig: Decodable, Sendable, Equatable {
    /// Whether this player, in this region, may be sent to buy coins on the
    /// web. False hides every pack and buy button.
    var web_allowed: Bool?
    /// Where buying on the web is allowed (the server's list, e.g. ["US"]).
    var regions: [String]?
    var currency: String?
    var packs: [CoinPack]?
    /// The old Stripe entry for cash events. Off: Stripe prohibits paid entry
    /// with a prize of value, so the path stays in the code but unreachable.
    var cash_entry: Bool?
}

struct CoinCheckout: Decodable, Sendable {
    let order_id: String
    let checkout_url: String
    var expires_at: String?
}

struct CoinOrder: Decodable, Sendable, Equatable {
    var order_id: String?
    /// pending | paid | expired | cancelled | refunded
    let status: String
    var coins: Int?
    var balance: Int?
}

struct CoinHistoryRow: Decodable, Sendable, Equatable, Identifiable {
    var id: String
    let delta: Int
    /// purchase | earn | spend | refund | clawback | grant
    let kind: String
    var label: String?
    let at: String
    var receipt_url: String?

    enum CodingKeys: String, CodingKey { case id, delta, kind, label, at, receipt_url, ref }

    init(id: String, delta: Int, kind: String, label: String?, at: String, receipt_url: String? = nil) {
        self.id = id; self.delta = delta; self.kind = kind; self.label = label
        self.at = at; self.receipt_url = receipt_url
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let delta = try c.decode(Int.self, forKey: .delta)
        let kind = try c.decode(String.self, forKey: .kind)
        let at = try c.decode(String.self, forKey: .at)
        self.delta = delta
        self.kind = kind
        self.at = at
        label = try c.decodeIfPresent(String.self, forKey: .label)
        receipt_url = try c.decodeIfPresent(String.self, forKey: .receipt_url)
        // Rows are keyed however the server keys them; fall back to a stable
        // composite so a list never collapses two rows into one.
        if let id = try? c.decodeIfPresent(String.self, forKey: .id) {
            self.id = id
        } else if let ref = try? c.decodeIfPresent(String.self, forKey: .ref) {
            self.id = "\(kind):\(ref)"
        } else {
            self.id = "\(kind):\(at):\(delta)"
        }
    }
}

struct CoinHistory: Decodable, Sendable {
    var balance: Int?
    let entries: [CoinHistoryRow]

    enum CodingKeys: String, CodingKey { case balance, entries, items }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        struct Split: Decodable { let coins: Int }
        balance = (try? c.decodeIfPresent(Int.self, forKey: .balance))
            ?? (try? c.decodeIfPresent(Split.self, forKey: .balance))?.coins
        entries = try c.decodeIfPresent([CoinHistoryRow].self, forKey: .items)
            ?? c.decodeIfPresent([CoinHistoryRow].self, forKey: .entries) ?? []
    }
}

struct CoinSpend: Decodable, Sendable {
    var spent: Int?
    let balance: Int
    var entered: Bool?

    enum CodingKeys: String, CodingKey { case spent, balance, entered, coins, entry_coins }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        entered = try c.decodeIfPresent(Bool.self, forKey: .entered)
        spent = try c.decodeIfPresent(Int.self, forKey: .spent)
            ?? c.decodeIfPresent(Int.self, forKey: .entry_coins)
        balance = try c.decodeIfPresent(Int.self, forKey: .coins)
            ?? c.decode(Int.self, forKey: .balance)
    }
}

private struct CoinCheckoutBody: Encodable, Sendable {
    let device_key: String
    let pack_id: String
    let region: String
}

private struct CoinSpendBody: Encodable, Sendable {
    let device_key: String
    let game_id: String
}

// MARK: - Region

enum CoinRegion {
    /// ISO 3166 alpha-2 for the App Store storefront the player is on,
    /// because that, not where they happen to be standing, is what Apple's
    /// link-out rule is about. The device region is the fallback.
    static func current() async -> String {
        #if DEBUG
        if let r = UserDefaults.standard.string(forKey: "coinsRegion"), !r.isEmpty { return r.uppercased() }
        #endif
        // Staging is for testing the flow, wherever the tester is.
        if !CQConfig.isProduction { return "US" }
        if let sf = await Storefront.current { return alpha2(sf.countryCode) }
        return Locale.current.region?.identifier.uppercased() ?? ""
    }

    /// Storefront codes are alpha-3. Only the ones that matter to the rule
    /// are mapped; anything else is passed through and the server, which
    /// holds the allowed list, reads it as not allowed.
    static func alpha2(_ code: String) -> String {
        let map = ["USA": "US", "NGA": "NG", "GBR": "GB", "CAN": "CA", "IRL": "IE", "AUS": "AU",
                   "DEU": "DE", "FRA": "FR", "GHA": "GH", "KEN": "KE", "ZAF": "ZA"]
        let up = code.uppercased()
        return map[up] ?? up
    }
}

// MARK: - Model

@MainActor
@Observable
final class CoinsModel {
    static let shared = CoinsModel()

    private(set) var config: CoinsConfig?
    private(set) var history: [CoinHistoryRow] = []
    private(set) var balance: Int?
    private(set) var region = ""
    /// Stripe's hosted checkout, while it is open.
    var checkoutURL: URL?
    /// Coins just added, for the "+1,200" moment. Nil when nothing to show.
    var gained: Int?
    var problem: String?
    private(set) var busy = false
    /// The order the player is paying for right now, so a return from Safari
    /// without the URL scheme (they closed the sheet) is still followed up.
    private var pendingOrder: String?

    private let client = GameClient()

    var webAllowed: Bool {
        if let w = config?.web_allowed { return w }
        return config?.regions?.contains(region.uppercased()) == true
    }
    var packs: [CoinPack] { webAllowed ? (config?.packs ?? []) : [] }

    /// The Stripe entry for cash events: kept, unreachable unless the server
    /// switches it on (or a DEBUG launch asks, for regression checks).
    var cashEntryEnabled: Bool {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "cashEntry") { return true }
        #endif
        return config?.cash_entry == true
    }

    func refresh(_ store: RoamStore? = nil) async {
        #if DEBUG
        if CoinsDemo.active { CoinsDemo.fill(self); return }
        #endif
        if region.isEmpty { region = await CoinRegion.current() }
        guard let key = try? await client.deviceKey() else { return }
        if let c = try? await client.roamGet("v1/coins/config", query: [
            URLQueryItem(name: "device_key", value: key),
            URLQueryItem(name: "region", value: region)], as: CoinsConfig.self) {
            config = c
        }
        if let h = try? await client.roamGet("v1/coins/history", query: [
            URLQueryItem(name: "device_key", value: key)], signed: true, as: CoinHistory.self) {
            history = h.entries
            if let b = h.balance { balance = b }
        }
        if let store { await store.refreshMe() }
    }

    /// A pack tapped: the server creates the Stripe session and the app opens
    /// Stripe's own page. Nothing about the card ever passes through the app.
    func buy(_ pack: CoinPack) async {
        guard !busy, webAllowed else { return }
        busy = true
        defer { busy = false }
        problem = nil
        do {
            let key = try await client.deviceKey()
            let c = try await client.roamPost("v1/coins/checkout", body: CoinCheckoutBody(
                device_key: key, pack_id: pack.id, region: region), as: CoinCheckout.self)
            guard let url = URL(string: c.checkout_url), url.scheme == "https" else {
                problem = "Checkout couldn't open. Try again."
                return
            }
            pendingOrder = c.order_id
            checkoutURL = url
            GameSound.shared.play(.tap)
        } catch {
            problem = error.localizedDescription
        }
    }

    /// `cosquest://coins?order=…&result=success|cancel`, from Stripe's return
    /// page via the server.
    func handle(_ url: URL, store: RoamStore?) async {
        guard url.scheme == "cosquest", url.host == "coins" else { return }
        let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let order = q.first { $0.name == "order" }?.value ?? pendingOrder
        let result = q.first { $0.name == "result" }?.value
        checkoutURL = nil
        guard let order else { return }
        if result == "cancel" {
            pendingOrder = nil
            problem = nil
            return
        }
        await follow(order, store: store)
    }

    /// Safari closed by the player: ask what happened rather than assume.
    func checkoutClosed(store: RoamStore?) async {
        checkoutURL = nil
        guard let order = pendingOrder else { return }
        await follow(order, store: store, quiet: true)
    }

    /// The webhook can land a moment after the browser returns, so the order
    /// is asked about a few times before telling the player it is still
    /// being confirmed.
    private func follow(_ order: String, store: RoamStore?, quiet: Bool = false) async {
        guard let key = try? await client.deviceKey() else { return }
        for attempt in 0..<10 {
            if let o = try? await client.roamGet("v1/coins/order/\(order)", query: [
                URLQueryItem(name: "device_key", value: key)], signed: true, as: CoinOrder.self) {
                switch o.status {
                case "paid":
                    pendingOrder = nil
                    if let b = o.balance { balance = b }
                    celebrate(o.coins ?? 0)
                    await refresh(store)
                    return
                case "expired", "cancelled", "failed":
                    pendingOrder = nil
                    return
                default:
                    break
                }
            }
            try? await Task.sleep(for: .milliseconds(500 + 300 * attempt))
        }
        if !quiet {
            problem = "Your payment is still being confirmed. Your CosCoins will appear as soon as it is."
        }
    }

    func celebrate(_ coins: Int) {
        guard coins > 0 else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        GameSound.shared.play(.coin)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) { gained = coins }
    }

    /// Enter an event with coins. Idempotent on the server per game.
    func spend(gameID: String) async throws -> CoinSpend {
        let key = try await client.deviceKey()
        let s = try await client.roamPost("v1/coins/spend", body: CoinSpendBody(
            device_key: key, game_id: gameID), as: CoinSpend.self)
        balance = s.balance
        return s
    }

    /// What the app shows as the balance: the coin ledger's when known,
    /// otherwise the player's standing.
    func displayBalance(_ store: RoamStore?) -> Int {
        balance ?? store?.me?.coins ?? 0
    }
}

// MARK: - The sheet

/// The coin pill, opened: your balance, the packs (where allowed), and every
/// coin in and out.
struct CoinsSheet: View {
    let store: RoamStore?
    @State private var model = CoinsModel.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "CosCoins") { dismiss() }
                    balancePanel
                    if model.webAllowed {
                        packsSection
                    } else {
                        notSoldHere
                    }
                    historySection
                }
                .padding(18)
            }
            .scrollIndicators(.hidden)
            if let g = model.gained {
                CoinsGainedMoment(coins: g) { withAnimation { model.gained = nil } }
                    .transition(.opacity)
            }
        }
        .gameType()
        .presentationDragIndicator(.visible)
        .sheet(item: Binding(get: { model.checkoutURL.map(IdentifiedURL.init) },
                             set: { if $0 == nil { model.checkoutURL = nil } })) { u in
            CheckoutSafari(url: u.url) { Task { await model.checkoutClosed(store: store) } }
                .ignoresSafeArea()
        }
        .task { await model.refresh(store) }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task { await model.refresh(store) }
        }
    }

    private var balancePanel: some View {
        GamePanel {
          VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 14) {
                GameCoin(size: 46)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(model.displayBalance(store))")
                        .font(GameFont.display(34).monospacedDigit())
                        .contentTransition(.numericText())
                        .animation(.smooth, value: model.displayBalance(store))
                    Text("CosCoins")
                        .font(GameFont.body(14, weight: .bold))
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                }
                Spacer()
            }
            Text("CosCoins are for use in CosQuest. They have no cash value and can't be withdrawn.")
                .font(GameFont.body(12, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.55))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
          }
        }
    }

    private var packsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Get CosCoins")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                      spacing: 12) {
                ForEach(model.packs) { pack in
                    Button { Task { await model.buy(pack) } } label: { CoinPackCard(pack: pack) }
                        .buttonStyle(CardPress())
                        .disabled(model.busy)
                }
            }
            if let p = model.problem {
                Text(p).font(GameFont.body(13, weight: .semibold)).foregroundStyle(GamePalette.sun)
            }
            HStack(spacing: 6) {
                Image(systemName: "lock.fill").font(.system(size: 11, weight: .bold))
                Text("Payment is handled securely by Stripe.")
            }
            .font(GameFont.body(12, weight: .bold))
            .foregroundStyle(GamePalette.ink.opacity(0.7))
        }
    }

    /// Outside the regions where the app may point at the web shop, the sheet
    /// says so plainly and offers no other route: coins aren't earned.
    private var notSoldHere: some View {
        GamePanel(padding: 14) {
            HStack(spacing: 12) {
                Image(systemName: "globe.americas.fill")
                    .font(.system(size: 18, weight: .heavy))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(GamePalette.skyDeep))
                Text("CosCoins are available in the US.")
                    .font(GameFont.display(16))
                Spacer(minLength: 0)
            }
        }
    }

    @ViewBuilder private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("History")
            if model.history.isEmpty {
                Text("Nothing yet. Coins you buy or spend show up here.")
                    .font(GameFont.body(14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
            } else {
                GamePanel(padding: 6) {
                    VStack(spacing: 0) {
                        ForEach(Array(model.history.enumerated()), id: \.element.id) { i, row in
                            CoinHistoryLine(row: row)
                            if i < model.history.count - 1 {
                                Rectangle().fill(GamePalette.ink.opacity(0.08)).frame(height: 1)
                                    .padding(.horizontal, 10)
                            }
                        }
                    }
                }
            }
        }
    }

    private func sectionTitle(_ s: String) -> some View {
        Text(s.uppercased())
            .font(GameFont.display(13)).tracking(1.4)
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            .padding(.top, 4)
    }
}

/// One pack, as a flat printed card like the nearby cards.
struct CoinPackCard: View {
    let pack: CoinPack

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                GameCoin(size: 30)
                Spacer(minLength: 4)
                if let tag = pack.tag ?? (pack.best_value == true ? "best_value" : nil) {
                    Text(tag == "best_value" ? "BEST VALUE" : tag.replacingOccurrences(of: "_", with: " ").uppercased())
                        .font(GameFont.display(10)).tracking(0.8)
                        .foregroundStyle(GamePalette.ink)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(GamePalette.sun))
                }
            }
            Text("\(pack.total.formatted())")
                .font(GameFont.display(24).monospacedDigit())
                .foregroundStyle(GamePalette.ink)
            Text(pack.bonus.map { $0 > 0 ? "\(pack.base.formatted()) + \($0.formatted()) bonus" : "CosCoins" }
                 ?? "CosCoins")
                .font(GameFont.body(11, weight: .heavy))
                .foregroundStyle(GamePalette.ink.opacity(0.55))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(pack.priceText)
                .font(GameFont.display(16))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(GamePalette.mint))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(GamePalette.cream)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill((pack.tag ?? (pack.best_value == true ? "best_value" : nil)) == "best_value" ? GamePalette.sunDeep : GamePalette.slate)
                    .offset(y: 4))
        )
        .shadow(color: .black.opacity(0.18), radius: 3, y: 3)
        .padding(.bottom, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(pack.total) CosCoins, \(pack.priceText)")
    }
}

struct CoinHistoryLine: View {
    let row: CoinHistoryRow

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(row.delta >= 0 ? GamePalette.mint : GamePalette.mist)
                .frame(width: 28, height: 28)
                .background(Circle().fill(GamePalette.ink.opacity(0.06)))
            VStack(alignment: .leading, spacing: 1) {
                Text(row.label ?? title)
                    .font(GameFont.body(14, weight: .bold))
                    .lineLimit(1)
                Text(when)
                    .font(GameFont.body(11, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.5))
            }
            Spacer(minLength: 6)
            if let r = row.receipt_url, let url = URL(string: r) {
                Link(destination: url) {
                    Image(systemName: "doc.text").font(.system(size: 13, weight: .bold))
                }
                .foregroundStyle(GamePalette.skyDeep)
                .accessibilityLabel("Receipt")
            }
            Text(row.delta >= 0 ? "+\(row.delta.formatted())" : "−\((-row.delta).formatted())")
                .font(GameFont.display(16).monospacedDigit())
                .foregroundStyle(row.delta >= 0 ? GamePalette.mint : GamePalette.ink.opacity(0.75))
        }
        .padding(.horizontal, 10).padding(.vertical, 9)
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        switch row.kind {
        case "purchase": return "Bought CosCoins"
        case "earn": return "Earned playing"
        case "spend": return "Event entry"
        case "refund": return "Refund"
        case "clawback": return "Payment reversed"
        case "grant": return "From CosQuest"
        default: return row.kind.capitalized
        }
    }

    private var symbol: String {
        switch row.kind {
        case "purchase": return "creditcard.fill"
        case "earn": return "star.fill"
        case "spend": return "ticket.fill"
        case "refund": return "arrow.uturn.backward"
        case "clawback": return "exclamationmark.triangle.fill"
        default: return "gift.fill"
        }
    }

    private var when: String {
        guard let d = RoamDates.parse(row.at) else { return "" }
        return d.formatted(.relative(presentation: .named))
    }
}

/// "+1,200 CosCoins": the count runs up, then settles.
struct CoinsGainedMoment: View {
    let coins: Int
    var onDone: () -> Void
    @State private var shown = 0
    @State private var landed = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.55).ignoresSafeArea()
                .onTapGesture { onDone() }
            VStack(spacing: 14) {
                GameCoin(size: 84)
                    .scaleEffect(landed ? 1 : 0.6)
                Text("+\(shown.formatted())")
                    .font(GameFont.display(56).monospacedDigit())
                    .foregroundStyle(.white)
                    .contentTransition(.numericText())
                Text("CosCoins added")
                    .font(GameFont.display(18))
                    .foregroundStyle(.white.opacity(0.85))
                Button("Nice", action: onDone)
                    .buttonStyle(.game(GamePalette.sun, fullWidth: false))
                    .padding(.top, 6)
            }
            .padding(28)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(coins) CosCoins added")
        .task {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.55)) { landed = true }
            let steps = 24
            for i in 1...steps {
                try? await Task.sleep(for: .milliseconds(30))
                withAnimation(.linear(duration: 0.03)) { shown = coins * i / steps }
            }
            GameSound.shared.play(.reward)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }
}

private struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Stripe's hosted checkout in a real browser: Apple Pay works there and the
/// player can see whose page they are on.
struct CheckoutSafari: UIViewControllerRepresentable {
    let url: URL
    let onDismiss: () -> Void

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let c = SFSafariViewController(url: url)
        c.delegate = context.coordinator
        c.dismissButtonStyle = .cancel
        return c
    }

    func updateUIViewController(_ c: SFSafariViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onDismiss: onDismiss) }

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        let onDismiss: () -> Void
        init(onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { onDismiss() }
    }
}

// MARK: - Entering an event with coins

/// The entry button for an event priced in coins, with its short-of-coins
/// state. The event's rewards are in-game only; the server refuses a coin
/// entry fee on anything with a cash, material or coin prize.
struct CoinEntryPanel: View {
    let price: Int
    let balance: Int
    var rewards: [String]
    let working: Bool
    let tint: Color
    var onEnter: () -> Void
    var onGetCoins: () -> Void

    private var short: Int { max(0, price - balance) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            GamePanel(padding: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("REWARDS").font(GameFont.display(12)).tracking(1.2)
                        .foregroundStyle(GamePalette.ink.opacity(0.55))
                    ForEach(rewards.isEmpty ? ["XP and rank for everyone", "A trophy for the top 3"] : rewards,
                            id: \.self) { r in
                        HStack(spacing: 8) {
                            Image(systemName: "rosette").font(.system(size: 12, weight: .heavy))
                                .foregroundStyle(GamePalette.sunDeep)
                            Text(r).font(GameFont.body(14, weight: .bold))
                        }
                    }
                    Text("In-game rewards only. CosCoins have no cash value.")
                        .font(GameFont.body(11, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.5))
                }
            }
            if short == 0 {
                Button { onEnter() } label: {
                    HStack(spacing: 8) {
                        Text(working ? "WORKING..." : "ENTER FOR")
                        if !working {
                            GameCoin(size: 20)
                            Text("\(price.formatted()) COSCOINS")
                        }
                    }
                }
                .buttonStyle(.game(tint))
                .disabled(working)
                Text("You have \(balance.formatted()) CosCoins.")
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
            } else {
                GamePanel(face: GamePalette.ice, padding: 14) {
                    HStack(spacing: 10) {
                        GameCoin(size: 28)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("You need \(short.formatted()) more CosCoins")
                                .font(GameFont.display(17))
                            Text("Entry is \(price.formatted()). You have \(balance.formatted()).")
                                .font(GameFont.body(12, weight: .semibold))
                                .foregroundStyle(GamePalette.ink.opacity(0.6))
                        }
                    }
                }
                if CoinsModel.shared.webAllowed {
                    Button("GET COSCOINS") { onGetCoins() }
                        .buttonStyle(.game(GamePalette.sun))
                } else {
                    Text("CosCoins are available in the US.")
                        .font(GameFont.body(13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                }
            }
        }
    }
}

// MARK: - DEBUG sample data

#if DEBUG
/// `-coinsDemo sheet|moment|entry|short` for screenshots without a server.
enum CoinsDemo {
    static var mode: String? { UserDefaults.standard.string(forKey: "coinsDemo") }
    static var active: Bool { mode != nil }

    static let packs: [CoinPack] = [
        CoinPack(id: "handful", name: "Handful", coins: 100, bonus: 0, price: "$0.99"),
        CoinPack(id: "pouch", name: "Pouch", coins: 550, bonus: 50, price: "$4.99", tag: "popular"),
        CoinPack(id: "chest", name: "Chest", coins: 1200, bonus: 200, price: "$9.99", tag: "best_value"),
        CoinPack(id: "vault", name: "Vault", coins: 2600, bonus: 600, price: "$19.99"),
    ]

    @MainActor static func fill(_ m: CoinsModel) {
        let now = Date()
        func ago(_ s: Double) -> String { ISO8601DateFormatter().string(from: now.addingTimeInterval(-s)) }
        m.setDemo(config: CoinsConfig(web_allowed: UserDefaults.standard.string(forKey: "coinsRegion") != "NG",
                                      packs: packs, cash_entry: false),
                  history: [
                    CoinHistoryRow(id: "1", delta: 1200, kind: "purchase", label: "Chest · 1,000 + 200 bonus",
                                   at: ago(600), receipt_url: "https://example.com/receipt"),
                    CoinHistoryRow(id: "2", delta: -500, kind: "spend", label: "Night Market Showdown", at: ago(3600)),
                    CoinHistoryRow(id: "5", delta: 500, kind: "refund", label: "Rooftop Rumble cancelled", at: ago(90_000)),
                  ],
                  balance: mode == "short" ? 200 : 1485)
        if mode == "moment" { m.celebrate(1400) }
    }

    /// A coin-priced event for EntryView, straight from JSON so it is the
    /// server's shape exactly.
    static let terms: GameTerms? = {
        let json = """
        {"game_id":"demo-coins","title":"Night Market Showdown","status":"scheduled","mode":"battle",
         "entry_fee_cents":0,"currency":"USD","platform_cut_bps":0,"winner_split_bps":[],
         "prize_pool_note":"In-game rewards only.","sponsored":false,"sponsor":null,"venue":null,
         "starts_at":null,"ends_at":null,"require_signatures":false,"environment_ready":true,
         "factions":[{"name":"Anime","color":"#E4468C","players":12},{"name":"Gaming","color":"#3CB371","players":9}],
         "players_joined":21,"players_paid":21,"pot_cents":0,"prize_pool_cents":0,"sponsor_cents":0,
         "entry_coins":500,
         "coin_rewards":["+400 XP for every finisher","Trophy: Night Market Crown (top 3)","Title: Market Legend (winner)"]}
        """
        return try? JSONDecoder().decode(GameTerms.self, from: Data(json.utf8))
    }()
}

extension CoinsModel {
    fileprivate func setDemo(config: CoinsConfig, history: [CoinHistoryRow], balance: Int) {
        self.config = config
        self.history = history
        self.balance = balance
    }
}
#endif
