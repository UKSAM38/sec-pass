import SwiftUI
import XCTest
@testable import SecurePass

final class VaultValidationTests: XCTestCase {
    func testPasswordGeneratorCoversEverySelectedGroup() throws {
        for _ in 0..<100 {
            let password = try PasswordTools.generate(length: 20)
            XCTAssertEqual(password.count, 20)
            XCTAssertNotNil(password.range(of: "[A-Z]", options: .regularExpression))
            XCTAssertNotNil(password.range(of: "[a-z]", options: .regularExpression))
            XCTAssertNotNil(password.range(of: "[0-9]", options: .regularExpression))
            XCTAssertNotNil(password.range(of: "[^A-Za-z0-9]", options: .regularExpression))
        }
    }

    func testRejectsUnsafeURLs() {
        for value in ["http://example.com", "javascript:alert(1)", "file:///tmp/a", "https://user:pw@example.com"] {
            XCTAssertThrowsError(try VaultValidation.url(value))
        }
        XCTAssertEqual(try VaultValidation.url("example.com"), "https://example.com")
    }

    func testRoundTripAndWrongPassword() async throws {
        let (created, recovery) = try await VaultCrypto.create(masterPassword: "four long random test words 739!")
        let raw = try VaultCrypto.encode(created)
        XCTAssertFalse(String(decoding: raw, as: UTF8.self).contains("four long random"))
        let opened = try await VaultCrypto.unlock(raw, secret: "four long random test words 739!")
        XCTAssertEqual(opened.payload.version, 1)
        let recovered = try await VaultCrypto.unlock(raw, secret: recovery, recovery: true)
        XCTAssertEqual(recovered.payload.entries.count, 0)
        do {
            _ = try await VaultCrypto.unlock(raw, secret: "wrong")
            XCTFail("Wrong password must fail")
        } catch { }
    }

    func testOpensDesktopInteropVector() async throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "INTEROP-TEST-VECTOR", withExtension: "spvault"))
        let opened = try await VaultCrypto.unlock(Data(contentsOf: url), secret: "interop test master phrase 482!")
        XCTAssertEqual(opened.payload.entries.single?.name, "Interop Example")
        XCTAssertEqual(opened.payload.entries.single?.username, "interop@example.test")
        XCTAssertEqual(opened.payload.entries.single?.password, "Interop-demo-secret-739!")
    }

    func testCredentialRotationInvalidatesOldMasterAndCreatesNewRecovery() async throws {
        let (created, _) = try await VaultCrypto.create(masterPassword: "first long master phrase 739!")
        let (rotated, recovery) = try await VaultCrypto.rotateCredentials(created, newMasterPassword: "second long master phrase 951!")
        let raw = try VaultCrypto.encode(rotated)
        await XCTAssertThrowsErrorAsync {
            _ = try await VaultCrypto.unlock(raw, secret: "first long master phrase 739!")
        }
        let reopened = try await VaultCrypto.unlock(raw, secret: "second long master phrase 951!")
        let recovered = try await VaultCrypto.unlock(raw, secret: recovery, recovery: true)
        XCTAssertEqual(reopened.payload.version, 1)
        XCTAssertEqual(recovered.payload.version, 1)
    }

    func testCredentialRotationGeneratesFreshDataKeyAndRejectsOldDataKey() async throws {
        let (created, _) = try await VaultCrypto.create(masterPassword: "first long master phrase 739!")
        let oldDataKey = created.key
        let (rotated, _) = try await VaultCrypto.rotateCredentials(created, newMasterPassword: "second long master phrase 951!")
        XCTAssertNotEqual(rotated.key, oldDataKey)
        let raw = try VaultCrypto.encode(rotated)
        XCTAssertThrowsError(try VaultCrypto.session(envelope: raw, dataKey: oldDataKey))
    }

    func testRepeatedCharacterPasswordsFlaggedAsWeak() {
        XCTAssertTrue(PasswordTools.isWeak("aaaaaaaaaaaa"))
        XCTAssertTrue(PasswordTools.isWeak("11111111111111"))
        XCTAssertFalse(PasswordTools.isWeak("Strong-Unique-948!"))
    }

    func testCSVImporterHandlesBOMQuotesNonHTTPSAndFormulas() throws {
        let csv = "\u{FEFF}name,url,username,password,note\r\n\"Example, Inc\",https://example.com,demo,\"  a,\"\"b  \",\"line1\nline2\"\r\nAndroidApp,android://abc@app,user,=SUM(1+2),\r\nBroken,https://bad.com,user,\r\n"
        let preview = try CSVImporter.prepare(raw: csv, existing: [])
        XCTAssertEqual(preview.added.count, 2)
        XCTAssertEqual(preview.added[0].password, "  a,\"b  ")
        XCTAssertEqual(preview.added[1].url, "")
        XCTAssertTrue(preview.added[1].notes.contains("android://abc@app"))
        XCTAssertEqual(preview.added[1].password, "=SUM(1+2)")
        XCTAssertEqual(preview.omittedURLs, 1)
        XCTAssertEqual(preview.invalid, 1)
        let duplicateCheck = try CSVImporter.prepare(raw: csv, existing: preview.added)
        XCTAssertEqual(duplicateCheck.duplicates, 2)
        XCTAssertEqual(duplicateCheck.added.count, 0)
    }

    @MainActor
    func testScenePhaseInactiveShowsShieldWithoutLockingWhileBackgroundLocks() {
        let vm = VaultViewModel()
        XCTAssertTrue(vm.shouldShowShield(for: .inactive))
        XCTAssertFalse(vm.shouldLockVault(for: .inactive))
        XCTAssertTrue(vm.shouldShowShield(for: .background))
        XCTAssertTrue(vm.shouldLockVault(for: .background))
    }
}

private func XCTAssertThrowsErrorAsync(_ expression: () async throws -> Void) async {
    do { try await expression(); XCTFail("Expected error") } catch { }
}

private extension Collection {
    var single: Element? { count == 1 ? first : nil }
}
