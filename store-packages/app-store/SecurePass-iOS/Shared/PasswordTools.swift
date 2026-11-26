import Foundation
import Security

enum PasswordTools {
    private static let upper = Array("ABCDEFGHJKLMNPQRSTUVWXYZ")
    private static let lower = Array("abcdefghijkmnopqrstuvwxyz")
    private static let numbers = Array("23456789")
    private static let symbols = Array("!@#$%^&*()-_=+[]{}:,.?")

    static func generate(length: Int = 20, includeSymbols: Bool = true) throws -> String {
        guard (12...128).contains(length) else { throw VaultError.invalid("Parola uzunluğu 12–128 olmalı.") }
        var groups = [upper, lower, numbers]
        if includeSymbols { groups.append(symbols) }
        var characters = try groups.map { try randomElement($0) }
        let all = groups.flatMap { $0 }
        while characters.count < length { characters.append(try randomElement(all)) }
        for index in stride(from: characters.count - 1, through: 1, by: -1) {
            let swap = try randomInt(upperBound: index + 1)
            characters.swapAt(index, swap)
        }
        return String(characters)
    }

    static func reuseCounts(_ entries: [VaultEntry]) -> [String: Int] {
        Dictionary(grouping: entries, by: \.password).mapValues(\.count)
    }

    static func isWeak(_ password: String) -> Bool {
        password.count < 12 ||
            Set(password).count <= 1 ||
            ["password", "qwerty", "123456", "sifre", "şifre", "admin"]
                .contains { password.lowercased().hasPrefix($0) }
    }

    private static func randomElement(_ values: [Character]) throws -> Character {
        values[try randomInt(upperBound: values.count)]
    }

    private static func randomInt(upperBound: Int) throws -> Int {
        guard upperBound > 0 else { throw VaultError.invalid("Karakter kümesi boş.") }
        let limit = UInt32.max - UInt32.max % UInt32(upperBound)
        var value: UInt32 = 0
        repeat {
            guard SecRandomCopyBytes(kSecRandomDefault, MemoryLayout<UInt32>.size, &value) == errSecSuccess else {
                throw VaultError.invalid("Güvenli rastgele veri üretilemedi.")
            }
        } while value >= limit
        return Int(value % UInt32(upperBound))
    }
}

