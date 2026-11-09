import SwiftUI

/// The pack download, on its own, with everything it verified shown.
///
/// Kept after the real screens landed because it is the only place the whole
/// asset pipeline is visible at once: the identity that signed for it, the
/// digest check on every file, the real-world height each mesh was built to,
/// and the assets the renderer could not build. When something is wrong with a
/// pack this answers "where" faster than the game does.
///
///     xcrun simctl launch <device> com.djmcevents.CostQuest -devHarness 1 -gameID <id>
struct PackHarnessView: View {
    @State private var model = PackHarnessModel()

    var body: some View {
        NavigationStack {
            List {
                Section("This device") {
                    LabeledContent("Identity") {
                        Text(model.deviceKey.prefix(20) + "…")
                            .font(.system(.footnote, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                    LabeledContent("Server", value: model.serverStatus)
                    LabeledContent("Payments", value: model.paymentMode)
                }

                Section("Game") {
                    TextField("Game id", text: $model.gameID)
                        .font(.system(.footnote, design: .monospaced))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Button(model.isWorking ? "Working…" : "Join and download environment") {
                        Task { await model.joinAndFetch() }
                    }
                    .disabled(model.isWorking || model.gameID.isEmpty)
                }

                if let progress = model.progress {
                    Section("Environment") {
                        ProgressView(value: progress.fraction)
                        LabeledContent("Files",
                            value: "\(progress.filesReady) of \(progress.filesTotal)")
                        LabeledContent("Downloaded",
                            value: "\(progress.bytesReady / 1_000_000) of \(progress.bytesTotal / 1_000_000) MB")
                        if progress.rejected > 0 {
                            LabeledContent("Failed verification",
                                           value: "\(progress.rejected)")
                                .foregroundStyle(.red)
                        }
                    }
                }

                if let pack = model.pack {
                    Section("Placeable assets") {
                        ForEach(pack.placeable, id: \.name) { asset in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(asset.name)
                                Text("\(asset.cls) · \(asset.height, format: .number.precision(.fractionLength(2))) m tall · up axis \(asset.upAxis)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        if let failed = pack.manifest.failed_assets, !failed.isEmpty {
                            ForEach(failed, id: \.name) { f in
                                Text("\(f.name): not built (\(f.stage))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if let message = model.message {
                    Section { Text(message).font(.footnote) }
                }
            }
            .navigationTitle("Pack harness")
            .task {
                await model.refresh()
                if !model.gameID.isEmpty { await model.joinAndFetch() }
            }
        }
    }
}

@Observable
@MainActor
final class PackHarnessModel {
    var deviceKey = "…"
    var serverStatus = "checking"
    var paymentMode = "…"
    var gameID = UserDefaults.standard.string(forKey: "gameID") ?? ""
    var isWorking = false
    var progress: PackStore.Progress?
    var pack: ReadyPack?
    var message: String?

    private let client: GameClient
    private let packs: PackStore

    init() {
        let client = GameClient()
        self.client = client
        self.packs = PackStore(client: client)
    }

    func refresh() async {
        deviceKey = (try? await DeviceIdentity.shared.publicKeyHex()) ?? "unavailable"
        do {
            let health = try await client.health()
            serverStatus = health.status
            paymentMode = health.paymentsAreLive ? "live" : "ledger only"
        } catch {
            serverStatus = error.localizedDescription
        }
    }

    func joinAndFetch() async {
        isWorking = true
        message = nil
        pack = nil
        defer { isWorking = false }

        let id = gameID.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            _ = try? await client.join(gameID: id, handle: "dev-harness", faction: nil)
            let ready = try await packs.fetch(gameID: id) { [weak self] p in
                Task { @MainActor in self?.progress = p }
            }
            pack = ready
            message = "Verified \(ready.placeable.count) of \(ready.manifest.assets.count) assets against the manifest."
        } catch {
            message = error.localizedDescription
        }
    }
}
