# SecPass Mobil Mağaza Paketleri

Bu dizindeki `app-store` ve `google-play` klasörleri Apple App Store ve Google Play Store başvurusu için gerekli tüm kaynak projeleri, mağaza görsellerini, ekran görüntülerini, gizlilik/destek metinlerini ve adım adım yükleme rehberini içerir.

- `STORE-UPLOAD-GUIDE-TR.md`: **Adım adım App Store Connect ve Google Play Console yükleme kılavuzu**
- `app-store/SecurePass-iOS`: SwiftUI iPhone & iPad uygulaması, AutoFill Credential Provider uzantısı ve `PrivacyInfo.xcprivacy` gizlilik manifestleri (`io.github.uksam38.secpass`)
- `app-store/store-assets/screenshots/`: `1290×2796` (iPhone 6.7"/6.9") ve `2048×2732` (iPad 13") mağaza ekran görüntüleri
- `google-play/SecurePass-Android`: Kotlin Android uygulaması ve AutofillService (`io.github.uksam38.secpass`)
- `google-play/store-assets/`: `512×512` mağaza ikonu, `1024×500` Feature Graphic ve `1080×1920` telefon ekran görüntüleri
- `google-play/artifacts/SecPass-1.0.0-release.aab`: Kalıcı 4096-bit upload anahtarıyla imzalanmış, `bundletool` ile doğrulanmış yerel yükleme paketi (Git deposuna dahil edilmez)

Her iki mobil uygulama da masaüstü sürümle birebir aynı geriye dönük uyumlu `securepass-v1` (`.spvault`) şifreli kasa biçimini kullanır.
