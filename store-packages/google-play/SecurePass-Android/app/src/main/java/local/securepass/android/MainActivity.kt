package local.securepass.android

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Instant

class MainActivity : FragmentActivity() {
    private lateinit var repository: VaultRepository
    private lateinit var root: LinearLayout
    private val handler = Handler(Looper.getMainLooper())
    private val pickerGuard = SystemPickerLockGuard()
    private var failedUnlockAttempts = 0
    private var lockGeneration = 0

    private val importVault = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        pickerGuard.endPicker()
        uri ?: return@registerForActivityResult
        confirmImport(uri)
    }
    private val importCsv = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        pickerGuard.endPicker()
        uri ?: return@registerForActivityResult
        previewCsvImport(uri)
    }
    private val exportVault = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        pickerGuard.endPicker()
        uri ?: return@registerForActivityResult
        runAction { repository.export(uri); toast("Şifreli yedek kaydedildi.") }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        repository = VaultRepository(this)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(28))
            setBackgroundColor(Color.rgb(12, 18, 25))
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.rgb(12, 18, 25))
            clipToPadding = false
            addView(root)
        }
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or
                    WindowInsetsCompat.Type.displayCutout() or
                    WindowInsetsCompat.Type.ime()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(scroll)
        if (savedInstanceState == null) {
            intent?.data?.let { uri ->
                intent.data = null
                confirmImport(uri)
            }
        }
        if (repository.exists()) renderLocked() else renderWelcome()
    }

    override fun onResume() {
        super.onResume()
        pickerGuard.endPicker()
    }

    override fun onStop() {
        super.onStop()
        if (pickerGuard.shouldLockOnStop(isChangingConfigurations)) {
            lockVaultUi()
        }
    }

    private fun lockVaultUi() {
        lockGeneration++
        VaultSessionHolder.lock()
        renderLocked()
    }

    private fun renderWelcome() {
        root.removeAllViews()
        title("SecPass")
        subtitle("Her hesabına ayrı parola. Hepsi sende.")
        note("Kasanız cihazda AES-256-GCM ile şifrelenir; sunucuya veri gönderilmez. Ana parola ve kurtarma anahtarı birlikte kaybolursa kasa geri açılamaz.")
        primaryButton("Yeni kasa oluştur") { createDialog() }
        button("Mevcut .spvault dosyasını içe aktar") { launchImportVault() }
    }

    private fun renderLocked() {
        if (!repository.exists()) { renderWelcome(); return }
        root.removeAllViews()
        title("SecPass")
        subtitle("Şifreli kasa kilitli")
        val secret = secretField("Ana parola")
        root.addView(secret, matchMargins())
        primaryButton("Kasayı aç") {
            val chars = secret.text.toString().toCharArray(); secret.text.clear()
            if (chars.isEmpty()) return@primaryButton
            val token = lockGeneration
            lifecycleScope.launch {
                if (failedUnlockAttempts > 0) delay((1 shl (failedUnlockAttempts - 1).coerceAtMost(3)) * 1_000L)
                runCatching { withContext(Dispatchers.Default) { VaultCrypto.unlock(repository.read(), chars) } }
                    .onSuccess {
                        if (token != lockGeneration || !lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                            it.destroy()
                            return@onSuccess
                        }
                        failedUnlockAttempts = 0; VaultSessionHolder.open(it); renderVault()
                    }
                    .onFailure {
                        failedUnlockAttempts = (failedUnlockAttempts + 1).coerceAtMost(4)
                        showError(VaultException("Kasa açılamadı. Bilgiyi kontrol edip tekrar deneyin."))
                    }
            }
        }
        if (BiometricVaultKey(this).exists()) button("Biyometri ile aç") { biometricUnlock() }
        button("Kurtarma anahtarıyla aç") { recoveryDialog() }
        button("Başka .spvault dosyası seç") { launchImportVault() }
    }

    private fun launchImportVault() {
        pickerGuard.beginPicker()
        importVault.launch(arrayOf("application/octet-stream", "application/json", "*/*"))
    }

    private fun renderVault() {
        val session = VaultSessionHolder.current() ?: return renderLocked()
        root.removeAllViews()
        val header = horizontal()
        header.addView(TextView(this).apply {
            setText(R.string.vault_title)
            textSize = 26f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
        }, weight(1f))
        header.addView(smallButton("Kilitle") { lockVaultUi() })
        root.addView(header)

        val counts = PasswordTools.counts(session.payload.entries)
        val risky = session.payload.entries.count { (counts[it.password] ?: 0) > 1 || PasswordTools.weak(it.password) }
        subtitle("${session.payload.entries.size} kayıt • $risky güvenlik uyarısı • ${session.payload.settings.lockMinutes} dk kilit")

        val actionsRow = horizontal().apply { setPadding(0, 0, 0, dp(10)) }
        actionsRow.addView(Button(this).apply {
            text = "+ Yeni kayıt"
            isAllCaps = false
            setTextColor(Color.WHITE)
            background = cardDrawable(Color.rgb(46, 166, 140), Color.rgb(46, 166, 140))
            setOnClickListener { editDialog(null) }
        }, weight(1f).apply { marginEnd = dp(8) })
        actionsRow.addView(smallButton("Ayarlar & Araçlar") { settingsDialog() })
        root.addView(actionsRow)

        val search = field("Site, kullanıcı adı veya not ara…")
        root.addView(search, matchMargins())
        val riskOnly = CheckBox(this).apply { setText(R.string.risk_only); setTextColor(Color.LTGRAY) }
        root.addView(riskOnly)
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(list)

        fun refresh() {
            VaultSessionHolder.touch()
            list.removeAllViews()
            val term = search.text.toString().trim()
            val visibleEntries = session.payload.entries.sortedBy { it.name.lowercase() }.filter {
                (term.isEmpty() || listOf(it.name, it.username, it.url, it.notes).any { value -> value.contains(term, true) }) &&
                    (!riskOnly.isChecked || (counts[it.password] ?: 0) > 1 || PasswordTools.weak(it.password))
            }
            if (visibleEntries.isEmpty()) {
                list.addView(TextView(this).apply {
                    text = if (session.payload.entries.isEmpty()) "Henüz kayıt yok. Yeni kayıt ekleyin veya Google CSV aktarın."
                    else "Aramayla eşleşen kayıt bulunamadı."
                    setTextColor(Color.GRAY)
                    setPadding(0, dp(18), 0, dp(18))
                })
                return
            }
            visibleEntries.forEach { entry ->
                val reused = counts[entry.password] ?: 0
                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = cardDrawable(Color.rgb(21, 31, 44), Color.rgb(37, 54, 74))
                    setPadding(dp(16), dp(14), dp(16), dp(14))
                    isClickable = true
                    isFocusable = true
                    setOnClickListener { entryDialog(entry) }
                }
                card.addView(TextView(this).apply {
                    text = if (entry.favorite) "★ ${entry.name}" else entry.name
                    textSize = 17f
                    setTypeface(typeface, Typeface.BOLD)
                    setTextColor(Color.WHITE)
                })
                card.addView(TextView(this).apply {
                    text = entry.username.ifEmpty { "Kullanıcı adı eklenmemiş" } + " • ${entry.category}"
                    textSize = 13f
                    setTextColor(Color.rgb(157, 176, 195))
                })
                if (reused > 1 || PasswordTools.weak(entry.password)) {
                    card.addView(TextView(this).apply {
                        text = if (reused > 1) "⚠ Aynı parola $reused hesapta kullanılıyor" else "⚠ Kısa veya yaygın parola"
                        textSize = 12f
                        setTextColor(if (reused > 1) Color.rgb(255, 115, 115) else Color.rgb(244, 184, 96))
                        setPadding(0, dp(4), 0, 0)
                    })
                }
                list.addView(card, matchMargins())
            }
        }

        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) = refresh()
        })
        riskOnly.setOnCheckedChangeListener { _, _ -> refresh() }
        refresh()
    }

    private fun settingsDialog() {
        val session = VaultSessionHolder.current() ?: return renderLocked()
        val bioHelper = BiometricVaultKey(this)
        val items = mutableListOf(
            "Google CSV içe aktar",
            "Şifreli yedek dışa aktar (.spvault)",
            "Başka .spvault kasası içe aktar",
            "Otomatik kilit süresi (${session.payload.settings.lockMinutes} dk)",
            if (bioHelper.exists()) "Biyometrik hızlı açılışı kapat" else "Biyometrik hızlı açılışı etkinleştir",
            "Ana parolayı ve veri anahtarını yenile",
            "Android AutoFill'i etkinleştir",
        )
        if (repository.hasSafetyBackup()) items += "Önceki şifreli kasaya geri dön"
        AlertDialog.Builder(this).setTitle("SecPass Araçlar & Güvenlik")
            .setItems(items.toTypedArray()) { _, which ->
                when (items[which]) {
                    "Google CSV içe aktar" -> {
                        pickerGuard.beginPicker()
                        importCsv.launch(arrayOf("text/*", "text/csv", "text/comma-separated-values", "*/*"))
                    }
                    "Şifreli yedek dışa aktar (.spvault)" -> {
                        pickerGuard.beginPicker()
                        exportVault.launch("SecPass-yedek.spvault")
                    }
                    "Başka .spvault kasası içe aktar" -> launchImportVault()
                    "Biyometrik hızlı açılışı kapat" -> runAction { bioHelper.delete(); toast("Biyometrik hızlı açılış kapatıldı.") }
                    "Biyometrik hızlı açılışı etkinleştir" -> enableBiometrics(session.key)
                    "Ana parolayı ve veri anahtarını yenile" -> rotateCredentialsDialog()
                    "Android AutoFill'i etkinleştir" -> runAction {
                        pickerGuard.beginPicker()
                        startActivity(Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).setData("package:$packageName".toUri()))
                    }
                    "Önceki şifreli kasaya geri dön" -> confirmRestore()
                    else -> lockTimeoutDialog()
                }
            }
            .setNegativeButton("Kapat", null)
            .show()
    }

    private fun lockTimeoutDialog() {
        val options = listOf(1, 2, 5, 10, 15)
        val session = VaultSessionHolder.current() ?: return
        val currentIdx = options.indexOf(session.payload.settings.lockMinutes).coerceAtLeast(2)
        AlertDialog.Builder(this).setTitle("Hareketsizlikte otomatik kilit")
            .setSingleChoiceItems(options.map { "$it dakika" }.toTypedArray(), currentIdx) { dialog, index ->
                runAction {
                    session.payload.settings.lockMinutes = options[index]
                    repository.write(VaultCrypto.encode(session))
                    dialog.dismiss()
                    renderVault()
                }
            }
            .setNegativeButton("Vazgeç", null)
            .show()
    }

    private fun previewCsvImport(uri: Uri) {
        runAction {
            val session = VaultSessionHolder.current() ?: throw VaultException("Kasa kilitli.")
            val raw = repository.readCsv(uri)
            val preview = CsvImporter.prepare(raw, session.payload.entries)
            val summary = buildString {
                append("Eklenecek yeni kayıt: ${preview.added.size}\n")
                append("Birebir tekrar (atlandı): ${preview.duplicates}\n")
                append("Geçersiz satır (atlandı): ${preview.invalid}\n")
                append("Nota alınan HTTPS dışı adres: ${preview.omittedUrls}\n\n")
                append("⚠ CSV şifresizdir. Aktarım sonrası CSV dosyasını İndirilenler ve Çöp Kutusu'ndan silin.")
            }
            val builder = AlertDialog.Builder(this).setTitle("Google CSV İçe Aktar").setMessage(summary)
                .setNegativeButton("Vazgeç", null)
            if (preview.added.isNotEmpty()) {
                builder.setPositiveButton("Şifreleyerek aktar") { _, _ ->
                    runAction {
                        val current = VaultSessionHolder.current() ?: throw VaultException("Kasa kilitli.")
                        if (current.payload.entries.size + preview.added.size > 10_000) {
                            throw VaultException("Kasa en fazla 10.000 kayıt tutabilir.")
                        }
                        current.payload.entries += preview.added
                        repository.write(VaultCrypto.encode(current))
                        toast("${preview.added.size} kayıt şifrelenerek aktarıldı.")
                        renderVault()
                    }
                }
            }
            builder.show()
        }
    }

    private fun confirmImport(uri: Uri) {
        if (!repository.exists()) {
            runAction { repository.import(uri); renderLocked() }
            return
        }
        AlertDialog.Builder(this).setTitle("Mevcut kasa değiştirilsin mi?")
            .setMessage("Mevcut kasanın şifreli geri dönüş kopyası cihazda saklandıktan sonra seçilen dosya etkinleştirilecek.")
            .setNegativeButton("Vazgeç", null)
            .setPositiveButton("Yedekle ve içe aktar") { _, _ ->
                runAction { repository.import(uri); renderLocked() }
            }.show()
    }

    private fun confirmRestore() {
        AlertDialog.Builder(this).setTitle("Önceki kasaya geri dönülsün mü?")
            .setMessage("Mevcut kasa kapanacak ve biyometrik hızlı açılış sıfırlanacak.")
            .setNegativeButton("Vazgeç", null)
            .setPositiveButton("Geri dön") { _, _ -> runAction { repository.restoreSafetyBackup(); renderLocked() } }
            .show()
    }

    private fun rotateCredentialsDialog() {
        val layout = dialogLayout()
        val master = secretField("Yeni ana parola (en az 14 karakter)")
        val confirmation = secretField("Yeni ana parolayı doğrula")
        layout.addView(master); layout.addView(confirmation)
        val dialog = AlertDialog.Builder(this).setTitle("Kasa kimlik bilgilerini yenile").setView(layout)
            .setNegativeButton("Vazgeç", null).setPositiveButton("Yenile", null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val first = master.text.toString().toCharArray()
                val second = confirmation.text.toString()
                master.text.clear(); confirmation.text.clear()
                if (String(first) != second) {
                    first.fill('\u0000'); showError(VaultException("Ana parolalar eşleşmiyor.")); return@setOnClickListener
                }
                val current = VaultSessionHolder.current()
                if (current == null) {
                    first.fill('\u0000')
                    showError(VaultException("Kasa kilitli."))
                    return@setOnClickListener
                }
                val token = lockGeneration
                val snapshot = VaultSession(
                    current.key.copyOf(),
                    current.envelope,
                    VaultPayload.fromJson(JSONObject(current.payload.toJson().toString())),
                )
                lifecycleScope.launch {
                    runCatching {
                        try {
                            withContext(Dispatchers.Default) { VaultCrypto.rotateCredentials(snapshot, first) }
                        } finally {
                            snapshot.destroy()
                        }
                    }.onSuccess { created ->
                        if (token != lockGeneration || !lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
                            created.session.destroy()
                            return@onSuccess
                        }
                        repository.write(VaultCrypto.encode(created.session))
                        BiometricVaultKey(this@MainActivity).delete()
                        VaultSessionHolder.open(created.session)
                        dialog.dismiss(); showRecovery(created.recoveryKey)
                    }.onFailure(::showError)
                }
            }
        }
        dialog.show()
    }

    private fun createDialog() {
        val layout = dialogLayout()
        val master = secretField("Ana parola (en az 14 karakter)")
        val confirmation = secretField("Ana parolayı doğrula")
        layout.addView(master); layout.addView(confirmation)
        val dialog = AlertDialog.Builder(this).setTitle("Yeni şifreli kasa").setView(layout)
            .setNegativeButton("Vazgeç", null).setPositiveButton("Oluştur", null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val a = master.text.toString().toCharArray(); val b = confirmation.text.toString()
                master.text.clear(); confirmation.text.clear()
                if (String(a) != b) { a.fill('\u0000'); showError(VaultException("Ana parolalar eşleşmiyor.")); return@setOnClickListener }
                lifecycleScope.launch {
                    runCatching { withContext(Dispatchers.Default) { VaultCrypto.create(a) } }
                        .onSuccess { created -> repository.write(VaultCrypto.encode(created.session)); VaultSessionHolder.open(created.session); dialog.dismiss(); showRecovery(created.recoveryKey) }
                        .onFailure(::showError)
                }
            }
        }
        dialog.show()
    }

    private fun recoveryDialog() {
        val field = secretField("Kurtarma anahtarı")
        val dialog = AlertDialog.Builder(this).setTitle("Kurtarma anahtarıyla aç").setView(field)
            .setNegativeButton("Vazgeç", null).setPositiveButton("Aç", null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val chars = field.text.toString().toCharArray(); field.text.clear()
                lifecycleScope.launch {
                    runCatching { withContext(Dispatchers.Default) { VaultCrypto.unlock(repository.read(), chars, true) } }
                        .onSuccess {
                            VaultSessionHolder.open(it)
                            dialog.dismiss()
                            toast("Kurtarma anahtarıyla açıldı. Ayarlardan yeni ana parola belirleyin.")
                            renderVault()
                        }
                        .onFailure(::showError)
                }
            }
        }
        dialog.show()
    }

    private fun showRecovery(key: String) {
        val layout = dialogLayout()
        layout.addView(TextView(this).apply { setText(R.string.recovery_key_warning) })
        layout.addView(TextView(this).apply { text = key; textSize = 17f; setTextIsSelectable(true); setPadding(0, dp(18), 0, dp(18)) })
        val confirmed = CheckBox(this).apply { setText(R.string.recovery_key_confirmed) }
        layout.addView(confirmed)
        val dialog = AlertDialog.Builder(this).setTitle("Kurtarma anahtarı").setView(layout).setPositiveButton("Devam", null).create()
        dialog.setCancelable(false)
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).apply {
                isEnabled = false
                setOnClickListener { if (confirmed.isChecked) { dialog.dismiss(); renderVault() } }
            }
            confirmed.setOnCheckedChangeListener { _, checked -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = checked }
        }
        dialog.show()
    }

    private fun entryDialog(entry: VaultEntry) {
        val counts = PasswordTools.counts(VaultSessionHolder.current()?.payload?.entries.orEmpty())
        val reused = counts[entry.password] ?: 0
        val layout = dialogLayout()
        val info = TextView(this).apply {
            text = buildString {
                append("Kullanıcı: ${entry.username.ifEmpty { "—" }}\nKategori: ${entry.category}")
                if (entry.url.isNotEmpty()) append("\nSite: ${entry.url}")
                if (reused > 1) append("\n\n⚠ Bu parola $reused hesapta kullanılıyor.")
                if (PasswordTools.weak(entry.password)) append("\n⚠ Parola kısa veya yaygın bir örüntü içeriyor.")
                if (entry.notes.isNotEmpty()) append("\n\nNotlar:\n${entry.notes}")
            }
            setPadding(0, dp(6), 0, dp(12))
        }
        layout.addView(info)

        var revealed = false
        val passwordView = TextView(this).apply {
            text = "Parola: ••••••••••••"
            typeface = Typeface.MONOSPACE
            setPadding(0, 0, 0, dp(8))
        }
        val hideRunnable = Runnable {
            revealed = false
            passwordView.text = "Parola: ••••••••••••"
        }
        layout.addView(passwordView)

        val revealBtn = smallButton("Parolayı göster / gizle") {
            revealed = !revealed
            handler.removeCallbacks(hideRunnable)
            if (revealed) {
                passwordView.text = "Parola: ${entry.password}"
                handler.postDelayed(hideRunnable, 20_000)
            } else {
                passwordView.text = "Parola: ••••••••••••"
            }
        }
        layout.addView(revealBtn)

        if (entry.username.isNotEmpty()) {
            layout.addView(smallButton("Kullanıcı adını kopyala") {
                copyClipboard("SecPass kullanıcı adı", entry.username, sensitive = false)
            })
        }
        layout.addView(smallButton("Parolayı kopyala") {
            copyClipboard("SecPass parolası", entry.password, sensitive = true)
        })
        if (entry.url.isNotEmpty()) {
            layout.addView(smallButton("Siteye git") { openValidatedUrl(entry.url) })
        }
        val changeTarget = entry.changeUrl.ifEmpty { entry.url }
        if (changeTarget.isNotEmpty()) {
            layout.addView(smallButton("Parola değiştirme sayfasını aç") { openValidatedUrl(changeTarget) })
        }

        val dialog = AlertDialog.Builder(this).setTitle(entry.name)
            .setView(ScrollView(this).apply { addView(layout) })
            .setNeutralButton("Düzenle") { _, _ -> editDialog(entry) }
            .setPositiveButton("Kapat", null)
            .create()
        dialog.setOnDismissListener { handler.removeCallbacks(hideRunnable) }
        dialog.show()
    }

    private fun editDialog(existing: VaultEntry?) {
        val layout = dialogLayout()
        val name = dialogField("Kayıt adı", existing?.name.orEmpty())
        val url = dialogField("https://example.com", existing?.url.orEmpty())
        val changeUrl = dialogField("Parola değiştirme HTTPS adresi", existing?.changeUrl.orEmpty())
        val username = dialogField("Kullanıcı adı / e-posta", existing?.username.orEmpty())
        val category = dialogField("Kategori", existing?.category ?: "Diğer")
        val password = dialogSecretField(if (existing == null) "Parola" else "Yeni parola (boşsa mevcut korunur)")
        var genLength = 20
        val lengthLabel = TextView(this).apply { text = "Üretilecek uzunluk: 20 karakter"; setPadding(0, dp(8), 0, 0) }
        val seek = SeekBar(this).apply {
            max = 52
            progress = 8
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
                    genLength = 12 + progress
                    lengthLabel.text = "Üretilecek uzunluk: $genLength karakter"
                }
                override fun onStartTrackingTouch(seekBar: SeekBar?) = Unit
                override fun onStopTrackingTouch(seekBar: SeekBar?) = Unit
            })
        }
        val useSymbols = CheckBox(this).apply { text = "Sembol kullan"; isChecked = true }
        val generate = smallButton("Güçlü parola üret") {
            password.inputType = InputType.TYPE_CLASS_TEXT
            password.setText(PasswordTools.generate(genLength, useSymbols.isChecked))
        }
        val notes = dialogField("Notlar", existing?.notes.orEmpty())
        val favorite = CheckBox(this).apply { setText(R.string.favorite); isChecked = existing?.favorite == true }
        listOf(name, url, changeUrl, username, category, password, lengthLabel, seek, useSymbols, generate, notes, favorite).forEach(layout::addView)
        val builder = AlertDialog.Builder(this).setTitle(existing?.name ?: "Yeni kayıt")
            .setView(ScrollView(this).apply { addView(layout) })
            .setNegativeButton("Vazgeç", null).setPositiveButton("Kaydet", null)
        if (existing != null) builder.setNeutralButton("Kaydı sil", null)
        val dialog = builder.create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                runAction {
                    val session = VaultSessionHolder.current() ?: throw VaultException("Kasa kilitli.")
                    val now = Instant.now().toString()
                    val entered = password.text.toString()
                    val item = if (existing == null) VaultEntry.fresh(
                        name.text.toString(), url.text.toString(), username.text.toString(), entered,
                        category.text.toString().ifBlank { "Diğer" }, notes.text.toString()
                    ).copy(
                        changeUrl = VaultValidation.url(changeUrl.text.toString()),
                        favorite = favorite.isChecked,
                    )
                    else existing.copy(
                        name = VaultValidation.name(name.text.toString()), url = VaultValidation.url(url.text.toString()),
                        changeUrl = VaultValidation.url(changeUrl.text.toString()),
                        username = VaultValidation.text(username.text.toString(), 1_024),
                        category = VaultValidation.text(category.text.toString().ifBlank { "Diğer" }, 80),
                        password = if (entered.isEmpty()) existing.password else VaultValidation.password(entered),
                        notes = VaultValidation.text(notes.text.toString(), 10_000), favorite = favorite.isChecked, updatedAt = now,
                        passwordChangedAt = if (entered.isEmpty() || entered == existing.password) existing.passwordChangedAt else now,
                    )
                    val index = session.payload.entries.indexOfFirst { it.id == item.id }
                    if (index >= 0) session.payload.entries[index] = item
                    else {
                        if (session.payload.entries.size >= 10_000) throw VaultException("Kayıt sınırı aşıldı.")
                        session.payload.entries += item
                    }
                    repository.write(VaultCrypto.encode(session)); password.text.clear(); dialog.dismiss(); renderVault()
                }
            }
            if (existing != null) dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
                AlertDialog.Builder(this).setTitle("Kayıt silinsin mi?")
                    .setMessage(existing.name)
                    .setNegativeButton("Vazgeç", null)
                    .setPositiveButton("Sil") { _, _ ->
                        runAction {
                            val session = VaultSessionHolder.current() ?: throw VaultException("Kasa kilitli.")
                            session.payload.entries.removeAll { it.id == existing.id }
                            repository.write(VaultCrypto.encode(session)); dialog.dismiss(); renderVault()
                        }
                    }.show()
            }
        }
        dialog.show()
    }

    private fun openValidatedUrl(rawUrl: String) {
        runAction {
            val safe = VaultValidation.url(rawUrl)
            if (safe.isEmpty()) throw VaultException("Bu kayıtta site adresi yok.")
            val uri = safe.toUri()
            AlertDialog.Builder(this).setTitle("Tarayıcıda açılsın mı?").setMessage(safe)
                .setNegativeButton("Vazgeç", null)
                .setPositiveButton("Aç") { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                .show()
        }
    }

    private fun copyClipboard(label: String, secret: String, sensitive: Boolean) {
        val clipboard = getSystemService(ClipboardManager::class.java)
        val clip = ClipData.newPlainText(label, secret)
        if (sensitive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            clip.description.extras = PersistableBundle().apply {
                putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
            }
        }
        clipboard.setPrimaryClip(clip)
        handler.postDelayed({
            val current = clipboard.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()
            if (current == secret) clipboard.clearPrimaryClip()
        }, 30_000)
        toast("$label kopyalandı; pano 30 saniye sonra temizlenecek.")
    }

    private fun biometricUnlock() {
        val helper = BiometricVaultKey(this)
        runCatching { helper.prepareDecryption() }.onSuccess { cipher ->
            biometricPrompt("Şifreli kasanızı açın", cipher) { authenticated ->
                runAction {
                    val key = helper.finishDecryption(authenticated)
                    try {
                        VaultSessionHolder.open(VaultCrypto.unlockWithKey(repository.read(), key))
                        renderVault()
                    } finally {
                        key.fill(0)
                    }
                }
            }
        }.onFailure { helper.delete(); showError(it) }
    }

    private fun enableBiometrics(dataKey: ByteArray) {
        val helper = BiometricVaultKey(this)
        runCatching { helper.prepareEncryption() }.onSuccess { cipher ->
            biometricPrompt("Biyometrik hızlı açılışı etkinleştirin", cipher) { authenticated ->
                runAction { helper.finishEncryption(authenticated, dataKey); toast("Biyometrik hızlı açılış etkin.") }
            }
        }.onFailure(::showError)
    }

    private fun biometricPrompt(title: String, cipher: javax.crypto.Cipher, success: (javax.crypto.Cipher) -> Unit) {
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                result.cryptoObject?.cipher?.let(success) ?: showError(VaultException("Biyometrik doğrulama sonucu geçersiz."))
            }
            override fun onAuthenticationError(code: Int, message: CharSequence) { if (code != BiometricPrompt.ERROR_NEGATIVE_BUTTON) toast(message.toString()) }
        })
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder().setTitle(title).setAllowedAuthenticators(BIOMETRIC_STRONG)
                .setNegativeButtonText("Ana parola kullan").build(), BiometricPrompt.CryptoObject(cipher)
        )
    }

    private fun cardDrawable(fill: Int, stroke: Int) = GradientDrawable().apply {
        cornerRadius = dp(12).toFloat()
        setColor(fill)
        setStroke(dp(1), stroke)
    }

    private fun runAction(action: () -> Unit) = runCatching(action).onFailure(::showError)
    private fun showError(error: Throwable) {
        val message = if (error is VaultException) error.message else null
        AlertDialog.Builder(this).setTitle("SecPass")
            .setMessage(message ?: "İşlem güvenli biçimde durduruldu. Tekrar deneyin.")
            .setPositiveButton("Tamam", null).show()
    }
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    private fun title(value: String) = root.addView(TextView(this).apply { text = value; textSize = 32f; setTypeface(typeface, Typeface.BOLD); setTextColor(Color.WHITE); setPadding(0, 0, 0, dp(6)) })
    private fun subtitle(value: String) = root.addView(TextView(this).apply { text = value; textSize = 15f; setTextColor(Color.rgb(92, 214, 186)); setPadding(0, 0, 0, dp(16)) })
    private fun note(value: String) = root.addView(TextView(this).apply { text = value; setTextColor(Color.rgb(157, 176, 195)); setPadding(0, 0, 0, dp(18)) })
    private fun primaryButton(label: String, click: () -> Unit) = root.addView(Button(this).apply {
        text = label; isAllCaps = false; setTextColor(Color.WHITE)
        background = cardDrawable(Color.rgb(46, 166, 140), Color.rgb(46, 166, 140))
        setOnClickListener { click() }
    }, matchMargins())
    private fun button(label: String, click: () -> Unit) = root.addView(Button(this).apply {
        text = label; isAllCaps = false; setTextColor(Color.WHITE)
        background = cardDrawable(Color.rgb(25, 37, 52), Color.rgb(45, 65, 90))
        setOnClickListener { click() }
    }, matchMargins())
    private fun smallButton(label: String, click: () -> Unit) = Button(this).apply { text = label; isAllCaps = false; setOnClickListener { click() } }
    private fun field(hint: String, value: String = "") = EditText(this).apply {
        this.hint = hint; setText(value); setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
        background = cardDrawable(Color.rgb(21, 31, 44), Color.rgb(45, 65, 90))
        setPadding(dp(14), dp(12), dp(14), dp(12))
        inputType = InputType.TYPE_CLASS_TEXT
    }
    private fun secretField(hint: String) = field(hint).apply { inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
    private fun dialogField(hint: String, value: String = "") = EditText(this).apply { this.hint = hint; setText(value); inputType = InputType.TYPE_CLASS_TEXT }
    private fun dialogSecretField(hint: String) = dialogField(hint).apply { inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
    private fun horizontal() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    private fun dialogLayout() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(10), dp(22), dp(6)) }
    private fun weight(value: Float) = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, value)
    private fun matchMargins() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
