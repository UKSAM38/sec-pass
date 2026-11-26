import Foundation
import SwiftUI

@MainActor
final class VaultViewModel: ObservableObject {
    enum State { case noVault, locked, unlocked }

    @Published private(set) var state: State = SharedVaultStore.exists() ? .locked : .noVault
    @Published private(set) var entries: [VaultEntry] = []
    @Published var error: String?
    @Published var notice: String?
    @Published var recoveryKey: String?
    @Published var csvPreview: CSVImportPreview?
    @Published var search = ""
    @Published var risksOnly = false
    @Published var selected: VaultEntry?
    @Published private(set) var revealPassword = false

    private var session: VaultSession?
    private var autoLockTask: Task<Void, Never>?
    private var revealTask: Task<Void, Never>?
    private var noticeTask: Task<Void, Never>?
    private var failedUnlockAttempts = 0

    var filteredEntries: [VaultEntry] {
        let counts = PasswordTools.reuseCounts(entries)
        return entries.filter { entry in
            let matches = search.isEmpty || [entry.name, entry.username, entry.url, entry.notes]
                .contains { $0.localizedCaseInsensitiveContains(search) }
            let risky = !risksOnly || (counts[entry.password] ?? 0) > 1 || PasswordTools.isWeak(entry.password)
            return matches && risky
        }
    }

    var reuseCounts: [String: Int] { PasswordTools.reuseCounts(entries) }
    var hasBiometricKey: Bool { BiometricKeyStore.exists() }
    var hasSafetyBackup: Bool { SharedVaultStore.hasSafetyBackup() }
    var lockMinutes: Int { session?.payload.settings.lockMinutes ?? 5 }

    nonisolated func shouldShowShield(for phase: ScenePhase) -> Bool {
        phase != .active
    }

    nonisolated func shouldLockVault(for phase: ScenePhase) -> Bool {
        phase == .background
    }

    func showNotice(_ message: String) {
        noticeTask?.cancel()
        notice = message
        noticeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            guard !Task.isCancelled else { return }
            self?.notice = nil
        }
    }

    func togglePasswordReveal() {
        setPasswordRevealed(!revealPassword)
    }

    func setPasswordRevealed(_ revealed: Bool) {
        revealTask?.cancel()
        revealPassword = revealed
        guard revealed else { return }
        revealTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(20))
            guard !Task.isCancelled else { return }
            self?.revealPassword = false
        }
    }

    func create(master: String, confirmation: String) async {
        await perform {
            guard master == confirmation else { throw VaultError.invalid("Ana parolalar eşleşmiyor.") }
            let (created, recovery) = try await VaultCrypto.create(masterPassword: master)
            self.session = created
            try SharedVaultStore.write(VaultCrypto.encode(created))
            self.recoveryKey = recovery
            self.open(created)
        }
    }

    func unlock(secret: String, recovery: Bool = false) async {
        if failedUnlockAttempts > 0 {
            let seconds = min(8, 1 << min(failedUnlockAttempts - 1, 3))
            try? await Task.sleep(for: .seconds(seconds))
        }
        await perform {
            do {
                let opened = try await VaultCrypto.unlock(SharedVaultStore.read(), secret: secret, recovery: recovery)
                self.failedUnlockAttempts = 0
                self.open(opened)
                if recovery {
                    self.showNotice("Kurtarma anahtarıyla açıldı. Güvenlik ayarlarından yeni ana parola belirleyin.")
                }
            } catch {
                self.failedUnlockAttempts = min(self.failedUnlockAttempts + 1, 4)
                throw VaultError.invalid("Kasa açılamadı. Bilgiyi kontrol edip tekrar deneyin.")
            }
        }
    }

    func unlockWithBiometrics() async {
        await perform {
            let key = try BiometricKeyStore.load(reason: "Şifreli kasanızı açın")
            self.open(try VaultCrypto.session(envelope: SharedVaultStore.read(), dataKey: key))
        }
    }

    func enableBiometrics() {
        guard let session else { return }
        do {
            try BiometricKeyStore.save(session.key)
            objectWillChange.send()
            showNotice("Face ID / Touch ID hızlı açılış etkinleştirildi.")
        } catch {
            self.error = "Biyometrik hızlı açılış etkinleştirilemedi."
        }
    }

    func disableBiometrics() {
        do {
            try BiometricKeyStore.delete()
            objectWillChange.send()
            showNotice("Face ID / Touch ID hızlı açılış kapatıldı.")
        } catch {
            self.error = "Biyometrik hızlı açılış kapatılamadı."
        }
    }

    func importVault(_ url: URL) {
        do {
            lock()
            try SharedVaultStore.importVault(from: url)
            state = .locked
            Task { await SharedVaultStore.clearCredentialIdentities() }
            showNotice("Şifreli kasa içe aktarıldı. Ana parolanızla açabilirsiniz.")
        } catch let error as VaultError { self.error = error.localizedDescription }
          catch { self.error = "Kasa dosyası içe aktarılamadı." }
    }

    func previewCSVImport(_ url: URL) {
        guard let current = session else {
            error = VaultError.locked.localizedDescription
            return
        }
        let accessed = url.startAccessingSecurityScopedResource()
        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            guard data.count <= 8 * 1024 * 1024 else {
                throw VaultError.invalid("CSV en fazla 8 MB olabilir.")
            }
            guard let raw = String(data: data, encoding: .utf8) else {
                throw VaultError.invalid("CSV dosyası UTF-8 metin biçiminde olmalıdır.")
            }
            csvPreview = try CSVImporter.prepare(raw: raw, existing: current.payload.entries)
        } catch let error as VaultError {
            self.error = error.localizedDescription
        } catch {
            self.error = "CSV dosyası okunamadı."
        }
    }

    func cancelCSVImport() {
        csvPreview = nil
    }

    func confirmCSVImport() async {
        await perform {
            guard var current = self.session else { throw VaultError.locked }
            guard let preview = self.csvPreview else { throw VaultError.invalid("Önce bir CSV dosyası seçin.") }
            guard current.payload.entries.count + preview.added.count <= 10_000 else {
                throw VaultError.invalid("Kasa en fazla 10.000 kayıt tutabilir.")
            }
            current.payload.entries.append(contentsOf: preview.added)
            try self.persist(current)
            self.csvPreview = nil
            self.showNotice("\(preview.added.count) kayıt şifrelenerek aktarıldı. Şifresiz CSV dosyasını silmeyi unutmayın.")
        }
    }

    func restoreSafetyBackup() {
        do {
            lock()
            try SharedVaultStore.restoreSafetyBackup()
            state = .locked
            Task { await SharedVaultStore.clearCredentialIdentities() }
            objectWillChange.send()
            showNotice("Önceki şifreli kasa yüklendi.")
        } catch { self.error = "Geri dönüş kopyası yüklenemedi." }
    }

    func rotateCredentials(master: String, confirmation: String) async {
        await perform {
            guard master == confirmation else { throw VaultError.invalid("Ana parolalar eşleşmiyor.") }
            guard let current = self.session else { throw VaultError.locked }
            var oldKey = current.key
            let (rotated, recovery) = try await VaultCrypto.rotateCredentials(current, newMasterPassword: master)
            try self.persist(rotated)
            oldKey.resetBytes(in: 0..<oldKey.count)
            try BiometricKeyStore.delete()
            self.recoveryKey = recovery
            self.objectWillChange.send()
        }
    }

    func save(_ entry: VaultEntry, keepExistingPassword: Bool = false) async {
        await perform {
            guard var current = self.session else { throw VaultError.locked }
            var copy = entry
            copy.name = try VaultValidation.name(copy.name)
            copy.url = try VaultValidation.url(copy.url)
            copy.changeUrl = try VaultValidation.url(copy.changeUrl)
            copy.username = try VaultValidation.text(copy.username, maximum: 1_024)
            copy.category = try VaultValidation.text(copy.category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Diğer" : copy.category, maximum: 80)
            copy.notes = try VaultValidation.text(copy.notes, maximum: 10_000)
            let now = ISO8601DateFormatter.securePass.string(from: Date())
            copy.updatedAt = now
            if let index = current.payload.entries.firstIndex(where: { $0.id == copy.id }) {
                let previous = current.payload.entries[index]
                if keepExistingPassword && copy.password.isEmpty {
                    copy.password = previous.password
                    copy.passwordChangedAt = previous.passwordChangedAt
                } else {
                    copy.password = try VaultValidation.password(copy.password)
                    copy.passwordChangedAt = previous.password == copy.password ? previous.passwordChangedAt : now
                }
                copy.createdAt = previous.createdAt
                current.payload.entries[index] = copy
            } else {
                copy.password = try VaultValidation.password(copy.password)
                copy.passwordChangedAt = now
                guard current.payload.entries.count < 10_000 else { throw VaultError.invalid("Kayıt sınırı aşıldı.") }
                current.payload.entries.append(copy)
            }
            try self.persist(current)
            self.selected = copy
            self.showNotice("Kayıt şifrelenerek kaydedildi.")
        }
    }

    func delete(_ entry: VaultEntry) async {
        await perform {
            guard var current = self.session else { throw VaultError.locked }
            current.payload.entries.removeAll { $0.id == entry.id }
            try self.persist(current)
            self.selected = nil
            self.showNotice("Kayıt silindi.")
        }
    }

    func changeLockMinutes(_ minutes: Int) async {
        await perform {
            guard var current = self.session else { throw VaultError.locked }
            guard [1, 2, 5, 10, 15].contains(minutes) else { throw VaultError.invalid("Geçersiz süre.") }
            current.payload.settings.lockMinutes = minutes
            try self.persist(current)
            self.objectWillChange.send()
        }
    }

    func touch() {
        guard state == .unlocked, let minutes = session?.payload.settings.lockMinutes else { return }
        autoLockTask?.cancel()
        autoLockTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(minutes * 60))
            guard !Task.isCancelled else { return }
            self?.lock()
        }
    }

    func lock() {
        autoLockTask?.cancel(); autoLockTask = nil
        revealTask?.cancel(); revealTask = nil
        if var key = session?.key { key.resetBytes(in: 0..<key.count) }
        session = nil; entries = []; selected = nil; revealPassword = false; csvPreview = nil
        state = SharedVaultStore.exists() ? .locked : .noVault
    }

    func exportData() -> Data? { try? SharedVaultStore.read() }

    private func open(_ opened: VaultSession) {
        session = opened
        entries = opened.payload.entries.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        state = .unlocked; error = nil; touch()
        Task { await SharedVaultStore.refreshCredentialIdentities(entries: entries) }
    }

    private func persist(_ updated: VaultSession) throws {
        let raw = try VaultCrypto.encode(updated)
        try SharedVaultStore.write(raw)
        session = updated
        entries = updated.payload.entries.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        touch()
        Task { await SharedVaultStore.refreshCredentialIdentities(entries: entries) }
    }

    private func perform(_ work: () async throws -> Void) async {
        do { try await work(); error = nil }
        catch let error as VaultError { self.error = error.localizedDescription }
        catch { self.error = "İşlem güvenli biçimde durduruldu. Tekrar deneyin." }
    }
}
