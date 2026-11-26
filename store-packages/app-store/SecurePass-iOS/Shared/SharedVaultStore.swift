import AuthenticationServices
import Foundation
import LocalAuthentication
import Security

enum SharedVaultStore {
    static var vaultURL: URL {
        if let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: securePassAppGroup) {
            return root.appendingPathComponent("active.spvault", isDirectory: false)
        }
        let fallback = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SecPass", isDirectory: true)
        return fallback.appendingPathComponent("active.spvault", isDirectory: false)
    }

    private static var safetyBackupURL: URL {
        vaultURL.deletingLastPathComponent().appendingPathComponent("previous.spvault", isDirectory: false)
    }

    static func read() throws -> Data {
        let data = try Data(contentsOf: vaultURL, options: [.mappedIfSafe])
        guard data.count <= securePassMaximumBytes else { throw VaultError.invalid("Kasa dosyası çok büyük.") }
        return data
    }

    static func write(_ data: Data, preservePrevious: Bool = true) throws {
        guard data.count <= securePassMaximumBytes else { throw VaultError.invalid("Kasa dosyası çok büyük.") }
        let directory = vaultURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if preservePrevious, FileManager.default.fileExists(atPath: vaultURL.path) {
            let previous = try Data(contentsOf: vaultURL)
            try previous.write(to: safetyBackupURL, options: [.atomic, .completeFileProtection])
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: safetyBackupURL.path)
        }
        try data.write(to: vaultURL, options: [.atomic, .completeFileProtection])
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: vaultURL.path)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        var activeURL = vaultURL; try? activeURL.setResourceValues(values)
        if FileManager.default.fileExists(atPath: safetyBackupURL.path) {
            var backupURL = safetyBackupURL; try? backupURL.setResourceValues(values)
        }
    }

    static func importVault(from source: URL) throws {
        let accessed = source.startAccessingSecurityScopedResource()
        defer { if accessed { source.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: source)
        guard data.count <= securePassMaximumBytes else { throw VaultError.invalid("Kasa dosyası çok büyük.") }
        let envelope = try JSONDecoder().decode(VaultEnvelope.self, from: data)
        guard envelope.format == securePassFormat else { throw VaultError.invalid("Desteklenmeyen kasa biçimi.") }
        try write(data)
        try BiometricKeyStore.delete()
    }

    static func hasSafetyBackup() -> Bool {
        FileManager.default.fileExists(atPath: safetyBackupURL.path)
    }

    static func restoreSafetyBackup() throws {
        let data = try Data(contentsOf: safetyBackupURL)
        guard data.count <= securePassMaximumBytes else { throw VaultError.invalid("Geri dönüş kopyası geçersiz.") }
        let envelope = try JSONDecoder().decode(VaultEnvelope.self, from: data)
        guard envelope.format == securePassFormat else { throw VaultError.invalid("Geri dönüş kopyası geçersiz.") }
        try write(data, preservePrevious: false)
        try BiometricKeyStore.delete()
    }

    static func exists() -> Bool { FileManager.default.fileExists(atPath: vaultURL.path) }

    @MainActor
    static func refreshCredentialIdentities(entries: [VaultEntry]) async {
        let identities = entries.compactMap { entry -> ASPasswordCredentialIdentity? in
            guard let host = entry.host, !entry.username.isEmpty else { return nil }
            return ASPasswordCredentialIdentity(
                serviceIdentifier: ASCredentialServiceIdentifier(identifier: host, type: .domain),
                user: entry.username, recordIdentifier: entry.id
            )
        }
        do {
            let state = await ASCredentialIdentityStore.shared.state()
            guard state.isEnabled else { return }
            try await ASCredentialIdentityStore.shared.replaceCredentialIdentities(identities)
        } catch {
            // AutoFill indeksi yardımcı özelliktir; kasa kaydını başarısız saydırmaz.
        }
    }

    @MainActor
    static func clearCredentialIdentities() async {
        do {
            let state = await ASCredentialIdentityStore.shared.state()
            guard state.isEnabled else { return }
            try await ASCredentialIdentityStore.shared.removeAllCredentialIdentities()
        } catch { }
    }
}

enum BiometricKeyStore {
    private static let service = "io.github.uksam38.secpass.vault-key"
    private static let account = "active-vault"

    private static var accessGroup: String? {
        Bundle.main.object(forInfoDictionaryKey: "KeychainAccessGroup") as? String
    }

    static func save(_ key: Data) throws {
        guard key.count == 32 else { throw VaultError.invalid("Kasa anahtarı geçersiz.") }
        try delete()
        var error: Unmanaged<CFError>?
        guard let control = SecAccessControlCreateWithFlags(
            nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.biometryCurrentSet], &error
        ) else { throw error!.takeRetainedValue() as Error }
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: key,
            kSecAttrAccessControl as String: control
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw VaultError.invalid("Biyometrik anahtar kaydedilemedi (\(status)).") }
    }

    static func load(reason: String) throws -> Data {
        let context = LAContext()
        context.localizedReason = reason
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: context
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data, data.count == 32 else {
            throw VaultError.invalid("Biyometrik kilit açılamadı.")
        }
        return data
    }

    static func exists() -> Bool {
        let context = LAContext()
        context.interactionNotAllowed = true
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: context
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    static func delete() throws {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw VaultError.invalid("Biyometrik anahtar kaldırılamadı.")
        }
    }
}
