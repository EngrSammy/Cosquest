import CryptoKit
import Foundation
import OSLog

// The Forge catalogue: the weapons, characters and environments the Forge
// portal has published, as the game reads them.
//
// GET v1/catalogue is public and unsigned: it is the same for everyone, so it
// carries an ETag and an unchanged catalogue answers 304 with no body (see
// costquest-backend app/forge.py, `catalogue`). Files are served per
// (element, version) and a version never changes, so a verified file on disk
// is good for ever and never fetched twice.
//
// This file is Foundation only, so Tests/ForgeCatalogueCheck.swift can compile
// it on its own and drive it with a stub network. The model the screens read
// is in Features/ForgeFeature.swift.
//
// Read only. Nothing here writes to the server: a Forge weapon is shown to the
// player as a published item, labelled as coming from the Forge, and is not
// granted, equipped or traded.

// MARK: - Flag

enum ForgeFlags {
    /// On by default. `-forgeCatalogue NO` at launch turns it off for that run;
    /// the stored `cq.forgeCatalogue` key turns it off until it is set back.
    static let key = "cq.forgeCatalogue"
    static let launchArgument = "forgeCatalogue"

    static func catalogueEnabled(_ defaults: UserDefaults = .standard) -> Bool {
        // A launch argument lands in the argument domain, which outranks the
        // app's own domain, so `-forgeCatalogue NO` wins over a stored YES.
        if defaults.object(forKey: launchArgument) != nil { return defaults.bool(forKey: launchArgument) }
        if defaults.object(forKey: key) != nil { return defaults.bool(forKey: key) }
        return true
    }
}

// MARK: - Wire

struct ForgeElement: Codable, Sendable, Hashable, Identifiable {
    let id: String
    /// weapon | character | environment
    let type: String
    let name: String
    var realm: String?
    /// common | rare | epic | legendary
    var rarity: String?
    var role: String?
    var rigged: Bool?
    let version: Int
    var published_at: String?
    var stats: Stats?
    var sockets: [String: [Double]]?
    var bounds_m: [[Double]]?
    var files: [File]
    var thumbnail: Thumbnail?

    struct Stats: Codable, Sendable, Hashable {
        var damage: Double?
        var range_m: Double?
        var cooldown_s: Double?
    }

    struct File: Codable, Sendable, Hashable {
        let file: String
        var lod: Int?
        var bytes: Int?
        var sha256: String?
        let url: String
    }

    struct Thumbnail: Codable, Sendable, Hashable {
        let file: String
        var sha256: String?
        let url: String
    }

    enum CodingKeys: String, CodingKey {
        case id, type, name, realm, rarity, role, rigged, version, published_at
        case stats, sockets, bounds_m, files, thumbnail
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(String.self, forKey: .type)
        name = try c.decode(String.self, forKey: .name)
        version = try c.decode(Int.self, forKey: .version)
        // Everything else is optional and tolerant: one odd field in a new
        // server build must not empty the whole catalogue.
        realm = try? c.decodeIfPresent(String.self, forKey: .realm)
        rarity = try? c.decodeIfPresent(String.self, forKey: .rarity)
        role = try? c.decodeIfPresent(String.self, forKey: .role)
        rigged = try? c.decodeIfPresent(Bool.self, forKey: .rigged)
        published_at = try? c.decodeIfPresent(String.self, forKey: .published_at)
        stats = try? c.decodeIfPresent(Stats.self, forKey: .stats)
        sockets = try? c.decodeIfPresent([String: [Double]].self, forKey: .sockets)
        bounds_m = try? c.decodeIfPresent([[Double]].self, forKey: .bounds_m)
        files = (try? c.decodeIfPresent([File].self, forKey: .files)) ?? []
        thumbnail = try? c.decodeIfPresent(Thumbnail.self, forKey: .thumbnail)
    }

    var isWeapon: Bool { type == "weapon" }

    /// The file the game shows: the lowest level of detail (lod0, the full
    /// mesh, is the one a close-up preview wants), USDZ preferred over glTF
    /// when a build has both, because RealityKit opens USDZ itself.
    var previewFile: File? {
        let usable = files.filter { $0.file.hasSuffix(".usdz") || $0.file.hasSuffix(".glb") }
        guard let lowest = usable.map({ $0.lod ?? 0 }).min() else { return nil }
        let atLowest = usable.filter { ($0.lod ?? 0) == lowest }
        return atLowest.first { $0.file.hasSuffix(".usdz") } ?? atLowest.first
    }
}

struct ForgeCatalogueBody: Codable, Sendable {
    let elements: [ForgeElement]

    init(elements: [ForgeElement]) { self.elements = elements }

    init(from decoder: Decoder) throws {
        // Decode element by element and drop the ones that do not parse,
        // rather than losing every weapon to one malformed character.
        struct Lenient: Decodable { let element: ForgeElement?
            init(from decoder: Decoder) throws { element = try? ForgeElement(from: decoder) } }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        elements = try c.decode([Lenient].self, forKey: .elements).compactMap(\.element)
    }

    enum CodingKeys: String, CodingKey { case elements }
}

// MARK: - Store

/// Fetches the catalogue, keeps it on disk with its ETag, and brings the
/// published weapons' models onto the device.
actor ForgeCatalogueStore {

    /// The network, injectable so the tests can play a server.
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

    enum Source: String, Sendable {
        /// A fresh 200 from the server.
        case network
        /// 304: the server confirmed the copy on disk.
        case notModified
        /// The server could not be reached; the copy on disk was used.
        case cache
        /// 404: this server has no catalogue (a build older than the Forge).
        case unavailable
        /// Nothing on disk and nothing from the server.
        case none
    }

    struct Snapshot: Sendable {
        let elements: [ForgeElement]
        let source: Source
        var weapons: [ForgeElement] { elements.filter(\.isWeapon) }
        /// Whether the server spoke for this catalogue just now, so files of
        /// elements it no longer lists can be dropped.
        var isAuthoritative: Bool { source == .network || source == .notModified }
    }

    private let baseURL: URL
    private let transport: Transport
    private let catalogueDir: URL
    private let filesDir: URL
    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "forge")
    /// Larger than any model the Forge makes today by two orders of
    /// magnitude; a bigger file is a mistake, not a weapon.
    private let maxFileBytes = 64 * 1024 * 1024

    /// - Parameters:
    ///   - root: where to keep things. Nil puts the catalogue in Application
    ///     Support (small, and what the game needs offline) and the models in
    ///     Caches (reproducible, so the system may reclaim them).
    init(baseURL: URL, root: URL? = nil, transport: Transport? = nil) {
        self.baseURL = baseURL
        // Kept apart per server, so a staging catalogue never shows in a
        // production build pointed back at production.
        let host = (baseURL.host ?? "server") + (baseURL.port.map { "_\($0)" } ?? "")
        let fm = FileManager.default
        if let root {
            catalogueDir = root.appending(path: "catalogue/\(host)", directoryHint: .isDirectory)
            filesDir = root.appending(path: "files/\(host)", directoryHint: .isDirectory)
        } else {
            let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            let caches = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            catalogueDir = support.appending(path: "forge/\(host)", directoryHint: .isDirectory)
            filesDir = caches.appending(path: "forge/\(host)", directoryHint: .isDirectory)
        }
        self.transport = transport ?? Self.urlSessionTransport
        try? fm.createDirectory(at: catalogueDir, withIntermediateDirectories: true)
        try? fm.createDirectory(at: filesDir, withIntermediateDirectories: true)
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 120
        // The ETag is handled here, against our own copy on disk. URLCache
        // answering a conditional request itself would hide the 304.
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        return URLSession(configuration: config)
    }()

    private static let urlSessionTransport: Transport = { request in
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }

    // MARK: Catalogue

    private var bodyURL: URL { catalogueDir.appending(path: "catalogue.json") }
    private var etagURL: URL { catalogueDir.appending(path: "catalogue.etag") }

    private func cached() -> ForgeCatalogueBody? {
        guard let data = try? Data(contentsOf: bodyURL) else { return nil }
        return try? JSONDecoder().decode(ForgeCatalogueBody.self, from: data)
    }

    private func cachedETag() -> String? {
        guard let s = try? String(contentsOf: etagURL, encoding: .utf8), !s.isEmpty else { return nil }
        return s
    }

    /// The catalogue, from the server when it answers and from disk when it
    /// does not. Never throws: a game screen that cannot get the catalogue
    /// simply shows no Forge items.
    func refresh() async -> Snapshot {
        await refresh(conditional: true)
    }

    private func refresh(conditional: Bool) async -> Snapshot {
        var request = URLRequest(url: baseURL.appending(path: "v1/catalogue"))
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let disk = cached()
        if conditional, disk != nil, let etag = cachedETag() {
            request.setValue(etag, forHTTPHeaderField: "If-None-Match")
        }
        do {
            let (data, http) = try await transport(request)
            switch http.statusCode {
            case 200:
                let body = try JSONDecoder().decode(ForgeCatalogueBody.self, from: data)
                try? data.write(to: bodyURL, options: .atomic)
                if let etag = http.value(forHTTPHeaderField: "ETag") {
                    try? Data(etag.utf8).write(to: etagURL, options: .atomic)
                } else {
                    try? FileManager.default.removeItem(at: etagURL)
                }
                return Snapshot(elements: body.elements, source: .network)
            case 304:
                if let disk { return Snapshot(elements: disk.elements, source: .notModified) }
                // A 304 with nothing to show for it: ask again, unconditionally.
                return conditional ? await refresh(conditional: false)
                                   : Snapshot(elements: [], source: .none)
            case 404:
                // A server from before the Forge. Not an error worth a word.
                return Snapshot(elements: [], source: .unavailable)
            default:
                log.notice("catalogue answered \(http.statusCode)")
            }
        } catch {
            log.notice("catalogue unreachable: \(error.localizedDescription)")
        }
        if let disk { return Snapshot(elements: disk.elements, source: .cache) }
        return Snapshot(elements: [], source: .none)
    }

    // MARK: Files

    private func location(_ element: ForgeElement, _ file: String) -> URL {
        filesDir
            .appending(path: Self.component(element.id), directoryHint: .isDirectory)
            .appending(path: String(element.version), directoryHint: .isDirectory)
            // The name arrives over the wire: reduce it to a bare component
            // before it is used as a path.
            .appending(path: Self.component(file))
    }

    private static func component(_ s: String) -> String {
        let c = URL(fileURLWithPath: s).lastPathComponent
        return c.isEmpty || c == ".." || c == "." ? "_" : c
    }

    private func absolute(_ url: String) -> URL? {
        if url.hasPrefix("http://") || url.hasPrefix("https://") { return URL(string: url) }
        let path = url.hasPrefix("/") ? String(url.dropFirst()) : url
        return baseURL.appending(path: path)
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private func verified(_ url: URL, _ expected: String?) -> Bool {
        guard let data = try? Data(contentsOf: url) else { return false }
        guard let expected else { return true }
        return Self.sha256(data) == expected.lowercased()
    }

    /// The model on disk for an element, if it has been fetched and verified.
    func localModel(for element: ForgeElement) -> URL? {
        guard let f = element.previewFile else { return nil }
        let url = location(element, f.file)
        return verified(url, f.sha256) ? url : nil
    }

    struct SyncReport: Sendable {
        var models: [String: URL] = [:]
        var downloaded = 0
        var alreadyHad = 0
        var rejected = 0
        var failed = 0
        var pruned = 0
    }

    /// Bring every weapon's preview model onto the device. Files already on
    /// disk and matching their digest are kept; a download that does not
    /// match its digest is thrown away and never shown.
    func syncWeapons(_ snapshot: Snapshot) async -> SyncReport {
        var report = SyncReport()
        let fm = FileManager.default
        for element in snapshot.weapons {
            guard let f = element.previewFile else { continue }
            let dest = location(element, f.file)
            if verified(dest, f.sha256) {
                report.models[element.id] = dest
                report.alreadyHad += 1
                continue
            }
            if let bytes = f.bytes, bytes > maxFileBytes { report.failed += 1; continue }
            guard let url = absolute(f.url) else { report.failed += 1; continue }
            do {
                let (data, http) = try await transport(URLRequest(url: url))
                guard http.statusCode == 200, data.count <= maxFileBytes else {
                    report.failed += 1
                    continue
                }
                if let expected = f.sha256, Self.sha256(data) != expected.lowercased() {
                    log.error("forge \(element.name) v\(element.version) \(f.file): digest mismatch, discarded")
                    report.rejected += 1
                    continue
                }
                try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
                try data.write(to: dest, options: .atomic)
                report.models[element.id] = dest
                report.downloaded += 1
            } catch {
                report.failed += 1
            }
        }
        if snapshot.isAuthoritative { report.pruned = prune(keeping: snapshot.weapons) }
        return report
    }

    /// Drop versions the catalogue has moved past, and elements it no longer
    /// lists. Only after the server has spoken: offline, or on a 404, what is
    /// on disk is all there is and it stays.
    private func prune(keeping weapons: [ForgeElement]) -> Int {
        let fm = FileManager.default
        let live = Dictionary(weapons.map { (Self.component($0.id), String($0.version)) },
                              uniquingKeysWith: { a, _ in a })
        var removed = 0
        guard let ids = try? fm.contentsOfDirectory(atPath: filesDir.path) else { return 0 }
        for id in ids where !id.hasPrefix(".") {
            let dir = filesDir.appending(path: id, directoryHint: .isDirectory)
            guard let keep = live[id] else {
                if (try? fm.removeItem(at: dir)) != nil { removed += 1 }
                continue
            }
            for v in (try? fm.contentsOfDirectory(atPath: dir.path)) ?? [] where v != keep && !v.hasPrefix(".") {
                if (try? fm.removeItem(at: dir.appending(path: v))) != nil { removed += 1 }
            }
        }
        return removed
    }
}
