# Doğrulama Kaydı — SecPass 1.0.0

Son doğrulama tarihi: **27 Kasım 2026**  
Geliştirme ortamı: Apple Silicon macOS; Electron 44.4.3, React 18, TypeScript, Vite 8.3.0, Xcode 27 (iOS 26/27 SDK), OpenJDK 17, Android SDK 36. Tüm test verileri yapaydır; kullanıcının kişisel kasalarına dokunulmadı.

- **Masaüstü (Electron + React):**
  - TypeScript kontrolü ve Vite üretim derlemesi başarılı (`SecPass`, `io.github.uksam38.secpass.desktop`).
  - 19/19 birim ve depo hijyeni/mağaza hazırlık testi geçti (`npm test`).
  - Gerçek Electron güvenlik E2E testi (`npm run test:security`) geçti: renderer sandbox, context isolation, Node erişimi olmaması, ağ engeli, dış dosya çakışma algılama, 30 sn pano süresi, uyku/boşta kalma kilidi, ana parola değişimi ve kilitlenme iptali.
  - Gerçek Electron pencere kullanım testi (`npm run test:desktop`) geçti: yeni kasa oluşturma, kurtarma anahtarı, kayıt ekleme/düzenleme, Google CSV içe aktarma, tekrar parola gruplama ve kurtarma anahtarıyla geri açma.
- **iOS (`store-packages/app-store/SecurePass-iOS`):**
  - `Info.plist`, `PrivacyInfo.xcprivacy` (ana uygulama + AutoFill uzantısı) ve `.entitlements` (`io.github.uksam38.secpass` / `group.io.github.uksam38.secpass`) `plutil` doğrulamasından geçti.
  - 9/9 XCTest geçti: `dataKey` veri anahtarı yenileme ve eski `dataKey` reddi, `securepass-v1` masaüstü uyumluluk vektörü, Google CSV (BOM, tırnak, HTTPS dışı URL, formül dizgeleri) içe aktarma, tek karakter tekrarı zayıf parola kontrolü ve `.inactive` (gizlilik perdesi) / `.background` (kasa kilidi) yaşam döngüsü ayrımı.
  - Cihaz hedefli Release `.xcarchive` derlemesi ve AutoFill uzantısı paket doğrulaması başarılı.
- **Android (`store-packages/google-play/SecurePass-Android`):**
  - `applicationId = "io.github.uksam38.secpass"`, `minSdk = 28`, `targetSdk = 36`, sıfır `INTERNET` izni.
  - Birim testleri (`testDebugUnitTest` / `testReleaseUnitTest`) ve Android Lint (0 hata) başarılı: `dataKey` yenileme, tek karakter tekrarı kontrolü, Google CSV ayrıştırma/tekrar ayıklama, biyometrik AutoFill kilit açma ve Android 13+ `EXTRA_IS_SENSITIVE` pano maskelemesi.
  - Kalıcı 4096-bit RSA upload anahtarıyla imzalanan `SecPass-1.0.0-release.aab` paketi `jarsigner -verify` ve resmi `bundletool validate` ile doğrulandı.
- **Mağaza Görselleri, Belgeler ve GitHub Hijyeni:**
  - `docs/` altında çift dilli (TR + EN) GitHub Pages tanıtım, gizlilik politikası ve destek sayfaları doğrulandı (`[DOLDURULACAK]` yer tutucu bulunmuyor).
  - Tam kare (alfa kanalsız) `1024×1024` App Store ikonu, `512×512` Google Play ikonu, `1024×500` Feature Graphic, `1290×2796` iPhone, `2048×2732` iPad ve `1080×1920` Android ekran görüntüleri boyut ve alfa kanalı testlerinden geçti.
  - Git indeks taramasında `release-secrets/`, `keystore.properties`, `.jks`/`.keystore`, kişisel `.spvault`/`.csv` veya büyük ikili paket sızıntısı bulunmadığı otomatik testle doğrulandı.
