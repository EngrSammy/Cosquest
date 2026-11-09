import AVFoundation
import SwiftUI
import UIKit

/// The game's own look and feel, so the app reads as a game and not as a
/// settings screen with a camera attached.
///
/// Everything a player touches goes through here: display type (Lilita One),
/// body type (Fredoka), chunky buttons that physically press down with a
/// click and a haptic, raised panels with a hard bottom edge, big reward
/// banners, and short synthesised sound effects. No system Form, no
/// `.borderedProminent`, no navigation-bar chrome on game surfaces.
enum GameFont {
    /// Headlines, numbers, button labels. Chunky and a little playful.
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom("LilitaOne", size: size, relativeTo: style)
    }
    /// Everything else. Rounded, friendly, readable in motion.
    static func body(_ size: CGFloat = 17, weight: Font.Weight = .medium,
                     relativeTo style: Font.TextStyle = .body) -> Font {
        // Named instances of the variable font: a family name plus .weight
        // is not guaranteed to resolve, a PostScript name is.
        let name: String
        switch weight {
        case .black, .heavy, .bold: name = "Fredoka-Bold"
        case .semibold: name = "Fredoka-SemiBold"
        case .medium: name = "Fredoka-Medium"
        case .light, .thin, .ultraLight: name = "Fredoka-Light"
        default: name = "Fredoka-Regular"
        }
        return .custom(name, size: size, relativeTo: style)
    }
}

/// The palette of the game surfaces: frosted ice, slate and sky, with orange
/// for the numbers that matter and red for danger. Taken from the hero-screen
/// reference Subomi chose on 26 Sep. House colours stay their own (RoamStyle):
/// on the map they mean something, and a palette is not allowed to move them.
enum GamePalette {
    static let sky = Color(red: 0.49, green: 0.76, blue: 0.89)
    /// The primary blue: stat bars, primary buttons, links.
    static let skyDeep = Color(red: 0.17, green: 0.60, blue: 0.84)
    static let grass = Color(red: 0.49, green: 0.76, blue: 0.40)
    /// The accent. Numbers, the call to action, coins.
    static let sun = Color(red: 0.95, green: 0.60, blue: 0.18)
    static let sunDeep = Color(red: 0.82, green: 0.47, blue: 0.06)
    /// Deep slate: dark panels, and the text on light ones.
    static let navy = Color(red: 0.12, green: 0.23, blue: 0.30)
    static let navyEdge = Color(red: 0.07, green: 0.15, blue: 0.20)
    /// Frosted card white.
    static let cream = Color(red: 0.95, green: 0.97, blue: 0.98)
    static let berry = Color(red: 0.85, green: 0.22, blue: 0.25)
    static let mint = Color(red: 0.24, green: 0.75, blue: 0.54)
    static let ink = Color(red: 0.12, green: 0.23, blue: 0.30)
    /// The page: pale ice blue.
    static let ice = Color(red: 0.78, green: 0.88, blue: 0.92)
    /// Header bars and the stage's lines.
    static let slate = Color(red: 0.55, green: 0.70, blue: 0.77)
    /// Secondary text on light surfaces.
    static let mist = Color(red: 0.36, green: 0.48, blue: 0.55)
    /// The empty part of a bar.
    static let track = Color(red: 0.83, green: 0.87, blue: 0.89)

    /// The darker edge under a face colour, for the pressed-3D look.
    static func edge(of color: Color) -> Color {
        let ui = UIColor(color)
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard ui.getHue(&h, saturation: &s, brightness: &b, alpha: &a) else {
            return color.opacity(0.7)
        }
        return Color(hue: Double(h), saturation: Double(min(1, s * 1.1)),
                     brightness: Double(b * 0.68), opacity: Double(a))
    }
}

// MARK: - Buttons

/// A chunky game button: a coloured face on a darker base that it sinks into
/// when pressed, a white display-font label with a drop shadow, a click and a
/// light haptic. The one button style for every call to action in the game.
struct GameButtonStyle: ButtonStyle {
    enum Size { case large, medium, small }
    var color: Color = GamePalette.sun
    var size: Size = .large
    var fullWidth: Bool = true

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let depth: CGFloat = size == .small ? 4 : 6
        let face = isEnabled ? color : Color(white: 0.62)
        let radius: CGFloat = size == .small ? 14 : 20
        return configuration.label
            .font(GameFont.display(size == .large ? 24 : size == .medium ? 20 : 16,
                                   relativeTo: .headline))
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.28), radius: 0, x: 0, y: 2)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, size == .small ? 14 : 22)
            .padding(.vertical, size == .large ? 16 : size == .medium ? 12 : 8)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(GamePalette.edge(of: face))
                        .offset(y: depth)
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(LinearGradient(colors: [face.opacity(0.92), face],
                                             startPoint: .top, endPoint: .bottom))
                        .overlay(alignment: .top) {
                            // The glossy highlight that makes it a toy, not a form.
                            RoundedRectangle(cornerRadius: radius, style: .continuous)
                                .fill(.white.opacity(0.28))
                                .frame(height: 10)
                                .padding(.horizontal, 10)
                                .padding(.top, 5)
                                .blendMode(.plusLighter)
                        }
                        .offset(y: pressed ? depth - 1 : 0)
                }
            }
            .padding(.bottom, depth)
            .offset(y: pressed ? 1 : 0)
            .animation(.spring(response: 0.18, dampingFraction: 0.6), value: pressed)
            .onChange(of: pressed) { _, down in
                guard down, isEnabled else { return }
                GameSound.shared.play(.tap)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
    }
}

/// A round icon button in the same family, for toolbars and corners.
struct GameIconButtonStyle: ButtonStyle {
    var color: Color = GamePalette.navy
    var diameter: CGFloat = 46

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        return configuration.label
            .font(.system(size: diameter * 0.4, weight: .heavy, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: diameter, height: diameter)
            .background {
                ZStack {
                    Circle().fill(GamePalette.edge(of: color)).offset(y: 4)
                    Circle().fill(color)
                        .overlay(Circle().strokeBorder(.white.opacity(0.35), lineWidth: 2))
                        .offset(y: pressed ? 3 : 0)
                }
            }
            .padding(.bottom, 4)
            .scaleEffect(pressed ? 0.94 : 1)
            .animation(.spring(response: 0.18, dampingFraction: 0.6), value: pressed)
            .onChange(of: pressed) { _, down in
                guard down else { return }
                GameSound.shared.play(.tap)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
    }
}

extension ButtonStyle where Self == GameButtonStyle {
    static var game: GameButtonStyle { GameButtonStyle() }
    static func game(_ color: Color, size: GameButtonStyle.Size = .large,
                     fullWidth: Bool = true) -> GameButtonStyle {
        GameButtonStyle(color: color, size: size, fullWidth: fullWidth)
    }
}

extension ButtonStyle where Self == GameIconButtonStyle {
    static var gameIcon: GameIconButtonStyle { GameIconButtonStyle() }
    static func gameIcon(_ color: Color, diameter: CGFloat = 46) -> GameIconButtonStyle {
        GameIconButtonStyle(color: color, diameter: diameter)
    }
}

// MARK: - Panels

/// A raised card: cream face, a thick darker base, rounded corners. Game
/// panels sit ON the scene, they are not rows in a table.
struct GamePanel<Content: View>: View {
    var face: Color = GamePalette.cream
    var padding: CGFloat = 18
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(GamePalette.edge(of: face).opacity(0.9))
                        .offset(y: 6)
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(face)
                        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .strokeBorder(.white.opacity(0.6), lineWidth: 2))
                }
            }
            .padding(.bottom, 6)
            .foregroundStyle(GamePalette.ink)
    }
}

/// A dark translucent panel for anything drawn over the camera.
struct GameHUDPanel<Content: View>: View {
    var padding: CGFloat = 12
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(GamePalette.navy.opacity(0.78))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(.white.opacity(0.18), lineWidth: 1.5))
                    .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
            }
            .foregroundStyle(.white)
    }
}

/// A big title with a thick outline and a drop shadow, the way game titles
/// are drawn. Use for screen headlines and banners.
/// A heading on a light page: heavy slate type, no outline. The outlined
/// `GameTitle` is for the moments (LEVEL UP!, TAKEN!); a sheet's name is not
/// a moment and should read like the hero screen's "HEROES".
struct GameHeading: View {
    let text: String
    var size: CGFloat = 34
    init(_ text: String, size: CGFloat = 34) { self.text = text; self.size = size }

    var body: some View {
        Text(text)
            .font(GameFont.display(size, relativeTo: .largeTitle))
            .foregroundStyle(GamePalette.ink)
            .shadow(color: .white.opacity(0.6), radius: 0, x: 0, y: 1)
            .accessibilityAddTraits(.isHeader)
    }
}

struct GameTitle: View {
    let text: String
    var size: CGFloat = 40
    var fill: Color = .white
    var outline: Color = GamePalette.ink

    init(_ text: String, size: CGFloat = 40, fill: Color = .white,
         outline: Color = GamePalette.ink) {
        self.text = text; self.size = size; self.fill = fill; self.outline = outline
    }

    var body: some View {
        let label = Text(text).font(GameFont.display(size, relativeTo: .largeTitle))
        return ZStack {
            // An outline from offset copies: SwiftUI has no text stroke.
            ForEach(0..<8, id: \.self) { i in
                let a = Double(i) * .pi / 4
                label.foregroundStyle(outline)
                    .offset(x: cos(a) * size * 0.06, y: sin(a) * size * 0.06)
            }
            label.foregroundStyle(fill)
        }
        .shadow(color: .black.opacity(0.3), radius: 0, x: 0, y: size * 0.09)
        .multilineTextAlignment(.center)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// A small caps label chip, e.g. "LIVE", "FREE", "GAME OVER".
struct GameChip: View {
    let text: String
    var color: Color = GamePalette.berry

    var body: some View {
        Text(text.uppercased())
            .font(GameFont.display(14, relativeTo: .caption))
            .tracking(1)
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Capsule().fill(color)
                .overlay(Capsule().strokeBorder(.white.opacity(0.5), lineWidth: 1.5)))
            .shadow(color: GamePalette.edge(of: color), radius: 0, y: 3)
    }
}

/// A coin, drawn, for token counts.
struct GameCoin: View {
    var size: CGFloat = 26
    var body: some View {
        ZStack {
            Circle().fill(GamePalette.sunDeep).offset(y: size * 0.08)
            Circle().fill(LinearGradient(colors: [Color(red: 1.0, green: 0.80, blue: 0.25), GamePalette.sun],
                                         startPoint: .top, endPoint: .bottom))
            Circle().strokeBorder(.white.opacity(0.6), lineWidth: size * 0.07)
                .padding(size * 0.14)
            Text("C").font(GameFont.display(size * 0.55)).foregroundStyle(GamePalette.sunDeep)
        }
        .frame(width: size, height: size)
    }
}

/// The page behind every game screen that is not over the camera: pale ice,
/// with the long diagonal panels of the hero screen behind it.
struct GameBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [GamePalette.slate.opacity(0.85), GamePalette.ice,
                                    Color(red: 0.87, green: 0.93, blue: 0.95)],
                           startPoint: .top, endPoint: .bottom)
            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                Path { p in
                    p.move(to: CGPoint(x: -w * 0.1, y: h * 0.28))
                    p.addLine(to: CGPoint(x: w * 0.42, y: h * 0.62))
                    p.move(to: CGPoint(x: w * 1.1, y: h * 0.3))
                    p.addLine(to: CGPoint(x: w * 0.6, y: h * 0.6))
                }
                .stroke(GamePalette.slate.opacity(0.55), lineWidth: 1.5)
                Path { p in
                    p.move(to: CGPoint(x: -w * 0.1, y: h * 0.28))
                    p.addLine(to: CGPoint(x: w * 0.42, y: h * 0.62))
                    p.addLine(to: CGPoint(x: -w * 0.1, y: h * 0.62))
                    p.closeSubpath()
                    p.move(to: CGPoint(x: w * 1.1, y: h * 0.3))
                    p.addLine(to: CGPoint(x: w * 0.6, y: h * 0.6))
                    p.addLine(to: CGPoint(x: w * 1.1, y: h * 0.6))
                    p.closeSubpath()
                }
                .fill(.white.opacity(0.12))
            }
        }
        .ignoresSafeArea()
    }
}

// MARK: - Reward banner

/// The big "CAPTURED!" / "+20" moment. Springs in, holds, flies out. Put it in
/// an overlay and drive it with `GameBannerModel.show`.
@MainActor @Observable
final class GameBannerModel {
    struct Banner: Identifiable, Equatable {
        let id = UUID()
        let title: String
        let subtitle: String?
        let color: Color
    }
    var current: Banner?

    func show(_ title: String, subtitle: String? = nil, color: Color = GamePalette.sun,
              sound: GameSound.Effect = .reward) {
        let banner = Banner(title: title, subtitle: subtitle, color: color)
        current = banner
        GameSound.shared.play(sound)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.2))
            if current?.id == banner.id { current = nil }
        }
    }
}

struct GameBannerView: View {
    let banner: GameBannerModel.Banner

    var body: some View {
        VStack(spacing: 6) {
            GameTitle(banner.title, size: 46, fill: .white,
                      outline: GamePalette.edge(of: banner.color))
            if let subtitle = banner.subtitle {
                Text(subtitle)
                    .font(GameFont.display(20))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 6)
                    .background(Capsule().fill(banner.color))
            }
        }
        .transition(.asymmetric(
            insertion: .scale(scale: 0.3).combined(with: .opacity),
            removal: .move(edge: .top).combined(with: .opacity)))
        .allowsHitTesting(false)
    }
}

// MARK: - Sound

/// Short synthesised effects, so the game has a voice without shipping audio
/// files. Mixes with other audio and respects the silent switch.
@MainActor
final class GameSound {
    static let shared = GameSound()

    enum Effect: CaseIterable { case tap, reward, coin, hit, whoosh, fanfare, pulse1, pulse2, pulse3 }

    private let engine = AVAudioEngine()
    private var players: [AVAudioPlayerNode] = []
    private var buffers: [Effect: AVAudioPCMBuffer] = [:]
    private var next = 0
    private var ready = false
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!

    private init() {}

    private func prepare() {
        guard !ready else { return }
        ready = true
        GameAudio.play()
        for _ in 0..<4 {
            let node = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: format)
            players.append(node)
        }
        engine.mainMixerNode.outputVolume = 0.55
        for effect in Effect.allCases { buffers[effect] = synth(effect) }
        do { try engine.start() } catch { ready = false }
    }

    func play(_ effect: Effect) {
        prepare()
        guard ready, let buffer = buffers[effect], !players.isEmpty else { return }
        if !engine.isRunning { try? engine.start() }
        // Still stopped (the session changed under it): skip the sound rather
        // than call play() on a stopped engine, which throws.
        guard engine.isRunning else { return }
        let node = players[next % players.count]
        next += 1
        node.stop()
        node.scheduleBuffer(buffer, at: nil, options: [])
        node.play()
    }

    /// Notes as (frequency Hz, duration s). Square-ish tones with a fast
    /// decay: the chiptune voice of a pocket game.
    private func synth(_ effect: Effect) -> AVAudioPCMBuffer? {
        let notes: [(Double, Double)]
        var noise = false
        switch effect {
        case .tap: notes = [(880, 0.04)]
        case .coin: notes = [(988, 0.06), (1319, 0.14)]
        case .reward: notes = [(784, 0.07), (988, 0.07), (1175, 0.07), (1568, 0.18)]
        case .fanfare: notes = [(523, 0.1), (659, 0.1), (784, 0.1), (1047, 0.3)]
        case .hit: notes = [(220, 0.05), (140, 0.16)]; noise = true
        case .whoosh: notes = [(400, 0.18)]; noise = true
        // The Strike's three pulses, rising: the ball's shake, in sound.
        case .pulse1: notes = [(523, 0.09)]
        case .pulse2: notes = [(659, 0.09)]
        case .pulse3: notes = [(784, 0.11)]
        }
        let rate = format.sampleRate
        let total = notes.reduce(0) { $0 + Int($1.1 * rate) }
        guard total > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                                        frameCapacity: AVAudioFrameCount(total)),
              let out = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = AVAudioFrameCount(total)
        var i = 0
        var seed: UInt32 = 12345
        for (freq, dur) in notes {
            let n = Int(dur * rate)
            for k in 0..<n {
                let t = Double(k) / rate
                let env = exp(-t * (noise ? 18 : 9)) * min(1, Double(k) / 60)
                let phase = sin(2 * .pi * freq * t)
                var v = (phase > 0 ? 0.6 : -0.6) * 0.5 + phase * 0.5
                if noise {
                    seed = seed &* 1_664_525 &+ 1_013_904_223
                    v = v * 0.5 + (Double(seed >> 9) / Double(1 << 23) - 0.5) * 0.9
                }
                out[i] = Float(v * env * 0.4)
                i += 1
            }
        }
        return buffer
    }
}

// MARK: - Conveniences

extension View {
    /// Game body type as the default for a whole screen.
    func gameType() -> some View {
        font(GameFont.body())
    }
}


/// The one audio session the game uses when it is not listening: playback,
/// mixed with whatever else is playing. Playback rather than ambient because
/// ambient obeys the silent switch, and a phone on silent is the common case:
/// the Warden and every sound in the game went quiet on it with no error.
enum GameAudio {
    /// Set once per activation, off the main thread: setCategory and
    /// setActive block while the audio server answers, and the system flags
    /// them as a hang risk when they run on main before every sound.
    @MainActor private static var active = false

    @MainActor static func play() {
        guard !active else { return }
        // [merged-app] A CosQuest call owns the session (.playAndRecord):
        // switching it to .playback would cut the call's microphone. The
        // effects still play, mixed into the call's session.
        if GameHost.shared.callActive { return }
        active = true
        DispatchQueue.global(qos: .userInitiated).async {
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default,
                                                             options: [.mixWithOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
        }
    }

    /// After something else (voice answers) has taken the session over.
    @MainActor static func invalidate() { active = false }
}

// MARK: - Side panels

extension View {
    /// The home's panels. The game is portrait, so this is a plain bottom
    /// sheet; the name stays so the call sites read the same if a
    /// wide layout ever comes back (tried landscape on 28 Sep).
    func sidePanel<C: View>(isPresented: Binding<Bool>, width: CGFloat = 470,
                            onDismiss: (() -> Void)? = nil,
                            @ViewBuilder content: @escaping () -> C) -> some View {
        // Each sheet keeps the detents it sets itself, as before the wide
        // layout was tried.
        sheet(isPresented: isPresented, onDismiss: onDismiss, content: content)
    }
}
