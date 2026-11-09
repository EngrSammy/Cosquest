import CoreMotion
import SwiftUI
import UIKit

// FEATURE: steps. Walking rewards from the pedometer, sealed shrines.
//
// This file is the whole iOS side of the feature. The views below are
// already placed in the app (RoamHomeView, PointCard, DailiesSheet...), so
// the feature only fills them in here. Keep every name and signature that is
// used elsewhere; add anything else you need in THIS file (more types, views,
// calls via `store.api.roamGet/roamPost`). Stay stateless where you can and
// hold state in an @Observable you create here.

/// A card in the Daily quests sheet: this week's distance and its rewards.
struct StepsCard: View {
    let store: RoamStore
    @State private var model = StepsModel()

    var body: some View {
        GamePanel {
            VStack(alignment: .leading, spacing: 12) {
                header
                if let s = model.status {
                    progress(s)
                    milestones(s)
                } else if model.busy {
                    HStack { Spacer(); ProgressView(); Spacer() }.padding(.vertical, 8)
                }
                if !model.newly.isEmpty { paid }
                if let note = model.note {
                    Text(note)
                        .font(GameFont.body(14, weight: .semibold))
                        .foregroundStyle(model.noteIsProblem ? GamePalette.berry
                                                             : GamePalette.ink.opacity(0.7))
                        .fixedSize(horizontal: false, vertical: true)
                }
                if model.motionDenied {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.game(GamePalette.skyDeep, size: .small, fullWidth: false))
                }
                Button {
                    Task { await model.update(store: store) }
                } label: {
                    Label(model.busy ? "Counting..." : "Update from your phone",
                          systemImage: "figure.walk")
                }
                .buttonStyle(.game(GamePalette.mint, size: .medium))
                .disabled(model.busy)
            }
        }
        // Once per appearance: opening the sheet is when a player wants to
        // see this week's walk, and the report is cheap and idempotent.
        .task { await model.update(store: store) }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "shoeprints.fill")
                .font(.system(size: 28, weight: .heavy))
                .foregroundStyle(GamePalette.grass)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("This week: \(StepsModel.km(model.status?.meters ?? 0)) km walked")
                    .font(GameFont.display(20))
                    .fixedSize(horizontal: false, vertical: true)
                Text("Walk to earn XP and items. Resets Monday.")
                    .font(GameFont.body(13, weight: .medium))
                    .foregroundStyle(GamePalette.ink.opacity(0.65))
            }
        }
    }

    private func progress(_ s: StepsStatus) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let next = s.next_milestone_km {
                let from = s.milestones.map(\.km).filter { $0 < next }.max() ?? 0
                let span = Double(max(1, next - from) * 1000)
                XPBar(progress: (Double(s.meters) - Double(from * 1000)) / span)
                Text("\(StepsModel.km(max(0, next * 1000 - s.meters))) km to \(next) km")
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(GamePalette.ink.opacity(0.7))
            } else {
                XPBar(progress: 1)
                Text("Every milestone done this week!")
                    .font(GameFont.body(13, weight: .semibold))
                    .foregroundStyle(GamePalette.mint)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func milestones(_ s: StepsStatus) -> some View {
        HStack(spacing: 8) {
            ForEach(s.milestones, id: \.km) { m in
                MilestoneTile(milestone: m,
                              state: s.claimed.contains(m.km) ? .done
                                   : m.km == s.next_milestone_km ? .next : .locked)
            }
        }
    }

    private var paid: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(model.newly, id: \.km) { n in
                HStack(spacing: 8) {
                    Image(systemName: "figure.walk").font(.system(size: 18, weight: .heavy))
                        .foregroundStyle(GamePalette.mint).accessibilityHidden(true)
                    Text("\(n.km) km reached! \(StepsModel.describe(n.rewards))")
                        .font(GameFont.body(14, weight: .bold))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(GamePalette.sun.opacity(0.25)))
    }
}

/// One of the three weekly milestones: done, the one being walked towards, or later.
private struct MilestoneTile: View {
    enum State { case done, next, locked }
    let milestone: StepsStatus.Milestone
    let state: State

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: state == .done ? "checkmark.seal.fill"
                            : state == .next ? "flag.fill" : "lock.fill")
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(color)
            Text("\(milestone.km) km").font(GameFont.display(18))
            Text(StepsModel.describe(coins: milestone.coins, xp: milestone.xp,
                                     items: milestone.items, short: true))
                .font(GameFont.body(11, weight: .semibold))
                .foregroundStyle(GamePalette.ink.opacity(0.7))
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
            GameChip(text: state == .done ? "Done" : state == .next ? "Next" : "Locked",
                     color: color)
                .scaleEffect(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(color.opacity(state == .locked ? 0.08 : 0.16)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(milestone.km) kilometres, "
            + (state == .done ? "done" : state == .next ? "next" : "locked") + ". "
            + StepsModel.describe(coins: milestone.coins, xp: milestone.xp,
                                  items: milestone.items, short: false))
    }

    private var color: Color {
        switch state {
        case .done: GamePalette.mint
        case .next: GamePalette.sunDeep
        case .locked: Color(white: 0.55)
        }
    }
}

// MARK: - Wire

struct StepsStatus: Decodable, Sendable {
    struct Milestone: Decodable, Sendable {
        let km: Int
        let coins: Int
        let xp: Int
        let items: [String: Int]
    }
    struct Paid: Decodable, Sendable {
        struct Rewards: Decodable, Sendable {
            let xp: Int
            let coins: Int
            let items: [String: Int]
        }
        let km: Int
        let rewards: Rewards
    }
    let week_start: String
    let meters: Int
    let next_milestone_km: Int?
    let claimed: [Int]
    let milestones: [Milestone]
    /// Only on a report: the milestones this report paid.
    let newly: [Paid]?
}

private struct StepsReportBody: Encodable, Sendable {
    let device_key: String
    let week_start: String
    let meters: Int
}

// MARK: - Model

@MainActor
@Observable
final class StepsModel {
    private(set) var status: StepsStatus?
    private(set) var newly: [StepsStatus.Paid] = []
    private(set) var busy = false
    private(set) var note: String?
    private(set) var noteIsProblem = false
    private(set) var motionDenied = false

    private let pedometer = CMPedometer()

    /// Read the pedometer, tell the server, show what it paid. When the phone
    /// cannot count (no sensor, no permission) the card still shows the
    /// server's figure, so a denied permission is a note, not a dead card.
    func update(store: RoamStore) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        note = nil
        noteIsProblem = false
        motionDenied = false
        let monday = Self.utcMonday(Date())
        do {
            let key = try await store.api.deviceKey()
            guard let meters = await readPedometer(since: monday) else {
                status = try await store.api.roamGet(
                    "v1/roam/steps", query: [URLQueryItem(name: "device_key", value: key)],
                    as: StepsStatus.self)
                return
            }
            let got = try await store.api.roamPost(
                "v1/roam/steps/report",
                body: StepsReportBody(device_key: key, week_start: Self.isoDay(monday),
                                      meters: meters),
                as: StepsStatus.self)
            status = got
            let fresh = got.newly ?? []
            if !fresh.isEmpty {
                newly = fresh
                GameSound.shared.play(.fanfare)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                // Coins, XP and the item bag all moved; let the rest of the app see it.
                store.featureChanged()
            }
        } catch {
            note = error.localizedDescription
            noteIsProblem = true
        }
    }

    /// Metres walked since `start`, or nil (with a note set) when the phone
    /// can't or won't say.
    private func readPedometer(since start: Date) async -> Int? {
        guard CMPedometer.isDistanceAvailable() else {
            note = "This phone can't count walking distance."
            return nil
        }
        switch CMPedometer.authorizationStatus() {
        case .denied, .restricted:
            deny()
            return nil
        default:
            break
        }
        let pedometer = self.pedometer
        let result: Result<Double, Error> = await withCheckedContinuation { cont in
            // @Sendable: CoreMotion calls this on its own queue. Without it the
            // closure inherits main-actor isolation and traps (SIGTRAP) the
            // moment the pedometer answers. This crashed on the phone.
            pedometer.queryPedometerData(from: start, to: Date()) { @Sendable data, error in
                // Pull the number out here: CMPedometerData isn't Sendable.
                if let error {
                    cont.resume(returning: .failure(error))
                } else {
                    cont.resume(returning: .success(data?.distance?.doubleValue ?? 0))
                }
            }
        }
        switch result {
        case .success(let m):
            return max(0, Int(m.rounded()))
        case .failure(let error as NSError):
            if error.domain == CMErrorDomain,
               error.code == Int(CMErrorMotionActivityNotAuthorized.rawValue) {
                deny()
            } else {
                note = "Couldn't read your steps just now."
                noteIsProblem = true
            }
            return nil
        }
    }

    private func deny() {
        note = "Allow Motion & Fitness in Settings to count your walks."
        noteIsProblem = true
        motionDenied = true
    }

    // MARK: Formatting

    static func km(_ meters: Int) -> String {
        (Double(meters) / 1000).formatted(.number.precision(.fractionLength(1)))
    }

    static let itemNames = ["fifty": "50/50", "time": "Extra time", "retry": "Second chance"]

    static func describe(_ r: StepsStatus.Paid.Rewards) -> String {
        describe(coins: r.coins, xp: r.xp, items: r.items, short: false)
    }

    static func describe(coins: Int, xp: Int, items: [String: Int], short: Bool) -> String {
        var parts: [String] = []
        // CosCoins are bought, not earned: a milestone never shows coins.
        if xp > 0 { parts.append("+\(xp) XP") }
        for (item, n) in items.sorted(by: { $0.key < $1.key }) where n > 0 {
            let name = itemNames[item] ?? item
            parts.append(short ? "\(n) \(name)" : "\(n) × \(name)")
        }
        return parts.joined(separator: short ? "\n" : ", ")
    }

    // MARK: Dates

    /// Monday 00:00 UTC of this week: the server's week, whatever the phone's
    /// time zone, so the pedometer and the server count the same stretch.
    static func utcMonday(_ now: Date) -> Date {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        let day = utc.startOfDay(for: now)
        // Gregorian weekday: Sunday = 1, Monday = 2.
        let back = (utc.component(.weekday, from: day) + 5) % 7
        return utc.date(byAdding: .day, value: -back, to: day) ?? day
    }

    static func isoDay(_ date: Date) -> String {
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = .gmt
        let c = utc.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }
}
