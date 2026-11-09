import CryptoKit
import Foundation
import Security

/// This device's Ed25519 key pair, and the signature scheme the server checks.
///
/// The private key is generated once, stored in the Keychain, and never leaves
/// the phone. The public key IS the device's identity: it is what `join` sends
/// as `device_key`, what the server stores against the player, and what every
/// signature is verified against.
///
/// The signing payload is defined by the server and reproduced here from the
/// specification in `docs/API.md` rather than being reverse-engineered from a
/// working request. Getting a byte wrong produces a 401 with no clue which
/// byte, so it is written out one field at a time:
///
///     SHA256( METHOD | path | SHA256(body) | nonce )
///
/// `path` excludes the query string and the host. `body` is the exact bytes
/// sent, which for a GET is empty.
actor DeviceIdentity {

    static let shared = DeviceIdentity()

    private static let keychainTag = "com.djmcevents.costquest.devicekey"

    private var cachedKey: Curve25519.Signing.PrivateKey?

    /// Nonces must strictly increase per device. Milliseconds since the epoch
    /// gives that for free across launches, with no state to persist, as long
    /// as it never goes backwards within a run — hence the counter.
    private var lastNonce: Int = 0

    private func key() throws -> Curve25519.Signing.PrivateKey {
        // [merged-app] Signed in through CosQuest: the account's player key
        // (Embed/AccountKey.swift, from POST /v1/sso/cosquest) wins over this
        // phone's own, so the player follows the account across phones.
        if let account = AccountKey.shared.privateKey { return account }
        if let cachedKey { return cachedKey }
        if let stored = try Self.loadFromKeychain() {
            cachedKey = stored
            return stored
        }
        let fresh = Curve25519.Signing.PrivateKey()
        try Self.saveToKeychain(fresh)
        cachedKey = fresh
        return fresh
    }

    /// Hex of the public key. The player's identity everywhere in the system.
    func publicKeyHex() throws -> String {
        try key().publicKey.rawRepresentation.hexString
    }

    func nextNonce() -> Int {
        let now = Int(Date().timeIntervalSince1970 * 1000)
        // [merged-app] An account key may have signed from another phone:
        // start above the highest nonce the server has seen for it.
        lastNonce = max(now, lastNonce + 1, AccountKey.shared.nonceFloor + 1)
        return lastNonce
    }

    /// The bytes the server expects a signature over.
    nonisolated static func signingPayload(method: String, path: String,
                                           body: Data, nonce: Int) -> Data {
        var hasher = SHA256()
        hasher.update(data: Data(method.uppercased().utf8))
        hasher.update(data: Data("|".utf8))
        hasher.update(data: Data(path.utf8))
        hasher.update(data: Data("|".utf8))
        hasher.update(data: Data(SHA256.hash(data: body)))
        hasher.update(data: Data("|".utf8))
        hasher.update(data: Data(String(nonce).utf8))
        return Data(hasher.finalize())
    }

    /// Headers for one signed request. Each call burns a nonce, so a request
    /// that is built and then not sent leaves a gap — which is fine, the
    /// server only requires that they increase.
    func signedHeaders(method: String, path: String, body: Data) throws -> [String: String] {
        let nonce = nextNonce()
        let payload = Self.signingPayload(method: method, path: path,
                                          body: body, nonce: nonce)
        // [merged-app] One key for both headers: the account key can be
        // installed between two key() calls, and a mixed pair is a 401.
        let signingKey = try key()
        let signature = try signingKey.signature(for: payload)
        return [
            "X-Device-Key": signingKey.publicKey.rawRepresentation.hexString,
            "X-Signature": signature.hexString,
            "X-Nonce": String(nonce),
        ]
    }

    // MARK: - Keychain
    //
    // The key is the player's identity and their claim on any prize, so it
    // lives in the Keychain rather than UserDefaults, and is marked
    // ThisDeviceOnly so it never rides a backup onto a second phone where two
    // devices would then share one identity.

    private static func saveToKeychain(_ key: Curve25519.Signing.PrivateKey) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keychainTag,
            kSecValueData as String: key.rawRepresentation,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw IdentityError.keychain(status)
        }
    }

    private static func loadFromKeychain() throws -> Curve25519.Signing.PrivateKey? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keychainTag,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw IdentityError.keychain(status)
        }
        return try Curve25519.Signing.PrivateKey(rawRepresentation: data)
    }

    enum IdentityError: Error, LocalizedError {
        case keychain(OSStatus)

        var errorDescription: String? {
            switch self {
            case .keychain(let status):
                return "Could not reach the keychain (\(status)). "
                     + "Your device identity could not be loaded."
            }
        }
    }
}

extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
