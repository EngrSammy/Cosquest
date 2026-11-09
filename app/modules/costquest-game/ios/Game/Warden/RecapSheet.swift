import SwiftUI

/// Your day, told by the Warden, on a card worth posting.
///
/// The numbers are the server's (`/v1/roam/me` → `today`); the story is the
/// on-device model's, written from them and checked against them. The card is
/// rendered to an image on the phone, so sharing needs no server either.
struct RecapSheet: View {
    let store: RoamStore
    let voice: WardenVoice
    @Environment(\.dismiss) private var dismiss

    @State private var story: WardenVoice.Said?
    @State private var image: Image?

    private var tint: Color { RoamStyle.realmColor(store.me?.faction) }

    var body: some View {
        ZStack {
            GameBackdrop()
            ScrollView {
                VStack(spacing: 18) {
                    SheetHeader(title: "Your day") { dismiss() }
                    if let t = store.me?.today, t.points_played > 0 {
                        card(t).padding(.top, 4)
                        if let image {
                            ShareLink(item: image,
                                      preview: SharePreview("My CostQuest day", image: image)) {
                                Label("Share your day", systemImage: "square.and.arrow.up")
                            }
                            .buttonStyle(.game(GamePalette.sun))
                        }
                    } else {
                        GamePanel {
                            HStack(spacing: 14) {
                                WardenBadge(tint: tint, size: 56)
                                Text("Nothing to tell yet. Play a Quest Point and I'll have a story for you.")
                                    .font(GameFont.body(17, weight: .semibold))
                            }
                        }
                    }
                }
                .padding(18)
            }
        }
        .gameType()
        .presentationDragIndicator(.visible)
        .task { await write() }
    }

    private func card(_ t: RoamMe.Today) -> some View {
        RecapCard(name: store.playerName, faction: store.me?.faction_name,
                  tint: tint, today: t, level: store.me?.standing.level ?? 1,
                  rank: store.me?.standing.rank ?? "Rookie", story: story,
                  level_: voice.speaker.level)
    }

    private func write() async {
        await store.refreshMe()
        guard let m = store.recapMoment() else { return }
        let s = await voice.line(for: m, wait: .seconds(14))
        withAnimation(.smooth(duration: 0.4)) { story = s }
        voice.say(s, style: m.style)
        // The image is rendered once the story is in, so the shared card is
        // the one on screen.
        if let t = store.me?.today {
            let renderer = ImageRenderer(content:
                RecapCard(name: store.playerName, faction: store.me?.faction_name, tint: tint,
                          today: t, level: store.me?.standing.level ?? 1,
                          rank: store.me?.standing.rank ?? "Rookie", story: s, level_: 0)
                    .frame(width: 360)
                    .padding(16)
                    .background(GamePalette.skyDeep))
            renderer.scale = 3
            if let ui = renderer.uiImage { image = Image(uiImage: ui) }
        }
    }
}

struct RecapCard: View {
    let name: String
    let faction: String?
    let tint: Color
    let today: RoamMe.Today
    let level: Int
    let rank: String
    let story: WardenVoice.Said?
    var level_: Double = 0

    var body: some View {
        GamePanel(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(GameFont.display(28))
                        Text("Level \(level) \(rank)\(faction.map { " · \($0)" } ?? "")")
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(GamePalette.ink.opacity(0.6))
                    }
                    Spacer()
                    GameChip(text: "CostQuest", color: tint)
                }
                HStack(spacing: 10) {
                    tile("\(today.points_played)", "points")
                    tile("\(today.correct)", "right")
                    tile("\(today.xp)", "XP")
                }
                HStack(alignment: .top, spacing: 12) {
                    WardenBadge(tint: tint, size: 48, level: level_)
                    if let story {
                        Text(story.text)
                            .font(GameFont.body(16, weight: .semibold))
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("The Warden is writing your day…")
                                .font(GameFont.body(15, weight: .medium))
                                .foregroundStyle(GamePalette.ink.opacity(0.6))
                        }
                    }
                }
                if let best = today.best_place {
                    Label("Best stop: \(best)", systemImage: "star.fill")
                        .font(GameFont.body(14, weight: .semibold))
                        .foregroundStyle(GamePalette.sunDeep)
                }
            }
        }
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(spacing: 0) {
            Text(value).font(GameFont.display(26)).lineLimit(1).minimumScaleFactor(0.6)
            Text(label.uppercased()).font(GameFont.display(11)).opacity(0.55)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14).fill(tint.opacity(0.14)))
    }
}
