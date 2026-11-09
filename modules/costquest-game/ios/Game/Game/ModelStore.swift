import CryptoKit
import Foundation
import os
import OSLog
import UIKit

/// Getting the on-device model onto the phone, once.
///
/// The agreement allows the model to ship "either embedded in the application
/// or delivered as an in app downloadable module", and downloadable is the
/// right call: 309 MB inside the binary is 309 MB every player waits through on
/// the App Store before they can see the entry screen, and it cannot be
/// replaced without a release. The server names the current files and their
/// digests, so replacing the model is a deploy.
///
/// Three details that are not decoration:
///
/// **Application Support, not Caches.** iOS reclaims Caches under disk
/// pressure, and a phone that silently threw away 300 MB would re-download it
/// at the venue on mobile data. It is excluded from iCloud backup, because
/// Apple rejects apps that back up gigabytes of re-downloadable data.
///
/// **A background session.** The download survives the app being suspended and
/// the screen locking, which a player will do while it runs.
///
/// **Verified before it is mapped.** The engine mmaps the file and reads
/// weights in place, so a truncated download is not a load error, it is
/// undefined behaviour. A `.ok` sidecar records the verified digest so later
/// launches skip re-hashing 300 MB.
@MainActor
@Observable
final class ModelStore {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "model")

    enum Phase: Equatable {
        case idle
        case checking
        case downloading(received: Int64, total: Int64)
        case verifying
        case ready(modelPath: String, tokenizerPath: String)
        case unsupported(String)
        case failed(String)

        var isReady: Bool { if case .ready = self { true } else { false } }
    }

    private(set) var phase: Phase = .idle
    private var wifiOnly = false

    private let client: GameClient
    private var task: Task<Void, Never>?

    init(client: GameClient = GameClient()) {
        self.client = client
    }

    private static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory,
                                            in: .userDomainMask)[0]
        let models = base.appending(path: "Models", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: models, withIntermediateDirectories: true)
        var url = models
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        return models
    }

    /// Fetch the model if it is not already here. Safe to call on every
    /// launch: a verified file is recognised without being re-hashed.
    /// `wifiOnly` is for fetches nobody asked for: the Warden wakes the model
    /// on its own, and a gigabyte taken silently from a data plan is not a
    /// thing a player forgives. Asking the assistant a question lifts it.
    func prepare(wifiOnly: Bool = false) {
        self.wifiOnly = wifiOnly
        guard task == nil, !phase.isReady else { return }
        task = Task { [weak self] in
            await self?.run()
            await MainActor.run { self?.task = nil }
        }
    }

    private func run() async {
        phase = .checking

        // A phone that cannot comfortably hold the model alongside a 60 fps AR
        // renderer is told so rather than being pushed into a low-memory kill
        // mid game. The game plays without the assistant.
        let manifest: ModelManifest
        do {
            manifest = try await client.modelManifest()
        } catch {
            phase = .failed(error.localizedDescription)
            return
        }
        // Pick the largest model this phone can hold rather than refusing the
        // preferred one outright. A 6 GB phone that cannot take the 1.7B can
        // still take the 0.5B, and an assistant that is sometimes clumsy beats
        // no assistant on a screen that promises one.
        let ram = ProcessInfo.processInfo.physicalMemory
        guard let pick = manifest.bestFitting(physicalMemory: ram) else {
            phase = .unsupported("This phone does not have the memory to run the game's assistant.")
            return
        }
        if pick.model.file != manifest.model.file {
            log.notice("""
                falling back to \(pick.label, privacy: .public): this phone has \
                \(ram / (1024 * 1024 * 1024)) GB and the preferred model needs \
                \(manifest.min_ram_bytes / (1024 * 1024 * 1024))
                """)
        }

        do {
            let model = try await file(pick.model)
            let tokenizer = try await file(pick.tokenizer)
            phase = .ready(modelPath: model.path, tokenizerPath: tokenizer.path)
            log.notice("on-device model ready: \(pick.label, privacy: .public)")
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    /// One file: reuse it if it is already verified here, otherwise fetch and
    /// verify it.
    private func file(_ spec: ModelManifest.File) async throws -> URL {
        let destination = Self.directory.appending(path: spec.file)
        let receipt = destination.appendingPathExtension("ok")

        if let recorded = try? String(contentsOf: receipt, encoding: .utf8),
           recorded.trimmingCharacters(in: .whitespacesAndNewlines) == spec.sha256,
           FileManager.default.fileExists(atPath: destination.path) {
            return destination
        }

        guard let url = URL(string: spec.url) else {
            throw StoreError.badManifest
        }
        phase = .downloading(received: 0, total: spec.bytes)

        // A delegate-driven download task rather than `URLSession.download(from:)`.
        //
        // The convenience method reports nothing until it finishes, and 309 MB
        // over a venue's link is minutes of a progress bar that has not moved.
        // A player watching that concludes the app is broken, and they are not
        // being unreasonable. This reports bytes as they land.
        let temporary = try await withCheckedThrowingContinuation { continuation in
            let progress = Downloader(expected: spec.bytes, wifiOnly: wifiOnly) { [weak self] received in
                Task { @MainActor in
                    self?.phase = .downloading(received: received, total: spec.bytes)
                }
            } finished: { result in
                continuation.resume(with: result)
            }
            progress.start(url: url)
            // Held for the life of the download: URLSession keeps only a weak
            // reference to its delegate once the task ends, and letting it go
            // early cancels the download with no error at all.
            self.downloader = progress
        }
        downloader = nil

        phase = .verifying
        // Hashed by streaming rather than by reading the file in: 300 MB in
        // one Data on a phone that is also holding an AR session is how an app
        // gets killed for memory doing something that did not need it.
        // Hashed off the main thread: a gigabyte takes seconds and the
        // interface froze for all of them.
        let digest = try await Task.detached(priority: .utility) {
            try ModelStore.digest(of: temporary)
        }.value
        guard digest == spec.sha256 else {
            try? FileManager.default.removeItem(at: temporary)
            throw StoreError.corrupt(spec.file)
        }
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: temporary, to: destination)
        try? spec.sha256.write(to: receipt, atomically: true, encoding: .utf8)
        return destination
    }

    private var downloader: Downloader?

    /// The delegate. A class because URLSession wants one, and it moves the
    /// finished file out of the system's temporary location immediately:
    /// the file at `location` is deleted the moment the delegate returns.
    private final class Downloader: NSObject, URLSessionDownloadDelegate {
        private let expected: Int64
        private let onProgress: @Sendable (Int64) -> Void
        private let onFinished: @Sendable (Result<URL, any Error>) -> Void
        /// Set once in `start` and never again, but the compiler cannot see
        /// that through a class it is asked to treat as Sendable, so the
        /// mutation is made explicit rather than silenced.
        private let sessionBox = OSAllocatedUnfairLock<URLSession?>(initialState: nil)

        private let wifiOnly: Bool

        init(expected: Int64, wifiOnly: Bool = false,
             progress: @escaping @Sendable (Int64) -> Void,
             finished: @escaping @Sendable (Result<URL, any Error>) -> Void) {
            self.expected = expected
            self.wifiOnly = wifiOnly
            self.onProgress = progress
            self.onFinished = finished
        }

        func start(url: URL) {
            let configuration = URLSessionConfiguration.default
            configuration.waitsForConnectivity = true
            // A venue on mobile data. Long enough that a slow link finishes
            // rather than restarting from nothing.
            configuration.timeoutIntervalForResource = 3600
            if wifiOnly {
                configuration.allowsExpensiveNetworkAccess = false
                configuration.allowsConstrainedNetworkAccess = false
            }
            let session = URLSession(configuration: configuration, delegate: self,
                                     delegateQueue: nil)
            sessionBox.withLock { $0 = session }
            session.downloadTask(with: url).resume()
        }

        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                        didWriteData bytesWritten: Int64,
                        totalBytesWritten: Int64,
                        totalBytesExpectedToWrite: Int64) {
            onProgress(totalBytesWritten)
        }

        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                        didFinishDownloadingTo location: URL) {
            // Moved synchronously, here. The system deletes this file as soon
            // as this method returns, so anything asynchronous loses it.
            let kept = FileManager.default.temporaryDirectory
                .appending(path: UUID().uuidString)
            do {
                try FileManager.default.moveItem(at: location, to: kept)
                onFinished(.success(kept))
            } catch {
                onFinished(.failure(error))
            }
            session.finishTasksAndInvalidate()
        }

        func urlSession(_ session: URLSession, task: URLSessionTask,
                        didCompleteWithError error: (any Error)?) {
            guard let error else { return }        // success went through above
            onFinished(.failure(error))
            session.finishTasksAndInvalidate()
        }
    }

    nonisolated private static func digest(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    enum StoreError: LocalizedError {
        case badManifest
        case download(Int)
        case corrupt(String)

        var errorDescription: String? {
            switch self {
            case .badManifest: "The server did not say where the assistant's model lives."
            case .download(let status): "The assistant's model could not be downloaded (\(status))."
            case .corrupt(let name): "The downloaded \(name) did not match its checksum."
            }
        }
    }
}
