package local.securepass.android

import org.junit.Assert.*
import org.junit.Test

class PasswordToolsTest {
    @Test fun generatedPasswordsContainEveryGroup() {
        repeat(100) {
            val value = PasswordTools.generate(20)
            assertEquals(20, value.length)
            assertTrue(value.any(Char::isUpperCase))
            assertTrue(value.any(Char::isLowerCase))
            assertTrue(value.any(Char::isDigit))
            assertTrue(value.any { !it.isLetterOrDigit() })
        }
    }

    @Test fun generatorRejectsUnsafeLengths() {
        assertThrows(VaultException::class.java) { PasswordTools.generate(11) }
        assertThrows(VaultException::class.java) { PasswordTools.generate(129) }
    }

    @Test fun repeatedCharacterPasswordsAreWeak() {
        assertTrue(PasswordTools.weak("aaaaaaaaaaaa"))
        assertTrue(PasswordTools.weak("99999999999999"))
        assertFalse(PasswordTools.weak("Strong-Unique-948!"))
    }

    @Test fun csvImporterHandlesBomQuotesNonHttpsAndDuplicates() {
        val csv = "\uFEFFname,url,username,password,note\r\n\"Example, Inc\",https://example.com,demo,\"  a,\"\"b  \",\"line1\nline2\"\r\nAndroidApp,android://abc@app,user,=SUM(1+2),\r\nBroken,https://bad.com,user,\r\n"
        val preview = CsvImporter.prepare(csv, emptyList())
        assertEquals(2, preview.added.size)
        assertEquals("  a,\"b  ", preview.added[0].password)
        assertEquals("", preview.added[1].url)
        assertTrue(preview.added[1].notes.contains("android://abc@app"))
        assertEquals("=SUM(1+2)", preview.added[1].password)
        assertEquals(1, preview.omittedUrls)
        assertEquals(1, preview.invalid)
        val dup = CsvImporter.prepare(csv, preview.added)
        assertEquals(2, dup.duplicates)
        assertEquals(0, dup.added.size)
    }

    @Test fun csvImporterDoesNotInflateOmittedUrlsOnInvalidRowsOrOversizedNotes() {
        val oversized = "n".repeat(10_001)
        val csv = "name,url,username,password,note\nEmptyPass,android://app,user,,ok\nTooLongNote,https://example.com,user,ValidPass123!,$oversized\n"
        val preview = CsvImporter.prepare(csv, emptyList())
        assertEquals(0, preview.added.size)
        assertEquals(0, preview.omittedUrls)
        assertEquals(2, preview.invalid)
    }

    @Test fun pickerGuardSkipsStopLockOnlyWithinActiveWindow() {
        val guard = SystemPickerLockGuard()
        assertTrue(guard.shouldLockOnStop(isChangingConfigurations = false, nowMs = 1_000L))
        guard.beginPicker(nowMs = 1_000L)
        assertFalse(guard.shouldLockOnStop(isChangingConfigurations = false, nowMs = 5_000L))
        assertTrue(guard.shouldLockOnStop(isChangingConfigurations = false, nowMs = 130_000L))
        guard.beginPicker(nowMs = 200_000L)
        guard.endPicker()
        assertTrue(guard.shouldLockOnStop(isChangingConfigurations = false, nowMs = 201_000L))
    }
}
