// The player's Ed25519 key and the signature scheme the game server checks.
// The TypeScript twin of costquest-ios Net/DeviceIdentity.swift.
//
// The signing payload is defined by the server (costquest-backend docs/API.md §1):
//
//     SHA256( METHOD | path | SHA256(body) | nonce )
//
// `path` is the path only (no host, no query string); `body` is the exact
// bytes sent (empty for a GET). Headers: X-Device-Key (public key hex),
// X-Signature (signature hex), X-Nonce (decimal, strictly increasing per key).
//
// Where the key comes from:
//   - one login (the account's player, POST /v1/sso/cosquest hands its seed), or
//   - this phone's own key, made once and kept in the secure store, when one
//     login is not available (backend not configured, offline first launch).
// Pure: no React Native imports (tested in features/game/__tests__).
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const SEP = utf8ToBytes("|");

/** The bytes the server expects a signature over. */
export function signingPayload(method: string, path: string, body: Uint8Array, nonce: number): Uint8Array {
  const h = sha256.create();
  h.update(utf8ToBytes(method.toUpperCase()));
  h.update(SEP);
  h.update(utf8ToBytes(path));
  h.update(SEP);
  h.update(sha256(body));
  h.update(SEP);
  h.update(utf8ToBytes(String(nonce)));
  return h.digest();
}

export type SignedHeaders = {
  "X-Device-Key": string;
  "X-Signature": string;
  "X-Nonce": string;
};

export const SEED_HEX = /^[0-9a-f]{64}$/;

export class Identity {
  readonly publicKeyHex: string;
  /** Where the key came from, for the UI and the logs. */
  readonly source: "account" | "device";
  private readonly seed: Uint8Array;
  private lastNonce: number;

  constructor(seedHex: string, source: "account" | "device", nonceFloor = 0) {
    const hex = seedHex.trim().toLowerCase();
    if (!SEED_HEX.test(hex)) throw new Error("A player key is 32 bytes of hex.");
    this.seed = hexToBytes(hex);
    this.publicKeyHex = bytesToHex(ed25519.getPublicKey(this.seed));
    this.source = source;
    this.lastNonce = Math.max(0, Math.floor(nonceFloor));
  }

  /**
   * Milliseconds since the epoch, never going backwards within a run, and
   * above the server's floor (two phones may share an account's key).
   */
  nextNonce(now: number = Date.now()): number {
    this.lastNonce = Math.max(Math.floor(now), this.lastNonce + 1);
    return this.lastNonce;
  }

  sign(message: Uint8Array): string {
    return bytesToHex(ed25519.sign(message, this.seed));
  }

  /** Headers for one signed request. Each call burns a nonce. */
  signedHeaders(method: string, path: string, body: Uint8Array, now?: number): SignedHeaders {
    const nonce = this.nextNonce(now);
    const signature = this.sign(signingPayload(method, path, body, nonce));
    return {
      "X-Device-Key": this.publicKeyHex,
      "X-Signature": signature,
      "X-Nonce": String(nonce),
    };
  }
}

/** Checks a signature (tests, and the dev self-check). */
export function verifySignature(publicKeyHex: string, message: Uint8Array, signatureHex: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signatureHex), message, hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

export { bytesToHex, hexToBytes, utf8ToBytes };
