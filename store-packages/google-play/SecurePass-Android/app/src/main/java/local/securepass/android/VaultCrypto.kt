package local.securepass.android

import org.bouncycastle.crypto.generators.SCrypt
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

object VaultCrypto {
    private const val N = 131_072
    private const val R = 8
    private const val P = 1
    private val random = SecureRandom()

    data class Created(val session: VaultSession, val recoveryKey: String)

    fun create(masterPassword: CharArray): Created {
        val master = String(masterPassword)
        VaultValidation.master(master)
        val key = randomBytes(32)
        val salt = randomBytes(32)
        val recovery = randomBytes(32)
        val passwordKey = derive(masterPassword, salt)
        return try {
            val empty = VaultBox("", "", "")
            var envelope = VaultEnvelope(
                VAULT_FORMAT, b64(salt), seal(key, passwordKey, "password"),
                seal(key, recovery, "recovery"), empty,
            )
            val payload = VaultPayload()
            envelope = envelope.copy(data = seal(payload.toJson().toString().toByteArray(StandardCharsets.UTF_8), key, "data"))
            Created(VaultSession(key, envelope, payload), recovery.joinToString("") { "%02x".format(it) }.chunked(8).joinToString("-"))
        } finally {
            passwordKey.fill(0); recovery.fill(0); masterPassword.fill('\u0000')
        }
    }

    fun unlock(raw: ByteArray, secret: CharArray, recovery: Boolean = false): VaultSession {
        if (raw.size > MAX_VAULT_BYTES) throw VaultException("Kasa dosyası çok büyük.")
        val envelope = try { envelope(JSONObject(String(raw, StandardCharsets.UTF_8))) }
        catch (error: Exception) { throw VaultException("Kasa dosyası geçersiz.", error) }
        if (envelope.format != VAULT_FORMAT) throw VaultException("Desteklenmeyen kasa biçimi.")
        val wrapping = if (recovery) recoveryKey(secret) else derive(secret, strictB64(envelope.salt, 32))
        return try {
            val key = open(if (recovery) envelope.recoverySlot else envelope.passwordSlot, wrapping, if (recovery) "recovery" else "password")
            if (key.size != 32) throw VaultException("Kasa anahtarı geçersiz.")
            try {
                unlockWithKey(raw, key)
            } finally {
                key.fill(0)
            }
        } catch (error: Exception) {
            throw VaultException("Ana parola / kurtarma anahtarı yanlış veya kasa hasarlı.", error)
        } finally {
            wrapping.fill(0); secret.fill('\u0000')
        }
    }

    fun unlockWithKey(raw: ByteArray, key: ByteArray): VaultSession {
        if (raw.size > MAX_VAULT_BYTES || key.size != 32) throw VaultException("Kasa geçersiz.")
        val envelope = try { envelope(JSONObject(String(raw, StandardCharsets.UTF_8))) }
        catch (error: Exception) { throw VaultException("Kasa dosyası geçersiz.", error) }
        if (envelope.format != VAULT_FORMAT) throw VaultException("Desteklenmeyen kasa biçimi.")
        val plaintext = try { open(envelope.data, key, "data") }
        catch (error: Exception) { throw VaultException("Şifreli kasa açılamadı.", error) }
        return try {
            val payload = VaultPayload.fromJson(JSONObject(String(plaintext, StandardCharsets.UTF_8)))
            VaultValidation.payload(payload)
            VaultSession(key.copyOf(), envelope, payload)
        } finally { plaintext.fill(0) }
    }

    fun encode(session: VaultSession): ByteArray {
        VaultValidation.payload(session.payload)
        val data = seal(session.payload.toJson().toString().toByteArray(StandardCharsets.UTF_8), session.key, "data")
        return json(session.envelope.copy(data = data)).toString().toByteArray(StandardCharsets.UTF_8)
    }

    fun rotateCredentials(session: VaultSession, newMasterPassword: CharArray): Created {
        val master = String(newMasterPassword)
        VaultValidation.master(master)
        val newDataKey = randomBytes(32)
        val salt = randomBytes(32)
        val recovery = randomBytes(32)
        val passwordKey = derive(newMasterPassword, salt)
        return try {
            val payloadCopy = VaultPayload.fromJson(JSONObject(session.payload.toJson().toString()))
            val empty = VaultBox("", "", "")
            var envelope = VaultEnvelope(
                VAULT_FORMAT, b64(salt),
                seal(newDataKey, passwordKey, "password"),
                seal(newDataKey, recovery, "recovery"),
                empty,
            )
            envelope = envelope.copy(data = seal(payloadCopy.toJson().toString().toByteArray(StandardCharsets.UTF_8), newDataKey, "data"))
            Created(
                VaultSession(newDataKey, envelope, payloadCopy),
                recovery.joinToString("") { "%02x".format(it) }.chunked(8).joinToString("-"),
            )
        } finally {
            passwordKey.fill(0); recovery.fill(0); newMasterPassword.fill('\u0000')
        }
    }

    private fun derive(password: CharArray, salt: ByteArray): ByteArray =
        SCrypt.generate(String(password).toByteArray(StandardCharsets.UTF_8), salt, N, R, P, 32)

    private fun recoveryKey(value: CharArray): ByteArray {
        val normalized = String(value).replace("-", "").replace(" ", "").lowercase()
        if (!normalized.matches(Regex("[0-9a-f]{64}"))) throw VaultException("Kurtarma anahtarı geçersiz.")
        return normalized.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    private fun seal(plaintext: ByteArray, key: ByteArray, purpose: String): VaultBox {
        val iv = randomBytes(12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        cipher.updateAAD("$VAULT_FORMAT:$purpose".toByteArray(StandardCharsets.UTF_8))
        val result = cipher.doFinal(plaintext)
        val ciphertext = result.copyOfRange(0, result.size - 16)
        val tag = result.copyOfRange(result.size - 16, result.size)
        return VaultBox(b64(iv), b64(tag), b64(ciphertext))
    }

    private fun open(box: VaultBox, key: ByteArray, purpose: String): ByteArray {
        val iv = strictB64(box.iv, 12)
        val tag = strictB64(box.tag, 16)
        val ciphertext = strictB64(box.ciphertext)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        cipher.updateAAD("$VAULT_FORMAT:$purpose".toByteArray(StandardCharsets.UTF_8))
        return cipher.doFinal(ciphertext + tag)
    }

    private fun envelope(json: JSONObject) = VaultEnvelope(
        json.getString("format"), json.getString("salt"), box(json.getJSONObject("passwordSlot")),
        box(json.getJSONObject("recoverySlot")), box(json.getJSONObject("data")),
    )

    private fun box(json: JSONObject) = VaultBox(json.getString("iv"), json.getString("tag"), json.getString("ciphertext"))
    private fun json(box: VaultBox) = JSONObject().put("iv", box.iv).put("tag", box.tag).put("ciphertext", box.ciphertext)
    private fun json(value: VaultEnvelope) = JSONObject().put("format", value.format).put("salt", value.salt)
        .put("passwordSlot", json(value.passwordSlot)).put("recoverySlot", json(value.recoverySlot)).put("data", json(value.data))

    private fun strictB64(value: String, length: Int? = null): ByteArray {
        if (value.length > MAX_VAULT_BYTES * 2 || !value.matches(Regex("[A-Za-z0-9+/]*={0,2}"))) throw VaultException("Şifreli alan geçersiz.")
        val decoded = try { Base64.getDecoder().decode(value) } catch (error: Exception) { throw VaultException("Şifreli alan geçersiz.", error) }
        if (b64(decoded) != value || length != null && decoded.size != length) throw VaultException("Şifreli alan geçersiz.")
        return decoded
    }

    private fun b64(value: ByteArray): String = Base64.getEncoder().encodeToString(value)
    private fun randomBytes(count: Int) = ByteArray(count).also(random::nextBytes)
}
