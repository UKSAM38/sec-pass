# SecPass — Yerel Şifreli Parola Kasası

**SecPass**, hesap ve parola verilerini herhangi bir bulut hesabına veya geliştirici sunucusuna göndermeden doğrudan kendi cihazında şifreleyerek saklayan yerel bir parola yöneticisidir. macOS (Electron + React), iOS (SwiftUI + AutoFill Credential Provider) ve Android (Kotlin + AutofillService) uygulamaları aynı geriye dönük uyumlu `.spvault` (`securepass-v1`, AES-256-GCM + scrypt) kasa biçimini paylaşır.

- **GitHub Deposu:** https://github.com/UKSAM38/sec-pass
- **Gizlilik Politikası:** https://uksam38.github.io/sec-pass/privacy.html
- **Destek & Kurulum Rehberi:** https://uksam38.github.io/sec-pass/support.html

## Proje Yapısı

- `desktop/`, `src/`, `main.cjs`: macOS / masaüstü Electron + React uygulaması
- `store-packages/app-store/SecurePass-iOS`: iPhone & iPad SwiftUI uygulaması ve AutoFill Credential Provider uzantısı (`SecPass`)
- `store-packages/google-play/SecurePass-Android`: Android Kotlin uygulaması ve AutofillService (`SecPass`)
- `docs/`: GitHub Pages üzerinde yayımlanan Türkçe/İngilizce tanıtım, gizlilik politikası ve destek sayfaları
- `store-packages/`: App Store ve Google Play mağaza metinleri, görselleri ve yükleme kılavuzları

## Başlangıç

1. **Yeni kasa oluştur** ile başka yerde kullanmadığınız en az 14 karakterlik bir ana parola seçin. Birkaç rastgele kelimeden oluşan uzun bir parola tercih edin.
2. `.spvault` dosyasını eşitlenmeyen yerel bir klasöre kaydedin (mobilde kasa cihazın korumalı uygulama alanına otomatik kaydedilir).
3. Gösterilen 64 karakterlik kurtarma anahtarını kağıda yazıp kasa dosyasından ayrı saklayın. Ana parola ve kurtarma anahtarı birlikte kaybolursa kasayı açan bir arka kapı bulunmaz.
4. Mevcut `.spvault` kasanızı masaüstü, iOS ve Android uygulamaları arasında şifreli yedek olarak taşıyıp aynı ana parolayla açabilirsiniz.

## Google Password Manager CSV İçe Aktarma

Chrome veya Google Şifre Yöneticisi → Ayarlar → Şifreleri dışa aktar yolundan CSV dosyanızı indirin ve masaüstü, iOS veya Android uygulamasında **Google CSV içe aktar** seçeneğini kullanın.

- Önizleme ekranı eklenecek, birebir tekrar olan, geçersiz ve HTTPS dışı adresi nota alınan kayıt sayısını gösterir.
- `name,url,username,password` sütunları zorunludur (`note`/`notes` isteğe bağlıdır). UTF-8 BOM, CRLF, tırnak içi virgül ve çok satırlı notlar desteklenir.
- En fazla 8 MB CSV ve 10.000 kayıt desteklenir. Aktarım sonrasında şifresiz CSV dosyasını cihazınızdan ve çöp kutusundan silin.

## Kilit, Pano ve Yedekleme

- Varsayılan 5 dakika hareketsizlikte otomatik kilitlenir (`1, 2, 5, 10, 15` dakika seçilebilir).
- Masaüstünde `⌘ L`, uyku, ekran kilidi veya pencere küçültme; mobilde arka plana geçiş kasayı anında kilitler.
- Görüntülenen parolalar 20 saniyede gizlenir; kopyalanan parolalar 30 saniyede temizlenir (Android 13+ üzerinde sistem pano önizlemesinde otomatik maskelenir).
- Her değişiklikten önce bir önceki şifreli sürüm (`.spvault.backup` / `previous.spvault`) saklanır. Ana parola değişimi hem 32 baytlık veri anahtarını (`dataKey`) hem de kurtarma anahtarını yeniler.

## Masaüstü Geliştirme ve Doğrulama

Node.js 22.12+ gerekir:

```sh
npm ci
npm run build
npm test
npm run test:security
npm run test:desktop
npm run electron:build
```

Güvenlik mimarisi ve tehdit modeli ayrıntıları için [SECURITY.md](SECURITY.md) dosyasına bakın.
