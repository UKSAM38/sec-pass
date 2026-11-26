package local.securepass.android

import android.app.Application
import android.content.ComponentCallbacks2

class SecurePassApplication : Application() {
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) VaultSessionHolder.lock()
    }
}

