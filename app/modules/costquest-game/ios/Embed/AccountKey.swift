import CryptoKit
import Foundation
import Security
import Synchronization

/// The CosQuest account's game player key, from one login
/// (POST /v1/sso/cosquest on the game backend, see GameSSO).
///
/// The game signs every request with an Ed25519 key. Standalone, that is a
/// key made on the phone and kept there (DeviceIdentity). Signed in through
/// CosQuest, it is the account's key instead, so the same person is the same
/// player on any phone they sign in on; patches/0003 makes DeviceIdentity ask
/// here first. Kept in the Keychain (this device only, never in a backup) so
/// the game starts as the right player before the network answers.
///
/// Read from DeviceIdentity's actor and written from the main actor, so the
/// state sits behind a Mutex rather than on either.
final class AccountKey: Sendable {
    static let shared = AccountKey()

    private struct State {
        var seed: Data?
        var subject: String?
        var nonceFloor: Int = 0
        var loaded = false
    }

    private let state = Mutex(State())
    private static let keychainAccount = "com.cosquest.game.accountkey"
    /// The Keychain outlives deleting the app; UserDefaults does not. A saved
    /// key without this flag belongs to an earlier install and is dropped.
    private static let savedFlag = "cq.accountKey.saved"

    private init() {}

    /// The account's signing key, or nil to sign as this phone.
    var privateKey: Curve25519.Signing.PrivateKey? {
        guard let seed = state.withLock({ $0.seed }) else { return nil }
        return try? Curve25519.Signing.PrivateKey(rawRepresentation: seed)
    }

    var nonceFloor: Int { state.withLock { $0.nonceFloor } }

    var subject: String? { state.withLock { $0.subject } }

    /// The saved key, once per process, before the first request is signed.
    func loadSaved() {
        let already = state.withLock { s -> Bool in
            defer { s.loaded = true }
            return s.loaded
        }
        guard !already else { return }
        guard UserDefaults.standard.bool(forKey: Self.savedFlag) else {
            Self.delete()
            return
        }
        guard let saved = Self.read() else { return }
        state.withLock { s in
            if s.seed == nil {
                s.seed = saved.seed
                s.subject = saved.subject
                s.nonceFloor = saved.nonceFloor
            }
        }
    }

    /// Install the account's key. Returns whether the signing identity changed.
    @discardableResult
    func install(seedHex: String, subject: String, nonceFloor: Int) throws -> Bool {
        guard let seed = Data(hexString: seedHex), seed.count == 32,
              (try? Curve25519.Signing.PrivateKey(rawRepresentation: seed)) != nil else {
            throw GameSSO.Failure.badAnswer
        }
        let changed = state.withLock { s -> Bool in
            let changed = s.seed != seed
            s.seed = seed
            s.subject = subject
            s.nonceFloor = max(s.nonceFloor, nonceFloor)
            s.loaded = true
            return changed
        }
        Self.write(Saved(seed: seed, subject: subject, nonceFloor: nonceFloor))
        return changed
    }

    /// Sign out. Returns whether there was an account key to forget.
    @discardableResult
    func clear() -> Bool {
        let had = state.withLock { s -> Bool in
            let had = s.seed != nil
            s = State(seed: nil, subject: nil, nonceFloor: 0, loaded: true)
            return had
        }
        Self.delete()
        return had
    }

    // MARK: - Keychain

    private struct Saved: Codable {
        let seed: Data
        let subject: String
        let nonceFloor: Int
    }

    private static func baseQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrAccount as String: keychainAccount]
    }

    private static func read() -> Saved? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Saved.self, from: data)
    }

    private static func write(_ saved: Saved) {
        guard let data = try? JSONEncoder().encode(saved) else { return }
        delete()
        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        if SecItemAdd(query as CFDictionary, nil) == errSecSuccess {
            UserDefaults.standard.set(true, forKey: savedFlag)
        }
    }

    private static func delete() {
        SecItemDelete(baseQuery() as CFDictionary)
        UserDefaults.standard.removeObject(forKey: savedFlag)
    }
}

extension Data {
    /// Bytes from lowercase or uppercase hex; nil for anything else.
    init?(hexString: String) {
        guard hexString.count % 2 == 0 else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(hexString.count / 2)
        var index = hexString.startIndex
        while index < hexString.endIndex {
            let next = hexString.index(index, offsetBy: 2)
            guard let byte = UInt8(hexString[index..<next], radix: 16) else { return nil }
            bytes.append(byte)
            index = next
        }
        self.init(bytes)
    }
}
