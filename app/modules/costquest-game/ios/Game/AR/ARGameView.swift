import ARKit
import Combine
import CoreLocation
import RealityKit
import SwiftUI

/// The screen the game is actually played on.
///
/// The camera fills it and the interface sits on top as lightly as it can. That
/// is not a style preference: a player is holding this at arm's length outdoors
/// while walking, so anything on screen has to be readable at a glance in
/// sunlight and has to not cover the thing they are pointing at. Hence one line
/// of coaching at the top, one status pill, and nothing else until the game
/// itself has something to say.
struct ARGameView: View {
    let session: GameSession
    let terms: GameTerms
    let warden: Warden

    @State private var field: FieldModel
    @State private var cameraPosition = SIMD3<Float>.zero
    /// Back to the lobby, when the screen above offers a way there.
    var onLeave: (() -> Void)? = nil

    @State private var showLocalNotice = false
    @State private var localNoticeShown = false
    @State private var hitOpacity: Double = 0
    /// "ARENA LOCKED", once per field, the first time the marker aligns it.
    @State private var arenaBanners = GameBannerModel()
    @State private var arenaLockedShown = false
    @Environment(\.scenePhase) private var scenePhase

    /// True when PlayView's corner controls (leave, map) sit over this view,
    /// so the HUD keeps clear of them.
    private let reservesPlayChrome: Bool

    init(session: GameSession, terms: GameTerms, warden: Warden,
         onLeave: (() -> Void)? = nil, reservesPlayChrome: Bool = false) {
        self.reservesPlayChrome = reservesPlayChrome
        self.session = session
        self.terms = terms
        self.warden = warden
        self.onLeave = onLeave
        let venue = terms.venue.map {
            CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng)
        }
        _field = State(initialValue: FieldModel(gameID: terms.game_id, game: session,
                                                venue: venue))
    }

    var body: some View {
        ZStack(alignment: .top) {
            ARViewContainer(model: field, isScanning: isScanning) { position in
                cameraPosition = position
            }
            .ignoresSafeArea()

            // Damage: a red vignette that flashes in and bleeds away.
            RadialGradient(colors: [.clear, .red.opacity(0.35), .red.opacity(0.85)],
                           center: .center, startRadius: 120, endRadius: 520)
                .ignoresSafeArea()
                .opacity(hitOpacity)
                .allowsHitTesting(false)

            if case .playing = field.phase {
                TargetReticle(session: session, field: field,
                              heading: field.location.trueNorth ?? 0,
                              terms: terms)
                GameHUD(session: session, field: field, terms: terms,
                        warden: warden,
                        cameraPosition: cameraPosition,
                        cameraHeading: field.location.trueNorth ?? 0,
                        reservesPlayChrome: reservesPlayChrome)
            }

            VStack(spacing: 8) {
                if case .tracking = field.phase {
                    ScanningCard(title: scanTitle, detail: scanDetail,
                                 elapsed: field.scanSeconds)
                        .transition(.move(edge: .top).combined(with: .opacity))
                    arenaChip
                    if showsMarkerHint {
                        Label("Point at the venue marker to share the arena",
                              systemImage: "qrcode.viewfinder")
                            .font(GameFont.body(14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .gamePanelBackground(cornerRadius: 14)
                            .overCamera()
                            .transition(.opacity)
                    }
                } else if let loading {
                    LoadingCard(title: loading.title, detail: loading.detail,
                                progress: loading.progress)
                        .transition(.move(edge: .top).combined(with: .opacity))
                } else if let text = coachingLine {
                    Text(text)
                        .font(GameFont.display(17))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        // A dark game panel, so the text stays readable
                        // whether the camera is pointed at a white wall or a
                        // night sky.
                        .gamePanelBackground(cornerRadius: 16)
                        .overCamera()
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
                if showLocalNotice {
                    // Said once rather than pinned. In this mode two players do
                    // not share an origin, which is worth knowing, and not
                    // worth a permanent line of text over the game.
                    Label(field.isCompact ? "The arena is set up around you"
                                          : "You're in. Explore the arena",
                          systemImage: "sparkles")
                        .font(GameFont.display(20))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .gamePanelBackground(cornerRadius: 18)
                        .overCamera()
                        .padding(.bottom, 150)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(.top, 12)
            .padding(.horizontal, 16)
            .allowsHitTesting(false)
            .animation(.snappy, value: loading?.title)
            .animation(.snappy, value: scanTitle)
            .animation(.snappy, value: coachingLine)
            .animation(.smooth, value: showLocalNotice)
            .animation(.snappy, value: field.alignment)

            // Shared or solo, always visible once the game is up. Under the
            // HUD's top bar so it never covers the token count or the buttons.
            if case .playing = field.phase {
                arenaChip
                    .padding(.top, 118)
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }

            if let banner = arenaBanners.current {
                GameBannerView(banner: banner)
                    .id(banner.id)
                    .frame(maxHeight: .infinity)
                    .offset(y: -150)
            }

            if case .failed(let why) = field.phase {
                FailureCard(failure: field.failure ?? .init(title: "The arena didn't load",
                                                            message: why,
                                                            symbol: "exclamationmark.triangle.fill",
                                                            offersSettings: false),
                            onRetry: { Task { await field.retry() } },
                            onLeave: onLeave)
                    .frame(maxHeight: .infinity)
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
            }
        }
        .animation(.smooth, value: field.phase)
        .animation(.spring(response: 0.4, dampingFraction: 0.6), value: arenaBanners.current)
        .onChange(of: field.alignment) { _, alignment in
            // The moment the arena snaps onto the marker, once per field.
            guard alignment == .sharedMarker, !arenaLockedShown else { return }
            arenaLockedShown = true
            arenaBanners.show("ARENA LOCKED", subtitle: "Shared with everyone here",
                              color: GamePalette.mint, sound: .reward)
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .task { Self.bindLocation(field: field, session: session) }
        .onDisappear { field.shutdown() }
        .onChange(of: scenePhase) { _, phase in
            // Backgrounding an ARSession without pausing it keeps the camera
            // warm and the battery draining for nothing. Coming back re-runs
            // the same configuration without a reset, so the world is still
            // there rather than frozen on the last frame.
            //
            // Only a real trip to the background pauses. `.inactive` is also a
            // permission prompt, a notification pulled down or Control Center,
            // and pausing for those is how a camera ends up frozen. The session
            // controller listens to the app lifecycle directly as well, so this
            // is belt and braces for the case scenePhase never changes.
            switch phase {
            case .active: field.session.resume()
            case .background: field.session.pause()
            default: break
            }
        }
        .onChange(of: field.phase) { _, phase in
            // One short toast when the game begins, never a pinned banner.
            guard case .playing = phase, !localNoticeShown else { return }
            localNoticeShown = true
            showLocalNotice = true
            Task {
                try? await Task.sleep(for: .seconds(3))
                showLocalNotice = false
            }
        }
        // The moments, driven from what the session already knows. The game
        // layer can also call these hooks on FieldModel directly.
        .onChange(of: session.captures) { old, new in
            // Not for the first snapshot, which reports every existing capture
            // at once and is not a moment anyone just made.
            guard case .playing = field.phase, !old.isEmpty || new.count == 1 else { return }
            for (anchor, faction) in new where old[anchor] != faction {
                let hex = terms.factions.first { $0.name == faction }?.color
                field.celebrateCapture(anchorID: anchor, color: UIColor(Theme.faction(hex)))
            }
        }
        .onChange(of: session.weapon) { old, new in
            guard case .playing = field.phase else { return }
            if new != nil, new != old { field.celebratePickup() }
        }
        .onChange(of: session.moment?.id) { _, _ in
            // Taking damage or going down flashes red; other bad news
            // ("Not that one") does not.
            guard let m = session.moment, m.tone == .bad,
                  m.text.hasPrefix("Hit by") || m.symbol == "heart.slash.fill" else { return }
            field.flashHit()
        }
        .onChange(of: field.hitFlash) { _, _ in
            withAnimation(.easeOut(duration: 0.08)) { hitOpacity = 1 }
            withAnimation(.easeIn(duration: 0.7).delay(0.12)) { hitOpacity = 0 }
        }
    }

    private struct Loading {
        let title: String
        let detail: String?
        /// Nil for an indeterminate step.
        let progress: Double?
    }

    /// Everything before the game, as one card rather than a stream of log
    /// lines: what is happening, and how far along it is.
    private var loading: Loading? {
        switch field.phase {
        case .idle:
            return Loading(title: "Preparing the arena", detail: nil, progress: nil)
        case .downloading(let p):
            guard p.bytesTotal > 0 else {
                return Loading(title: "Preparing the arena",
                               detail: "Downloading the arena", progress: nil)
            }
            let ready = p.bytesReady / 1_000_000, total = max(p.bytesTotal / 1_000_000, 1)
            return Loading(title: "Preparing the arena",
                           detail: "Downloading · \(ready) of \(total) MB",
                           progress: p.fraction)
        case .tracking:
            return nil
        case .placing(let done, let total):
            return Loading(title: "Building the arena",
                           detail: "Bringing it to life",
                           progress: total > 0 ? Double(done) / Double(total) : nil)
        case .playing, .failed:
            return nil
        }
    }

    private var isScanning: Bool {
        if case .tracking = field.phase { return field.scanSeconds < 20 }
        return false
    }

    /// Advice that changes as the scan goes on, so a slow start reads as
    /// progress rather than as the same line stuck on screen.
    private var scanTitle: String {
        let t = field.scanSeconds
        if field.session.mode == .geo && t < 12 { return "Look up at the buildings around you" }
        switch t {
        case ..<6: return "Scan the floor around you"
        case ..<14: return "Nearly there"
        default: return "Setting up the arena"
        }
    }

    private var scanDetail: String {
        let t = field.scanSeconds
        if field.session.mode == .geo && t < 12 { return "Hold your phone up and pan slowly" }
        switch t {
        case ..<6: return field.session.coachingText ?? "Sweep your phone slowly across the floor"
        case ..<14: return "Keep the floor in view"
        default: return "Hold steady"
        }
    }

    /// Whose arena this is, in two words.
    private var arenaChip: some View {
        let shared = field.alignment != .solo
        return GameChip(text: shared ? "SHARED ARENA" : "SOLO ARENA",
                        color: shared ? GamePalette.mint : GamePalette.skyDeep)
            .accessibilityLabel(shared ? "Shared arena" : "Solo arena")
    }

    /// World tracking with no marker yet: tell the player the marker exists.
    /// Geo mode shares the arena on its own, so it does not need the hint.
    private var showsMarkerHint: Bool {
        if case .local = field.session.mode { return field.alignment == .solo }
        return false
    }

    /// ARKit's own coaching once the game is up ("Finding where you were."),
    /// which is worth a line while it lasts.
    private var coachingLine: String? {
        if case .playing = field.phase { return field.session.coachingText }
        return nil
    }

    /// Every fix goes to the game session, which attaches it to events (with
    /// how good and how old it is) for the geofence and the anti-cheat, and
    /// hands it to the live link for the map. The link throttles; this does
    /// not need to. A located action with an old fix, or one the server
    /// refused with need_location, asks for a fresh one first (refreshFix).
    /// Out of `body` so the view's type-check stays cheap.
    private static func bindLocation(field: FieldModel, session: GameSession) {
        let location = field.location
        location.onUpdate = { [weak session, weak location] in
            guard let session, let location else { return }
            session.coordinate = location.coordinate
            session.fix = location.fix
            session.heading = location.trueNorth ?? 0
            session.altitude = location.altitude
            Task { await session.reportPosition() }
        }
        session.refreshFix = { [weak session, weak location] in
            guard let location else { return }
            await location.freshFix()
            session?.coordinate = location.coordinate
            session?.fix = location.fix
        }
    }
}

/// The one card shown while the field comes up.
private struct LoadingCard: View {
    let title: String
    let detail: String?
    let progress: Double?

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                if progress == nil {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                }
                Text(title)
                    .font(GameFont.display(22))
                    .foregroundStyle(.white)
            }
            if let detail {
                Text(detail)
                    .font(GameFont.body(14, weight: .semibold).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.75))
                    .contentTransition(.numericText())
            }
            if let progress {
                // A chunky game progress bar.
                ZStack(alignment: .leading) {
                    Capsule().fill(GamePalette.navyEdge)
                    Capsule().fill(LinearGradient(colors: [GamePalette.sun, GamePalette.sunDeep],
                                                  startPoint: .top, endPoint: .bottom))
                        .frame(width: max(14, 200 * min(max(progress, 0), 1)))
                }
                .frame(width: 200, height: 14)
                .overlay(Capsule().strokeBorder(.white.opacity(0.6), lineWidth: 2))
                .animation(.smooth, value: progress)
            }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 22)
        .padding(.vertical, 16)
        .gamePanelBackground(cornerRadius: 22)
        .overCamera()
        .accessibilityElement(children: .combine)
    }
}

/// The designed loader while the world is being understood: a pulsing
/// viewfinder, a line of advice, and a ring that fills while it looks, so the
/// player can see it is working and roughly how long it takes.
private struct ScanningCard: View {
    let title: String
    let detail: String
    let elapsed: Double
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.18), lineWidth: 3)
                Circle()
                    .trim(from: 0, to: min(elapsed / 20, 1))
                    .stroke(GamePalette.sun, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.linear(duration: 0.25), value: elapsed)
                Image(systemName: "viewfinder")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                    .scaleEffect(pulse ? 1.12 : 0.9)
                    .opacity(pulse ? 1 : 0.6)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(GameFont.display(20))
                    .foregroundStyle(.white)
                    .contentTransition(.opacity)
                Text(detail)
                    .font(GameFont.body(14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.75))
                    .contentTransition(.opacity)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: 360)
        .gamePanelBackground(cornerRadius: 22)
        .overCamera()
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Shown when the field could not come up. Says so in plain words and always
/// offers a way forward and, when the screen above allows it, a way out.
private struct FailureCard: View {
    let failure: FieldModel.Failure
    let onRetry: () -> Void
    let onLeave: (() -> Void)?

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: failure.symbol)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(GamePalette.sun)
            GameTitle(failure.title, size: 26, outline: GamePalette.navyEdge)
            Text(failure.message)
                .font(GameFont.body(16))
                .foregroundStyle(.white.opacity(0.75))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                if let onLeave {
                    Button("Leave", action: onLeave)
                        .buttonStyle(.game(GamePalette.berry, size: .medium))
                }
                if failure.offersSettings {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.game(GamePalette.sunDeep, size: .medium))
                } else {
                    Button("Try again", action: onRetry)
                        .buttonStyle(.game(GamePalette.mint, size: .medium))
                }
            }
            .padding(.top, 4)
            if failure.offersSettings {
                Button("Try again", action: onRetry)
                    .font(GameFont.display(16))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(24)
        .frame(maxWidth: 340)
        .gamePanelBackground(cornerRadius: 26)
        .overCamera()
        .padding(.horizontal, 16)
    }
}

private extension View {
    /// The dark raised panel game surfaces use over the camera.
    func gamePanelBackground(cornerRadius: CGFloat) -> some View {
        background {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(GamePalette.navy.opacity(0.82))
                .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(.white.opacity(0.2), lineWidth: 1.5))
                .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
        }
    }
}

/// Hosts the `ARView` and wires it to the model.
///
/// `ARView` rather than `RealityView` on purpose. This game needs the Metal
/// post-process hook (`renderCallbacks.postProcess`) for the effects the mote
/// engine drives, and needs to hand its `ARSession` to `NISession` for
/// ultra wideband camera assistance. Both of those are `ARView` surface.
private struct ARViewContainer: UIViewRepresentable {
    let model: FieldModel
    /// Apple's coaching overlay only while we are actually asking the player
    /// to scan; never over the game, never after the fallback has placed it.
    let isScanning: Bool
    /// The camera's position in the field's frame, reported at the same
    /// throttled rate as the level-of-detail step rather than per frame: the
    /// HUD is deciding what a player can reach, and four times a second is
    /// four times more often than anyone can walk into range.
    let onCameraMoved: @MainActor (SIMD3<Float>) -> Void

    func makeUIView(context: Context) -> ARView {
        // `.nonAR` camera mode would be the default for a plain scene; this is
        // explicitly the AR camera with automatic session configuration off,
        // because the controller decides the configuration, not RealityKit.
        let view = ARView(frame: .zero, cameraMode: .ar,
                          automaticallyConfigureSession: false)

        // Apple's own coaching UI. Worth using rather than writing: it knows
        // the animations for each tracking problem, it is localised into every
        // language the App Store ships, and players have seen it before in
        // other apps.
        let coaching = ARCoachingOverlayView()
        coaching.sessionProvider = view
        coaching.activatesAutomatically = true
        coaching.goal = .horizontalPlane
        coaching.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(coaching)
        NSLayoutConstraint.activate([
            coaching.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            coaching.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            coaching.topAnchor.constraint(equalTo: view.topAnchor),
            coaching.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        context.coordinator.coaching = coaching

        // Tap a thing in the world to act on it, the way every AR game works.
        let tap = UITapGestureRecognizer(target: context.coordinator,
                                         action: #selector(Coordinator.tapped(_:)))
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        context.coordinator.model = model

        context.coordinator.observe(view: view, model: model,
                                    onCameraMoved: onCameraMoved)
        Task { await model.begin(in: view) }
        return view
    }

    func updateUIView(_ view: ARView, context: Context) {
        // Geo mode asks the player for a different thing (look at buildings,
        // not at the floor), so the coaching goal follows the mode.
        guard let coaching = context.coordinator.coaching else { return }
        coaching.goal = model.session.mode == .geo ? .geoTracking : .horizontalPlane
        coaching.activatesAutomatically = isScanning
        if !isScanning, coaching.isActive { coaching.setActive(false, animated: true) }
    }

    static func dismantleUIView(_ view: ARView, coordinator: Coordinator) {
        view.session.pause()
        coordinator.cancellables.removeAll()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor
    final class Coordinator: NSObject {
        var cancellables: Set<AnyCancellable> = []
        weak var model: FieldModel?

        @objc func tapped(_ recognizer: UITapGestureRecognizer) {
            guard let view = recognizer.view else { return }
            model?.handleTap(at: recognizer.location(in: view))
        }

        weak var coaching: ARCoachingOverlayView?
        /// Level-of-detail work is throttled rather than run per frame. At
        /// 60fps a walking player covers about two centimetres a frame, so
        /// checking four times a second is four times more often than any
        /// boundary can actually be crossed, and it keeps the render thread
        /// free.
        private var lastStep = Date.distantPast
        private var stepping = false

        func observe(view: ARView, model: FieldModel,
                     onCameraMoved: @escaping @MainActor (SIMD3<Float>) -> Void) {
            view.scene.subscribe(to: SceneEvents.Update.self) { [weak self, weak view] _ in
                guard let self, let view, !stepping,
                      Date().timeIntervalSince(lastStep) > 0.25 else { return }
                lastStep = Date()
                stepping = true
                let camera = view.cameraTransform.translation
                onCameraMoved(camera)
                Task { @MainActor in
                    await model.stepLevelsOfDetail(cameraAt: camera)
                    self.stepping = false
                }
            }.store(in: &cancellables)

            NotificationCenter.default.publisher(
                for: UIApplication.didReceiveMemoryWarningNotification)
                .sink { _ in
                    MainActor.assumeIsolated { model.handleMemoryPressure() }
                }
                .store(in: &cancellables)
        }
    }
}
