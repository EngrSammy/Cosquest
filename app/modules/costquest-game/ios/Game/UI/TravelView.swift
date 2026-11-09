import CoreLocation
import SwiftUI

/// Getting to the venue.
///
/// The outpost is where players gather; the game is played on foot at a real
/// place, in augmented reality. Between those two facts sits a journey the app
/// had nothing to say about: you paid, and were dropped straight onto a field
/// map for a venue you might be five kilometres from, where nothing was in
/// reach and nothing explained why.
///
/// So this screen exists for exactly as long as the journey does. It shows the
/// one number that matters, points the way, and gets out of the way the moment
/// you arrive.
struct TravelView: View {
    let session: GameSession
    let terms: GameTerms
    /// Called once the player is inside the venue, so the app can hand over to
    /// the field map without them having to do anything.
    let onArrived: () -> Void
    let onLeave: () -> Void

    @State private var arrived = false
    /// Set when no fix has come after a while (location off, indoors, or
    /// permission declined), so the screen stops spinning and says so.
    @State private var gaveUpWaiting = false
    @State private var pulse = false

    /// This screen's own fix. The session's coordinate is only fed by the AR
    /// view, which does not exist yet on the way to the venue, so reading it
    /// here waited forever.
    @State private var location = PlayerLocation()

    private var me: CLLocationCoordinate2D? { location.coordinate ?? session.coordinate }
    private var heading: Double { location.trueNorth ?? session.heading }

    private var venue: CLLocationCoordinate2D? {
        terms.venue.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
    }

    private var radius: Double { Double(terms.venue?.radius_m ?? 250) }

    /// Metres to the venue, or nil before the phone has a fix.
    private var distance: Double? {
        guard let venue, let me else { return nil }
        return CLLocation(latitude: me.latitude, longitude: me.longitude)
            .distance(from: CLLocation(latitude: venue.latitude, longitude: venue.longitude))
    }

    /// Compass bearing to the venue, relative to where the phone is pointing,
    /// so the arrow points at the place rather than at north.
    private var relativeBearing: Double? {
        guard let venue, let me else { return nil }
        let φ1 = me.latitude * .pi / 180, φ2 = venue.latitude * .pi / 180
        let Δλ = (venue.longitude - me.longitude) * .pi / 180
        let y = sin(Δλ) * cos(φ2)
        let x = cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ)
        let bearing = atan2(y, x) * 180 / .pi
        return bearing - heading
    }

    private var factionColour: Color {
        Theme.faction(terms.factions.first { $0.name == session.faction }?.color)
    }

    var body: some View {
        ZStack {
            GameBackdrop()

            VStack(spacing: 26) {
                VStack(spacing: 8) {
                    GameChip(text: "On your way", color: factionColour)
                    GameTitle(terms.title, size: 38)
                }
                .padding(.top, 28)
                .padding(.horizontal, 24)

                Spacer(minLength: 0)

                VStack(spacing: 18) {
                    if let d = distance {
                        VStack(spacing: 6) {
                            // The arrow turns with the phone, so it is a direction
                            // rather than a fact about north.
                            compass
                                .padding(.bottom, 6)

                            Text(d < 1000
                                 ? "\(Int(d.rounded())) m"
                                 : String(format: "%.1f km", d / 1000))
                                .font(GameFont.display(64, relativeTo: .largeTitle))
                                .foregroundStyle(GamePalette.ink)
                                .contentTransition(.numericText())

                            Text("TO THE PLAY AREA")
                                .font(GameFont.display(16, relativeTo: .caption))
                                .tracking(1)
                                .foregroundStyle(GamePalette.ink.opacity(0.55))
                        }
                    } else if gaveUpWaiting {
                        VStack(spacing: 10) {
                            Image(systemName: "location.slash.fill")
                                .font(.system(size: 34, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 84, height: 84)
                                .background(Circle().fill(factionColour)
                                    .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 4)))
                            Text("Distance unknown")
                                .font(GameFont.display(26))
                            Text("Turn on Location Services for CosQuest to see how far you are.")
                                .font(GameFont.body(15)).foregroundStyle(GamePalette.ink.opacity(0.6))
                                .multilineTextAlignment(.center)
                        }
                        .frame(minHeight: 150)
                    } else {
                        VStack(spacing: 14) {
                            ZStack {
                                pulseRings
                                ProgressView().controlSize(.large).tint(GamePalette.ink)
                            }
                            .frame(width: 150, height: 120)
                            Text("Finding your location...")
                                .font(GameFont.display(18)).foregroundStyle(GamePalette.ink.opacity(0.7))
                        }
                        .frame(minHeight: 150)
                    }

                    venueFacts

                    Text("This game is played on foot, in augmented reality, at the "
                         + "venue. Head there and it will start on its own.")
                        .font(GameFont.body(14))
                        .foregroundStyle(GamePalette.ink.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .modifier(TravelPanel(padding: 20))
                .padding(.horizontal, 24)

                Spacer(minLength: 0)

                VStack(spacing: 10) {
                    // A way through without being there. The server refuses
                    // scoring events from outside the venue, so this shows the
                    // field; it does not let anyone play from their sofa.
                    Button { onArrived() } label: {
                        Text("PREVIEW THE FIELD")
                    }
                    .buttonStyle(.game(factionColour))

                    Text("Actions unlock when you reach the play area.")
                        .font(GameFont.body(13, weight: .semibold))
                        .foregroundStyle(.white)
                        .shadow(color: GamePalette.ink.opacity(0.5), radius: 0, y: 1)
                        .multilineTextAlignment(.center)

                    Button(role: .destructive) { onLeave() } label: {
                        Text("Leave this game")
                    }
                    .buttonStyle(.game(GamePalette.berry, size: .medium))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 20)
            }
        }
        .onChange(of: distance ?? .greatestFiniteMagnitude, initial: true) { _, d in
            // Arriving is not a button. The player is walking with the phone in
            // a pocket half the time, and asking them to confirm they have got
            // somewhere they are standing is interface for its own sake.
            guard !arrived, d <= radius else { return }
            arrived = true
            onArrived()
        }
        .task {
            // Tell the outpost this player is on their way, so the crowd
            // shows them leaving rather than idling by the fire.
            Presence.shared.status = "heading"
            Presence.shared.gameID = terms.game_id
            // A game with no venue has nowhere to travel to.
            guard venue != nil else {
                arrived = true
                onArrived()
                return
            }
            location.start()
            withAnimation(.easeOut(duration: 1.8).repeatForever(autoreverses: false)) {
                pulse = true
            }
            try? await Task.sleep(for: .seconds(10))
            if me == nil { withAnimation { gaveUpWaiting = true } }
        }
        .onDisappear { location.stop() }
    }
}

private extension TravelView {
    /// Two expanding rings, the "radar" behind the arrow.
    var pulseRings: some View {
        ZStack {
            ForEach(0..<2, id: \.self) { i in
                Circle()
                    .stroke(factionColour.opacity(0.5), lineWidth: 3)
                    .frame(width: 70, height: 70)
                    .scaleEffect(pulse ? 1.9 : 0.8)
                    .opacity(pulse ? 0 : 0.9)
                    .animation(.easeOut(duration: 1.8)
                        .repeatForever(autoreverses: false)
                        .delay(Double(i) * 0.9), value: pulse)
            }
        }
    }

    /// The arrow in a compass disc, pulsing so it reads as live.
    var compass: some View {
        ZStack {
            pulseRings
            Circle()
                .fill(GamePalette.cream)
                .frame(width: 108, height: 108)
                .overlay(Circle().strokeBorder(GamePalette.ink, lineWidth: 4))
                .shadow(color: GamePalette.edge(of: factionColour), radius: 0, y: 6)
            Text("N")
                .font(GameFont.display(14))
                .foregroundStyle(GamePalette.berry)
                .offset(y: -42)
                .rotationEffect(.degrees(-heading))
                .animation(.smooth(duration: 0.4), value: heading)
            Image(systemName: "location.north.fill")
                .font(.system(size: 46, weight: .black))
                .foregroundStyle(factionColour.gradient)
                .shadow(color: GamePalette.ink.opacity(0.6), radius: 0, y: 2)
                .rotationEffect(.degrees(relativeBearing ?? 0))
                .animation(.smooth(duration: 0.4), value: relativeBearing ?? 0)
        }
        .frame(width: 160, height: 140)
    }

    /// The venue in three chips: the side, the area, the crowd.
    var venueFacts: some View {
        HStack(spacing: 8) {
            if let faction = session.faction {
                fact(icon: "flag.fill", text: faction.capitalized, colour: factionColour)
            }
            fact(icon: "scope", text: "\(Int(radius)) m area", colour: Theme.brass)
            fact(icon: "person.2.fill", text: "\(terms.players_joined) in", colour: Theme.brass)
        }
    }

    func fact(icon: String, text: String, colour: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 12, weight: .heavy))
                .foregroundStyle(colour)
            Text(text).font(GameFont.display(14)).lineLimit(1)
        }
        .foregroundStyle(GamePalette.ink)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Capsule().fill(colour.opacity(0.15))
            .overlay(Capsule().strokeBorder(colour, lineWidth: 2)))
    }
}

private struct TravelPanel: ViewModifier {
    var padding: CGFloat
    func body(content: Content) -> some View {
        GamePanel(padding: padding) { content }
    }
}

// MARK: - Shared look for the flow's full screens

/// The page behind the terms, the journey and the results.
///
/// Drawn from the lobby's own palette (sea, shallows, sand and meadow) so
/// that leaving the map for a game does not feel like leaving the product for
/// a settings screen. Kept soft, because text sits on it; the dense content
/// goes on material cards above.
struct CQBackdrop: View {
    /// An optional wash of the player's side, for screens that belong to it.
    var tint: Color? = nil
    @Environment(\.colorScheme) private var scheme

    private static let sea = Color(red: 0.38, green: 0.66, blue: 0.80)
    private static let shallow = Color(red: 0.52, green: 0.78, blue: 0.86)
    private static let sand = Color(red: 0.90, green: 0.84, blue: 0.66)
    private static let grass = Color(red: 0.55, green: 0.74, blue: 0.45)
    private static let forest = Color(red: 0.24, green: 0.48, blue: 0.30)

    var body: some View {
        ZStack {
            LinearGradient(colors: [Self.sea, Self.shallow, Self.sand],
                           startPoint: .top, endPoint: .bottom)
            Canvas { ctx, size in
                let w = size.width, h = size.height
                ctx.fill(Path(ellipseIn: CGRect(x: -w * 0.35, y: h * 0.52,
                                                width: w * 0.95, height: h * 0.42)),
                         with: .color(Self.grass.opacity(0.75)))
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.45, y: h * 0.66,
                                                width: w * 0.9, height: h * 0.45)),
                         with: .color(Self.grass.opacity(0.85)))
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.6, y: h * 0.08,
                                                width: w * 0.6, height: h * 0.2)),
                         with: .color(Self.sand.opacity(0.55)))
                ctx.fill(Path(ellipseIn: CGRect(x: -w * 0.1, y: h * 0.8,
                                                width: w * 0.5, height: h * 0.16)),
                         with: .color(Self.forest.opacity(0.35)))
            }
            .blur(radius: 40)
            if let tint {
                RadialGradient(colors: [tint.opacity(0.45), .clear],
                               center: .top, startRadius: 0, endRadius: 460)
            }
            // Dimmed at night so the page follows the phone into dark mode
            // without the palette turning muddy.
            Rectangle().fill(scheme == .dark ? Color.black.opacity(0.5)
                                             : Color.white.opacity(0.12))
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

/// The heading on the flow's full screens: a small brass eyebrow over a large
/// rounded title, the same on the terms, the journey and the results.
struct CQScreenTitle: View {
    let eyebrow: String
    let title: String
    var alignment: HorizontalAlignment = .leading

    var body: some View {
        VStack(alignment: alignment, spacing: 6) {
            Text(eyebrow.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.4)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .cqGlass(.capsule)
            Text(title)
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(alignment == .center ? .center : .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity,
               alignment: alignment == .center ? .center : .leading)
    }
}
