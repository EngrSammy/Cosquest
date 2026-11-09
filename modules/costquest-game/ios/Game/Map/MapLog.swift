import Foundation

/// Map diagnostics, in the console under "[map]". A handful of lines per
/// load: what was built and how long it took, and anything that failed.
enum MapLog {
    static func note(_ s: String) { print("[map] \(s)") }
}
