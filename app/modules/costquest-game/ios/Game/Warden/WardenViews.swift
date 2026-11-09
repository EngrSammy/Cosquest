import SwiftUI

/// The Warden's face: a small hooded spirit in the player's faction colour,
/// drawn rather than loaded, that pulses while it speaks.
struct WardenBadge: View {
    var tint: Color = GamePalette.skyDeep
    var size: CGFloat = 44
    /// 0...1, from the speaker, for the talking pulse.
    var level: Double = 0

    @State private var bob = false
    @State private var blink = false

    var body: some View {
        ZStack {
            // Hood.
            Circle()
                .fill(LinearGradient(colors: [tint.opacity(0.95), GamePalette.edge(of: tint)],
                                     startPoint: .top, endPoint: .bottom))
                .overlay(Circle().strokeBorder(.white.opacity(0.7), lineWidth: size * 0.05))
            // Face in the hood's shadow.
            Ellipse()
                .fill(GamePalette.navyEdge)
                .frame(width: size * 0.62, height: size * 0.5)
                .offset(y: size * 0.06)
            // Eyes: glowing, and they blink.
            HStack(spacing: size * 0.14) {
                ForEach(0..<2, id: \.self) { _ in
                    Capsule()
                        .fill(.white)
                        .frame(width: size * 0.1, height: blink ? size * 0.02 : size * 0.16)
                        .shadow(color: tint, radius: size * 0.08)
                }
            }
            .offset(y: size * 0.04)
            // The mouth is light: it glows as the Warden speaks.
            Capsule()
                .fill(.white.opacity(0.25 + 0.75 * level))
                .frame(width: size * (0.12 + 0.14 * level), height: size * 0.05)
                .offset(y: size * 0.2)
        }
        .frame(width: size, height: size)
        .scaleEffect(1 + 0.06 * level)
        .offset(y: bob ? -2 : 2)
        .animation(.easeInOut(duration: 0.12), value: level)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.6).repeatForever()) { bob = true }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Double.random(in: 2.5...5)))
                withAnimation(.easeInOut(duration: 0.08)) { blink = true }
                try? await Task.sleep(for: .milliseconds(120))
                withAnimation(.easeInOut(duration: 0.08)) { blink = false }
            }
        }
        .accessibilityHidden(true)
    }
}

/// What the Warden just said, with its face.
struct WardenBubble: View {
    let said: WardenVoice.Said
    var tint: Color
    var level: Double = 0
    var compact = false
    /// Shows a close button; the player can always put the Warden away.
    var onClose: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            WardenBadge(tint: tint, size: compact ? 36 : 44, level: level)
            VStack(alignment: .leading, spacing: 3) {
                Text("THE WARDEN")
                    .font(GameFont.display(12))
                    .tracking(1.2)
                    .foregroundStyle(tint)
                Text(said.text)
                    .font(GameFont.body(compact ? 15 : 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .contentTransition(.opacity)
            }
            Spacer(minLength: 0)
            if let onClose { WardenClose(action: onClose) }
        }
        .padding(12)
        .background {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(GamePalette.navy.opacity(0.88))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(tint.opacity(0.7), lineWidth: 2))
                .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
        }
        .transition(.asymmetric(insertion: .scale(scale: 0.9, anchor: .topLeading).combined(with: .opacity),
                                removal: .opacity))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("The Warden: \(said.text)")
    }
}

/// The Warden's close button: small, always in the same corner.
struct WardenClose: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 11, weight: .black))
                .foregroundStyle(.white.opacity(0.7))
                .frame(width: 26, height: 26)
                .background(Circle().fill(.white.opacity(0.12)))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .padding(-9)
        .accessibilityLabel("Close")
    }
}
