import CoreLocation
import RealityKit
import SwiftUI
import simd

/// The venue, rendered by us.
///
/// This is the thing MapKit could not be: a world with no Apple furniture, no
/// street names, no scale bar, and a look we choose. It is built from
/// OpenStreetMap the way Pokémon GO's is — they dropped Google for OSM in 2017
/// and render it themselves — and the attribution the licence asks for sits
/// where we put it rather than in a corner we cannot touch.
///
/// A stylised board, not a map: flat vertex colours, low buildings, trees in
/// the parks, and fog into a sky so the world has no edge. It has to read at a
/// glance in sunlight and cost little next to the game, ARKit and a language
/// model. The heavy work (triangulating ~2,000 buildings) runs off the main
/// actor; the main actor copies finished buffers and swaps one entity.
struct WorldView: View {
    let centre: CLLocationCoordinate2D
    let radiusM: Double
    /// Where the player is, in metres east and north of the venue centre.
    var playerOffset: SIMD2<Float> = .zero
    /// The camera's base yaw, degrees. The map is north-up at zero.
    var heading: Double = 0
    /// What stands in the world besides the ground: venues, objectives,
    /// other players. Positioned in the same local metres.
    var objects: [SceneObject] = []
    var onSelect: (String) -> Void = { _ in }
    /// Draw the player, with a ring on the ground showing how far they can
    /// reach. Off for a venue backdrop, where who is standing where is game
    /// state; on in Roam, where the player IS the subject, as in any
    /// location game.
    var player: PlayerPawn? = nil
    /// Which way the player faces, degrees clockwise from north, for the
    /// arrow at their feet. Nil: the way they last walked.
    var facing: Double? = nil
    /// Where the camera starts, in metres back from the player.
    var initialDolly: Double = 130
    /// Buildings are drawn at this share of their height. A game map keeps
    /// them low so the things you can play are never hidden behind a tower.
    var buildingScale: Float = 1
    /// Camera height as a share of its distance back. Higher looks down more.
    /// Ignored with `zoomTilt`, where the pitch follows the zoom.
    var cameraRise: Float = 0.5
    /// Tie the camera's tilt to its zoom (Pokémon GO's camera): close in looks
    /// toward the horizon, pulled back looks down.
    var zoomTilt: Bool = false
    /// Chosen outdoors on a real phone. The alternatives stay in Palette
    /// because a game played after dark is a real case.
    var palette: Palette = .daylight

    @State private var orbit: Double = 0
    @State private var orbitStart: Double = 0
    @State private var dolly: Double = 130
    @State private var dollyStart: Double = 130
    @State private var dollySet = false
    /// How far the view has TRAVELLED from the player, in scene metres (x
    /// east, z south). Pokémon GO does not allow this, but our content sits at
    /// venues across a city, and being unable to look where you are going made
    /// the world feel like a cage.
    @State private var travel: SIMD2<Float> = .zero
    @State private var travelStart: SIMD2<Float> = .zero
    @State private var viewSize: CGSize = .zero
    /// Read once when the scene is built. A session runs for an hour or two,
    /// so the light does not need to track the clock within it — but it must
    /// match the light the player is standing in when they open it.
    @State private var hour = TimeOfDay.override ?? TimeOfDay.now()
    @State private var scene = WorldScene()
    @State private var phase: Phase = .loading
    @State private var attribution = GroundCache.attribution
    @State private var fetching = false
    private let client = GameClient()

    enum Phase: Equatable { case loading, ready, failed }

    private var dollyRange: ClosedRange<Double> { zoomTilt ? 70...380 : 60...600 }

    var body: some View {
        ZStack {
            hour.sky.ignoresSafeArea()

            // Always present, so the scene (and the camera the gestures move)
            // exists from the first frame; the ground arrives into it.
            RealityView { content in
                content.camera = .virtual
                scene.attach(to: content, palette: palette, hour: hour)
                configureRig()
                scene.sync(objects)
                scene.setPlayer(player)
            } update: { _ in
                // Every input the caller can change, pushed into the rig.
                // Cheap: assignments and an object diff by id.
                configureRig()
                scene.sync(objects)
                scene.setPlayer(player)
            }
            .ignoresSafeArea()
            .opacity(phase == .failed && !scene.hasWorld ? 0 : 1)
            .overlay { gestureLayer }

            if phase == .failed && !scene.hasWorld {
                VStack(spacing: 14) {
                    ContentUnavailableView("Could not load the map here",
                                           systemImage: "map",
                                           description: Text("The game still works. Trying again…"))
                    Button("Try now") { retryNow() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(.bottom, 80)
            }

            // Loading is a small spinner in a corner, never a full-screen
            // block: the map (cached, or the bare board) stays in play.
            if fetching || (phase == .failed && scene.hasWorld) {
                VStack {
                    HStack {
                        Spacer()
                        HStack(spacing: 6) {
                            if fetching {
                                ProgressView().controlSize(.mini)
                            } else {
                                Image(systemName: "wifi.exclamationmark")
                                    .font(.caption2.weight(.bold))
                            }
                        }
                        .padding(7)
                        .cqGlass(.circle)
                        .padding(.trailing, 18)
                        .onTapGesture { if !fetching { retryNow() } }
                    }
                    .padding(.top, 118)
                    Spacer()
                }
                .transition(.opacity)
                .allowsHitTesting(!fetching)
            }

            // A view that can travel needs a way back.
            if simd_length(travel) > 40 {
                VStack {
                    Spacer()
                    Button {
                        travel = .zero
                        travelStart = .zero
                        scene.travelTarget = .zero   // the rig eases it home
                    } label: {
                        Label("Back to me", systemImage: "location.fill")
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 14).padding(.vertical, 9)
                            .cqGlass(.capsule, interactive: true)
                    }
                    .buttonStyle(.plain)
                    .padding(.bottom, 120)
                }
                .transition(.opacity)
            }

            // The licence asks for this on a produced work. It is ours to
            // place, which is the whole point of rendering our own ground.
            VStack {
                Spacer()
                HStack {
                    Text(attribution)
                        .font(.system(size: 9))
                        .foregroundStyle(.white.opacity(0.55))
                        .shadow(color: .black.opacity(0.25), radius: 1)
                        .padding(.leading, 12).padding(.bottom, 4)
                    Spacer()
                }
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
        }
        .animation(.easeOut(duration: 0.25), value: fetching)
        .task(id: "\(centre.latitude),\(centre.longitude),\(palette.name),\(attempt)") { await load() }
        .onAppear {
            guard !dollySet else { return }
            dollySet = true
            // `-mapDolly 250 -mapYaw 40`: QA and screenshots at a set view.
            let start = UserDefaults.standard.string(forKey: "mapDolly").flatMap(Double.init) ?? initialDolly
            dolly = min(dollyRange.upperBound, max(dollyRange.lowerBound, start))
            if let yaw = UserDefaults.standard.string(forKey: "mapYaw").flatMap(Double.init) {
                orbit = yaw
                orbitStart = yaw
            }
            dollyStart = dolly
            scene.dollyTarget = dolly
        }
    }

    // MARK: - Gestures

    /// On a transparent layer rather than on the RealityView: RealityView
    /// takes touches for its own entity handling on iOS, and a DragGesture
    /// attached to it never fired.
    private var gestureLayer: some View {
        GeometryReader { geo in
            Color.clear
                .contentShape(.rect)
                .onAppear {
                    viewSize = geo.size
                    if UserDefaults.standard.bool(forKey: "mapProbe") {
                        Task {
                            try? await Task.sleep(for: .seconds(12))
                            MapLog.note("view \(Int(geo.size.width))x\(Int(geo.size.height))")
                            scene.probe(size: geo.size)
                        }
                    }
                }
                .onChange(of: geo.size) { _, new in viewSize = new }
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { g in
                            // Metres per point scales with how far back the
                            // camera is, so a drag covers the same fraction of
                            // the screen whatever the zoom.
                            let perPoint = Float(dolly / 420)
                            let yaw = Float((heading + orbit) * .pi / 180)
                            // Camera right and forward, on the ground.
                            let right = SIMD2<Float>(cos(yaw), -sin(yaw))
                            let forward = SIMD2<Float>(-sin(yaw), -cos(yaw))
                            let dx = Float(g.translation.width) * perPoint
                            let dy = Float(g.translation.height) * perPoint
                            // Drag right moves the world right (the camera
                            // left); drag down pulls the far side toward you.
                            travel = travelStart - right * dx + forward * dy
                            scene.travelTarget = travel
                        }
                        .onEnded { g in
                            travelStart = travel
                            // A touch that never travelled is a TAP.
                            if abs(g.translation.width) < 8, abs(g.translation.height) < 8,
                               let id = scene.pick(at: g.location, in: geo.size) {
                                onSelect(id)
                            }
                        }
                )
                .simultaneousGesture(
                    RotateGesture()
                        .onChanged { g in
                            orbit = orbitStart + g.rotation.degrees
                            scene.yawDegrees = heading + orbit
                        }
                        .onEnded { _ in orbitStart = orbit }
                )
                .simultaneousGesture(
                    MagnifyGesture()
                        .onChanged { g in
                            dolly = min(dollyRange.upperBound,
                                        max(dollyRange.lowerBound, dollyStart / g.magnification))
                            scene.dollyTarget = dolly
                        }
                        .onEnded { _ in dollyStart = dolly }
                )
        }
    }

    private func configureRig() {
        scene.setCentre(centre)
        scene.yawDegrees = heading + orbit
        scene.zoomTilt = zoomTilt
        scene.rise = cameraRise
        scene.dollyRange = dollyRange
        scene.pawnTarget = WorldScene.scene(playerOffset)
        scene.facing = facing
        scene.restyle(palette: palette, hour: hour)
    }

    // MARK: - Loading

    private var style: BoardStyle { palette.worldStyle(buildingScale: buildingScale, hour: hour) }

    /// Draws what it can at once and then brings it up to date.
    ///
    /// 1. The last ground this phone saw, from disk, if it covers here: a
    ///    cold launch shows the city immediately instead of a spinner.
    /// 2. The server's answer, retried with backoff until it arrives. An
    ///    answer byte-identical to what is drawn is not rebuilt.
    private func load() async {
        let centre = self.centre
        let style = self.style
        let animateFirst = !scene.hasWorld
        if !scene.hasWorld, let cached = await GroundCache.load(near: centre) {
            await show(cached.0, data: cached.1, style: style, animated: true)
        }
        var delay: Double = 2
        while !Task.isCancelled {
            fetching = true
            do {
                let (geometry, data) = try await client.groundWithData(
                    lat: centre.latitude, lng: centre.longitude, radiusM: radiusM)
                fetching = false
                guard !Task.isCancelled else { return }
                if data != scene.shownData {
                    await show(geometry, data: data, style: style,
                               animated: animateFirst && !scene.hasWorld)
                    GroundCache.save(data, attribution: geometry.attribution)
                }
                phase = .ready
                return
            } catch {
                fetching = false
                if Task.isCancelled { return }
                MapLog.note("ground fetch failed: \(error)")
                phase = .failed
                try? await Task.sleep(for: .seconds(delay))
                delay = min(delay * 2, 30)
            }
        }
    }

    /// Part of the load task's id, so "try now" restarts the task (cancelling
    /// the one asleep in its backoff) rather than racing it.
    @State private var attempt = 0
    private func retryNow() { attempt += 1 }

    private func show(_ g: GroundGeometry, data: Data, style: BoardStyle,
                      animated: Bool) async {
        // Triangulation and vertex packing off the main actor. The result is
        // plain arrays, so it crosses back without copying the world twice.
        let blobs = await Task.detached(priority: .userInitiated) {
            WorldBuilder.build(g, style: style)
        }.value
        let origin = CLLocationCoordinate2D(latitude: g.origin.lat, longitude: g.origin.lng)
        MapLog.note("built: \(blobs.stats)")
        await scene.install(blobs, origin: origin, data: data, animated: animated)
        attribution = g.attribution
        if phase != .ready { phase = .ready }
    }
}

/// The last ground answer, kept on disk so a launch can draw at once.
enum GroundCache {
    private static var url: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appending(path: "roam-ground-v2.json")
    }

    static var attribution: String {
        UserDefaults.standard.string(forKey: "groundAttribution") ?? "© OpenStreetMap contributors"
    }

    /// The cached answer, decoded off the main actor, if its world reaches
    /// the given point with room to spare.
    static func load(near centre: CLLocationCoordinate2D) async -> (GroundGeometry, Data)? {
        guard let url else { return nil }
        return await Task.detached(priority: .userInitiated) { () -> (GroundGeometry, Data)? in
            guard let data = try? Data(contentsOf: url),
                  let g = try? JSONDecoder().decode(GroundGeometry.self, from: data) else { return nil }
            let o = CLLocation(latitude: g.origin.lat, longitude: g.origin.lng)
            let here = CLLocation(latitude: centre.latitude, longitude: centre.longitude)
            guard o.distance(from: here) < g.radius_m * 0.6 else { return nil }
            return (g, data)
        }.value
    }

    static func save(_ data: Data, attribution: String) {
        guard let url else { return }
        UserDefaults.standard.set(attribution, forKey: "groundAttribution")
        Task.detached(priority: .utility) {
            try? data.write(to: url, options: .atomic)
        }
    }
}

extension TimeOfDay {
    /// `-mapHour day|dawn|dusk|night` for screenshots and QA.
    static var override: TimeOfDay? {
        UserDefaults.standard.string(forKey: "mapHour").flatMap(TimeOfDay.init(rawValue:))
    }
}

/// The world's colours.
///
/// A set rather than one, because a venue is looked at outdoors in daylight
/// and this decision cannot be made from a screenshot on a desk.
///
/// The ground is low in saturation because the game's own objects are
/// saturated and have to be the brightest things on the screen — but it is
/// NOT low in value contrast: roads, grass, water and roofs must separate in
/// sunlight, which the first all-beige version did not.
struct Palette: Equatable {
    let name: String
    let sky: Color
    let earth: UIColor
    let green: UIColor
    let water: UIColor
    let road: UIColor
    let building: UIColor
    let sun: Float
    let fill: Float

    /// Midday. The safe one: high legibility, nothing atmospheric.
    static let daylight = Palette(
        name: "Daylight",
        sky: Color(red: 0.62, green: 0.76, blue: 0.85),
        earth: UIColor(red: 0.76, green: 0.74, blue: 0.66, alpha: 1),
        green: UIColor(red: 0.48, green: 0.64, blue: 0.40, alpha: 1),
        water: UIColor(red: 0.22, green: 0.44, blue: 0.58, alpha: 1),
        road: UIColor(red: 0.40, green: 0.39, blue: 0.37, alpha: 1),
        building: UIColor(red: 0.92, green: 0.89, blue: 0.83, alpha: 1),
        sun: 2600, fill: 900)

    /// A game world rather than a map: the Roam board. Its full colour set
    /// is in `worldStyle`.
    static let meadow = Palette(
        name: "Meadow",
        sky: Color(red: 0.86, green: 0.92, blue: 0.95),
        earth: UIColor(red: 0.89, green: 0.93, blue: 0.79, alpha: 1),
        green: UIColor(red: 0.66, green: 0.84, blue: 0.49, alpha: 1),
        water: UIColor(red: 0.43, green: 0.76, blue: 0.89, alpha: 1),
        road: UIColor(red: 1.00, green: 0.98, blue: 0.94, alpha: 1),
        building: UIColor(red: 0.90, green: 0.83, blue: 0.70, alpha: 1),
        sun: 2900, fill: 1200)

    /// Evening, which is when most of these games will actually be played.
    static let dusk = Palette(
        name: "Dusk",
        sky: Color(red: 0.24, green: 0.26, blue: 0.40),
        earth: UIColor(red: 0.30, green: 0.31, blue: 0.38, alpha: 1),
        green: UIColor(red: 0.24, green: 0.36, blue: 0.31, alpha: 1),
        water: UIColor(red: 0.16, green: 0.24, blue: 0.38, alpha: 1),
        road: UIColor(red: 0.46, green: 0.46, blue: 0.53, alpha: 1),
        building: UIColor(red: 0.42, green: 0.42, blue: 0.50, alpha: 1),
        sun: 1800, fill: 800)

    /// Near monochrome, matching the back office, where colour is reserved
    /// entirely for the game.
    static let slate = Palette(
        name: "Slate",
        sky: Color(red: 0.10, green: 0.11, blue: 0.12),
        earth: UIColor(red: 0.16, green: 0.17, blue: 0.18, alpha: 1),
        green: UIColor(red: 0.18, green: 0.23, blue: 0.19, alpha: 1),
        water: UIColor(red: 0.11, green: 0.16, blue: 0.21, alpha: 1),
        road: UIColor(red: 0.34, green: 0.35, blue: 0.37, alpha: 1),
        building: UIColor(red: 0.26, green: 0.27, blue: 0.29, alpha: 1),
        sun: 2200, fill: 700)

    static let all: [Palette] = [.daylight, .meadow, .dusk, .slate]

    /// Every colour the world builder needs, as plain values.
    func worldStyle(buildingScale: Float, hour: TimeOfDay = .day) -> BoardStyle {
        var s: BoardStyle
        if name == "Meadow" {
            // Values from the map design study (07 §6.3): a wider value range
            // so the board reads outdoors. Roads lighter than the ground with
            // a darker kerb; grass two steps of green; water blue with a pale
            // bank; buildings in four families, roofs lighter than walls.
            s = BoardStyle(
                earth: RGB(hex: 0xD2DFAE),
                park: RGB(hex: 0xA9D67E),
                parkEdge: RGB(hex: 0x8CC266),
                grass: RGB(hex: 0xBBDD8E),
                wood: RGB(hex: 0x93C66C),
                pitch: RGB(hex: 0xB9E08F),
                paved: RGB(hex: 0xE0D7BF),
                water: RGB(hex: 0x6EC1E4),
                shore: RGB(hex: 0xB9E2EE),
                road: RGB(hex: 0xFFFBF0),
                roadMajor: RGB(hex: 0xFFF1CF),
                casing: RGB(hex: 0xB9A983),
                path: RGB(hex: 0xF7F0DE),
                rail: RGB(hex: 0xC4BDB3),
                railTie: RGB(hex: 0x7F7874),
                walls: [RGB(hex: 0xDCC39C), RGB(hex: 0xDDB69A), RGB(hex: 0xC9CCD6),
                        RGB(hex: 0xE0C8A6)],
                roofs: [RGB(hex: 0xEFDDBE), RGB(hex: 0xECC6AE), RGB(hex: 0xDDE2EA),
                        RGB(hex: 0xF2DBB8)],
                trunk: RGB(hex: 0x8B6A4E),
                leaves: [RGB(hex: 0x6DB35A), RGB(hex: 0x7EC265), RGB(hex: 0x5EA653),
                         RGB(hex: 0x8CCB6B)])
            if hour == .night {
                s = Palette.meadowNight
            } else if hour == .dusk {
                s = Palette.meadowDusk(day: s)
            }
        } else {
            func rgb(_ c: UIColor) -> RGB {
                var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
                c.getRed(&r, green: &g, blue: &b, alpha: &a)
                return RGB(Float(r), Float(g), Float(b))
            }
            let e = rgb(earth), g = rgb(green), w = rgb(water), r = rgb(road), b = rgb(building)
            s = BoardStyle(
                earth: e, park: g, parkEdge: g.scaled(0.88), grass: g.mixed(e, 0.3),
                wood: g.scaled(0.86), pitch: g.scaled(1.08), paved: e.mixed(r, 0.35),
                water: w, shore: w.mixed(RGB(1, 1, 1), 0.35), road: r, roadMajor: r.scaled(1.06),
                casing: r.scaled(0.72), path: r.mixed(e, 0.4), rail: r.scaled(0.6),
                railTie: r.scaled(0.45), walls: [b.scaled(0.92), b, b.scaled(1.04)],
                roofs: [b.scaled(1.02), b.scaled(1.08), b.scaled(1.1)],
                trunk: RGB(hex: 0x6E5642), leaves: [g.scaled(0.9), g, g.scaled(1.06)])
            s.roadGlow = 0.3
        }
        s.buildingScale = buildingScale
        if buildingScale < 1 {
            // A game board, not a skyline (07 §6.4: about 3-9 m): towers
            // still read as towers, but no block walls off a street.
            s.buildingKnee = 6
            s.buildingCap = 11
        }
        return s
    }

    /// The Roam board after dark: its own colours rather than the day's
    /// multiplied down. Deep indigo walls with moonlit roofs and warm windows,
    /// streets the brightest ground there is, parks and water still readable,
    /// and never darker than a legible dusk. The game's objects stay the
    /// brightest things on screen (they glow; see WorldScene.nightGlow).
    static let meadowNight: BoardStyle = {
        var s = BoardStyle(
            earth: RGB(hex: 0x232B47),
            park: RGB(hex: 0x2F6152),
            parkEdge: RGB(hex: 0x275246),
            grass: RGB(hex: 0x356A57),
            wood: RGB(hex: 0x28574A),
            pitch: RGB(hex: 0x3C7458),
            paved: RGB(hex: 0x2F3858),
            water: RGB(hex: 0x2A5F93),
            shore: RGB(hex: 0x4A7BAA),
            road: RGB(hex: 0xC7AE7E),
            roadMajor: RGB(hex: 0xE3C58E),
            casing: RGB(hex: 0x1B2140),
            path: RGB(hex: 0x8D93BC),
            rail: RGB(hex: 0x59607F),
            railTie: RGB(hex: 0x3A3F5C),
            walls: [RGB(hex: 0x303656), RGB(hex: 0x383452), RGB(hex: 0x2D3650),
                    RGB(hex: 0x3B3759)],
            roofs: [RGB(hex: 0x6F789F), RGB(hex: 0x7A7299), RGB(hex: 0x6B7C9C),
                    RGB(hex: 0x8480A6)],
            trunk: RGB(hex: 0x3B302B),
            leaves: [RGB(hex: 0x2E5E4B), RGB(hex: 0x336A53), RGB(hex: 0x2A5543),
                     RGB(hex: 0x3A6E57)])
        s.windows = [RGB(hex: 0xFFD37A), RGB(hex: 0xFFC766), RGB(hex: 0xFFE3A3),
                     RGB(hex: 0xF6B85C)]
        s.windowShare = 0.55
        s.roofRim = RGB(hex: 0xC3CCFF)
        s.roadGlow = 0.55
        s.lampPools = true
        return s
    }()

    /// Dusk: its own colours, not day and night averaged (that gave one
    /// mauve for ground, walls and roofs alike). The ground and walls are in
    /// shadow and cool; the roofs catch the last warm light, so buildings
    /// still read from above; streets stay the palest thing on the ground;
    /// parks stay green. The first windows are on.
    static func meadowDusk(day d: BoardStyle) -> BoardStyle {
        var s = BoardStyle(
            earth: RGB(hex: 0x6A6384),
            park: RGB(hex: 0x5E8F63),
            parkEdge: RGB(hex: 0x4F7D55),
            grass: RGB(hex: 0x6C9A68),
            wood: RGB(hex: 0x4E7D55),
            pitch: RGB(hex: 0x70A063),
            paved: RGB(hex: 0x7B7290),
            water: RGB(hex: 0x4E86BC),
            shore: RGB(hex: 0x8DB0D2),
            road: RGB(hex: 0xF4DFC0),
            roadMajor: RGB(hex: 0xFFD7A1),
            casing: RGB(hex: 0x463E5E),
            path: RGB(hex: 0xD6C4B9),
            rail: RGB(hex: 0x807592),
            railTie: RGB(hex: 0x534A66),
            walls: [RGB(hex: 0x675A80), RGB(hex: 0x755C78), RGB(hex: 0x5D5C82),
                    RGB(hex: 0x7A6480)],
            roofs: [RGB(hex: 0xEDB99B), RGB(hex: 0xE4A792), RGB(hex: 0xD9B5BF),
                    RGB(hex: 0xF2C8A2)],
            trunk: RGB(hex: 0x5A4638),
            leaves: [RGB(hex: 0x4F834F), RGB(hex: 0x5A8F57), RGB(hex: 0x47774A),
                     RGB(hex: 0x66995C)])
        s.windows = meadowNight.windows
        s.windowShare = 0.3
        s.roofRim = RGB(hex: 0xFFE2CC)
        s.roadGlow = 0.2
        _ = d
        return s
    }

    static func material(_ colour: UIColor) -> RealityKit.Material {
        var m = SimpleMaterial(color: colour, isMetallic: false)
        // Not fully matte. At 0.95 every face returned almost the same value
        // whatever its angle, so a wall and the roof above it were the same
        // colour and the box lost its edges.
        m.roughness = 0.68
        // Back faces culled. Drawing both sides let you see the inside of a
        // building through its own front wall, which is what makes a solid
        // read as paper.
        m.faceCulling = .back
        return m
    }
}

// MARK: - Things standing in the world

/// A venue, an objective or another player, standing in the venue's own
/// metres. Named for the scene rather than the map, because the MapKit
/// pin of the same idea still exists next door.
struct SceneObject: Identifiable, Equatable {
    let id: String
    /// East and north of the venue centre, in metres.
    let offset: SIMD2<Float>
    let tint: UIColor
    /// The ground a game occupies. A game is not a pin: it is a piece of a
    /// city, and drawing it as a zone rather than a point is what tells a
    /// player where they have to BE. Zero for an objective, which really is a
    /// single spot.
    var groundRadiusM: Float = 0
    /// Live objects get a halo. It is the one thing that has to be visible
    /// from the far side of a venue.
    var isLive = false
    var style: Style = .beacon
    /// How high the tappable head sits, for turning a tap into an object.
    var headHeight: Float = 30

    enum Style: Equatable {
        /// A pole and a ball: a game standing at a venue.
        case beacon
        /// A spinning crystal on a plinth: a Quest Point. Dimmed while it
        /// is recharging for this player.
        case shrine(dimmed: Bool)
        /// A pulsing battle beacon: a public Room anyone near can join.
        case room
    }

    /// Everything that changes how the object is drawn. Includes where it
    /// is: when the centre moves every offset is re-based, and an id-only
    /// check left the shrines 300 m from their streets.
    var signature: String {
        "\(style)|\(tint.description)|\(Int(offset.x.rounded()))|\(Int(offset.y.rounded()))|\(isLive)|\(Int(groundRadiusM))"
    }
}

/// What an object entity was last built from.
struct ObjectSignature: Component {
    let value: String
}

/// The player, as drawn in Roam.
struct PlayerPawn: Equatable {
    var tint: UIColor
    /// The reach ring's radius, in metres: where the server will let them
    /// play from.
    var reachM: Float
}

/// Carries which object an entity is, so a tap resolves to the right one.
struct ObjectID: Component {
    let id: String
}

extension UIColor {
    /// Brighter or darker by a factor, keeping the hue. For separating
    /// neighbouring buildings without inventing new colours.
    func scaled(by f: CGFloat) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return UIColor(red: min(1, r * f), green: min(1, g * f),
                       blue: min(1, b * f), alpha: a)
    }
}
