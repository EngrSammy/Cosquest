import CryptoKit
import Foundation

/// Two phones, one file each, and no server.
///
/// The mesh is the part of this client that cannot be tested from one device,
/// and it is also the part most likely to be quietly broken: a missing Bonjour
/// service type in Info.plist, a pre-shared key that does not match, a length
/// prefix read the wrong way round. Every one of those fails as silence rather
/// than as an error, so the test has to be two processes that actually find
/// each other.
///
/// Symmetric on purpose: both instances hold a blob nobody else has, both
/// announce it, both ask for what they hear about. If each ends up holding the
/// other's blob with a matching digest, then discovery, the handshake, framing,
/// chunking and reassembly are all working.
///
///     xcrun simctl launch --console-pty <A> com.djmcevents.CostQuest -meshTest 1
///     xcrun simctl launch --console-pty <B> com.djmcevents.CostQuest -meshTest 1
enum MeshSelfTest {

    /// Larger than the 32 KB frame cap, so reassembly is exercised rather than
    /// skipped. A pack file is single-digit megabytes; this is the same shape
    /// of problem at a size that finishes quickly.
    private static let blobSize = 200 * 1024

    @MainActor
    static func run() async {
        print("\n=== CostQuest mesh, two devices ===\n")

        let identity = (try? await DeviceIdentity.shared.publicKeyHex()) ?? UUID().uuidString
        let mine = blob(for: identity)
        let myDigest = digest(of: mine)
        print("  this device \(identity.prefix(12))")
        print("  serving \(mine.count / 1024) KB as \(myDigest.prefix(16))\n")

        let mesh = PeerMesh(gameID: "mesh-self-test", deviceKey: identity)

        // Bytes that arrived. Checked against the digest that was asked for,
        // because that check is the entire reason taking a file from a
        // stranger's phone is safe.
        actor Received {
            var items: [String: Data] = [:]
            func add(_ digest: String, _ data: Data) { items[digest] = data }
            var count: Int { items.count }
            func all() -> [String: Data] { items }
        }
        let received = Received()

        await mesh.setOnWant { [mesh] peer, digests in
            for wanted in digests where wanted == myDigest {
                await mesh.serve(digest: wanted, bytes: mine, to: peer)
            }
        }
        await mesh.setOnTile { digest, bytes in
            await received.add(digest, bytes)
        }
        await mesh.setOnInventory { [mesh] _, digests in
            let unknown = digests.filter { $0 != myDigest }
            guard !unknown.isEmpty else { return }
            print("  a peer says it holds \(unknown.count) file(s); asking")
            await mesh.request(unknown)
        }

        await mesh.start()

        // Announced repeatedly rather than once: the two instances are started
        // by hand a few seconds apart, and the one that started first would
        // otherwise have announced to an empty room.
        //
        // Runs the whole window rather than stopping at first success. The
        // first version stopped as soon as this side had what it wanted, which
        // tore the mesh down under the other side and failed it: an exchange
        // that had in fact worked perfectly looked like a discovery failure on
        // one of the two devices.
        var peers = 0
        for tick in 0..<25 {
            await mesh.announce(holding: [myDigest])
            peers = max(peers, await mesh.peerCount)
            let got = await received.count
            if tick % 4 == 0 {
                print("  \(tick)s  peers \(peers)  files received \(got)")
            }
            try? await Task.sleep(for: .seconds(1))
        }

        print("")
        // Names rather than a counter: the compiler cannot see a nested
        // function mutating a captured Int, and reports the failure branch as
        // unreachable. Collecting names is what the other self tests do anyway,
        // and it says which check failed rather than how many.
        var failures: [String] = []
        func check(_ name: String, _ ok: Bool, _ detail: String = "") {
            print("  \(ok ? "PASS" : "FAIL")  \(name)\(detail.isEmpty ? "" : "  " + detail)")
            if !ok { failures.append(name) }
        }

        check("another device was found over Bonjour", peers > 0, "\(peers) peer(s)")
        let got = await received.all()
        check("a file arrived from that device", !got.isEmpty, "\(got.count) file(s)")
        for (claimed, bytes) in got {
            check("the bytes match the digest they were sent under",
                  digest(of: bytes) == claimed,
                  "\(bytes.count / 1024) KB")
            check("the file survived being split across frames",
                  bytes.count == blobSize)
        }

        print("")
        if failures.isEmpty {
            print("  Mesh: all checks passed.\n")
        } else {
            print("  \(failures.count) FAILED: \(failures.joined(separator: ", "))\n")
        }
        await mesh.stop()
        exit(failures.isEmpty ? 0 : 1)
    }

    /// A blob unique to a device and reproducible from its key, so the two
    /// instances hold different files without having to agree on anything.
    private static func blob(for identity: String) -> Data {
        var out = Data(capacity: blobSize)
        var seed = SHA256.hash(data: Data(identity.utf8)).withUnsafeBytes {
            $0.load(as: UInt64.self)
        }
        while out.count < blobSize {
            seed &+= 0x9E3779B97F4A7C15
            var z = seed
            z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
            z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
            withUnsafeBytes(of: (z ^ (z >> 31)).littleEndian) { out.append(contentsOf: $0) }
        }
        return out
    }

    private static func digest(of data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
