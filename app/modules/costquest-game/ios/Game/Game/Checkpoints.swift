import CoreNFC
import OSLog

/// Tapping a physical checkpoint at the venue.
///
/// M3 acceptance asks that "the player can tap an NFC checkpoint to trigger an
/// in game action (capture a point, unlock a weapon, or claim a sponsor item)".
/// A tag is a sticker on a real post, which is worth more than it sounds: it is
/// proof of presence that no amount of GPS spoofing gives you, because the
/// player's phone has to physically be within a couple of centimetres of an
/// object the organiser put there.
///
/// The tag carries nothing but an anchor id. Every rule about what that anchor
/// is worth lives on the server, so a tag that is copied or written by hand can
/// only ever name a point that already exists, and the server still applies the
/// same cooldowns, geofence and faction rules it would to a tap in the app.
///
/// Two constraints from Apple's documentation shape the code. Reading needs the
/// `com.apple.developer.nfc.readersession.formats` entitlement and
/// `NFCReaderUsageDescription`, and it is unavailable on iPad and on older
/// iPhones, so `readingAvailable` is checked rather than assumed.
@MainActor
final class Checkpoints: NSObject {

    private let log = Logger(subsystem: "com.djmcevents.costquest", category: "nfc")
    private var session: NFCNDEFReaderSession?

    /// Called with the anchor id a tag named.
    var onCheckpoint: ((String) -> Void)?
    private(set) var lastError: String?

    static var isAvailable: Bool { NFCNDEFReaderSession.readingAvailable }

    /// The scheme an organiser writes onto a tag:
    ///
    ///     costquest://anchor/3df2c8ce-7be6-48e8-a596-eaa577f36f2f
    ///
    /// A URI record rather than a text record so that a phone without the app
    /// still does something sensible with the tag, and so the id cannot be
    /// confused with a label somebody wrote on it.
    nonisolated static let scheme = "costquest"

    func scan() {
        guard Self.isAvailable else {
            lastError = "This phone cannot read checkpoint tags."
            return
        }
        // `invalidateAfterFirstRead` is true: a checkpoint is one tap, and a
        // session that stays open invites a second read the player did not
        // intend while the sheet is still up.
        let session = NFCNDEFReaderSession(delegate: self, queue: nil,
                                           invalidateAfterFirstRead: true)
        session.alertMessage = "Hold your phone near the checkpoint."
        session.begin()
        self.session = session
    }

    /// Pull an anchor id out of whatever the tag actually held.
    ///
    /// Written to be forgiving about the record type and strict about the
    /// content. A venue's tags get written by whoever is setting up on the day,
    /// often with a phone app, and they arrive as a URI record, a text record
    /// or occasionally a bare uuid. All three are accepted; anything that is
    /// not a uuid is refused, because an id that does not match an anchor would
    /// send the player a server error instead of telling them the tag is wrong.
    nonisolated static func anchorID(in payloads: [NFCNDEFPayload]) -> String? {
        for payload in payloads {
            var candidate: String?
            if let url = payload.wellKnownTypeURIPayload() {
                if url.scheme == scheme {
                    candidate = url.lastPathComponent
                } else if url.pathComponents.contains("anchor") {
                    candidate = url.lastPathComponent
                }
            }
            if candidate == nil, let text = payload.wellKnownTypeTextPayload().0 {
                candidate = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    .replacingOccurrences(of: "\(scheme)://anchor/", with: "")
            }
            if let candidate, UUID(uuidString: candidate) != nil {
                return candidate
            }
        }
        return nil
    }
}

extension Checkpoints: NFCNDEFReaderSessionDelegate {

    nonisolated func readerSession(_ session: NFCNDEFReaderSession,
                                   didDetectNDEFs messages: [NFCNDEFMessage]) {
        let payloads = messages.flatMap(\.records)
        let id = Checkpoints.anchorID(in: payloads)
        if id == nil {
            session.invalidate(errorMessage: "That is not a CosQuest checkpoint.")
        }
        Task { @MainActor in
            guard let id else { return }
            self.log.notice("checkpoint \(id.prefix(8)) tapped")
            self.onCheckpoint?(id)
        }
    }

    nonisolated func readerSession(_ session: NFCNDEFReaderSession,
                                   didInvalidateWithError error: any Error) {
        // A player cancelling the sheet arrives here as an error. It is not
        // one, and putting "the operation was cancelled" on screen after
        // someone deliberately tapped Cancel is how an app looks broken.
        let code = (error as? NFCReaderError)?.code
        let quiet = code == .readerSessionInvalidationErrorUserCanceled
            || code == .readerSessionInvalidationErrorFirstNDEFTagRead
        let text = error.localizedDescription
        Task { @MainActor in
            self.session = nil
            self.lastError = quiet ? nil : text
        }
    }

    nonisolated func readerSessionDidBecomeActive(_ session: NFCNDEFReaderSession) {}
}
