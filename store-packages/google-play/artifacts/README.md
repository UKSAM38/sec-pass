# Google Play Derleme Çıktıları (Yerel)

Google Play Console'a yüklenecek imzalı üretim paketi:

- `SecPass-1.0.0-release.aab` (`applicationId = "io.github.uksam38.secpass"`, `versionCode = 1`, `versionName = "1.0.0"`, `targetSdk = 36`)

> Not: İkili `.aab` ve `.apk` dosyaları Git deposunu şişirmemek için `.gitignore` ile dışlanmıştır; yerel olarak bu klasörde hazır tutulur ve `./gradlew bundleRelease` komutuyla istenildiği zaman yeniden üretilebilir.
