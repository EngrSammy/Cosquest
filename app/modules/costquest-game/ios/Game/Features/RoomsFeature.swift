import SwiftUI
import UIKit

// FEATURE: rooms. The arena battle, anywhere.
//
// A Room is a free, live Events game that a player starts where they stand
// (costquest-backend app/rooms.py). The server lays out the weapons, shrines
// and supply chests around the host; everyone who joins picks up their arena
// weapon in the room, so it is fair. This file is the Battle sheet (start,
// rooms near you, join with a code) and the beacons the map shows for public
// rooms. Entering a room is the Events path, unchanged: the sheet hands the
// game id up, and EntryView opens it with the side preset to the player's
// Roam faction.

// MARK: - Wire

struct RoomCreated: Decodable, Sendable, Equatable {
    let game_id: String
    let code: String
    let ends_at: String?
}

struct NearbyRoom: Decodable, Sendable, Equatable, Identifiable {
    let game_id: String
    let host_handle: String?
    let players: Int?
    let ends_at: String?
    let distance_m: Double?
    let lat: Double
    let lng: Double
    var code: String?
    var host_faction: String?

    var id: String { game_id }
}

/// `GET v1/rooms/nearby` answers with a bare list; take a wrapped one too.
private struct NearbyRooms: Decodable, Sendable {
    let rooms: [NearbyRoom]
    init(from decoder: Decoder) throws {
        if let list = try? [NearbyRoom](from: decoder) {
            rooms = list
        } else {
            struct Wrapped: Decodable { let rooms: [NearbyRoom] }
            rooms = try Wrapped(from: decoder).rooms
        }
    }
}

private struct RoomBody: Encodable, Sendable {
    let device_key: String
    let lat: Double
    let lng: Double
    let accuracy_m: Double
    let minutes: Int
    let `private`: Bool
}

private struct RoomCodeBody: Encodable, Sendable {
    let device_key: String
    let code: String
}

private struct RoomFound: Decodable, Sendable { let game_id: String }

// MARK: - State

/// Rooms near the player, for the sheet and the map's beacons. One for the
/// home screen, refreshed as the player walks.
@MainActor @Observable
final class RoomsModel {
    private(set) var nearby: [NearbyRoom] = []
    private(set) var loaded = false
    /// The room this player is hosting, once started.
    private(set) var hosting: RoomCreated?
    var problem: String?
    var busy = false

    func refresh(_ store: RoamStore) async {
        // Opened before the first fix: wait a little for one rather than
        // saying "looking" for ever.
        for _ in 0..<20 where store.coordinate == nil {
            try? await Task.sleep(for: .milliseconds(500))
        }
        guard let here = store.coordinate else { return }
        do {
            let r = try await store.api.roamGet("v1/rooms/nearby", query: [
                URLQueryItem(name: "lat", value: String(here.latitude)),
                URLQueryItem(name: "lng", value: String(here.longitude)),
            ], as: NearbyRooms.self)
            nearby = r.rooms.filter { !Self.ended($0.ends_at) }
                .sorted { ($0.distance_m ?? 0) < ($1.distance_m ?? 0) }
        } catch {
            // Beacons are a nicety; a failed fetch keeps the last ones.
        }
        loaded = true
    }

    func start(_ store: RoamStore, minutes: Int, isPrivate: Bool) async -> RoomCreated? {
        problem = nil
        busy = true
        defer { busy = false }
        do {
            guard let here = store.coordinate else { throw RoamError.noLocation }
            let key = try await store.api.deviceKey()
            let r = try await store.api.roamPost("v1/rooms", body: RoomBody(
                device_key: key, lat: here.latitude, lng: here.longitude,
                accuracy_m: max(0, store.accuracy), minutes: minutes, private: isPrivate),
                as: RoomCreated.self)
            hosting = r
            GameSound.shared.play(.fanfare)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            Task { await refresh(store) }
            return r
        } catch {
            problem = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return nil
        }
    }

    func find(code: String, store: RoamStore) async -> String? {
        problem = nil
        busy = true
        defer { busy = false }
        do {
            let key = try await store.api.deviceKey()
            let r = try await store.api.roamPost("v1/rooms/code",
                                                 body: RoomCodeBody(device_key: key, code: code),
                                                 as: RoomFound.self)
            return r.game_id
        } catch GameClient.ClientError.http(let status, _) where status == 404 {
            problem = "No live room has that code."
        } catch {
            problem = error.localizedDescription
        }
        UINotificationFeedbackGenerator().notificationOccurred(.error)
        return nil
    }

    static func ended(_ iso: String?) -> Bool {
        guard let iso, let d = RoamDates.parse(iso) else { return false }
        return d < Date()
    }

    static func timeLeft(_ iso: String?, now: Date = Date()) -> String {
        guard let iso, let d = RoamDates.parse(iso) else { return "Live" }
        let s = Int(d.timeIntervalSince(now))
        if s <= 0 { return "Ending" }
        if s < 60 { return "\(s) s left" }
        return "\(Int((Double(s) / 60).rounded(.up))) min left"
    }
}

// MARK: - The map's beacons

enum RoomBeacons {
    static let prefix = "room:"

    static func id(_ room: NearbyRoom) -> String { prefix + room.game_id }

    static func gameID(fromObject id: String) -> String? {
        id.hasPrefix(prefix) ? String(id.dropFirst(prefix.count)) : nil
    }

    static let tint = UIColor(GamePalette.berry)
}

// MARK: - Rail button

struct BattleButton: View {
    let rooms: RoomsModel
    var onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) { Image(systemName: "figure.fencing") }
            .buttonStyle(.gameIcon(GamePalette.berry, diameter: 50))
            .overlay(alignment: .topTrailing) {
                if !rooms.nearby.isEmpty {
                    Text("\(rooms.nearby.count)")
                        .font(GameFont.display(13).monospacedDigit())
                        .foregroundStyle(GamePalette.ink)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(Circle().fill(GamePalette.sun)
                            .overlay(Circle().strokeBorder(.white, lineWidth: 2)))
                        .offset(x: 4, y: -4)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityLabel("Battle")
            .accessibilityValue(rooms.nearby.isEmpty ? "" : "\(rooms.nearby.count) rooms near you")
    }
}

// MARK: - The Battle sheet

struct BattleSheet: View {
    let store: RoamStore
    let rooms: RoomsModel
    /// A room chosen elsewhere (a beacon tapped on the map).
    var focusGameID: String? = nil
    /// Into the Events flow for this game.
    var onEnter: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var minutes = 10
    @State private var isPrivate = false
    @State private var code = ""
    @State private var created: RoomCreated?
    @FocusState private var codeFocused: Bool

    private var factionColor: Color { RoamStyle.realmColor(store.me?.faction) }

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SheetHeader(title: "Battle") { dismiss() }
                    if let created { hosting(created) } else { startPanel }
                    nearbyPanel
                    codePanel
                    if let p = rooms.problem {
                        Label(p, systemImage: "exclamationmark.triangle.fill")
                            .font(GameFont.body(15, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .background(Capsule().fill(GamePalette.berry))
                    }
                }
                .padding(18)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .gameType()
        .presentationDragIndicator(.visible)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: created)
        .task { await rooms.refresh(store) }
        .onAppear {
            // Back in the sheet after starting one: the code is still here.
            if created == nil, let h = rooms.hosting, !RoomsModel.ended(h.ends_at) { created = h }
        }
        .task {
            #if DEBUG
            switch UserDefaults.standard.string(forKey: "roamRoom") {
            case "start":
                try? await Task.sleep(for: .seconds(1))
                created = await rooms.start(store, minutes: minutes, isPrivate: true)
            case "join":
                for _ in 0..<30 where rooms.nearby.isEmpty { try? await Task.sleep(for: .milliseconds(500)) }
                try? await Task.sleep(for: .seconds(1))
                if let r = rooms.nearby.first { enter(r.game_id) }
            default: break
            }
            #endif
        }
    }

    // MARK: Start

    private var startPanel: some View {
        GamePanel {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: "figure.fencing")
                        .font(.system(size: 24, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(GamePalette.berry)
                            .overlay(Circle().strokeBorder(.white, lineWidth: 3)))
                        .shadow(color: GamePalette.edge(of: GamePalette.berry), radius: 0, y: 3)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Start a Room here").font(GameFont.display(23))
                        Text("Weapons and shrines drop around you. Anyone near can join.")
                            .font(GameFont.body(14, weight: .medium))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                HStack(spacing: 12) {
                    Text("Length").font(GameFont.body(16, weight: .bold))
                    Spacer()
                    stepButton("minus", enabled: minutes > 5) { minutes = max(5, minutes - 5) }
                    Text("\(minutes) min")
                        .font(GameFont.display(24).monospacedDigit())
                        .frame(width: 92)
                        .contentTransition(.numericText())
                    stepButton("plus", enabled: minutes < 20) { minutes = min(20, minutes + 5) }
                }
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { isPrivate.toggle() }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: isPrivate ? "lock.fill" : "lock.open.fill")
                            .font(.system(size: 17, weight: .heavy))
                            .foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(isPrivate ? GamePalette.navy : GamePalette.mint))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Private room")
                                .font(GameFont.body(16, weight: .bold))
                            Text(isPrivate ? "Only people with the code can join."
                                           : "Shows on the map for players nearby.")
                                .font(GameFont.body(13, weight: .medium))
                                .foregroundStyle(GamePalette.ink.opacity(0.65))
                        }
                        Spacer()
                        Capsule()
                            .fill(isPrivate ? GamePalette.navy : GamePalette.ink.opacity(0.18))
                            .frame(width: 50, height: 30)
                            .overlay(alignment: isPrivate ? .trailing : .leading) {
                                Circle().fill(.white).padding(3)
                                    .shadow(color: .black.opacity(0.2), radius: 1, y: 1)
                            }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isPrivate ? "Private room, on" : "Private room, off")
                Button {
                    Task { created = await rooms.start(store, minutes: minutes, isPrivate: isPrivate) }
                } label: {
                    if rooms.busy { ProgressView().tint(.white) } else {
                        Label("Start the Room", systemImage: "bolt.fill")
                    }
                }
                .buttonStyle(.game(GamePalette.berry))
                .disabled(rooms.busy || store.coordinate == nil)
            }
        }
    }

    private func stepButton(_ symbol: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button { withAnimation(.snappy) { action() } } label: { Image(systemName: symbol) }
            .buttonStyle(.gameIcon(enabled ? GamePalette.skyDeep : Color(white: 0.7), diameter: 38))
            .disabled(!enabled)
            .accessibilityLabel(symbol == "plus" ? "Longer" : "Shorter")
    }

    /// The room is up: the code, big enough to read across a table.
    private func hosting(_ r: RoomCreated) -> some View {
        GamePanel {
            VStack(spacing: 14) {
                HStack {
                    GameChip(text: "Live", color: GamePalette.berry)
                    Spacer()
                    TimelineView(.periodic(from: .now, by: 1)) { t in
                        Text(RoomsModel.timeLeft(r.ends_at, now: t.date))
                            .font(GameFont.body(15, weight: .bold).monospacedDigit())
                            .foregroundStyle(GamePalette.ink.opacity(0.65))
                    }
                }
                Text("Your Room is open").font(GameFont.display(24))
                VStack(spacing: 6) {
                    Text("ROOM CODE").font(GameFont.display(13)).tracking(1.6)
                        .foregroundStyle(GamePalette.ink.opacity(0.55))
                    HStack(spacing: 6) {
                        ForEach(Array(r.code.enumerated()), id: \.offset) { _, ch in
                            Text(String(ch))
                                .font(GameFont.display(40))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 58)
                                .background {
                                    ZStack {
                                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                                            .fill(GamePalette.edge(of: factionColor)).offset(y: 4)
                                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                                            .fill(factionColor)
                                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                                                .strokeBorder(.white.opacity(0.5), lineWidth: 2))
                                    }
                                }
                                .shadow(color: .black.opacity(0.25), radius: 0, y: 2)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Room code \(r.code.map(String.init).joined(separator: " "))")
                }
                ShareLink(item: "Join my CosQuest Room with code \(r.code)") {
                    Label("Share the code", systemImage: "square.and.arrow.up")
                        .font(GameFont.body(15, weight: .bold))
                }
                .tint(GamePalette.skyDeep)
                Button {
                    enter(r.game_id)
                } label: { Label("Enter the battle", systemImage: "arkit") }
                .buttonStyle(.game(GamePalette.mint))
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: Nearby

    private var nearbyPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                GameHeading("Rooms near you", size: 24)
                Spacer()
                Button { Task { await rooms.refresh(store) } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.gameIcon(GamePalette.skyDeep, diameter: 36))
                    .accessibilityLabel("Refresh")
            }
            let list = rooms.nearby.filter { $0.game_id != created?.game_id }
            if list.isEmpty {
                GamePanel(padding: 14) {
                    HStack(spacing: 12) {
                        Image(systemName: "dot.radiowaves.left.and.right")
                            .font(.system(size: 22, weight: .heavy))
                            .foregroundStyle(GamePalette.ink.opacity(0.35))
                        Text(rooms.loaded ? "No rooms open nearby. Start one and they'll come to you."
                                          : "Looking for rooms…")
                            .font(GameFont.body(15, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.7))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                ForEach(list) { room in
                    Button { enter(room.game_id) } label: { roomRow(room) }
                        .buttonStyle(CardPress())
                }
            }
        }
    }

    private func roomRow(_ room: NearbyRoom) -> some View {
        let focused = room.game_id == focusGameID
        return HStack(spacing: 12) {
            ZStack {
                Circle().fill(GamePalette.berry)
                Circle().strokeBorder(.white, lineWidth: 3)
                Image(systemName: "figure.fencing")
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(.white)
            }
            .frame(width: 48, height: 48)
            .shadow(color: GamePalette.edge(of: GamePalette.berry), radius: 0, y: 3)
            VStack(alignment: .leading, spacing: 4) {
                Text("\(room.host_handle ?? "Someone")'s Room")
                    .font(GameFont.display(19))
                    .lineLimit(1)
                HStack(spacing: 10) {
                    Label(RoamStyle.distance(room.distance_m), systemImage: "location.fill")
                    Label("\(room.players ?? 0)", systemImage: "person.2.fill")
                    TimelineView(.periodic(from: .now, by: 15)) { t in
                        Label(RoomsModel.timeLeft(room.ends_at, now: t.date), systemImage: "timer")
                    }
                }
                .font(GameFont.body(13, weight: .bold))
                .foregroundStyle(GamePalette.ink.opacity(0.65))
                .labelStyle(.titleAndIcon)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 4)
            Text("JOIN")
                .font(GameFont.display(16))
                .foregroundStyle(.white)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Capsule().fill(GamePalette.mint)
                    .shadow(color: GamePalette.edge(of: GamePalette.mint), radius: 0, y: 3))
        }
        .foregroundStyle(GamePalette.ink)
        .padding(12)
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(GamePalette.edge(of: GamePalette.cream)).offset(y: 5)
                RoundedRectangle(cornerRadius: 20, style: .continuous).fill(GamePalette.cream)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(focused ? GamePalette.sun : .white.opacity(0.6), lineWidth: focused ? 3 : 2))
        .padding(.bottom, 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(room.host_handle ?? "Someone")'s Room, \(RoamStyle.distance(room.distance_m)) away, \(room.players ?? 0) players, \(RoomsModel.timeLeft(room.ends_at))")
        .accessibilityHint("Joins the room")
    }

    // MARK: Code

    private var codePanel: some View {
        GamePanel {
            VStack(alignment: .leading, spacing: 12) {
                Text("Join with a code").font(GameFont.display(22))
                HStack(spacing: 10) {
                    TextField("ABC234", text: $code)
                        .font(GameFont.display(26).monospaced())
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .keyboardType(.asciiCapable)
                        .focused($codeFocused)
                        .submitLabel(.join)
                        .onSubmit(join)
                        .onChange(of: code) { _, v in
                            let clean = String(v.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(6))
                            if clean != v { code = clean }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(.white)
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(GamePalette.ink.opacity(0.2), lineWidth: 2)))
                    Button("Join", action: join)
                        .buttonStyle(.game(GamePalette.skyDeep, size: .medium, fullWidth: false))
                        .disabled(code.count != 6 || rooms.busy)
                }
            }
        }
    }

    private func join() {
        guard code.count == 6 else { return }
        codeFocused = false
        Task {
            if let id = await rooms.find(code: code, store: store) { enter(id) }
        }
    }

    private func enter(_ gameID: String) {
        dismiss()
        onEnter(gameID)
    }
}
