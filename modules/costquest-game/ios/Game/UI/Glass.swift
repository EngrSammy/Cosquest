import SwiftUI

/// Liquid Glass where the phone has it, a material where it does not.
///
/// The deployment target is iOS 18 and the SDK is 26, so every glass call has
/// to be gated. Gating at each call site meant an `if #available` around every
/// button, and the fallback drifted from the real thing; this keeps the two
/// spellings of one idea in a single place.
extension View {
    /// A floating surface: controls over the map, sheet furniture, chips.
    @ViewBuilder
    func cqGlass(_ shape: some Shape = .rect(cornerRadius: 16),
                 interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(interactive ? .regular.interactive() : .regular,
                             in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }
}

/// Groups glass so neighbouring pieces refract as one, rather than as separate
/// panes stacked on each other. Apple's own controls do this and it is the
/// difference between a cluster of buttons and one control.
struct CQGlassGroup<Content: View>: View {
    var spacing: CGFloat = 6
    @ViewBuilder var content: Content

    var body: some View {
        if #available(iOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
    }
}
