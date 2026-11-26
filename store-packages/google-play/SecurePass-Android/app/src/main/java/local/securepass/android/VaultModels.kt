package local.securepass.android

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.util.UUID

const val VAULT_FORMAT = "securepass-v1"
const val MAX_VAULT_BYTES = 16 * 1024 * 1024

data class VaultBox(val iv: String, val tag: String, val ciphertext: String)
data class VaultEnvelope(
    val format: String,
    val salt: String,
    val passwordSlot: VaultBox,
    val recoverySlot: VaultBox,
    val data: VaultBox,
)

data class VaultSettings(var lockMinutes: Int = 5)

data class VaultEntry(
    val id: String,
    var name: String,
    var url: String,
    var changeUrl: String,
    var username: String,
    var password: String,
    var category: String,
    var notes: String,
    var favorite: Boolean,
    val createdAt: String,
    var updatedAt: String,
    var passwordChangedAt: String,
) {
    val host: String? get() = runCatching { URI(url).host?.lowercase() }.getOrNull()

    fun toJson() = JSONObject().apply {
        put("id", id); put("name", name); put("url", url); put("changeUrl", changeUrl)
        put("username", username); put("password", password); put("category", category)
        put("notes", notes); put("favorite", favorite); put("createdAt", createdAt)
        put("updatedAt", updatedAt); put("passwordChangedAt", passwordChangedAt)
    }

    companion object {
        fun fromJson(json: JSONObject) = VaultEntry(
            json.getString("id"), json.getString("name"), json.optString("url"),
            json.optString("changeUrl"), json.optString("username"), json.getString("password"),
            json.optString("category", "Diğer"), json.optString("notes"),
            json.optBoolean("favorite"), json.getString("createdAt"), json.getString("updatedAt"),
            json.getString("passwordChangedAt"),
        )

        fun fresh(
            name: String,
            url: String,
            username: String,
            password: String,
            category: String = "Diğer",
            notes: String = "",
        ): VaultEntry {
            val now = Instant.now().toString()
            return VaultEntry(
                UUID.randomUUID().toString(), VaultValidation.name(name), VaultValidation.url(url), "",
                VaultValidation.text(username, 1_024), VaultValidation.password(password),
                VaultValidation.text(category.ifBlank { "Diğer" }, 80),
                VaultValidation.text(notes, 10_000),
                false, now, now, now,
            )
        }
    }
}

data class VaultPayload(
    val version: Int = 1,
    val entries: MutableList<VaultEntry> = mutableListOf(),
    val settings: VaultSettings = VaultSettings(),
) {
    fun toJson() = JSONObject().apply {
        put("version", version)
        put("entries", JSONArray().also { array -> entries.forEach { array.put(it.toJson()) } })
        put("settings", JSONObject().put("lockMinutes", settings.lockMinutes))
    }

    companion object {
        fun fromJson(json: JSONObject): VaultPayload {
            val array = json.getJSONArray("entries")
            val entries = MutableList(array.length()) { VaultEntry.fromJson(array.getJSONObject(it)) }
            return VaultPayload(json.getInt("version"), entries, VaultSettings(json.getJSONObject("settings").getInt("lockMinutes")))
        }
    }
}

data class VaultSession(var key: ByteArray, var envelope: VaultEnvelope, var payload: VaultPayload) {
    fun destroy() { key.fill(0); payload.entries.clear() }
}

class VaultException(message: String, cause: Throwable? = null) : Exception(message, cause)

object VaultValidation {
    fun text(value: String, maximum: Int): String {
        if (value.length > maximum) throw VaultException("Alan çok uzun.")
        return value
    }

    fun name(value: String): String = value.trim().also {
        if (it.isEmpty()) throw VaultException("Kayıt adı gerekli.")
        text(it, 256)
    }

    fun password(value: String): String = value.also {
        if (it.isEmpty()) throw VaultException("Parola boş olamaz.")
        text(it, 4_096)
    }

    fun master(value: String) {
        if (value.length !in 14..1_024 || value.isBlank()) throw VaultException("Ana parola en az 14 karakter olmalı.")
    }

    fun url(value: String): String {
        text(value, 2_048)
        if (value.isBlank()) return ""
        val trimmed = value.trim()
        if (trimmed.contains('\r') || trimmed.contains('\n')) {
            throw VaultException("Yalnızca geçerli HTTPS adresleri kabul edilir.")
        }
        val hasScheme = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(trimmed)
        val candidate = if (!hasScheme) "https://$trimmed" else trimmed
        val parsed = runCatching { URI(candidate) }.getOrElse {
            throw VaultException("Yalnızca geçerli HTTPS adresleri kabul edilir.")
        }
        val host = parsed.host
        if (parsed.scheme?.lowercase() != "https" || host == null || !host.contains('.') || parsed.userInfo != null) {
            throw VaultException("Yalnızca geçerli HTTPS adresleri kabul edilir.")
        }
        return parsed.toString()
    }

    fun payload(payload: VaultPayload) {
        if (payload.version != 1 || payload.entries.size > 10_000 || payload.settings.lockMinutes !in setOf(1, 2, 5, 10, 15)) {
            throw VaultException("Kasa içeriği geçersiz.")
        }
        val ids = mutableSetOf<String>()
        payload.entries.forEach {
            if (!ids.add(it.id)) throw VaultException("Tekrarlanan kayıt kimliği.")
            name(it.name); url(it.url); url(it.changeUrl); password(it.password)
            runCatching { Instant.parse(it.createdAt); Instant.parse(it.updatedAt); Instant.parse(it.passwordChangedAt) }
                .getOrElse { throw VaultException("Geçersiz kayıt tarihi.") }
        }
    }
}
