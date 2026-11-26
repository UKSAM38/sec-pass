package local.securepass.android

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.*
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews

class SecurePassAutofillService : AutofillService() {
    override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
        runCatching {
            val structure = request.fillContexts.lastOrNull()?.structure ?: return callback.onSuccess(null)
            val fields = Fields.from(structure)
            if (fields.all.isEmpty()) return callback.onSuccess(null)
            val session = VaultSessionHolder.current()
            if (session == null) return callback.onSuccess(authentication(fields))
            callback.onSuccess(response(fields, matching(session.payload.entries, fields.domain)))
        }.onFailure { callback.onFailure("SecPass AutoFill tamamlanamadı.") }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // Kullanıcının bilgisi olmadan yeni sır saklamaz; ana uygulamada açık kayıt akışı kullanılır.
        callback.onSuccess()
    }

    private fun authentication(fields: Fields): FillResponse {
        val intent = Intent(this, AutofillAuthActivity::class.java).apply {
            putParcelableArrayListExtra(AutofillAuthActivity.EXTRA_USER_IDS, ArrayList(fields.usernames))
            putParcelableArrayListExtra(AutofillAuthActivity.EXTRA_PASSWORD_IDS, ArrayList(fields.passwords))
            putExtra(AutofillAuthActivity.EXTRA_DOMAIN, fields.domain)
        }
        val pending = PendingIntent.getActivity(this, 4102, intent, PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return FillResponse.Builder().setAuthentication(
            fields.all.toTypedArray(), pending.intentSender, presentation(packageName, "SecPass kasasını aç")
        ).build()
    }

    private fun response(fields: Fields, entries: List<VaultEntry>): FillResponse? {
        if (entries.isEmpty()) return null
        val builder = FillResponse.Builder()
        entries.take(20).forEach { entry -> builder.addDataset(dataset(packageName, fields, entry)) }
        return builder.build()
    }

    companion object {
        fun matching(entries: List<VaultEntry>, domain: String?): List<VaultEntry> = entries.filter { entry ->
            if (domain.isNullOrBlank()) true
            else entry.host?.let { it == domain || it.endsWith(".$domain") || domain.endsWith(".$it") } == true
        }.sortedBy { it.name.lowercase() }

        fun dataset(pkgName: String, fields: Fields, entry: VaultEntry): Dataset {
            val label = if (entry.username.isBlank()) entry.name else "${entry.name} — ${entry.username}"
            val builder = Dataset.Builder(presentation(pkgName, label))
            fields.usernames.forEach { builder.setValue(it, AutofillValue.forText(entry.username)) }
            fields.passwords.forEach { builder.setValue(it, AutofillValue.forText(entry.password)) }
            return builder.build()
        }

        fun presentation(pkgName: String, label: String) = RemoteViews(pkgName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, label)
        }
    }
}

data class Fields(
    val usernames: List<AutofillId>,
    val passwords: List<AutofillId>,
    val domain: String?,
) {
    val all: List<AutofillId> get() = (usernames + passwords).distinct()

    companion object {
        fun from(structure: AssistStructure): Fields {
            val users = mutableListOf<AutofillId>()
            val passwords = mutableListOf<AutofillId>()
            var domain: String? = null

            fun visit(node: AssistStructure.ViewNode) {
                domain = domain ?: node.webDomain?.lowercase()
                val id = node.autofillId
                if (id != null && node.autofillType == View.AUTOFILL_TYPE_TEXT) {
                    val hints = node.autofillHints?.map(String::lowercase).orEmpty()
                    val input = node.inputType
                    when {
                        hints.any { it.contains("password") } || input and 0x80 != 0 -> passwords += id
                        hints.any { it.contains("username") || it.contains("email") } || input and 0x20 != 0 -> users += id
                    }
                }
                for (index in 0 until node.childCount) visit(node.getChildAt(index))
            }
            for (window in 0 until structure.windowNodeCount) visit(structure.getWindowNodeAt(window).rootViewNode)
            return Fields(users, passwords, domain)
        }
    }
}
