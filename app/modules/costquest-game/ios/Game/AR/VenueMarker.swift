import ARKit
import CoreGraphics
import OSLog

/// The printed venue marker, as ARKit sees it.
///
/// Every phone that has seen the marker puts the venue origin on it, so they
/// all share one arena placement without geo tracking. It is the pragmatic
/// version of Pokemon GO's scanned locations: a sheet of paper instead of a
/// cloud map. See docs/SHARED_AR.md.
///
/// The artwork lives in `VenueMarkerArt` (CoreGraphics only), which the print
/// script compiles too.
enum VenueMarker {

    static var physicalWidth: CGFloat { VenueMarkerArt.physicalWidth }
    static var name: String { VenueMarkerArt.imageName }

    /// The marker at `pixels` square.
    static func cgImage(pixels: Int) -> CGImage? {
        VenueMarkerArt.makeImage(pixels: pixels)
    }

    /// Built once: drawing the bitmap costs a few milliseconds and the session
    /// asks for it on every reconfigure. ARReferenceImage is immutable once
    /// named, so sharing the one instance is safe.
    nonisolated(unsafe) private static let cached: ARReferenceImage = {
        // 1024 px is plenty for detection; ARKit downsamples larger images.
        let image = VenueMarkerArt.makeImage(pixels: 1024)!
        let reference = ARReferenceImage(image, orientation: .up,
                                         physicalWidth: VenueMarkerArt.physicalWidth)
        reference.name = VenueMarkerArt.imageName
#if DEBUG
        validate(reference)
#endif
        return reference
    }()

    static func referenceImage() -> ARReferenceImage { cached }

#if DEBUG
    /// Ask ARKit whether it will accept the marker, once, into the log. The
    /// callback is `@Sendable` for the same reason as `canTrackGeo`'s: ARKit
    /// answers on its own queue, and an actor-inheriting closure would trap.
    private static func validate(_ reference: ARReferenceImage) {
        let log = Logger(subsystem: "com.djmcevents.costquest", category: "marker")
        reference.validate { @Sendable error in
            if let error {
                log.error("venue marker REJECTED by ARKit: \(error.localizedDescription, privacy: .public)")
            } else {
                log.notice("venue marker accepted by ARKit")
            }
        }
    }
#endif
}
