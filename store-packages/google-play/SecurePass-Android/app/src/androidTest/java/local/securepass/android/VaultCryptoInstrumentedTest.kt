package local.securepass.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VaultCryptoInstrumentedTest {
    @Test fun opensDesktopInteropVector() {
        val raw = requireNotNull(javaClass.classLoader?.getResourceAsStream("INTEROP-TEST-VECTOR.spvault")).use { it.readBytes() }
        val opened = VaultCrypto.unlock(raw, "interop test master phrase 482!".toCharArray())
        assertEquals("Interop Example", opened.payload.entries.single().name)
        assertEquals("interop@example.test", opened.payload.entries.single().username)
        assertEquals("Interop-demo-secret-739!", opened.payload.entries.single().password)
    }

    @Test fun encryptedRoundTripAndRecovery() {
        val created = VaultCrypto.create("four long random test words 739!".toCharArray())
        created.session.payload.entries += VaultEntry.fresh(
            "Example", "https://example.com", "demo@example.test", "Unique-test-secret-473!"
        )
        val raw = VaultCrypto.encode(created.session)
        val serialized = String(raw)
        assertFalse(serialized.contains("Unique-test-secret"))
        assertFalse(serialized.contains("demo@example.test"))
        val opened = VaultCrypto.unlock(raw, "four long random test words 739!".toCharArray())
        assertEquals("Unique-test-secret-473!", opened.payload.entries.single().password)
        val recovered = VaultCrypto.unlock(raw, created.recoveryKey.toCharArray(), true)
        assertEquals(1, recovered.payload.entries.size)
        assertThrows(VaultException::class.java) { VaultCrypto.unlock(raw, "wrong".toCharArray()) }
    }

    @Test fun ciphertextTamperingFailsClosed() {
        val created = VaultCrypto.create("another long random test phrase 927!".toCharArray())
        val raw = VaultCrypto.encode(created.session)
        val marker = "\"ciphertext\":\""
        val text = String(raw)
        val index = text.lastIndexOf(marker) + marker.length
        val replacement = if (text[index] == 'A') 'B' else 'A'
        val modified = (text.substring(0, index) + replacement + text.substring(index + 1)).toByteArray()
        assertThrows(VaultException::class.java) {
            VaultCrypto.unlock(modified, "another long random test phrase 927!".toCharArray())
        }
    }

    @Test fun credentialRotationInvalidatesOldMasterAndOldDataKeyAndPreservesEntries() {
        val created = VaultCrypto.create("first long master phrase 739!".toCharArray())
        val oldDataKey = created.session.key.copyOf()
        created.session.payload.entries += VaultEntry.fresh(
            "Rotation", "https://example.com", "demo@example.test", "Unique-test-secret-473!"
        )
        val rotated = VaultCrypto.rotateCredentials(created.session, "second long master phrase 951!".toCharArray())
        assertFalse(rotated.session.key.contentEquals(oldDataKey))
        val raw = VaultCrypto.encode(rotated.session)
        assertThrows(VaultException::class.java) {
            VaultCrypto.unlock(raw, "first long master phrase 739!".toCharArray())
        }
        assertThrows(VaultException::class.java) {
            VaultCrypto.unlockWithKey(raw, oldDataKey)
        }
        assertEquals(1, VaultCrypto.unlock(raw, "second long master phrase 951!".toCharArray()).payload.entries.size)
        assertEquals(1, VaultCrypto.unlock(raw, rotated.recoveryKey.toCharArray(), true).payload.entries.size)
    }
}
