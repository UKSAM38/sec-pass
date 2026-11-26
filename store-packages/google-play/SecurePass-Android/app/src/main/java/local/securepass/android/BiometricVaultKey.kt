package local.securepass.android

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class BiometricVaultKey(private val context: Context) {
    private val alias = "securepass-biometric-vault-key"
    private val prefs = context.getSharedPreferences("biometric-vault", Context.MODE_PRIVATE)

    fun exists() = prefs.contains("ciphertext") && prefs.contains("iv")

    fun prepareEncryption(): Cipher {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!store.containsAlias(alias)) {
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(true)
                    .setInvalidatedByBiometricEnrollment(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            } else {
                @Suppress("DEPRECATION")
                builder.setUserAuthenticationValidityDurationSeconds(-1)
            }
            generator.init(builder.build())
            generator.generateKey()
        }
        return Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
    }

    fun finishEncryption(cipher: Cipher, dataKey: ByteArray) {
        val encrypted = cipher.doFinal(dataKey)
        prefs.edit {
            putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            putString("ciphertext", Base64.encodeToString(encrypted, Base64.NO_WRAP))
        }
    }

    fun prepareDecryption(): Cipher {
        val iv = prefs.getString("iv", null)?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: throw VaultException("Biyometrik anahtar bulunamadı.")
        return Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        }
    }

    fun finishDecryption(cipher: Cipher): ByteArray {
        val encrypted = prefs.getString("ciphertext", null)?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: throw VaultException("Biyometrik anahtar bulunamadı.")
        return cipher.doFinal(encrypted).also {
            if (it.size != 32) { it.fill(0); throw VaultException("Biyometrik anahtar geçersiz.") }
        }
    }

    fun delete() {
        prefs.edit { clear() }
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(alias)) store.deleteEntry(alias)
    }

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return store.getKey(alias, null) as? SecretKey ?: throw VaultException("Cihaz anahtarı kullanılamıyor.")
    }
}
