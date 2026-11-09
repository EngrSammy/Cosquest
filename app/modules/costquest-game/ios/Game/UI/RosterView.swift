import SwiftUI

/// Who else is in this game.
///
/// The first genuinely social surface in the app, and it took a server change
/// to make possible: the scoreboard used to report tokens, state and faction
/// against a player UUID and nothing a human could read. You could see that
/// eleven people were playing and not one thing about any of them.
///
/// Grouped by faction rather than ranked flat, because the thing a player wants
/// to know first is who is with them and who is against them. Ranking inside a
/// side is secondary and ranking across sides is what the score bar already
/// shows.
struct RosterView: View {
    let session: GameSession
    let terms: GameTerms
    @Environment(\.dismiss) private var dismiss

    /// One row, already resolved to something displayable.
    private struct Entry: Identifiable {
        let id: String
        let name: String
        let tokens: Int
        let state: String
        let faction: String?
        let isYou: Bool
        /// True when the player never set a name, so the row can say so quietly
        /// rather than showing a UUID or inventing one.
        let unnamed: Bool
    }

    private var entries: [Entry] {
        session.players.map { id, p in
            Entry(id: id,
                  name: session.handle(of: id) ?? "Player",
                  tokens: p.tokens,
                  state: p.state,
                  faction: p.faction,
                  isYou: id == session.playerID,
                  unnamed: session.handle(of: id) == nil)
        }
        .sorted { ($0.tokens, $0.name) > ($1.tokens, $1.name) }
    }

    /// Factions in the order the game defines them, plus a bucket for anyone
    /// playing for themselves. Free-for-all games have no factions at all, and
    /// a screen that rendered nothing for them would be worse than a flat list.
    private var sections: [(String?, [Entry])] {
        let all = entries
        if terms.factions.isEmpty {
            return [(nil, all)]
        }
        var out: [(String?, [Entry])] = terms.factions.map { f in
            (f.name, all.filter { $0.faction == f.name })
        }
        let loose = all.filter { $0.faction == nil }
        if !loose.isEmpty { out.append((nil, loose)) }
        return out.filter { !$0.1.isEmpty }
    }

    var body: some View {
        NavigationStack {
            List {
                if entries.isEmpty {
                    Section {
                        Text("Nobody has joined yet.")
                            .font(GameFont.body(15)).foregroundStyle(.secondary)
                    }
                }
                ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                    Section {
                        ForEach(section.1) { e in row(e) }
                    } header: {
                        HStack {
                            if let name = section.0 {
                                Circle()
                                    .fill(Theme.faction(terms.factions
                                        .first { $0.name == name }?.color))
                                    .frame(width: 8, height: 8)
                                Text(name)
                            } else {
                                Text("Playing alone")
                            }
                            Spacer()
                            Text("\(section.1.reduce(0) { $0 + $1.tokens }) tokens")
                                .font(GameFont.body(13)).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Who's playing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder private func row(_ e: Entry) -> some View {
        HStack(spacing: 10) {
            // State before name: "is that one still standing" is the question
            // a player is asking when they open this mid-game.
            Circle()
                .fill(colour(for: e.state))
                .frame(width: 7, height: 7)

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(e.name)
                        .font(GameFont.body(17, weight: e.isYou ? .semibold : .medium))
                        .foregroundStyle(e.unnamed ? .secondary : .primary)
                    if e.isYou {
                        Text("you").font(GameFont.display(12))
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Theme.raised, in: .capsule)
                    }
                }
                if e.state != "active" {
                    // Eliminated players are out until they come back; the
                    // server's word for that ("respawning") is plumbing.
                    Text(e.state == "downed" ? "Down" : "Out")
                        .font(GameFont.display(12))
                        .foregroundStyle(colour(for: e.state))
                }
            }
            Spacer()
            Text("\(e.tokens)")
                .font(GameFont.display(20).monospacedDigit())
        }
        .padding(.vertical, 2)
    }

    private func colour(for state: String) -> Color {
        switch state {
        case "downed": return Theme.refusal
        case "respawning": return .orange
        default: return Theme.affirm
        }
    }
}
