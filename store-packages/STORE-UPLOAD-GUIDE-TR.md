# SecPass — App Store ve Google Play Adım Adım Yükleme Rehberi

Tüm teknik kod düzeltmeleri, gizlilik manifestleri, mağaza görselleri, ekran görüntüleri, veri güvenliği cevapları ve çift dilli (TR + EN) gizlilik/destek web sayfaları hazırlanmıştır. Aşağıdaki sırayla yükleme işlemini tamamlayabilirsiniz.

---

## 0. Önce GitHub Pages Adreslerinin Canlı Olduğunu Doğrulayın

GitHub'da `https://github.com/UKSAM38/sec-pass` deposunun **Settings → Pages** menüsünde kaynak olarak `Deploy from a branch` → `main` / `/docs` seçili olduğunda aşağıdaki adresler otomatik yayına girer:

- **Ana Sayfa:** `https://uksam38.github.io/sec-pass/`
- **Gizlilik Politikası URL'si (Her iki mağaza için):** `https://uksam38.github.io/sec-pass/privacy.html`
- **Destek URL'si (App Store & Google Play için):** `https://uksam38.github.io/sec-pass/support.html`

---

## 1. Google Play Store Yükleme Adımları

### Hazır Dosyalarınız
- **İmzalı Üretim Paketi (AAB):** `store-packages/google-play/artifacts/SecPass-1.0.0-release.aab` (`applicationId: io.github.uksam38.secpass`, `versionCode: 1`, `versionName: 1.0.0`, `targetSdk: 36`)
- **Uygulama İkonu (512×512):** `store-packages/google-play/store-assets/icon-512.png`
- **Özellik Grafiği / Feature Graphic (1024×500):** `store-packages/google-play/store-assets/feature-graphic-1024x500.png`
- **Telefon Ekran Görüntüleri (1080×1920, 4 adet):** `store-packages/google-play/store-assets/screenshots/phone/`
- **Mağaza Metinleri:** `store-packages/google-play/STORE-LISTING-TR.md`
- **Veri Güvenliği (Data Safety) Cevapları:** `store-packages/google-play/DATA-SAFETY.md`

### Play Console Sırası
1. **Google Play Console** (`https://play.google.com/console`) → **Uygulama oluştur**:
   - Uygulama adı: `SecPass — Yerel Parola Kasası`
   - Varsayılan dil: `Türkçe (tr-TR)`
   - Uygulama veya oyun: `Uygulama`
   - Ücretsiz veya ücretli: `Ücretsiz`
2. **Uygulama İçeriği (App Content)** bölümündeki beyanları doldurun:
   - **Gizlilik Politikası:** `https://uksam38.github.io/sec-pass/privacy.html`
   - **Reklamlar:** *Hayır, uygulamam reklam içermiyor.*
   - **Uygulama Erişimi (App Access):** *Tüm işlevler özel erişim olmadan kullanılabilir* (veya not olarak: *"Uygulama sunucusuz çalışır ve hesap gerektirmez. İnceleme ekibi ilk açılışta herhangi bir 14+ karakterlik test parolasıyla yeni kasa oluşturup tüm özellikleri deneyebilir."*).
   - **Veri Güvenliği (Data Safety):** *Uygulamanız gerekli kullanıcı verisi türlerinden herhangi birini topluyor veya paylaşıyor mu?* → **Hayır**.
   - **İçerik Derecelendirmesi (IARC):** Yardımcı Program / Verimlilik (Utilities / Productivity) — şiddet, kullanıcı etkileşimi, konum paylaşımı veya satın alma **Yok**.
   - **Hedef Kitle:** `18 yaş ve üzeri` (veya `13+`; çocuklara yönelik **değildir**).
   - **Finans / Sağlık / Devlet / Haber Beyanları:** Hiçbiri geçerli değildir.
3. **Ana Mağaza Girişi (Main Store Listing):**
   - `STORE-LISTING-TR.md` içindeki kısa ve tam açıklamayı yapıştırın.
   - `icon-512.png`, `feature-graphic-1024x500.png` ve `screenshots/phone/*.png` dosyalarını yükleyin.
4. **Sürüm Yükleme (Test / Production):**
   - *Not: Kasım 2023 sonrası açılan kişisel Play Console hesaplarında üretim (Production) öncesi en az 12 test kullanıcısıyla 14 gün kesintisiz **Kapalı Test (Closed Testing)** zorunluluğu vardır.*
   - **Play App Signing**'i etkinleştirin ve `SecPass-1.0.0-release.aab` dosyasını yükleyin.
   - **Çok Önemli:** `release-secrets/google-play/` içindeki upload keystore (`.jks`) ve parola bilgisini en az iki farklı çevrimdışı diskte yedekleyin.

---

## 2. Apple App Store Yükleme Adımları

### Hazır Dosyalarınız
- **Xcode Projesi:** `store-packages/app-store/SecurePass-iOS/SecurePass.xcodeproj` (`PrivacyInfo.xcprivacy` hem ana uygulamada hem AutoFill uzantısında gömülüdür)
- **App Store İkonu (1024×1024, alfa kanalsız):** `store-packages/app-store/SecurePass-iOS/SecurePass/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`
- **iPhone 6.7"/6.9" Ekran Görüntüleri (1290×2796, 4 adet):** `store-packages/app-store/store-assets/screenshots/iphone-6.7/`
- **iPad 13" Ekran Görüntüleri (2048×2732, 4 adet):** `store-packages/app-store/store-assets/screenshots/ipad-13/`
- **Mağaza Metinleri & İnceleme Notu:** `store-packages/app-store/STORE-METADATA-TR.md`

### Apple Developer & Xcode Sırası
1. **Apple Developer Portal (`https://developer.apple.com/account`):**
   - **Identifiers → App Groups:** `group.io.github.uksam38.secpass` grubunu oluşturun.
   - **Identifiers → App IDs:**
     - `io.github.uksam38.secpass` (Capabilities: *App Groups* → `group.io.github.uksam38.secpass`, *AutoFill Credential Provider*)
     - `io.github.uksam38.secpass.credential-provider` (Capabilities: *App Groups* → `group.io.github.uksam38.secpass`, *AutoFill Credential Provider*)
2. **Xcode İmzalı Arşiv ve Yükleme:**
   - `store-packages/app-store/SecurePass-iOS/SecurePass.xcodeproj` dosyasını Xcode ile açın.
   - **Signing & Capabilities** sekmesinde hem `SecurePass` hem de `SecurePassCredentialProvider` hedefleri için kendi **Team** hesabınızı seçin.
   - Üst menüden hedef cihaz olarak **Any iOS Device (arm64)** seçip **Product → Archive** komutunu çalıştırın.
   - Açılan Organizer penceresinde **Distribute App → App Store Connect → Upload** adımlarını izleyin.
3. **App Store Connect (`https://appstoreconnect.apple.com`):**
   - **Yeni Uygulama (New App):** Ad: `SecPass — Yerel Parola Kasası` (doluysa `SecPass: Yerel Parola Kasası`), Bundle ID: `io.github.uksam38.secpass`, SKU: `secpass-ios-001`.
   - **Gizlilik Politikası URL'si:** `https://uksam38.github.io/sec-pass/privacy.html`
   - **Destek URL'si:** `https://uksam38.github.io/sec-pass/support.html`
   - **Uygulama Gizliliği (App Privacy Nutrition Labels):** *Veri Toplanmıyor (No, we do not collect data from this app)*.
   - **Şifreleme İhracat Uyumluluğu (Export Compliance):** Uygulama `ITSAppUsesNonExemptEncryption = true` beyan eder (kullanıcı kasasını AES-256-GCM + scrypt ile şifrelediği için). App Store Connect sorusunda:
     1. *Standart şifreleme algoritmaları mı kullanıyor?* → **Evet**
     2. *Yalnızca kimlik doğrulama / işletim sistemi koruması dışında dosya/veri şifrelemesi yapıyor mu?* → Parola yöneticisi kategorisi için ekrandaki yönlendirmeye göre yıllık Fransız/ABD standart açık kaynak / kitle pazarı (Mass Market) beyanını işaretleyin.
   - `STORE-METADATA-TR.md` içindeki açıklama, anahtar kelimeler ve **App Review İnceleme Notu**'nu yapıştırın; `iphone-6.7` ve `ipad-13` ekran görüntülerini yükleyip incelemeye gönderin.
