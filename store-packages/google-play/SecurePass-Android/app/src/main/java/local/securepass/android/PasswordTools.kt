package local.securepass.android

import java.security.SecureRandom

object PasswordTools {
    private val random = SecureRandom()
    private const val UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    private const val LOWER = "abcdefghijkmnopqrstuvwxyz"
    private const val NUMBERS = "23456789"
    private const val SYMBOLS = "!@#$%^&*()-_=+[]{}:,.?"

    fun generate(length: Int = 20, symbols: Boolean = true): String {
        if (length !in 12..128) throw VaultException("Parola uzunluğu 12–128 olmalı.")
        val groups = mutableListOf(UPPER, LOWER, NUMBERS).apply { if (symbols) add(SYMBOLS) }
        val chars = groups.map { it[random.nextInt(it.length)] }.toMutableList()
        val all = groups.joinToString("")
        while (chars.size < length) chars += all[random.nextInt(all.length)]
        for (index in chars.lastIndex downTo 1) {
            val swap = random.nextInt(index + 1)
            val value = chars[index]; chars[index] = chars[swap]; chars[swap] = value
        }
        return chars.joinToString("")
    }

    fun counts(entries: List<VaultEntry>): Map<String, Int> = entries.groupingBy { it.password }.eachCount()
    fun weak(password: String) =
        password.length < 12 ||
            password.toSet().size <= 1 ||
            listOf("password", "qwerty", "123456", "sifre", "şifre", "admin")
                .any { password.lowercase().startsWith(it) }
}
