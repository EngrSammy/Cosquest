import Foundation

/// Where this build points. One place, because the base URL is now needed by
/// more than the API client: the map style names its own tile URLs, so the
/// map and the API have to agree about which server they are talking to or
/// the app quietly draws a different venue's world.
enum CQConfig {
    /// Overridable at launch (`-server https://...`) so a build can be pointed
    /// at a laptop without a rebuild, which is how the acceptance scripts and
    /// a venue walkthrough get to use the same binary.
    static let baseURLString: String = {
        if let s = UserDefaults.standard.string(forKey: "server"),
           let u = URL(string: s), u.scheme?.hasPrefix("http") == true {
            return s.hasSuffix("/") ? String(s.dropLast()) : s
        }
        // A build made for staging (scripts/demo-install.sh --staging) carries
        // its server in Info.plist, so it stays pointed there across launches.
        if let s = Bundle.main.object(forInfoDictionaryKey: "CQServerURL") as? String,
           let u = URL(string: s), u.scheme == "https" {
            return s.hasSuffix("/") ? String(s.dropLast()) : s
        }
        return productionURLString
    }()

    static let productionURLString = "https://costquest.204.168.162.79.sslip.io"

    /// Anything but production gets a badge on screen, so a test build is
    /// never mistaken for the real game, least of all in front of a client.
    static var isProduction: Bool { baseURLString == productionURLString }

    static var baseURL: URL { URL(string: baseURLString)! }
}
