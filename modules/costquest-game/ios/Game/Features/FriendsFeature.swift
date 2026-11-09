import CoreImage
import CoreImage.CIFilterBuiltins
import CryptoKit
import Foundation
import NearbyInteraction
import Network
import OSLog
import SwiftUI
import UIKit

// FEATURE: social. Friends added in person, friendship levels, gifts.
//
// This file is the whole iOS side of the feature. The views below are
// already placed in the app (RoamHomeView, PointCard, DailiesSheet...), so
// the feature only fills them in here. Keep every name and signature that is
// used elsewhere; add anything else you need in THIS file (more types, views,
// calls via `store.api.roamGet/roamPost`). Stay stateless where you can and
// hold state in an @Observable you create here.
//
// Safety is the design: a friend is added only by standing next to them (the
// server checks the adder is within 100 m of where the code was made), there
// is no search, no request from afar, no chat, and no location ever crosses
// between friends. The phone shows what the server says; it judges nothing.

// MARK: - Wire

struct FriendEntry: Decodable, Sendable, Equatable, Identifiable {
    let friend_key: String
    let handle: String
    let faction: String?
    let level_name: String
    let days: Int
    let next_level_at: Int?
    let can_gift_today: Bool
    let since: String

    var id: String { friend_key }
}

struct FriendsPayload: Decodable, Sendable, Equatable {
    let friends: [FriendEntry]
    let pending_gifts: Int
}

struct FriendCode: Decodable, Sendable, Equatable {
    let code: String
    let expires_at: String
    let ttl_s: Int
}

struct FriendAdded: Decodable, Sendable {
    let added: Bool
    let already: Bool
    let friend_key: String
    let handle: String
}

struct FriendGiftSent: Decodable, Sendable { let sent: Bool }

struct FriendGift: Decodable, Sendable, Equatable, Hashable {
    let from: String
    let item: String
    let name: String
    let added: Int
}

struct FriendClaim: Decodable, Sendable {
    let gifts: [FriendGift]
    let bag: [String: Int]
}

private struct FriendCodeBody: Encodable, Sendable {
    let device_key: String
    let lat: Double
    let lng: Double
}

private struct FriendAddBody: Encodable, Sendable {
    let device_key: String
    let code: String
    let lat: Double
    let lng: Double
}

private struct FriendGiftBody: Encodable, Sendable {
    let device_key: String
    let friend_key: String
}

private struct FriendClaimBody: Encodable, Sendable {
    let device_key: String
}

// MARK: - State

/// Friends, the live code and the gift box. One per button, shared with the
/// sheet, so the badge and the list never disagree.
@MainActor @Observable
final class FriendsModel {
    private(set) var payload: FriendsPayload?
    private(set) var code: FriendCode?
    private(set) var codeExpires: Date?
    private(set) var qr: UIImage?
    private(set) var failed = false
    private(set) var busy = false
    /// The last thing to tell the player: a refusal in the server's words,
    /// or a friend just added.
    var message: String?
    /// What the last "Open gifts" brought, shown until the sheet closes.
    var opened: [FriendGift] = []
    /// Friends gifted this session, so the button greys at once rather than
    /// after the list reloads.
    private(set) var giftedNow: Set<String> = []

    var pending: Int { payload?.pending_gifts ?? 0 }

    func refresh(_ store: RoamStore) async {
        do {
            let key = try await store.api.deviceKey()
            payload = try await store.api.roamGet(
                "v1/roam/social/friends", query: [URLQueryItem(name: "device_key", value: key)],
                signed: true, as: FriendsPayload.self)
            failed = false
        } catch {
            // Keep the list we had: a flaky network should not "unfriend".
            failed = true
        }
    }

    func makeCode(_ store: RoamStore) async {
        guard let here = store.coordinate, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            let c = try await store.api.roamPost(
                "v1/roam/social/code",
                body: FriendCodeBody(device_key: key, lat: here.latitude, lng: here.longitude),
                as: FriendCode.self)
            code = c
            // The phone's clock, not the server's timestamp, times the
            // countdown: a skewed clock must not show a live code as dead.
            codeExpires = Date().addingTimeInterval(TimeInterval(c.ttl_s))
            qr = Self.qrImage(c.code)
        } catch {
            message = error.localizedDescription
        }
    }

    func add(_ typed: String, store: RoamStore) async -> Bool {
        guard let here = store.coordinate, !busy else { return false }
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            let r = try await store.api.roamPost(
                "v1/roam/social/add",
                body: FriendAddBody(device_key: key, code: typed,
                                    lat: here.latitude, lng: here.longitude),
                as: FriendAdded.self)
            message = r.already ? "You and \(r.handle) are already friends."
                                : "You and \(r.handle) are now friends!"
            if r.added { GameSound.shared.play(.fanfare) }
            await refresh(store)
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }

    func gift(_ friend: FriendEntry, store: RoamStore) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            _ = try await store.api.roamPost(
                "v1/roam/social/gift",
                body: FriendGiftBody(device_key: key, friend_key: friend.friend_key),
                as: FriendGiftSent.self)
            giftedNow.insert(friend.friend_key)
            GameSound.shared.play(.whoosh)
            await refresh(store)
        } catch {
            message = error.localizedDescription
            await refresh(store)
        }
    }

    func claim(_ store: RoamStore) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            let r = try await store.api.roamPost(
                "v1/roam/social/claim", body: FriendClaimBody(device_key: key),
                as: FriendClaim.self)
            opened = r.gifts
            if !r.gifts.isEmpty { GameSound.shared.play(.reward) }
            store.noteBag(r.bag)
            await refresh(store)
            store.featureChanged()
        } catch {
            message = error.localizedDescription
        }
    }

    func canGift(_ f: FriendEntry) -> Bool { f.can_gift_today && !giftedNow.contains(f.friend_key) }

    private static func qrImage(_ text: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        // Scaled up as pixels, not interpolated, so the modules stay sharp.
        guard let out = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 10, y: 10)),
              let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

// MARK: - Button

/// A button in the home top bar that opens Friends.
struct FriendsButton: View {
    let store: RoamStore
    @State private var model = FriendsModel()
    @State private var showing = false

    var body: some View {
        Button { showing = true } label: { Image(systemName: "person.2.fill") }
            .buttonStyle(.gameIcon(GamePalette.berry, diameter: 46))
            .overlay(alignment: .topTrailing) {
                if model.pending > 0 {
                    Text("\(model.pending)")
                        .font(GameFont.display(13, relativeTo: .caption))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .frame(minWidth: 22, minHeight: 22)
                        .background(Capsule().fill(GamePalette.sunDeep)
                            .overlay(Capsule().strokeBorder(.white, lineWidth: 2)))
                        .offset(x: 6, y: -6)
                        .allowsHitTesting(false)
                }
            }
            .accessibilityLabel(model.pending > 0
                                ? "Friends, \(model.pending) \(model.pending == 1 ? "gift" : "gifts") waiting"
                                : "Friends")
            .task { await model.refresh(store) }
            .sheet(isPresented: $showing, onDismiss: {
                model.opened = []
                model.message = nil
            }) {
                FriendsSheet(store: store, model: model)
            }
    }
}

// MARK: - Sheet

struct FriendsSheet: View {
    let store: RoamStore
    @Bindable var model: FriendsModel
    @Environment(\.dismiss) private var dismiss
    @State private var typed = ""
    @FocusState private var typing: Bool
    @State private var nearby = NearbyFriendModel()

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "Friends") { dismiss() }
                    Text("Friends are added face to face. No chat, and nobody sees where you are.")
                        .font(GameFont.body(15, weight: .semibold))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.3), radius: 0, y: 1)
                    HoldPhonesCard(store: store, friends: model, nearby: nearby)
                    addPanel
                    if let m = model.message {
                        GamePanel(face: GamePalette.sun.opacity(0.95), padding: 14) {
                            Text(m).font(GameFont.body(15, weight: .semibold))
                        }
                    }
                    giftsPanel
                    listPanel
                }
                .padding(18)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .gameType()
        .presentationDragIndicator(.visible)
        .task { await model.refresh(store) }
        .task { await nearby.start(store: store, friends: model) }
        // Radios off the moment the sheet goes: no listener, browser,
        // connection or ranging session outlives the screen.
        .onDisappear { nearby.stop() }
    }

    // MARK: Add in person

    private var addPanel: some View {
        GamePanel {
            VStack(alignment: .leading, spacing: 14) {
                Text("Or use a code").font(GameFont.display(22))
                if store.coordinate == nil {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Waiting for your location")
                            .font(GameFont.body(15, weight: .semibold))
                    }
                } else {
                    myCode
                    Divider()
                    Text("Got a friend's code?").font(GameFont.body(15, weight: .bold))
                    HStack(spacing: 10) {
                        TextField("ABC123", text: $typed)
                            .font(GameFont.display(24).monospaced())
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .focused($typing)
                            .submitLabel(.done)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(RoundedRectangle(cornerRadius: 14).fill(.white))
                            .overlay(RoundedRectangle(cornerRadius: 14)
                                .strokeBorder(GamePalette.ink.opacity(0.15), lineWidth: 2))
                            .onChange(of: typed) { _, v in
                                let clean = String(v.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(6))
                                if clean != v { typed = clean }
                            }
                            .accessibilityLabel("Friend's code")
                        Button("Add") {
                            typing = false
                            Task { if await model.add(typed, store: store) { typed = "" } }
                        }
                        .buttonStyle(.game(GamePalette.mint, size: .medium, fullWidth: false))
                        .disabled(typed.count != 6 || model.busy)
                    }
                }
            }
        }
    }

    @ViewBuilder private var myCode: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let left = model.codeExpires.map { max(0, Int($0.timeIntervalSince(ctx.date))) } ?? 0
            if let code = model.code, left > 0 {
                VStack(spacing: 10) {
                    Button { Task { await model.makeCode(store) } } label: {
                        Text(code.code)
                            .font(GameFont.display(46).monospaced())
                            .tracking(6)
                            .foregroundStyle(GamePalette.ink)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Your code \(code.code.map(String.init).joined(separator: " ")). Tap for a new one.")
                    if let qr = model.qr {
                        Image(uiImage: qr)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 170, height: 170)
                            .padding(8)
                            .background(RoundedRectangle(cornerRadius: 14).fill(.white))
                            .accessibilityHidden(true)
                    }
                    GameChip(text: "Valid \(left / 60):\(String(format: "%02d", left % 60))",
                             color: left < 60 ? GamePalette.berry : GamePalette.skyDeep)
                    Text("Show this to a friend standing beside you.")
                        .font(GameFont.body(14, weight: .medium))
                        .foregroundStyle(GamePalette.ink.opacity(0.7))
                }
                .frame(maxWidth: .infinity)
            } else {
                Button(model.code == nil ? "Show my code" : "Code expired. New code") {
                    Task { await model.makeCode(store) }
                }
                .buttonStyle(.game(GamePalette.skyDeep, size: .medium))
                .disabled(model.busy)
            }
        }
    }

    // MARK: Gifts

    @ViewBuilder private var giftsPanel: some View {
        if model.pending > 0 || !model.opened.isEmpty {
            GamePanel {
                VStack(alignment: .leading, spacing: 12) {
                    if model.pending > 0 {
                        Button {
                            Task { await model.claim(store) }
                        } label: {
                            Label("Open gifts (\(model.pending))", systemImage: "gift.fill")
                        }
                        .buttonStyle(.game(GamePalette.sun, size: .medium))
                        .disabled(model.busy)
                    }
                    if !model.opened.isEmpty {
                        Text("Gifts arrived").font(GameFont.display(20))
                        ForEach(Array(model.opened.enumerated()), id: \.offset) { _, g in
                            HStack(spacing: 10) {
                                Image(systemName: "gift.fill").foregroundStyle(GamePalette.berry)
                                Text(g.name).font(GameFont.body(16, weight: .bold))
                                Spacer()
                                Text(g.added > 0 ? "from \(g.from)" : "from \(g.from) (bag full)")
                                    .font(GameFont.body(14, weight: .medium))
                                    .foregroundStyle(GamePalette.ink.opacity(0.65))
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: List

    @ViewBuilder private var listPanel: some View {
        GamePanel {
            VStack(alignment: .leading, spacing: 12) {
                Text("Your friends").font(GameFont.display(22))
                if let p = model.payload {
                    if p.friends.isEmpty {
                        Text("No friends yet. Meet up, show your code, and play together.")
                            .font(GameFont.body(15, weight: .medium))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                    }
                    ForEach(p.friends) { f in row(f) }
                } else if model.failed {
                    Text("Can't load your friends right now.")
                        .font(GameFont.body(15, weight: .medium))
                    Button("Try again") { Task { await model.refresh(store) } }
                        .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
                } else {
                    ProgressView()
                }
            }
        }
    }

    private func row(_ f: FriendEntry) -> some View {
        let canGift = model.canGift(f)
        return HStack(spacing: 10) {
            Circle().fill(RoamStyle.realmColor(f.faction)).frame(width: 14, height: 14)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(f.handle).font(GameFont.body(17, weight: .bold)).lineLimit(1)
                HStack(spacing: 6) {
                    GameChip(text: f.level_name, color: levelColor(f.level_name))
                    Text(daysLine(f))
                        .font(GameFont.body(13, weight: .semibold))
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            Spacer(minLength: 4)
            Button {
                Task { await model.gift(f, store: store) }
            } label: {
                Label(canGift ? "Gift" : "Sent", systemImage: canGift ? "gift.fill" : "checkmark")
            }
            .buttonStyle(.game(GamePalette.berry, size: .small, fullWidth: false))
            .disabled(!canGift || model.busy)
            .accessibilityLabel(canGift ? "Send \(f.handle) a gift" : "Gift sent to \(f.handle) today")
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
    }

    private func daysLine(_ f: FriendEntry) -> String {
        let d = "\(f.days) \(f.days == 1 ? "day" : "days")"
        guard let next = f.next_level_at else { return d }
        return "\(d) · next at \(next)"
    }

    private func levelColor(_ name: String) -> Color {
        switch name {
        case "Best": return GamePalette.sunDeep
        case "Ultra": return GamePalette.berry
        case "Great": return GamePalette.skyDeep
        default: return GamePalette.mint
        }
    }
}

// MARK: - Hold phones together
//
// Both phones open Friends. Each advertises a small Bonjour service on the
// same `_costquest._tcp` type the game mesh uses (the only types Info.plist
// allows), told apart by a "cq=friend" TXT entry and a "cqfriend-" name; the
// game mesh only dials records whose "game" matches its own, so the two never
// meet. The phones swap device keys (and, where the radio exists, ultra
// wideband tokens) over one short TLS link, then each claims the other at
// /v1/roam/social/nearby. The server makes them friends only once both have
// claimed within 90 s from within 100 m: a phone can say anything over the
// local network and still befriend nobody on its own.
//
// Every Network and NearbyInteraction callback below is `@Sendable` or
// `nonisolated` and hops explicitly: a callback that silently inherits
// @MainActor isolation traps the first time the framework calls it from its
// own queue.

struct NearbyFriendResult: Decodable, Sendable {
    let friends: Bool
    let waiting: Bool?
    let already: Bool?
    let friend_key: String?
    let handle: String?
    let faction: String?
}

private struct FriendNearbyBody: Encodable, Sendable {
    let device_key: String
    let peer_key: String
    let lat: Double
    let lng: Double
    let distance_m: Double?
}

private let friendLog = Logger(subsystem: "com.djmcevents.costquest", category: "friends")

/// The local-network half: advertise, browse, and one small link per pair.
actor FriendBeacon {

    enum Event: Sendable {
        /// Everyone currently advertising the friend service, key to handle.
        case seen([String: String])
        /// A link is up and the other phone said who it is.
        case hello(key: String, handle: String)
        /// The other phone's ultra wideband discovery token.
        case token(key: String, data: Data)
        case linkLost(key: String)
        /// Local Network permission was refused.
        case denied
    }

    /// Must be listed in Info.plist NSBonjourServices.
    static let serviceType = "_costquest._tcp"

    private let key: String
    private let handle: String
    private let emit: @Sendable (Event) -> Void

    private struct Link {
        let connection: NWConnection
        var key: String?
    }

    private var listener: NWListener?
    private var browser: NWBrowser?
    private var links: [String: Link] = [:]
    private var endpoints: [String: NWEndpoint] = [:]
    private var redial: Task<Void, Never>?
    private var stopped = false

    init(key: String, handle: String, emit: @escaping @Sendable (Event) -> Void) {
        self.key = key
        self.handle = handle
        self.emit = emit
    }

    func start() {
        guard !stopped else { return }
        do {
            let listener = try NWListener(using: Self.parameters())
            listener.service = NWListener.Service(
                name: "cqfriend-\(key.prefix(12))", type: Self.serviceType,
                txtRecord: NWTXTRecord(["cq": "friend", "key": key,
                                        "h": String(handle.prefix(40))]))
            listener.newConnectionHandler = { @Sendable [weak self] connection in
                Task { await self?.adopt(connection, key: nil) }
            }
            listener.stateUpdateHandler = { @Sendable [weak self] state in
                switch state {
                case .waiting(let error), .failed(let error):
                    Task { await self?.trouble(error, from: "listener") }
                default: break
                }
            }
            listener.start(queue: .global(qos: .userInitiated))
            self.listener = listener
        } catch {
            friendLog.error("friend listener: \(error.localizedDescription)")
        }

        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: Self.serviceType, domain: nil),
                                using: Self.parameters())
        browser.browseResultsChangedHandler = { @Sendable [weak self] results, _ in
            Task { await self?.found(results) }
        }
        browser.stateUpdateHandler = { @Sendable [weak self] state in
            switch state {
            case .waiting(let error), .failed(let error):
                Task { await self?.trouble(error, from: "browser") }
            default: break
            }
        }
        browser.start(queue: .global(qos: .userInitiated))
        self.browser = browser

        // A dial can fail while the peer-to-peer link is still forming; try
        // again rather than wait for the browse results to change.
        redial = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                await self?.dialMissing()
            }
        }
    }

    func stop() {
        stopped = true
        redial?.cancel()
        redial = nil
        listener?.cancel()
        listener = nil
        browser?.cancel()
        browser = nil
        for link in links.values { link.connection.cancel() }
        links.removeAll()
        endpoints.removeAll()
    }

    func send(token: Data, to peer: String) {
        send(["t": "uwb", "token": token.base64EncodedString()], toKey: peer)
    }

    /// TLS with a fixed pre-shared key, so only CostQuest's friend screen can
    /// complete the handshake, and peer-to-peer Wi-Fi so it works with no
    /// shared network at all.
    private static func parameters() -> NWParameters {
        let tls = NWProtocolTLS.Options()
        let secret = Data(SHA256.hash(data: Data("costquest/friend-link/v1".utf8)))
        let identity = Data("cqfriend".utf8)
        secret.withUnsafeBytes { secretBytes in
            identity.withUnsafeBytes { identityBytes in
                sec_protocol_options_add_pre_shared_key(
                    tls.securityProtocolOptions,
                    DispatchData(bytes: secretBytes) as __DispatchData,
                    DispatchData(bytes: identityBytes) as __DispatchData)
            }
        }
        sec_protocol_options_append_tls_ciphersuite(
            tls.securityProtocolOptions, tls_ciphersuite_t.AES_128_GCM_SHA256)
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        let parameters = NWParameters(tls: tls, tcp: tcp)
        parameters.includePeerToPeer = true
        return parameters
    }

    private func trouble(_ error: NWError, from what: String) {
        friendLog.notice("friend \(what): \(String(describing: error))")
        // kDNSServiceErr_PolicyDenied: the Local Network switch is off.
        if case .dns(let code) = error, code == -65570 { emit(.denied) }
    }

    private func found(_ results: Set<NWBrowser.Result>) {
        guard !stopped else { return }
        var handles: [String: String] = [:]
        var eps: [String: NWEndpoint] = [:]
        for result in results {
            guard case .bonjour(let record) = result.metadata,
                  record.dictionary["cq"] == "friend",
                  let peer = record.dictionary["key"], peer != key else { continue }
            handles[peer] = record.dictionary["h"] ?? "Player"
            eps[peer] = result.endpoint
        }
        endpoints = eps
        emit(.seen(handles))
        dialMissing()
    }

    /// One link per pair: the phone with the smaller key dials, the other
    /// answers. Both reach the same answer from the same two strings.
    private func dialMissing() {
        guard !stopped else { return }
        for (peer, endpoint) in endpoints where key < peer {
            guard !links.values.contains(where: { $0.key == peer }) else { continue }
            adopt(NWConnection(to: endpoint, using: Self.parameters()), key: peer)
        }
    }

    private func adopt(_ connection: NWConnection, key peer: String?) {
        guard !stopped else { connection.cancel(); return }
        let id = UUID().uuidString
        links[id] = Link(connection: connection, key: peer)
        connection.stateUpdateHandler = { @Sendable [weak self] state in
            switch state {
            case .ready: Task { await self?.ready(id) }
            case .failed, .cancelled: Task { await self?.drop(id) }
            default: break
            }
        }
        connection.start(queue: .global(qos: .userInitiated))
        receive(on: connection, id: id)
    }

    private func ready(_ id: String) {
        send(["t": "hi", "key": key, "h": String(handle.prefix(40))], onLink: id)
    }

    private func drop(_ id: String) {
        guard let link = links.removeValue(forKey: id) else { return }
        link.connection.cancel()
        if let peer = link.key, !links.values.contains(where: { $0.key == peer }) {
            emit(.linkLost(key: peer))
        }
    }

    private func send(_ object: [String: String], toKey peer: String) {
        guard let id = links.first(where: { $0.value.key == peer })?.key else { return }
        send(object, onLink: id)
    }

    private func send(_ object: [String: String], onLink id: String) {
        guard let connection = links[id]?.connection,
              let body = try? JSONSerialization.data(withJSONObject: object) else { return }
        var length = UInt32(body.count).bigEndian
        var frame = Data(bytes: &length, count: 4)
        frame.append(body)
        connection.send(content: frame, completion: .contentProcessed { @Sendable _ in })
    }

    private func receive(on connection: NWConnection, id: String) {
        connection.receive(minimumIncompleteLength: 4, maximumLength: 4) {
            @Sendable [weak self] header, _, _, error in
            guard let self, let header, header.count == 4, error == nil else {
                Task { await self?.drop(id) }
                return
            }
            let length = Int(header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self).bigEndian })
            guard length > 0, length < 64 * 1024 else {
                Task { await self.drop(id) }
                return
            }
            connection.receive(minimumIncompleteLength: length, maximumLength: length) {
                @Sendable body, _, _, error in
                guard let body, error == nil else {
                    Task { await self.drop(id) }
                    return
                }
                Task {
                    await self.handle(body, on: id)
                    await self.receive(on: connection, id: id)
                }
            }
        }
    }

    private func handle(_ body: Data, on id: String) {
        guard !stopped,
              let object = try? JSONSerialization.jsonObject(with: body) as? [String: String],
              let type = object["t"] else { return }
        switch type {
        case "hi":
            guard let peer = object["key"], peer.count == 64, peer != key else { return }
            links[id]?.key = peer
            emit(.hello(key: peer, handle: object["h"] ?? "Player"))
        case "uwb":
            guard let peer = links[id]?.key, let encoded = object["token"],
                  let token = Data(base64Encoded: encoded) else { return }
            emit(.token(key: peer, data: token))
        default:
            break
        }
    }
}

/// Ultra wideband distance to each phone on the friend screen. One session
/// per peer, since a peer configuration ranges against a single token.
@MainActor
final class FriendRanger: NSObject {
    static var isSupported: Bool {
        NISession.deviceCapabilities.supportsPreciseDistanceMeasurement
    }

    var onDistance: ((_ peer: String, _ metres: Double) -> Void)?

    private var sessions: [String: NISession] = [:]
    private var peerFor: [ObjectIdentifier: String] = [:]
    private var theirTokens: [String: NIDiscoveryToken] = [:]

    /// Our token for this peer, making its session if there is none yet.
    func token(for peer: String) -> Data? {
        guard Self.isSupported else { return nil }
        return session(for: peer).discoveryToken.flatMap {
            try? NSKeyedArchiver.archivedData(withRootObject: $0, requiringSecureCoding: true)
        }
    }

    /// Their token arrived: range against it. Returns our token to send back
    /// when the session is new.
    func accept(_ data: Data, from peer: String) -> Data? {
        guard Self.isSupported,
              let theirs = try? NSKeyedUnarchiver.unarchivedObject(ofClass: NIDiscoveryToken.self,
                                                                   from: data) else { return nil }
        let isNew = sessions[peer] == nil
        let session = session(for: peer)
        if theirTokens[peer] != theirs {
            theirTokens[peer] = theirs
            session.run(NINearbyPeerConfiguration(peerToken: theirs))
        }
        return isNew ? token(for: peer) : nil
    }

    func stopAll() {
        for session in sessions.values { session.invalidate() }
        sessions.removeAll()
        peerFor.removeAll()
        theirTokens.removeAll()
    }

    private func session(for peer: String) -> NISession {
        if let s = sessions[peer] { return s }
        let s = NISession()
        s.delegate = self
        sessions[peer] = s
        peerFor[ObjectIdentifier(s)] = peer
        return s
    }

    fileprivate func fix(_ id: ObjectIdentifier, _ metres: Double) {
        guard let peer = peerFor[id] else { return }
        onDistance?(peer, metres)
    }

    fileprivate func ended(_ id: ObjectIdentifier) {
        guard let peer = peerFor.removeValue(forKey: id) else { return }
        if let s = sessions[peer], ObjectIdentifier(s) == id {
            sessions.removeValue(forKey: peer)
            theirTokens.removeValue(forKey: peer)
        }
    }
}

extension FriendRanger: NISessionDelegate {
    nonisolated func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        let id = ObjectIdentifier(session)
        guard let metres = nearbyObjects.compactMap(\.distance).first else { return }
        let d = Double(metres)
        Task { @MainActor in self.fix(id, d) }
    }

    nonisolated func session(_ session: NISession, didRemove nearbyObjects: [NINearbyObject],
                             reason: NINearbyObject.RemovalReason) {
        guard reason == .peerEnded else { return }
        let id = ObjectIdentifier(session)
        Task { @MainActor in self.ended(id) }
    }

    nonisolated func session(_ session: NISession, didInvalidateWith error: any Error) {
        let id = ObjectIdentifier(session)
        Task { @MainActor in self.ended(id) }
    }

    nonisolated func sessionWasSuspended(_ session: NISession) {}

    nonisolated func sessionSuspensionEnded(_ session: NISession) {
        if let configuration = session.configuration { session.run(configuration) }
    }
}

/// The "hold phones together" screen state. One per Friends sheet.
@MainActor @Observable
final class NearbyFriendModel {

    struct Peer: Identifiable, Equatable {
        let key: String
        let handle: String
        let linked: Bool
        /// Metres, when ultra wideband measured it in the last few seconds.
        let distance: Double?
        var id: String { key }
    }

    /// Claims fire on their own under this, when the radio can measure.
    static let claimDistance = 0.5
    static let claimWindow: TimeInterval = 90

    private(set) var running = false
    private(set) var denied = false
    /// Nobody found after 20 s.
    private(set) var quiet = false
    /// Who we are claiming right now.
    private(set) var claiming: String?
    private(set) var status: String?
    private(set) var success: String?
    private(set) var celebrations = 0
    let usesUWB = FriendRanger.isSupported

    private var advertised: [String: String] = [:]
    private var greeted: [String: String] = [:]
    private var distances: [String: (metres: Double, at: Date)] = [:]
    /// Ticks so "recent" distances expire on screen without a new fix.
    private(set) var tick = Date()

    private var beacon: FriendBeacon?
    private var ranger: FriendRanger?
    private var timers: [Task<Void, Never>] = []
    private var claimTask: Task<Void, Never>?
    private var autoClaimed: Set<String> = []
    private weak var store: RoamStore?
    private weak var friends: FriendsModel?

    var peers: [Peer] {
        let keys = Set(advertised.keys).union(greeted.keys)
        return keys.sorted().map { k in
            Peer(key: k, handle: greeted[k] ?? advertised[k] ?? "Player",
                 linked: greeted[k] != nil, distance: recentDistance(k))
        }
    }

    func recentDistance(_ key: String) -> Double? {
        guard let d = distances[key], tick.timeIntervalSince(d.at) < 3 else { return nil }
        return d.metres
    }

    func start(store: RoamStore, friends: FriendsModel) async {
        guard !running else { return }
        running = true
        self.store = store
        self.friends = friends
        guard let key = try? await store.api.deviceKey() else {
            status = "This phone couldn't prove who it is. Try again later."
            return
        }
        // Dismissed while the key was loading.
        guard running else { return }
        let handle = store.profile?.handle ?? "Player"

        if usesUWB {
            let r = FriendRanger()
            r.onDistance = { [weak self] peer, metres in self?.measured(peer, metres) }
            ranger = r
        }
        let beacon = FriendBeacon(key: key, handle: handle) { @Sendable [weak self] event in
            Task { @MainActor in self?.handle(event) }
        }
        self.beacon = beacon
        await beacon.start()

        timers.append(Task { [weak self] in
            try? await Task.sleep(for: .seconds(20))
            guard !Task.isCancelled, let self else { return }
            self.quiet = true
        })
        timers.append(Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                self?.tick = Date()
            }
        })
    }

    func stop() {
        running = false
        claimTask?.cancel()
        claimTask = nil
        for t in timers { t.cancel() }
        timers.removeAll()
        if let beacon { Task { await beacon.stop() } }
        beacon = nil
        ranger?.stopAll()
        ranger = nil
        advertised.removeAll()
        greeted.removeAll()
        distances.removeAll()
        autoClaimed.removeAll()
        claiming = nil
        quiet = false
        denied = false
        status = nil
    }

    private func handle(_ event: FriendBeacon.Event) {
        guard running else { return }
        switch event {
        case .seen(let map):
            advertised = map
        case .hello(let key, let handle):
            greeted[key] = handle
            if let ranger, let token = ranger.token(for: key), let beacon {
                Task { await beacon.send(token: token, to: key) }
            }
        case .token(let key, let data):
            if let answer = ranger?.accept(data, from: key), let beacon {
                Task { await beacon.send(token: answer, to: key) }
            }
        case .linkLost(let key):
            greeted.removeValue(forKey: key)
        case .denied:
            denied = true
        }
    }

    private func measured(_ peer: String, _ metres: Double) {
        distances[peer] = (metres, Date())
        tick = Date()
        if metres <= Self.claimDistance, claiming == nil, !autoClaimed.contains(peer) {
            autoClaimed.insert(peer)
            claim(peer)
        }
    }

    /// Claim this phone and keep claiming until the other side has too.
    func claim(_ peer: String) {
        guard claiming == nil else { return }
        let name = peers.first { $0.key == peer }?.handle ?? "your friend"
        claiming = peer
        success = nil
        status = "Waiting for \(name)…"
        // The closest the radio has seen at the moment of claiming, if any.
        let distance = recentDistance(peer)
        claimTask = Task { [weak self] in await self?.runClaim(peer, name: name, distance: distance) }
    }

    private func runClaim(_ peer: String, name: String, distance: Double?) async {
        let deadline = Date().addingTimeInterval(Self.claimWindow)
        while !Task.isCancelled, Date() < deadline {
            guard let store else { return }
            if let here = store.coordinate {
                do {
                    let key = try await store.api.deviceKey()
                    let r = try await store.api.roamPost(
                        "v1/roam/social/nearby",
                        body: FriendNearbyBody(device_key: key, peer_key: peer,
                                               lat: here.latitude, lng: here.longitude,
                                               distance_m: distance),
                        as: NearbyFriendResult.self)
                    if Task.isCancelled { return }
                    if r.friends {
                        await celebrate(r.handle ?? name)
                        return
                    }
                    status = "Waiting for \(name) to add you too…"
                } catch let e as GameClient.ClientError where !e.isRetryable {
                    status = e.localizedDescription
                    claiming = nil
                    autoClaimed.remove(peer)
                    return
                } catch {
                    // A dropped request: the window is long, keep trying.
                }
            } else {
                status = "Waiting for your location…"
            }
            try? await Task.sleep(for: .seconds(2.5))
        }
        guard !Task.isCancelled else { return }
        status = "Didn't hear back from \(name). Make sure they tap Add on their phone too."
        claiming = nil
        autoClaimed.remove(peer)
    }

    private func celebrate(_ name: String) async {
        claiming = nil
        status = nil
        success = "You and \(name) are friends"
        celebrations += 1
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        GameSound.shared.play(.fanfare)
        if let store, let friends {
            await friends.refresh(store)
            store.featureChanged()
        }
    }
}

/// The big card at the top of Friends.
struct HoldPhonesCard: View {
    let store: RoamStore
    let friends: FriendsModel
    let nearby: NearbyFriendModel

    var body: some View {
        GamePanel(face: GamePalette.sun.opacity(0.97)) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: "iphone.radiowaves.left.and.right")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(GamePalette.berry)
                        .symbolEffect(.pulse, isActive: nearby.running && nearby.claiming == nil)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Add a friend").font(GameFont.display(24))
                        Text("Open this on both phones and hold them close.")
                            .font(GameFont.body(15, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.8))
                    }
                }
                content
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let s = nearby.success {
            HStack(spacing: 10) {
                Image(systemName: "party.popper.fill").font(.system(size: 26))
                    .foregroundStyle(GamePalette.berry)
                Text(s).font(GameFont.display(22))
            }
            .transition(.scale.combined(with: .opacity))
            .accessibilityElement(children: .combine)
        }
        if nearby.denied {
            VStack(alignment: .leading, spacing: 8) {
                Text("CosQuest needs Local Network access to find the other phone.")
                    .font(GameFont.body(15, weight: .semibold))
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
            }
        } else if store.coordinate == nil {
            HStack(spacing: 8) {
                ProgressView()
                Text("Waiting for your location").font(GameFont.body(15, weight: .semibold))
            }
        } else {
            let peers = nearby.peers
            if peers.isEmpty {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(nearby.quiet ? "Make sure the other phone has this screen open."
                                      : "Looking for phones nearby…")
                        .font(GameFont.body(15, weight: .semibold))
                }
            }
            ForEach(peers) { p in peerRow(p) }
        }
        if let s = nearby.status {
            Text(s).font(GameFont.body(14, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.75))
        }
    }

    private func peerRow(_ p: NearbyFriendModel.Peer) -> some View {
        let isClaiming = nearby.claiming == p.key
        // With a live distance, the radio decides: it claims on its own
        // once the phones are touching. Without one, the player taps.
        let tooFar = p.distance.map { $0 > NearbyFriendModel.claimDistance } ?? false
        return HStack(spacing: 10) {
            Circle().fill(p.linked ? GamePalette.mint : GamePalette.ink.opacity(0.25))
                .frame(width: 12, height: 12)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(p.handle).font(GameFont.body(17, weight: .bold)).lineLimit(1)
                if let d = p.distance {
                    Text(d < 1 ? "\(Int((d * 100).rounded())) cm away" : String(format: "%.1f m away", d))
                        .font(GameFont.body(13, weight: .semibold).monospacedDigit())
                        .foregroundStyle(GamePalette.ink.opacity(0.65))
                        .contentTransition(.numericText())
                }
            }
            Spacer(minLength: 4)
            if isClaiming {
                ProgressView()
            } else {
                Button(tooFar ? "Hold closer" : "Add \(p.handle)") { nearby.claim(p.key) }
                    .buttonStyle(.game(GamePalette.mint, size: .small, fullWidth: false))
                    .disabled(tooFar || nearby.claiming != nil)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
    }
}
