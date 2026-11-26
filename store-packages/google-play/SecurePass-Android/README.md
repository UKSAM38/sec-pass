# SecPass Android

Kotlin Android uygulaması ve Android AutofillService paketidir. Masaüstü ve iOS ile aynı `securepass-v1` (`.spvault`) biçimini AES-256-GCM + scrypt ile kullanır.

## Derleme ve Doğrulama

JDK 17 ve Android SDK 36 gerekir:

```sh
./gradlew test lint assembleDebug bundleRelease
```

- **applicationId:** `io.github.uksam38.secpass` (`minSdk = 28`, `targetSdk = 36`)
- **İمzalı Üretim Paketi:** `../artifacts/SecPass-1.0.0-release.aab`

## Güvenlik ve Özellikler

- `AndroidManifest.xml` bilerek `INTERNET` izni istemez.
- Aktif kasa `noBackupFilesDir` içinde tutulur; `FLAG_SECURE` ekran yakalamayı ve son uygulamalar önizlemesini engeller.
- Ana parola değişiminde yeni 32 baytlık veri anahtarı (`dataKey`), yeni salt ve yeni kurtarma anahtarı üretilir.
- Hem uygulama içinde hem de `AutofillAuthActivity` otomatik doldurma ekranında Android Keystore destekli biyometrik hızlı kilit açma ve artan gecikmeli ana parola koruması bulunur.
- Android 13+ cihazlarda kopyalanan parolalar `ClipDescription.EXTRA_IS_SENSITIVE` ile sistem pano balonunda maskelenir ve 30 saniye sonra otomatik temizlenir.
- Doğrudan Google Password Manager CSV şifre içe aktarma ve yazarken anlık arama desteklenir.
