# SecPass Mağazaya Gönderim Kontrol Listesi

Son doğrulama: **27 Kasım 2026**

## Tamamlanan İşler

- [x] Masaüstü, iOS ve Android üzerinde `securepass-v1` şifreleme, yeni 32B `dataKey` ile ana parola yenileme, kurtarma anahtarı, Google CSV içe aktarma ve tekrar algılama test edildi.
- [x] Hiçbir platformda analitik, reklam, takip SDK'sı veya `INTERNET` izni (Android) bulunmadığı doğrulandı.
- [x] Paket kimlikleri ters alan adı standardına (`io.github.uksam38.secpass`) taşındı.
- [x] Çift dilli (TR + EN) Gizlilik Politikası ve Destek web sayfaları `docs/` altında GitHub Pages yayınına hazırlandı (`Samet Uçar` — `sametucar2738@gmail.com`).
- [x] Tam kare (full-bleed, alfa kanalsız) `1024×1024` App Store ikonu, `512×512` Google Play ikonu, `1024×500` Feature Graphic ve iPhone / iPad / Android mağaza ekran görüntüleri üretildi.
- [x] iOS ana uygulama ve AutoFill uzantısı için zorunlu `PrivacyInfo.xcprivacy` dosyaları eklendi; 9/9 XCTest ve cihaz hedefli Release `.xcarchive` doğrulandı.
- [x] Android birim testleri, lint kontrolü ve kalıcı upload anahtarıyla imzalı `SecPass-1.0.0-release.aab` paketi (`jarsigner` + `bundletool`) doğrulandı.

## Geliştirici Hesaplarında Tamamlanacak Son Adımlar

Ayrıntılı yönergeler `STORE-UPLOAD-GUIDE-TR.md` dosyasındadır:

- [ ] Apple Developer Portal'da `group.io.github.uksam38.secpass`, `io.github.uksam38.secpass` ve `io.github.uksam38.secpass.credential-provider` kimliklerini oluşturup Xcode'da Team seçerek App Store Connect'e Archive/Upload yapmak.
- [ ] Google Play Console'da `SecPass — Yerel Parola Kasası` uygulamasını oluşturup `SecPass-1.0.0-release.aab` paketini ve `store-assets/` görsellerini yüklemek.
- [ ] `release-secrets/google-play/` içindeki upload keystore dosyasını en az iki ayrı çevrimdışı konuma yedeklemek.
