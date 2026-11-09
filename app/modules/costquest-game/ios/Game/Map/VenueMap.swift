import CoreLocation
import MapKit
import SwiftUI

/// The world the game is played in.
///
/// It is a map underneath, and it is not presented as one. Pokémon GO's screen
/// looks geographic and is a rendered game world: no street names, no
/// addresses, no cafés, nothing to search, and you never browse a list — you
/// look at where you are and things are simply there. That is the whole
/// difference between a place you are standing in and a directory of places.
///
/// MapKit cannot be repainted into that, but it can be RESTRAINED into it:
///
/// - `emphasis: .muted` pushes the cartography back so it reads as ground
///   rather than as information.
/// - `pointsOfInterest: .excludingAll` removes Apple's own pins, which
///   otherwise compete with the organiser's objectives — the only things here
///   a player can act on.
/// - `elevation: .realistic` with a pitched camera turns a plan into somewhere
///   you are standing.
/// - `mapControlVisibility(.hidden)` removes the compass and scale. A game
///   world does not have a scale bar.
///
/// What is left is Apple's gesture feel, which is the thing a custom renderer
/// is hardest pressed to match, under our own objects.
struct VenueMap<Overlay: View>: View {
    var center: CLLocationCoordinate2D
    var zoom: Double
    var markers: [MapMarker]
    var venueRing: (centre: CLLocationCoordinate2D, radiusM: Double)?
    /// Drawn where the player stands, instead of the system's blue dot. A
    /// faction game has sides, and the player is one of them.
    var playerTint: Color = .accentColor
    var onSelect: (String) -> Void = { _ in }
    /// Sits on the world rather than beside it, so it can be a heads-up
    /// element of the scene.
    @ViewBuilder var overlay: Overlay

    @State private var camera: MapCameraPosition = .automatic
    @State private var lastCommanded: CLLocationCoordinate2D?

    var body: some View {
        Map(position: $camera, interactionModes: [.pan, .zoom, .rotate, .pitch]) {
            UserAnnotation { _ in PlayerPuck(tint: playerTint) }

            if let venueRing {
                MapCircle(center: venueRing.centre, radius: venueRing.radiusM)
                    .foregroundStyle(playerTint.opacity(0.10))
                    .stroke(playerTint.opacity(0.55), lineWidth: 2)
            }

            ForEach(markers) { marker in
                Annotation(marker.title, coordinate: marker.coordinate,
                           anchor: .bottom) {
                    WorldObject(marker: marker) { onSelect(marker.id) }
                }
                .annotationTitles(.hidden)
            }
        }
        .mapStyle(Self.style(WorldStyle.current))
        .mapControlVisibility(.hidden)
        .overlay(alignment: .bottom) { overlay }
        .onAppear { command(center) }
        .onChange(of: center.latitude) { _, _ in command(center) }
        .onChange(of: center.longitude) { _, _ in command(center) }
        .onChange(of: zoom) { _, _ in command(center, force: true) }
    }

    /// Move the camera only when the target has really changed, so a poll that
    /// returns the same answer does not fight the player's thumb.
    private func command(_ c: CLLocationCoordinate2D, force: Bool = false) {
        if !force, let last = lastCommanded,
           abs(last.latitude - c.latitude) < 0.0002,
           abs(last.longitude - c.longitude) < 0.0002 {
            return
        }
        lastCommanded = c
        withAnimation(.smooth(duration: 0.5)) {
            camera = .camera(MapCamera(centerCoordinate: c,
                                       distance: Self.distance(forZoom: zoom),
                                       heading: 0,
                                       // Tilted. A flat overhead plan reads as
                                       // a map; a raked one reads as ground you
                                       // are standing on, and it is the single
                                       // cheapest thing that changes which of
                                       // those this feels like.
                                       pitch: Self.pitch(forZoom: zoom)))
        }
    }

    /// Web-map zoom levels to a camera altitude. The callers were written
    /// against zoom levels and they read better than metres: "14" is a
    /// neighbourhood and "17" is a courtyard.
    static func distance(forZoom zoom: Double) -> Double {
        60_000_000 / pow(2, zoom)
    }

    /// Flat when you are looking at a city, raked when you are in a venue.
    /// Tilting while zoomed out only makes the horizon visible, which is the
    /// one thing that does look like a bug.
    /// The ground the game is played on.
    ///
    /// `.standard` keeps street names, which is the loudest thing still saying
    /// "map document" rather than "world". `.imagery` has NO labels at all,
    /// which is as close to a rendered world as MapKit gets, at the cost of
    /// satellite photography rather than an authored look.
    static func style(_ kind: WorldStyle.Kind) -> MapStyle {
        switch kind {
        case .drawn:
            .standard(elevation: .realistic, emphasis: .muted,
                      pointsOfInterest: .excludingAll, showsTraffic: false)
        case .photographic:
            .imagery(elevation: .realistic)
        case .photographicWithRoads:
            .hybrid(elevation: .realistic, pointsOfInterest: .excludingAll,
                    showsTraffic: false)
        }
    }

    static func pitch(forZoom zoom: Double) -> Double {
        switch zoom {
        case ..<14: 0
        case ..<16: 30
        default: 55
        }
    }
}

extension VenueMap where Overlay == EmptyView {
    init(center: CLLocationCoordinate2D, zoom: Double, markers: [MapMarker],
         venueRing: (centre: CLLocationCoordinate2D, radiusM: Double)? = nil,
         playerTint: Color = .accentColor,
         onSelect: @escaping (String) -> Void = { _ in }) {
        self.init(center: center, zoom: zoom, markers: markers,
                  venueRing: venueRing, playerTint: playerTint,
                  onSelect: onSelect) { EmptyView() }
    }
}

/// Where the player is standing.
///
/// Not the system's blue dot: this is a faction game, and the player belongs to
/// a side. A ring pulses out of it so you can find yourself on a busy screen
/// without hunting.
private struct PlayerPuck: View {
    let tint: Color
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(0.5), lineWidth: 2)
                .frame(width: 44, height: 44)
                .scaleEffect(pulse ? 1.5 : 0.8)
                .opacity(pulse ? 0 : 0.9)
            Circle().fill(.white).frame(width: 22, height: 22)
            Circle().fill(tint).frame(width: 15, height: 15)
        }
        .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
        .onAppear {
            withAnimation(.easeOut(duration: 2.2).repeatForever(autoreverses: false)) {
                pulse = true
            }
        }
        .accessibilityLabel("You")
    }
}

/// An object standing in the world: a venue, an objective, another player.
///
/// Drawn as something with a footprint on the ground rather than as a pin
/// floating above it, because the camera is raked and a flat marker at 55
/// degrees reads as a sticker on glass.
private struct WorldObject: View {
    let marker: MapMarker
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                ZStack {
                    if marker.isLive {
                        Circle()
                            .fill(Color(uiColor: marker.tint).opacity(0.25))
                            .frame(width: 54, height: 54)
                            .blur(radius: 6)
                    }
                    Circle()
                        .fill(Color(uiColor: marker.tint).gradient)
                        .frame(width: 38, height: 38)
                        .overlay(Circle().strokeBorder(.white.opacity(0.85),
                                                       lineWidth: 2.5))
                        .shadow(color: .black.opacity(0.45), radius: 5, y: 3)
                    if let symbol = marker.symbol {
                        Image(systemName: symbol)
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                if let badge = marker.badge {
                    Text(badge)
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(.black.opacity(0.65), in: .capsule)
                        .foregroundStyle(.white)
                        .offset(y: -4)
                }
                // The stem grounds the object: without it a circle at this
                // camera angle floats, and the player cannot tell which patch
                // of ground it belongs to.
                Capsule()
                    .fill(.black.opacity(0.28))
                    .frame(width: 3, height: 10)
                Ellipse()
                    .fill(.black.opacity(0.22))
                    .frame(width: 16, height: 5)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(marker.subtitle.map { "\(marker.title), \($0)" }
                            ?? marker.title)
    }
}

/// Anything standing in the world.
struct MapMarker: Identifiable, Equatable {
    let id: String
    let coordinate: CLLocationCoordinate2D
    let title: String
    let subtitle: String?
    let tint: UIColor
    var symbol: String?
    /// A short piece of state worn under the object: a countdown, a score, a
    /// number of players. Nil when there is nothing to say.
    var badge: String?
    /// Live objects glow. It is the one thing on this screen that has to be
    /// visible from across a venue.
    var isLive = false

    static func == (a: MapMarker, b: MapMarker) -> Bool {
        a.id == b.id
            && abs(a.coordinate.latitude - b.coordinate.latitude) < 1e-7
            && abs(a.coordinate.longitude - b.coordinate.longitude) < 1e-7
            && a.title == b.title && a.subtitle == b.subtitle
            && a.symbol == b.symbol && a.badge == b.badge && a.isLive == b.isLive
    }
}

extension UIColor {
    /// `#rrggbb` as the organiser typed it in the back office. Returns nil
    /// rather than a default, so a malformed colour is visibly the app's
    /// fallback and not silently a different faction's colour.
    convenience init?(hex: String?) {
        guard var s = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: CGFloat((v >> 16) & 0xff) / 255,
                  green: CGFloat((v >> 8) & 0xff) / 255,
                  blue: CGFloat(v & 0xff) / 255, alpha: 1)
    }
}


/// Which ground to draw, switchable at launch so the three can be compared on
/// a real phone rather than argued about from a screenshot.
///
///     -worldStyle photographic
enum WorldStyle {
    enum Kind: String { case drawn, photographic, photographicWithRoads }

    static var current: Kind {
        UserDefaults.standard.string(forKey: "worldStyle")
            .flatMap(Kind.init(rawValue:)) ?? .drawn
    }
}
