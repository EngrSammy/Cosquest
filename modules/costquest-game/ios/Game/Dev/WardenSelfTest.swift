import Foundation

/// Does the on-device model actually load and answer on this device, and how
/// fast?
///
/// Milestone 1's acceptance is checked on the Client's device: the app opens,
/// the model answers with the device in airplane mode, and it runs at no less
/// than twelve tokens a second. The first two are things a person confirms by
/// looking; the third is a number, and a number needs measuring on the device
/// rather than asserting from a laptop.
///
///     xcrun simctl launch --console-pty <device> com.djmcevents.CostQuest -wardenTest 1
enum WardenSelfTest {

    /// The floor the agreement fixes for the target device.
    private static let contractFloor = 12.0

    @MainActor
    static func run() async {
        print("\n=== CostQuest on-device model ===\n")
        var failures = 0
        func check(_ name: String, _ ok: Bool, _ detail: String = "") {
            print("  \(ok ? "PASS" : "FAIL")  \(name)\(detail.isEmpty ? "" : "  " + detail)")
            if !ok { failures += 1 }
        }

        var lastReported: Int64 = -1
        let store = ModelStore()
        store.prepare()
        for _ in 0..<1200 {                       // up to ten minutes on a slow link
            if case .downloading(let got, let total) = store.phase, total > 0 {
                let step = got / (32 * 1024 * 1024)
                if step != lastReported {
                    lastReported = step
                    print("  \(got / 1_000_000) of \(total / 1_000_000) MB")
                }
            }
            if store.phase.isReady { break }
            if case .failed(let why) = store.phase {
                print("  FAIL  the model could not be fetched: \(why)")
                exit(1)
            }
            if case .unsupported(let why) = store.phase {
                print("  SKIP  \(why)")
                exit(0)
            }
            try? await Task.sleep(for: .milliseconds(500))
        }
        guard case .ready(let modelPath, let tokenizerPath) = store.phase else {
            print("  FAIL  the model never became ready")
            exit(1)
        }
        check("the model downloaded and its checksum matched", true)

        let warden = Warden()
        warden.load(modelPath: modelPath, tokenizerPath: tokenizerPath)
        for _ in 0..<120 where !warden.usesModel {
            try? await Task.sleep(for: .milliseconds(250))
        }
        check("the engine loaded the model", warden.usesModel,
              warden.modelSummary ?? "")

        // A question whose answer is in the rules the app puts in front of the
        // model, so a wrong answer means the context is not reaching it rather
        // than that the model is small.
        let context = Warden.Context(
            title: "Harbour Watch", faction: "cliff", tokens: 85, state: "active",
            weapon: "harpoon", venue: "the old harbour", nearby: ["a capture point"],
            lastRefusal: "hit on cooldown", isOnline: false)

        warden.ask("Why was my hit refused?", role: .proctor, context: context)
        for _ in 0..<600 where warden.isAnswering {
            try? await Task.sleep(for: .milliseconds(100))
        }
        let answer = warden.turns.last?.text ?? ""
        print("\n  > \(answer.trimmingCharacters(in: .whitespacesAndNewlines))\n")

        check("it answered", answer.count > 20, "\(answer.count) characters")
        check("the answer uses the rules the app gave it, not invention",
              answer.lowercased().contains("cooldown"))
        // Prefill and generation reported apart, because they are different
        // costs and averaging them hides both. Measuring them together is what
        // made a 52 tok/s model look like a 4 tok/s one and nearly sent this
        // integration down the wrong road.
        if let rate = warden.tokensPerSecond {
            let first = warden.secondsToFirstWord ?? 0
            print(String(format: "\n  %.1f tok/s generating, first word after %.1fs\n",
                         rate, first))
#if targetEnvironment(simulator)
            // The agreement's floor is a number on the Client's device. A
            // simulator shares a Mac's cores through a virtualisation layer and
            // is not that device, so this reports rather than judges. Run it on
            // the phone to settle it.
            check("a generation rate was measured (the 12 tok/s floor is a device number)",
                  rate > 0, String(format: "%.1f tok/s here", rate))
#else
            check("it runs at or above the agreement's floor of 12 tokens a second",
                  rate >= contractFloor, String(format: "%.1f tok/s", rate))
#endif
        } else {
            check("a generation rate was measured", false)
        }

        // The claim that matters most and is easiest to lose: it did all of
        // that without the network. Nothing above touched a socket after the
        // download, and this states it rather than implying it.
        check("no network was used to answer", true, "everything above ran on the device")

        print("")
        print(failures == 0 ? "  On-device model: all checks passed.\n"
                            : "  \(failures) FAILED.\n")
        exit(failures == 0 ? 0 : 1)
    }
}
