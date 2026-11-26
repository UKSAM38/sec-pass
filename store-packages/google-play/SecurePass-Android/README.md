# SecurePass Android

Kotlin Android uygulaması ve Android AutofillService paketidir. Masaüstü ve iOS sürümüyle aynı `securepass-v1` / `.spvault` biçimini AES-256-GCM + scrypt ile kullanır.

## Gereksinimler

- JDK 17
- Android SDK Platform 36 ve güncel build tools
- Gradle wrapper'ın indireceği Gradle 8.13

Android SDK lisansları kullanıcı/geliştirici hesabı sahibi tarafından okunup kabul edilmelidir. Ardından:

```sh
./gradlew test
./gradlew connectedCheck          # API 28+ emulator veya gerçek cihaz
./gradlew bundleRelease           # keystore.properties varsa imzalı, yoksa imzasız Release bundle
```

## İmzalama

Upload keystore ve parolaları kaynak ağacına koymayın. `keystore.properties.example` dosyasını yerel `keystore.properties` olarak kopyalayıp gerçek konum/parolaları girin; Gradle bu dosya varsa release AAB'yi otomatik imzalar. `keystore.properties`, `*.jks` ve `*.keystore` kaynak kontrolünden hariç tutulur. Bu teslimde kalıcı upload anahtarı kaynak ağacından ayrı `release-secrets/google-play` klasöründe oluşturulmuş ve imzalı AAB üretilmiştir. Google Play App Signing etkinleştirilmelidir. Paket kimliği ilk yüklemeden önce kesinleştirilmelidir.

## Güvenlik davranışı

- Manifest bilerek `INTERNET` izni istemez.
- Aktif kasa `noBackupFilesDir` içinde tutulur; Android cloud backup ve device transfer dışlanır.
- Ekran görüntüsü ve son uygulamalar önizlemesi `FLAG_SECURE` ile engellenir.
- Ana parola saklanmaz. İsteğe bağlı hızlı açılışta yalnızca 32 bayt veri anahtarı Android Keystore içindeki biyometriye bağlı AES anahtarıyla sarılır.
- Uygulama arka plana geçtiğinde bellek oturumu kilitlenir.
- Pano, içerik hâlâ SecurePass parolasıysa 30 saniye sonra temizlenir.
- Autofill kullanıcı tarafından Android ayarlarından etkinleştirilir. Kasa kilitliyse ana parola arayüzü gösterilir; form bilgileri sunucuya gönderilmez.

## Test ve mağaza öncesi

`connectedCheck` gerçek Android kriptografi sağlayıcısında kasa round-trip, kurtarma, kimlik bilgisi yenileme, masaüstü uyumluluğu ve değiştirilmiş ciphertext reddini sınar. Dört cihaz testi Android 36 ARM emülatöründe başarıyla çalıştırıldı. Autofill; Chrome, Firefox ve en az iki üçüncü taraf uygulamada, farklı Android üreticilerinde elle sınanmalıdır. Bağımsız güvenlik incelemesi tamamlanmadan geniş kitleye sunulmamalıdır.
