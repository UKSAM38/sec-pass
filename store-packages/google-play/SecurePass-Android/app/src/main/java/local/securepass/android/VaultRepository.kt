package local.securepass.android

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.charset.StandardCharsets

class VaultRepository(private val context: Context) {
    private val file = File(context.noBackupFilesDir, "active.spvault")
    private val previousFile = File(context.noBackupFilesDir, "previous.spvault")
    fun exists() = file.isFile
    fun hasSafetyBackup() = previousFile.isFile

    fun read(): ByteArray {
        if (!file.isFile || file.length() > MAX_VAULT_BYTES) throw VaultException("Kasa bulunamadı veya çok büyük.")
        return file.readBytes()
    }

    fun write(bytes: ByteArray, preservePrevious: Boolean = true) {
        if (bytes.size > MAX_VAULT_BYTES) throw VaultException("Kasa dosyası çok büyük.")
        file.parentFile?.mkdirs()
        if (preservePrevious && file.isFile) atomicWrite(previousFile, file.readBytes())
        atomicWrite(file, bytes)
    }

    private fun atomicWrite(target: File, bytes: ByteArray) {
        val targetAtomic = AtomicFile(target)
        val stream = targetAtomic.startWrite()
        try {
            stream.write(bytes); stream.fd.sync(); targetAtomic.finishWrite(stream)
        } catch (error: Exception) {
            targetAtomic.failWrite(stream); throw error
        }
    }

    fun import(uri: Uri) {
        val bytes = readLimitedBytes(uri, MAX_VAULT_BYTES, "Kasa dosyası çok büyük.")
        val format = runCatching { org.json.JSONObject(String(bytes, StandardCharsets.UTF_8)).getString("format") }
            .getOrElse { throw VaultException("Geçersiz kasa dosyası.") }
        if (format != VAULT_FORMAT) throw VaultException("Geçersiz kasa dosyası.")
        write(bytes); BiometricVaultKey(context).delete(); VaultSessionHolder.lock()
    }

    fun readCsv(uri: Uri): String {
        val bytes = readLimitedBytes(uri, 8 * 1024 * 1024, "CSV en fazla 8 MB olabilir.")
        return String(bytes, StandardCharsets.UTF_8)
    }

    private fun readLimitedBytes(uri: Uri, maxBytes: Int, limitError: String): ByteArray {
        return context.contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(16_384)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > maxBytes) throw VaultException(limitError)
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        } ?: throw VaultException("Dosya okunamadı.")
    }

    fun restoreSafetyBackup() {
        if (!previousFile.isFile) throw VaultException("Geri dönüş kopyası bulunamadı.")
        val bytes = previousFile.readBytes()
        if (bytes.size > MAX_VAULT_BYTES) throw VaultException("Geri dönüş kopyası geçersiz.")
        val format = runCatching { org.json.JSONObject(String(bytes, StandardCharsets.UTF_8)).getString("format") }
            .getOrElse { throw VaultException("Geri dönüş kopyası geçersiz.") }
        if (format != VAULT_FORMAT) throw VaultException("Geri dönüş kopyası geçersiz.")
        write(bytes, preservePrevious = false)
        BiometricVaultKey(context).delete(); VaultSessionHolder.lock()
    }

    fun export(uri: Uri) {
        val bytes = read()
        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
            ?: throw VaultException("Yedek dosyası yazılamadı.")
    }
}

object VaultSessionHolder {
    @Volatile private var value: VaultSession? = null
    @Volatile private var lastActivity = 0L

    @Synchronized fun open(session: VaultSession) {
        if (value !== session) value?.destroy()
        value = session
        touch()
    }

    @Synchronized fun lock() { value?.destroy(); value = null; lastActivity = 0L }
    fun current(): VaultSession? {
        val session = value ?: return null
        val timeout = session.payload.settings.lockMinutes * 60_000L
        if (android.os.SystemClock.elapsedRealtime() - lastActivity >= timeout) { lock(); return null }
        touch(); return value
    }
    fun touch() { lastActivity = android.os.SystemClock.elapsedRealtime() }
}
