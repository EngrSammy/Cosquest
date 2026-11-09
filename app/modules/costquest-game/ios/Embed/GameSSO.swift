import Foundation

/// One login: the CosQuest chat session, traded for the account's game
/// player on the game backend (ubmids/costquest-backend, branch cosquest-sso,
/// docs/SSO.md). The backend checks the token with the chat backend, so a
/// logged-out session is refused there, not here.
enum GameSSO {
    struct Answer: Decodable, Sendable {
        struct Player: Decodable, Sendable {
            let device_key: String
            let handle: String?
            let faction: String?
            let chat_faction: String?
        }
        struct Key: Decodable, Sendable {
            let alg: String
            let seed_hex: String
        }
        let subject: String
        let created: Bool
        let player: Player
        let key: Key
        let nonce_floor: Int
    }

    enum Failure: Error, LocalizedError {
        case notConfigured
        case sessionEnded
        case server(Int)
        case badAnswer
        case network

        var code: String {
            switch self {
            case .notConfigured: return "sso_not_configured"
            case .sessionEnded: return "sso_session_ended"
            case .server: return "sso_server"
            case .badAnswer: return "sso_bad_answer"
            case .network: return "sso_network"
            }
        }

        var errorDescription: String? {
            switch self {
            case .notConfigured: return "The game server does not have CosQuest sign-in switched on yet."
            case .sessionEnded: return "Your CosQuest session has ended. Sign in again."
            case .server(let status): return "The game server answered \(status)."
            case .badAnswer: return "The game server's answer could not be read."
            case .network: return "The game server could not be reached."
            }
        }
    }

    static func exchange(chatToken: String) async throws -> Answer {
        var request = URLRequest(url: CQConfig.baseURL.appendingPathComponent("v1/sso/cosquest"))
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["token": chatToken])
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            // URLSession reports a cancelled task as URLError(.cancelled).
            if error is CancellationError || (error as? URLError)?.code == .cancelled {
                throw CancellationError()
            }
            throw Failure.network
        }
        guard let http = response as? HTTPURLResponse else { throw Failure.network }
        switch http.statusCode {
        case 200:
            do { return try JSONDecoder().decode(Answer.self, from: data) }
            catch { throw Failure.badAnswer }
        case 401: throw Failure.sessionEnded
        case 503: throw Failure.notConfigured
        default: throw Failure.server(http.statusCode)
        }
    }
}
