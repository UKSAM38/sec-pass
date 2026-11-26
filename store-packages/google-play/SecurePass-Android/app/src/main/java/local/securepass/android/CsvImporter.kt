package local.securepass.android

import java.nio.charset.StandardCharsets

data class CsvImportPreview(
    val added: List<VaultEntry>,
    val duplicates: Int,
    val invalid: Int,
    val omittedUrls: Int,
    val total: Int,
)

object CsvImporter {
    private const val MAX_CSV_BYTES = 8 * 1024 * 1024
    private const val MAX_FIELD_LEN = 12_000
    private const val MAX_COLS = 30
    private const val MAX_ROWS = 10_001

    private enum class State { START, QUOTED, CLOSED, PLAIN }

    fun parse(input: String): List<List<String>> {
        if (input.toByteArray(StandardCharsets.UTF_8).size > MAX_CSV_BYTES) {
            throw VaultException("CSV en fazla 8 MB olabilir.")
        }
        val source = if (input.startsWith("\uFEFF")) input.substring(1) else input
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val field = StringBuilder()
        var state = State.START

        fun pushField() {
            if (field.length > MAX_FIELD_LEN) throw VaultException("CSV alanı çok uzun.")
            row.add(field.toString())
            field.clear()
            state = State.START
            if (row.size > MAX_COLS) throw VaultException("CSV sütun sayısı sınırı aşıldı.")
        }

        fun pushRow() {
            pushField()
            if (row.any { it.isNotEmpty() }) rows.add(row)
            row = mutableListOf()
            if (rows.size > MAX_ROWS) throw VaultException("En fazla 10.000 kayıt aktarılabilir.")
        }

        var i = 0
        while (i < source.length) {
            val c = source[i]
            if (state == State.QUOTED) {
                if (c == '"') {
                    if (i + 1 < source.length && source[i + 1] == '"') {
                        field.append('"')
                        i += 2
                        continue
                    } else {
                        state = State.CLOSED
                    }
                } else {
                    field.append(c)
                }
                i++
                continue
            }
            if (c == ',') {
                pushField()
                i++
                continue
            }
            if (c == '\r' || c == '\n') {
                if (c == '\r' && i + 1 < source.length && source[i + 1] == '\n') i++
                pushRow()
                i++
                continue
            }
            if (state == State.CLOSED) throw VaultException("CSV tırnak biçimi geçersiz.")
            if (c == '"') {
                if (state != State.START) throw VaultException("CSV tırnak biçimi geçersiz.")
                state = State.QUOTED
            } else {
                field.append(c)
                state = State.PLAIN
            }
            i++
        }

        if (state == State.QUOTED) throw VaultException("CSV içinde kapanmamış tırnak var.")
        if (field.isNotEmpty() || row.isNotEmpty() || state != State.START) pushRow()
        return rows
    }

    fun prepare(raw: String, existing: List<VaultEntry>): CsvImportPreview {
        val allRows = parse(raw)
        if (allRows.isEmpty()) throw VaultException("CSV boş.")
        val header = allRows.first().map { it.trim().lowercase() }
        val required = listOf("name", "url", "username", "password")
        if (header.toSet().size != header.size || !required.all(header::contains)) {
            throw VaultException("Google CSV başlıkları gerekli: name, url, username, password (note isteğe bağlı).")
        }
        val rows = allRows.drop(1)

        fun get(row: List<String>, col: String): String {
            val index = header.indexOf(col)
            return if (index in row.indices) row[index] else ""
        }

        fun fingerprint(e: VaultEntry) = "${e.url}\u0000${e.username}\u0000${e.password}"

        val seen = existing.mapTo(mutableSetOf(), ::fingerprint)
        val added = mutableListOf<VaultEntry>()
        var duplicates = 0
        var invalid = 0
        var omittedUrls = 0

        for (row in rows) {
            try {
                if (row.size != header.size) throw VaultException("Satır sütun sayısı uyumsuz.")
                val rawName = get(row, "name")
                val rawUrl = get(row, "url")
                val rawUser = get(row, "username")
                val rawPass = get(row, "password")
                val rawNotes = get(row, "note").ifEmpty { get(row, "notes") }
                val resolvedName = rawName.trim().ifEmpty { rawUrl.trim().ifEmpty { "İçe aktarılan kayıt" } }

                val item = try {
                    VaultEntry.fresh(resolvedName, rawUrl, rawUser, rawPass, "İçe aktarılan", rawNotes)
                } catch (_: Exception) {
                    var fallbackNotes = rawNotes
                    if (rawUrl.isNotEmpty()) {
                        val suffix = "Orijinal adres (bağlantı olarak açılmaz): $rawUrl"
                        fallbackNotes = (if (fallbackNotes.isEmpty()) suffix else "$fallbackNotes\n$suffix").take(10_000)
                        omittedUrls++
                    }
                    VaultEntry.fresh(resolvedName, "", rawUser, rawPass, "İçe aktarılan", fallbackNotes)
                }

                val key = fingerprint(item)
                if (!seen.add(key)) {
                    duplicates++
                    continue
                }
                added += item
            } catch (_: Exception) {
                invalid++
            }
        }

        if (existing.size + added.size > 10_000) {
            throw VaultException("Kasa en fazla 10.000 kayıt tutabilir.")
        }
        return CsvImportPreview(added, duplicates, invalid, omittedUrls, rows.size)
    }
}
