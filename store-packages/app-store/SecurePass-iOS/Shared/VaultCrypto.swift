import CryptoKit
import CryptoSwift
import Foundation
import Security

enum VaultCrypto {
    private static let scryptN = 131_072
    private static let scryptR = 8
    private static let scryptP = 1

    static func create(masterPassword: String) async throws -> (VaultSession, String) {
        try VaultValidation.master(masterPassword)
        let dataKey = try randomData(count: 32)
        let salt = try randomData(count: 32)
        let recoveryKey = try randomData(count: 32)
        let passwordKey = try await derive(password: masterPassword, salt: salt)
        let placeholder = VaultBox(iv: "", tag: "", ciphertext: "")
        var envelope = VaultEnvelope(
            format: securePassFormat, salt: salt.base64EncodedString(),
            passwordSlot: try seal(dataKey, key: passwordKey, purpose: "password"),
            recoverySlot: try seal(dataKey, key: recoveryKey, purpose: "recovery"), data: placeholder
        )
        let payload = VaultPayload()
        envelope = try encrypt(payload: payload, replacing: envelope, key: dataKey)
        let recovery = recoveryKey.map { String(format: "%02x", $0) }.joined()
            .chunks(of: 8).joined(separator: "-")
        return (VaultSession(key: dataKey, envelope: envelope, payload: payload), recovery)
    }

    static func unlock(_ raw: Data, secret: String, recovery: Bool = false) async throws -> VaultSession {
        guard raw.count <= securePassMaximumBytes else { throw VaultError.invalid("Kasa dosyası çok büyük.") }
        let envelope: VaultEnvelope
        do { envelope = try JSONDecoder().decode(VaultEnvelope.self, from: raw) }
        catch { throw VaultError.invalid("Kasa dosyası geçersiz.") }
        guard envelope.format == securePassFormat,
              let salt = strictBase64(envelope.salt, length: 32) else {
            throw VaultError.invalid("Desteklenmeyen kasa biçimi.")
        }
        let wrappingKey: Data
        if recovery {
            let normalized = secret.replacingOccurrences(of: "-", with: "").replacingOccurrences(of: " ", with: "").lowercased()
            guard normalized.count == 64, let decoded = Data(hex: normalized) else {
                throw VaultError.invalid("Kurtarma anahtarı geçersiz.")
            }
            wrappingKey = decoded
        } else {
            wrappingKey = try await derive(password: secret, salt: salt)
        }
        do {
            let key = try open(envelope: recovery ? envelope.recoverySlot : envelope.passwordSlot,
                               key: wrappingKey, purpose: recovery ? "recovery" : "password")
            guard key.count == 32 else { throw VaultError.invalid("Kasa anahtarı geçersiz.") }
            let plaintext = try open(envelope: envelope.data, key: key, purpose: "data")
            var payload = try JSONDecoder().decode(VaultPayload.self, from: plaintext)
            try VaultValidation.payload(payload)
            payload.entries.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            return VaultSession(key: key, envelope: envelope, payload: payload)
        } catch {
            throw VaultError.invalid("Ana parola / kurtarma anahtarı yanlış veya kasa hasarlı.")
        }
    }

    static func encode(_ session: VaultSession) throws -> Data {
        try VaultValidation.payload(session.payload)
        let envelope = try encrypt(payload: session.payload, replacing: session.envelope, key: session.key)
        return try JSONEncoder().encode(envelope)
    }

    static func rotateCredentials(_ session: VaultSession, newMasterPassword: String) async throws -> (VaultSession, String) {
        try VaultValidation.master(newMasterPassword)
        let newDataKey = try randomData(count: 32)
        let salt = try randomData(count: 32)
        let recoveryKey = try randomData(count: 32)
        let passwordKey = try await derive(password: newMasterPassword, salt: salt)
        let placeholder = VaultBox(iv: "", tag: "", ciphertext: "")
        var envelope = VaultEnvelope(
            format: securePassFormat,
            salt: salt.base64EncodedString(),
            passwordSlot: try seal(newDataKey, key: passwordKey, purpose: "password"),
            recoverySlot: try seal(newDataKey, key: recoveryKey, purpose: "recovery"),
            data: placeholder
        )
        envelope = try encrypt(payload: session.payload, replacing: envelope, key: newDataKey)
        let recovery = recoveryKey.map { String(format: "%02x", $0) }.joined()
            .chunks(of: 8).joined(separator: "-")
        return (VaultSession(key: newDataKey, envelope: envelope, payload: session.payload), recovery)
    }

    static func session(envelope raw: Data, dataKey: Data) throws -> VaultSession {
        let envelope = try JSONDecoder().decode(VaultEnvelope.self, from: raw)
        guard envelope.format == securePassFormat, dataKey.count == 32 else { throw VaultError.invalid("Kasa geçersiz.") }
        let plaintext = try open(envelope: envelope.data, key: dataKey, purpose: "data")
        let payload = try JSONDecoder().decode(VaultPayload.self, from: plaintext)
        try VaultValidation.payload(payload)
        return VaultSession(key: dataKey, envelope: envelope, payload: payload)
    }

    private static func encrypt(payload: VaultPayload, replacing envelope: VaultEnvelope, key: Data) throws -> VaultEnvelope {
        let plaintext = try JSONEncoder().encode(payload)
        return VaultEnvelope(format: envelope.format, salt: envelope.salt,
                             passwordSlot: envelope.passwordSlot, recoverySlot: envelope.recoverySlot,
                             data: try seal(plaintext, key: key, purpose: "data"))
    }

    private static func derive(password: String, salt: Data) async throws -> Data {
        guard password.count <= 1_024 else { throw VaultError.invalid("Ana parola çok uzun.") }
        return try await Task.detached(priority: .userInitiated) {
            try autoreleasepool {
                Data(try Scrypt(password: Array(password.utf8), salt: Array(salt), dkLen: 32,
                                N: scryptN, r: scryptR, p: scryptP).calculate())
            }
        }.value
    }

    private static func seal(_ plaintext: Data, key: Data, purpose: String) throws -> VaultBox {
        let symmetric = SymmetricKey(data: key)
        let nonce = AES.GCM.Nonce()
        let sealed = try AES.GCM.seal(plaintext, using: symmetric, nonce: nonce,
                                      authenticating: Data("\(securePassFormat):\(purpose)".utf8))
        return VaultBox(iv: Data(nonce).base64EncodedString(), tag: sealed.tag.base64EncodedString(),
                        ciphertext: sealed.ciphertext.base64EncodedString())
    }

    private static func open(envelope: VaultBox, key: Data, purpose: String) throws -> Data {
        guard let iv = strictBase64(envelope.iv, length: 12),
              let tag = strictBase64(envelope.tag, length: 16),
              let ciphertext = strictBase64(envelope.ciphertext) else {
            throw VaultError.invalid("Şifreli alan geçersiz.")
        }
        let sealed = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv), ciphertext: ciphertext, tag: tag)
        return try AES.GCM.open(sealed, using: SymmetricKey(data: key),
                                authenticating: Data("\(securePassFormat):\(purpose)".utf8))
    }

    private static func strictBase64(_ value: String, length: Int? = nil) -> Data? {
        guard value.count <= securePassMaximumBytes * 2,
              let data = Data(base64Encoded: value), data.base64EncodedString() == value,
              length == nil || data.count == length else { return nil }
        return data
    }

    private static func randomData(count: Int) throws -> Data {
        var data = Data(count: count)
        let status = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        guard status == errSecSuccess else { throw VaultError.invalid("Güvenli rastgele veri üretilemedi.") }
        return data
    }
}

private extension String {
    func chunks(of count: Int) -> [String] {
        stride(from: 0, to: self.count, by: count).map { offset in
            let start = index(startIndex, offsetBy: offset)
            return String(self[start..<index(start, offsetBy: min(count, self.count - offset))])
        }
    }
}

private extension Data {
    init?(hex: String) {
        guard hex.count.isMultiple(of: 2) else { return nil }
        var bytes = [UInt8](); bytes.reserveCapacity(hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
            bytes.append(byte); index = next
        }
        self = Data(bytes)
    }
}
