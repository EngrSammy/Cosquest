import SwiftUI

/// The official rules, presented in the app.
///
/// This screen is a shipping requirement, not a courtesy. App Store Review
/// Guideline 5.3.2 requires that a contest or sweepstakes run through an app
/// present its official rules in the app, and that those rules state plainly
/// that Apple is not a sponsor and is not involved in any way. An app that
/// takes entry money and pays cash prizes without this screen is rejected, and
/// the rejection arrives after the venue has been booked.
///
/// The numbers are read from the server's terms for this specific game rather
/// than written into the app, because rules that are accurate for one event and
/// stale for the next are worse than no rules at all. The one thing hard-coded
/// here is the Apple disclaimer, because it is the same sentence for every
/// game and it is the sentence review looks for.
struct RulesView: View {
    let terms: GameTerms
    @Environment(\.dismiss) private var dismiss

    private var sponsor: String {
        terms.sponsor ?? "DJMC Events"
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            GameBackdrop()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header

                    section("Who runs this contest", icon: "building.2.fill", color: GamePalette.skyDeep) {
                        Text("""
                        \(sponsor) is the sponsor of this contest and is solely \
                        responsible for it: for running the game, for judging it, \
                        and for paying the prizes.
                        """)
                        // The sentence guideline 5.3.2 exists for. Kept whole
                        // and kept prominent rather than folded into a
                        // paragraph of small print.
                        Text("Apple is not a sponsor of this contest and is not involved in it in any way.")
                            .fontWeight(.semibold)
                            .foregroundStyle(GamePalette.ink)
                    }

                    section("How to enter", icon: "ticket.fill", color: GamePalette.mint) {
                        if terms.isFree {
                            Text("Entry is free. Join the game at the venue, choose a side, and play.")
                        } else {
                            Text("""
                            Entry is \(terms.entryFee), paid by card. Payment is taken \
                            outside the App Store and Apple takes no part in it.
                            """)
                        }
                        Text("""
                        You must be physically at the venue to score. The game checks \
                        your position and refuses anything reported from outside it.
                        """)
                    }

                    section("How the game is scored", icon: "star.fill", color: GamePalette.sunDeep) {
                        Text("""
                        You earn tokens by taking them from players on other sides, by \
                        capturing points on the field, and by answering questions at \
                        the marked stops.
                        """)
                        Text("""
                        Every action is judged by the game server, not by your phone. \
                        The server keeps a complete record of the game and can replay \
                        it to the same result, which is how a disputed score is settled.
                        """)
                    }

                    section("Prizes", icon: "trophy.fill", color: GamePalette.sun) {
                        Text(terms.prize_pool_note)
                        if !terms.isFree {
                            Text("The top \(terms.winner_split_bps.count) players by tokens receive \(terms.splitDescription) of that pool.")
                        }
                        Text("""
                        Prizes are paid to the payout details you give when you join. \
                        A prize you have not set up a destination for is held for you \
                        rather than forfeited.
                        """)
                    }

                    section("Fair play", icon: "shield.fill", color: GamePalette.berry) {
                        Text("""
                        Reported positions, ranges and answers are checked against the \
                        server's own record. Anything impossible is refused at the time \
                        and tells you why.
                        """)
                        Text("""
                        \(sponsor) may remove a player who interferes with the game or \
                        with other players, and may void a score obtained by doing so.
                        """)
                    }

                    section("Where this contest is open", icon: "mappin.and.ellipse", color: GamePalette.grass) {
                        Text("""
                        This contest is open only where \(sponsor) is permitted to run \
                        it. It is void where prohibited. \(sponsor) is responsible for \
                        holding any licence or permission the venue's jurisdiction \
                        requires.
                        """)
                    }

                    section("Questions", icon: "questionmark.bubble.fill", color: GamePalette.sky) {
                        Text("Contact \(sponsor) at the venue or through the organiser who invited you.")
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 20)
                .padding(.bottom, 32)
            }
            .scrollIndicators(.hidden)

            Button { dismiss() } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.gameIcon(GamePalette.berry, diameter: 44))
            .accessibilityLabel("Close")
            .padding(.top, 12)
            .padding(.trailing, 16)
        }
        .gameType()
    }

    private var header: some View {
        VStack(spacing: 10) {
            GameChip(text: "Official Rules", color: GamePalette.berry)
            GameTitle(terms.title, size: 38)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            if terms.sponsored, let name = terms.sponsor {
                GameChip(text: "Sponsored by \(name)", color: GamePalette.sunDeep)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 40)
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private func section(_ title: String, icon: String, color: Color,
                         @ViewBuilder body: () -> some View) -> some View {
        GamePanel {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(GamePalette.edge(of: color)).offset(y: 3)
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(color)
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(GamePalette.ink, lineWidth: 2.5))
                        Image(systemName: icon)
                            .font(.system(size: 20, weight: .heavy))
                            .foregroundStyle(.white)
                            .shadow(color: GamePalette.ink.opacity(0.5), radius: 0, y: 1.5)
                    }
                    .frame(width: 44, height: 44)
                    Text(title)
                        .font(GameFont.display(21))
                        .foregroundStyle(GamePalette.ink)
                }
                body()
                    .font(GameFont.body(16))
                    .foregroundStyle(GamePalette.ink.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
