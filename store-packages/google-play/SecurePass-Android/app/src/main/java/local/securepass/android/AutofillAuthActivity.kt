package local.securepass.android

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.widget.*
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AutofillAuthActivity : FragmentActivity() {
    private lateinit var repository: VaultRepository
    private lateinit var usernames: ArrayList<AutofillId>
    private lateinit var passwords: ArrayList<AutofillId>
    private var domain: String? = null
    private var failedAttempts = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        repository = VaultRepository(this)
        usernames = parcelables(EXTRA_USER_IDS)
        passwords = parcelables(EXTRA_PASSWORD_IDS)
        domain = intent.getStringExtra(EXTRA_DOMAIN)
        if (!repository.exists()) {
            cancel()
            return
        }
        if (BiometricVaultKey(this).exists()) {
            tryBiometricUnlock()
        } else {
            showMasterUnlock()
        }
    }

    private fun tryBiometricUnlock() {
        val helper = BiometricVaultKey(this)
        val cipher = runCatching { helper.prepareDecryption() }.getOrElse {
            helper.delete()
            showMasterUnlock()
            return
        }
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val authenticated = result.cryptoObject?.cipher
                if (authenticated == null) {
                    showMasterUnlock()
                    return
                }
                runCatching {
                    val key = helper.finishDecryption(authenticated)
                    try {
                        val session = VaultCrypto.unlockWithKey(repository.read(), key)
                        VaultSessionHolder.open(session)
                        choose(session.payload.entries)
                    } finally {
                        key.fill(0)
                    }
                }.onFailure { showMasterUnlock() }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                showMasterUnlock()
            }
        })
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("SecPass AutoFill")
                .setSubtitle(getString(R.string.autofill_unlock_prompt, domain ?: getString(R.string.autofill_app_fallback)))
                .setAllowedAuthenticators(BIOMETRIC_STRONG)
                .setNegativeButtonText("Ana parola kullan")
                .build(),
            BiometricPrompt.CryptoObject(cipher),
        )
    }

    private fun showMasterUnlock() {
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 32, 48, 16) }
        val message = TextView(this).apply {
            text = getString(R.string.autofill_unlock_prompt, domain ?: getString(R.string.autofill_app_fallback))
            setTextColor(Color.DKGRAY)
        }
        val password = EditText(this).apply {
            hint = "Ana parola"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        layout.addView(message); layout.addView(password)
        val dialog = AlertDialog.Builder(this).setTitle("SecPass AutoFill").setView(layout)
            .setNegativeButton("Vazgeç") { _, _ -> cancel() }
            .setPositiveButton("Aç", null)
            .create()
        dialog.setOnCancelListener { cancel() }
        dialog.setOnShowListener {
            val positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            positive.setOnClickListener {
                val chars = password.text.toString().toCharArray()
                password.text.clear()
                if (chars.isEmpty()) return@setOnClickListener
                positive.isEnabled = false
                lifecycleScope.launch {
                    if (failedAttempts > 0) {
                        delay((1 shl (failedAttempts - 1).coerceAtMost(3)) * 1_000L)
                    }
                    runCatching { withContext(Dispatchers.Default) { VaultCrypto.unlock(repository.read(), chars) } }
                        .onSuccess { session ->
                            failedAttempts = 0
                            VaultSessionHolder.open(session)
                            dialog.dismiss()
                            choose(session.payload.entries)
                        }
                        .onFailure {
                            failedAttempts = (failedAttempts + 1).coerceAtMost(4)
                            message.setText(R.string.vault_unlock_failed)
                            positive.isEnabled = true
                        }
                }
            }
        }
        dialog.show()
    }

    private fun choose(all: List<VaultEntry>) {
        val fields = Fields(usernames, passwords, domain)
        val matched = SecurePassAutofillService.matching(all, domain)
        val entries = matched.ifEmpty { all.sortedBy { it.name.lowercase() } }
        if (entries.isEmpty()) return cancel()
        if (matched.size == 1) return finish(matched.first(), fields)
        AlertDialog.Builder(this).setTitle("Hesap seç")
            .setItems(entries.map { if (it.username.isBlank()) it.name else "${it.name} — ${it.username}" }.toTypedArray()) { _, index ->
                finish(entries[index], fields)
            }
            .setOnCancelListener { cancel() }
            .show()
    }

    private fun finish(entry: VaultEntry, fields: Fields) {
        val result = Intent().putExtra(
            AutofillManager.EXTRA_AUTHENTICATION_RESULT,
            SecurePassAutofillService.dataset(packageName, fields, entry),
        )
        setResult(RESULT_OK, result); finish()
    }

    private fun cancel() { setResult(RESULT_CANCELED); finish() }

    @Suppress("DEPRECATION")
    private fun parcelables(key: String): ArrayList<AutofillId> =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(key, AutofillId::class.java) ?: arrayListOf()
        else intent.getParcelableArrayListExtra(key) ?: arrayListOf()

    companion object {
        const val EXTRA_USER_IDS = "io.github.uksam38.secpass.user.ids"
        const val EXTRA_PASSWORD_IDS = "io.github.uksam38.secpass.password.ids"
        const val EXTRA_DOMAIN = "io.github.uksam38.secpass.domain"
    }
}
