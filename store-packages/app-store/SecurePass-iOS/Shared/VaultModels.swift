import Foundation

let securePassFormat = "securepass-v1"
let securePassAppGroup = "group.io.github.uksam38.secpass"
let securePassMaximumBytes = 16 * 1024 * 1024

struct VaultBox: Codable, Sendable {
    let iv: String
    let tag: String
    let ciphertext: String
}

struct VaultEnvelope: Codable, Sendable {
    let format: String
    let salt: String
    let passwordSlot: VaultBox
    let recoverySlot: VaultBox
    let data: VaultBox
}

struct VaultSettings: Codable, Sendable {
    var lockMinutes: Int = 5
}

struct VaultEntry: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var url: String
    var changeUrl: String
    var username: String
    var password: String
    var category: String
    var notes: String
    var favorite: Bool
    var createdAt: String
    var updatedAt: String
    var passwordChangedAt: String

    var host: String? { URL(string: url)?.host?.lowercased() }

    static func fresh(name: String, url: String, username: String, password: String, category: String = "Diğer", notes: String = "") throws -> VaultEntry {
        let now = ISO8601DateFormatter.securePass.string(from: Date())
        return VaultEntry(
            id: UUID().uuidString.lowercased(), name: try VaultValidation.name(name),
            url: try VaultValidation.url(url), changeUrl: "",
            username: try VaultValidation.text(username, maximum: 1_024),
            password: try VaultValidation.password(password),
            category: try VaultValidation.text(category.isEmpty ? "Diğer" : category, maximum: 80),
            notes: try VaultValidation.text(notes, maximum: 10_000), favorite: false,
            createdAt: now, updatedAt: now, passwordChangedAt: now
        )
    }
}

struct VaultPayload: Codable, Sendable {
    var version: Int = 1
    var entries: [VaultEntry] = []
    var settings = VaultSettings()
}

struct VaultSession: Sendable {
    var key: Data
    var envelope: VaultEnvelope
    var payload: VaultPayload
}

enum VaultError: LocalizedError {
    case invalid(String)
    case locked

    var errorDescription: String? {
        switch self {
        case .invalid(let message): message
        case .locked: "Kasa kilitli."
        }
    }
}

enum VaultValidation {
    static func text(_ value: String, maximum: Int) throws -> String {
        guard value.count <= maximum else { throw VaultError.invalid("Alan çok uzun.") }
        return value
    }

    static func name(_ value: String) throws -> String {
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { throw VaultError.invalid("Kayıt adı gerekli.") }
        return try text(cleaned, maximum: 256)
    }

    static func password(_ value: String) throws -> String {
        guard !value.isEmpty else { throw VaultError.invalid("Parola boş olamaz.") }
        return try text(value, maximum: 4_096)
    }

    static func master(_ value: String) throws {
        guard value.count >= 14, value.count <= 1_024, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw VaultError.invalid("Ana parola en az 14 karakter olmalı.")
        }
    }

    static func url(_ value: String) throws -> String {
        if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "" }
        var input = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if URL(string: input)?.scheme == nil { input = "https://" + input }
        guard let parsed = URL(string: input), parsed.scheme == "https", parsed.user == nil,
              parsed.password == nil, let host = parsed.host, host.contains(".") else {
            throw VaultError.invalid("Yalnızca geçerli HTTPS adresleri kabul edilir.")
        }
        return parsed.absoluteString
    }

    static func payload(_ payload: VaultPayload) throws {
        guard payload.version == 1, payload.entries.count <= 10_000,
              [1, 2, 5, 10, 15].contains(payload.settings.lockMinutes) else {
            throw VaultError.invalid("Kasa içeriği geçersiz.")
        }
        var ids = Set<String>()
        for entry in payload.entries {
            guard ids.insert(entry.id).inserted else { throw VaultError.invalid("Tekrarlanan kayıt kimliği.") }
            _ = try name(entry.name)
            _ = try url(entry.url)
            _ = try url(entry.changeUrl)
            _ = try password(entry.password)
            guard ISO8601DateFormatter.securePass.date(from: entry.createdAt) != nil,
                  ISO8601DateFormatter.securePass.date(from: entry.updatedAt) != nil,
                  ISO8601DateFormatter.securePass.date(from: entry.passwordChangedAt) != nil else {
                throw VaultError.invalid("Geçersiz kayıt tarihi.")
            }
        }
    }
}

extension ISO8601DateFormatter {
    static let securePass: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

