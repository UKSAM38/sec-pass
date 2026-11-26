import Foundation

struct CSVImportPreview: Sendable {
    let added: [VaultEntry]
    let duplicates: Int
    let invalid: Int
    let omittedURLs: Int
    let total: Int
}

enum CSVImporter {
    private static let maxCSVBytes = 8 * 1024 * 1024
    private static let maxFieldLength = 12_000
    private static let maxColumns = 30
    private static let maxRows = 10_001

    private enum ParseState { case start, quoted, closed, plain }

    static func parse(_ input: String) throws -> [[String]] {
        guard input.utf8.count <= maxCSVBytes else {
            throw VaultError.invalid("CSV en fazla 8 MB olabilir.")
        }
        let source: Substring = input.hasPrefix("\u{FEFF}") ? input.dropFirst() : input[...]
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var state: ParseState = .start

        func pushField() throws {
            guard field.count <= maxFieldLength else {
                throw VaultError.invalid("CSV alanı çok uzun.")
            }
            row.append(field)
            field = ""
            state = .start
            guard row.count <= maxColumns else {
                throw VaultError.invalid("CSV sütun sayısı sınırı aşıldı.")
            }
        }

        func pushRow() throws {
            try pushField()
            if row.contains(where: { !$0.isEmpty }) {
                rows.append(row)
            }
            row.removeAll(keepingCapacity: true)
            guard rows.count <= maxRows else {
                throw VaultError.invalid("En fazla 10.000 kayıt aktarılabilir.")
            }
        }

        let chars = Array(source)
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if state == .quoted {
                if c == "\"" {
                    if i + 1 < chars.count && chars[i + 1] == "\"" {
                        field.append("\"")
                        i += 2
                        continue
                    } else {
                        state = .closed
                    }
                } else {
                    field.append(c)
                }
                i += 1
                continue
            }
            if c == "," {
                try pushField()
                i += 1
                continue
            }
            if c == "\r\n" || c == "\r" || c == "\n" {
                if c == "\r" && i + 1 < chars.count && chars[i + 1] == "\n" {
                    i += 1
                }
                try pushRow()
                i += 1
                continue
            }
            if state == .closed {
                throw VaultError.invalid("CSV tırnak biçimi geçersiz.")
            }
            if c == "\"" {
                guard state == .start else {
                    throw VaultError.invalid("CSV tırnak biçimi geçersiz.")
                }
                state = .quoted
            } else {
                field.append(c)
                state = .plain
            }
            i += 1
        }

        if state == .quoted {
            throw VaultError.invalid("CSV içinde kapanmamış tırnak var.")
        }
        if !field.isEmpty || !row.isEmpty || state != .start {
            try pushRow()
        }
        return rows
    }

    static func prepare(raw: String, existing: [VaultEntry]) throws -> CSVImportPreview {
        var rows = try parse(raw)
        guard !rows.isEmpty else {
            throw VaultError.invalid("CSV boş.")
        }
        let header = rows.removeFirst().map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        let required = ["name", "url", "username", "password"]
        guard Set(header).count == header.count, required.allSatisfy({ header.contains($0) }) else {
            throw VaultError.invalid("Google CSV başlıkları gerekli: name, url, username, password (note isteğe bağlı).")
        }

        func value(_ row: [String], _ column: String) -> String {
            guard let idx = header.firstIndex(of: column), idx < row.count else { return "" }
            return row[idx]
        }

        func fingerprint(_ entry: VaultEntry) -> String {
            "\(entry.url)\u{0000}\(entry.username)\u{0000}\(entry.password)"
        }

        var seen = Set(existing.map(fingerprint))
        var added: [VaultEntry] = []
        var duplicates = 0
        var invalid = 0
        var omittedURLs = 0

        for row in rows {
            do {
                guard row.count == header.count else { throw VaultError.invalid("Satır sütun sayısı uyumsuz.") }
                let rawName = value(row, "name")
                let rawURL = value(row, "url")
                let rawUser = value(row, "username")
                let rawPass = value(row, "password")
                let rawNotes = !value(row, "note").isEmpty ? value(row, "note") : value(row, "notes")
                let resolvedName = !rawName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? rawName
                    : (!rawURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? rawURL : "İçe aktarılan kayıt")

                var item: VaultEntry
                do {
                    item = try VaultEntry.fresh(
                        name: resolvedName, url: rawURL, username: rawUser, password: rawPass,
                        category: "İçe aktarılan", notes: rawNotes
                    )
                } catch {
                    var fallbackNotes = rawNotes
                    if !rawURL.isEmpty {
                        let suffix = "Orijinal adres (bağlantı olarak açılmaz): \(rawURL)"
                        fallbackNotes = fallbackNotes.isEmpty ? suffix : "\(fallbackNotes)\n\(suffix)"
                        if fallbackNotes.count > 10_000 {
                            fallbackNotes = String(fallbackNotes.prefix(10_000))
                        }
                    }
                    item = try VaultEntry.fresh(
                        name: resolvedName, url: "", username: rawUser, password: rawPass,
                        category: "İçe aktarılan", notes: fallbackNotes
                    )
                    if !rawURL.isEmpty { omittedURLs += 1 }
                }

                let key = fingerprint(item)
                if seen.contains(key) {
                    duplicates += 1
                    continue
                }
                seen.insert(key)
                added.append(item)
            } catch {
                invalid += 1
            }
        }

        guard existing.count + added.count <= 10_000 else {
            throw VaultError.invalid("Kasa en fazla 10.000 kayıt tutabilir.")
        }
        return CSVImportPreview(
            added: added, duplicates: duplicates, invalid: invalid,
            omittedURLs: omittedURLs, total: rows.count
        )
    }
}
