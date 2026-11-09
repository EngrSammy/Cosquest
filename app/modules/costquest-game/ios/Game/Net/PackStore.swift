import CryptoKit
import Foundation
import OSLog

/// Gets a game's environment onto the device and keeps it there.
///
/// Three things this has to get right, and they are the reasons it is not just
/// a loop over `URLSession.download`:
///
/// **Every file is verified.** The manifest publishes a sha256 per file and
/// that digest is the contract. It is checked whether the bytes came from the
/// server or from a phone standing next to us, because tile sharing means we
/// will accept bytes from a stranger's device and a peer that lies has to fail
/// here rather than in the renderer.
///
/// **A pack version never changes.** Approving an edit writes a new version
/// directory on the server, so a file identified by (pack, version, name) is
/// immutable and can be cached for ever with no invalidation. That is what
/// makes arriving at a venue for the second time instant.
///
/// **A venue is a bad network.** Downloads are bounded and resumable in the
/// sense that anything already verified on disk is never fetched again, so a
/// player who loses signal half way through picks up where they stopped rather
/// than starting over.
actor PackStore {

    private let client: GameClient
    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "pack")

    /// How many files to pull at once. The server is one hop away over TLS and
    /// the files are small; four keeps the pipe full without turning a venue's
    /// worth of phones into a thundering herd.
    private let concurrency = 4

    /// The last manifest fetched, so a digest can be turned back into a file.
    /// The mesh asks for files by digest and knows nothing about names.
    private var manifest: PackManifest?

    /// Nearby phones, when the mesh is up. Optional because the pack has to
    /// download with no mesh at all, which is the case for the first player to
    /// arrive at a venue.
    private weak var peers: PeerMesh?

    init(client: GameClient) {
        self.client = client
    }

    func use(peers: PeerMesh) {
        self.peers = peers
    }

    // MARK: - Where files live

    /// Caches directory, not Documents: this is reproducible data that the
    /// server can serve again, so the system is welcome to reclaim it under
    /// storage pressure rather than us holding a player's phone hostage.
    private static var root: URL {
        let base = FileManager.default.urls(for: .cachesDirectory,
                                            in: .userDomainMask)[0]
        return base.appending(path: "packs", directoryHint: .isDirectory)
    }

    private func location(pack: String, version: String, file: String) -> URL {
        Self.root
            .appending(path: pack, directoryHint: .isDirectory)
            .appending(path: version, directoryHint: .isDirectory)
            // The name comes from a manifest we generated, but it arrives over
            // the wire, so it is reduced to a bare component before it is used
            // as a path.
            .appending(path: URL(fileURLWithPath: file).lastPathComponent)
    }

    // MARK: - Progress

    struct Progress: Sendable, Equatable {
        var filesTotal = 0
        var filesReady = 0
        var bytesTotal = 0
        var bytesReady = 0
        /// Files that arrived but failed their digest. Non-zero means either a
        /// corrupted transfer or a peer that lied; both are retried from the
        /// server.
        var rejected = 0

        var fraction: Double {
            bytesTotal > 0 ? Double(bytesReady) / Double(bytesTotal) : 0
        }
        var isComplete: Bool { filesTotal > 0 && filesReady == filesTotal }
    }

    // MARK: - Fetching

    /// Bring a game's whole environment onto the device.
    ///
    /// `onProgress` fires on every file so the UI can show something moving;
    /// a player staring at a still screen assumes it has hung.
    func fetch(gameID: String,
               onProgress: @Sendable @escaping (Progress) -> Void = { _ in }
    ) async throws -> ReadyPack {

        let manifest = try await client.packManifest(gameID: gameID)
        self.manifest = manifest

        if let failed = manifest.failed_assets, !failed.isEmpty {
            // Not an error. The renderer names what it could not build rather
            // than returning a quietly thinner pack, and the game is played
            // with what exists.
            log.notice("pack \(manifest.pack_id) is missing \(failed.count) asset(s): \(failed.map(\.name).joined(separator: ", "))")
        }

        let wanted = manifest.assets.flatMap { asset in
            asset.files.map { (asset: asset, file: $0) }
        }
        var progress = Progress(filesTotal: wanted.count,
                                bytesTotal: wanted.reduce(0) { $0 + $1.file.bytes })

        // Anything already on disk AND verified is done. Verifying rather than
        // trusting the filename is what makes a half-written file from a
        // killed download self-healing.
        var missing: [(asset: PackManifest.Asset, file: PackManifest.File)] = []
        for item in wanted {
            let url = location(pack: manifest.pack_id, version: manifest.version,
                               file: item.file.file)
            if verified(at: url, against: item.file.sha256) {
                progress.filesReady += 1
                progress.bytesReady += item.file.bytes
            } else {
                missing.append(item)
            }
        }
        onProgress(progress)

        if !missing.isEmpty {
            try FileManager.default.createDirectory(
                at: location(pack: manifest.pack_id, version: manifest.version,
                             file: "x").deletingLastPathComponent(),
                withIntermediateDirectories: true)
        }

        // Ask the phones standing next to us first.
        //
        // This is the whole point of the mesh: two hundred players pulling the
        // same twenty-eight megabytes through one cell is the load pattern that
        // ruins an event, and the player beside you already has the file. The
        // wait is deliberately short and the result is not depended on. If the
        // neighbours deliver, the loop below finds the files already verified
        // on disk and skips them; if they do not, nothing has been lost but two
        // seconds that were going to be spent downloading anyway.
        if let peers, !missing.isEmpty {
            await peers.request(missing.map(\.file.sha256))
            try? await Task.sleep(for: .seconds(2))
            let before = missing.count
            missing = missing.filter { item in
                !verified(at: location(pack: manifest.pack_id, version: manifest.version,
                                       file: item.file.file),
                          against: item.file.sha256)
            }
            let arrived = before - missing.count
            if arrived > 0 {
                log.notice("took \(arrived) file(s) from nearby players instead of the server")
                // Recounted from disk rather than accumulated, so the bar can
                // never disagree with what is actually there.
                progress.filesReady = wanted.count - missing.count
                progress.bytesReady = wanted.reduce(0) { total, item in
                    let url = location(pack: manifest.pack_id, version: manifest.version,
                                       file: item.file.file)
                    return verified(at: url, against: item.file.sha256)
                        ? total + item.file.bytes : total
                }
                onProgress(progress)
            }
        }

        // Bounded parallelism. A task group with everything in it would open a
        // connection per file and, on a venue's network, finish slower than
        // four at a time.
        var cursor = 0
        try await withThrowingTaskGroup(of: (PackManifest.File, Bool).self) { group in
            func addNext() {
                guard cursor < missing.count else { return }
                let item = missing[cursor]
                cursor += 1
                group.addTask { [self] in
                    let ok = try await download(gameID: gameID, manifest: manifest,
                                                file: item.file)
                    return (item.file, ok)
                }
            }
            for _ in 0..<min(concurrency, missing.count) { addNext() }

            while let (file, ok) = try await group.next() {
                if ok {
                    progress.filesReady += 1
                    progress.bytesReady += file.bytes
                } else {
                    progress.rejected += 1
                }
                onProgress(progress)
                addNext()
            }
        }

        // Tell the server what we hold, so the players around us can take these
        // files off our phone instead of the network.
        let held = wanted.compactMap { item -> String? in
            let url = location(pack: manifest.pack_id, version: manifest.version,
                               file: item.file.file)
            return FileManager.default.fileExists(atPath: url.path) ? item.file.sha256 : nil
        }
        try? await client.announceTiles(gameID: gameID, holding: held)

        return ReadyPack(manifest: manifest, directory: location(
            pack: manifest.pack_id, version: manifest.version, file: "x")
            .deletingLastPathComponent())
    }

    /// One file, verified before it is kept. Returns false if the bytes did
    /// not match, which the caller counts rather than throwing on: one bad
    /// file should not lose the pack.
    private func download(gameID: String, manifest: PackManifest,
                          file: PackManifest.File) async throws -> Bool {
        let data = try await client.packFile(gameID: gameID,
                                             version: manifest.version,
                                             filename: file.file)
        guard digest(of: data) == file.sha256 else {
            log.error("digest mismatch on \(file.file); discarding")
            return false
        }
        let url = location(pack: manifest.pack_id, version: manifest.version,
                           file: file.file)
        // Written beside and moved into place, so a reader never sees a
        // half-written asset and a kill mid-write leaves nothing to mistake
        // for a complete file.
        let temp = url.appendingPathExtension("part")
        try data.write(to: temp, options: .atomic)
        try? FileManager.default.removeItem(at: url)
        try FileManager.default.moveItem(at: temp, to: url)
        return true
    }

    // MARK: - Verification

    private func digest(of data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// Whether the file on disk really is the file the manifest names.
    ///
    /// Read into memory to hash: pack files are single-digit megabytes, the
    /// largest seen is 2.4 MB, and streaming would trade clarity for nothing.
    /// If assets ever get large this becomes a streaming hash.
    private func verified(at url: URL, against expected: String) -> Bool {
        guard let data = try? Data(contentsOf: url, options: .mappedIfSafe) else {
            return false
        }
        return digest(of: data) == expected
    }

    /// The bytes behind a digest, for serving to a neighbour.
    ///
    /// Verified before it is handed over, not merely read. A file that has been
    /// corrupted on this device would otherwise be passed to every phone in the
    /// venue, each of which would reject it and fall back to the server: one
    /// bad file on one phone turning into the load the mesh exists to avoid.
    func data(forDigest digest: String) -> Data? {
        guard let manifest,
              let file = manifest.assets.flatMap(\.files).first(where: { $0.sha256 == digest })
        else { return nil }
        let url = location(pack: manifest.pack_id, version: manifest.version,
                           file: file.file)
        guard let data = try? Data(contentsOf: url), self.digest(of: data) == digest
        else { return nil }
        return data
    }

    /// Take bytes a neighbour sent, identified only by digest.
    ///
    /// The digest is the whole contract. A peer that sends something else fails
    /// here, we fall back to the server, and nothing is lost but a moment. That
    /// is what makes accepting a file from a stranger's phone reasonable at all.
    @discardableResult
    func accept(peerBytes: Data, forDigest digest: String) -> Bool {
        guard let manifest,
              let file = manifest.assets.flatMap(\.files).first(where: { $0.sha256 == digest })
        else { return false }
        return (try? accept(peerBytes: peerBytes, for: file,
                            pack: manifest.pack_id, version: manifest.version)) ?? false
    }

    /// Everything this device holds and can serve, for announcing to the mesh.
    func servableDigests() -> [String] {
        guard let manifest else { return [] }
        return manifest.assets.flatMap(\.files).compactMap { file in
            verified(at: location(pack: manifest.pack_id, version: manifest.version,
                                  file: file.file), against: file.sha256)
                ? file.sha256 : nil
        }
    }

    /// Accept bytes handed over by a nearby player. The digest is the whole
    /// reason this is safe: a peer that sends something else fails here and we
    /// fall back to the server, having lost nothing but a moment.
    func accept(peerBytes: Data, for file: PackManifest.File,
                pack: String, version: String) throws -> Bool {
        guard digest(of: peerBytes) == file.sha256 else { return false }
        let url = location(pack: pack, version: version, file: file.file)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try peerBytes.write(to: url, options: .atomic)
        return true
    }

    /// Which of these digests we do not have, so the mesh knows what to ask
    /// its neighbours for.
    func missingDigests(from manifest: PackManifest) -> [String] {
        manifest.assets.flatMap(\.files).compactMap { file in
            let url = location(pack: manifest.pack_id, version: manifest.version,
                               file: file.file)
            return verified(at: url, against: file.sha256) ? nil : file.sha256
        }
    }
}

/// A pack that is on the device and verified, and where to find its files.
struct ReadyPack: Sendable {
    let manifest: PackManifest
    let directory: URL

    /// The file to load for an asset at a level of detail, or nil if that one
    /// did not make it onto the device.
    func url(for asset: PackManifest.Asset, lod: Int) -> URL? {
        guard let file = asset.file(lod: lod) else { return nil }
        let url = directory.appending(path: file.file)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Assets with at least their nearest level of detail present. An asset
    /// whose files did not arrive is skipped rather than placed as a hole.
    var placeable: [PackManifest.Asset] {
        manifest.assets.filter { url(for: $0, lod: 0) != nil }
    }
}
