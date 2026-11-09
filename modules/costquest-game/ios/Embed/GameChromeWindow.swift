import SwiftUI
import UIKit

/// The chat's unread count and an ongoing call, kept visible while the game
/// covers the whole app with one of its own screens (a fight, an encounter,
/// a raid). Those are presented modally, above the React Native shell, so
/// the shell's own bubble and call pill are hidden behind them.
///
/// Display only, on purpose: it never takes a touch, so it cannot steal one
/// from a fight. The shell's bubble (tap to return, long press for the last
/// messages) is back the moment the game's screen closes. docs/merged-app-ux.md.
@MainActor
final class GameChromeWindowController {
    private var window: UIWindow?
    private var model = GameChromeModel()
    private var timer: Timer?

    func update(host: GameHost) {
        model.unread = host.unread
        model.call = host.call
        if host.visible {
            startWatching()
        } else {
            stopWatching()
            hide()
        }
    }

    private func startWatching() {
        guard timer == nil else { return }
        // A modal coming and going has no notification to observe from
        // outside SwiftUI; twice a second is enough for a status line.
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            MainActor.assumeIsolated { GameHost.shared.refreshChrome() }
        }
    }

    private func stopWatching() {
        timer?.invalidate()
        timer = nil
    }

    func refresh(covered: Bool) {
        let worthShowing = model.unread > 0 || model.call != nil
        if covered && worthShowing { show() } else { hide() }
    }

    private func show() {
        if window == nil {
            guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }) else { return }
            let made = PassthroughWindow(windowScene: scene)
            made.windowLevel = .statusBar - 1
            made.backgroundColor = .clear
            let host = UIHostingController(rootView: GameChromeView(model: model))
            host.view.backgroundColor = .clear
            made.rootViewController = host
            window = made
        }
        window?.isHidden = false
    }

    private func hide() {
        window?.isHidden = true
    }
}

extension GameHost {
    func refreshChrome() {
        chromeController.refresh(covered: isCoveredByGameModal())
    }
}

@MainActor
@Observable
final class GameChromeModel {
    var unread = 0
    var call: GameCallPill?
}

/// Never the target of a touch.
private final class PassthroughWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? { nil }
}

private struct GameChromeView: View {
    let model: GameChromeModel

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if let call = model.call {
                HStack(spacing: 6) {
                    Image(systemName: call.video ? "video.fill" : "phone.fill")
                    Text(call.title).lineLimit(1)
                    if let answered = call.answeredAtMs {
                        Text(Date(timeIntervalSince1970: answered / 1000), style: .timer)
                            .monospacedDigit()
                    }
                }
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Capsule().fill(Color(red: 0.12, green: 0.66, blue: 0.33)))
            }
            if model.unread > 0 {
                HStack(spacing: 5) {
                    Image(systemName: "bubble.left.fill")
                    Text(model.unread > 99 ? "99+" : "\(model.unread)").monospacedDigit()
                }
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(.white)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Capsule().fill(Color(red: 0.86, green: 0.09, blue: 0.62)))
            }
        }
        .padding(.top, 4)
        .padding(.trailing, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
    }
}
