# Güvenlik kontrolü — 21 Eylül 2026

Görseldeki genel web güvenliği listesi SecPass’ın çevrimdışı mimarisine göre değerlendirildi.

| Madde | Durum | SecPass karşılığı |
|---|---|---|
| Anahtarları çıkar | Uygulandı | Kaynakta gömülü API anahtarı veya parola yok; veri anahtarı rastgele üretiliyor. Android upload anahtarı ve parolası kaynak/teslim ZIP'lerinden ayrı tutuluyor. |
| `.env` geçmişi | Uygulandı | Paketlerde `.env` yok; sürüm kontrolüne sır eklenmiyor. |
| İzin kuralları | Uygulandı | iOS App Group/Keychain ve Android Autofill yetkileri asgari kapsamda. |
| Yetkiyi sunucuda tut | Uygulanamaz | Sunucu ve kullanıcı hesabı yok; yetkilendirme cihazın güvenli deposunda. |
| Girişe sınır koy | Uygulandı | Başarısız kilit açmalarda artan gecikme; scrypt çevrimdışı denemeleri pahalılaştırıyor. |
| Girdiyi doğrula | Uygulandı | Boyut, şema, tarih, kayıt sayısı ve yalnızca HTTPS URL doğrulaması var. |
| Yüklemeyi sınırla | Uygulandı | Kasa 16 MB, masaüstü CSV 8 MB; biçim doğrulaması başarısızsa dosya kabul edilmiyor. |
| CORS’u kilitle | Uygulanamaz | HTTP sunucusu yok; masaüstü renderer ağı ayrıca engelli. |
| Güvenlik başlıkları | Uygulandı | Masaüstünde sıkı CSP, sandbox ve context isolation; mobilde WebView yok. |
| HTTPS zorunlu | Uygulandı | Kayıt ve parola değiştirme bağlantılarında yalnızca HTTPS kabul ediliyor. |
| Şifreleri hash’le | Mimariye uyarlandı | Site parolaları geri okunması gerektiği için hash yerine AES-256-GCM ile şifreleniyor; ana parola saklanmıyor ve scrypt ile anahtar türetiyor. |
| Çerezi güvenli yap | Uygulanamaz | Oturum çerezi veya web hesabı yok. |
| Hata mesajını kıs | Uygulandı | Kilit açma hataları ayrıntı sızdırmayan ortak mesaj kullanıyor; dosya hataları sınırlı kullanıcı mesajlarına çevriliyor. |
| Logları temizle | Uygulandı | Parola, anahtar ve kasa içeriği loglanmıyor; üretim uygulamasında geliştirici konsolu kapalı. |
| Sorguyu parametrele | Uygulanamaz | Veritabanı/SQL yok; doğrulanan şifreli JSON dosyası var. |
| XSS’e karşı kaçır | Uygulandı | React metinleri varsayılan kaçırıyor; ham HTML kullanılmıyor; CSP ve gezinme engeli var. |
| Webhook imzası | Uygulanamaz | Webhook veya ağ servisi yok. |
| Admin’e rol koy | Uygulanamaz | Yönetici paneli veya çok kullanıcılı hesap sistemi yok. |
| Paketleri denetle | Uygulandı | `npm audit --omit=dev` sonucu 0 bilinen açık; sürümler kilitli. |
| Otomatik yedek | Uygulandı | Her yazmadan önce cihaz içi şifreli önceki sürüm tutuluyor; dışa aktarma ayrıca mevcut. |
| Hesabı gerçekten sil | Uygulanamaz | Hesap/sunucu verisi yok; kayıt silme onaylı, uygulama kaldırıldığında cihaz verisi sistemce silinir. |
| Harcama uyarısı | Uygulanamaz | Ödeme, faturalandırma veya bulut harcaması yok. |
| Saldırgan gibi dene | Kısmen tamam | Kripto değiştirme, yanlış anahtar, ağ engeli, IPC, dış dosya yarışı, pano, uyku/boşta kilidi ve Android 36 emülatör cihaz testleri tamamlandı. Bağımsız mobil güvenlik denetimi ve fiziksel cihaz testi yayın öncesinde yapılmalı. |

Ek düzeltmeler: mobil ana parola ve kurtarma anahtarı yenileme, eski kimlik bilgilerinin geçersizleşmesi, biyometrik anahtarın sıfırlanması, içe aktarma öncesi onay, geri dönüş kopyası, kayıt silme onayı, iOS uygulama değiştirici gizlilik perdesi ve Android ekran yakalama engeli.

Mac kurulum denetimi: kurulu paket kaynakla eşleşti, derin kod imzası/ASAR bütünlüğü doğrulandı, Electron fuse sertleştirmeleri etkin bulundu ve çalışan süreçlerde ağ soketi görülmedi. Electron 44.4.3'e yükseltildikten sonra tüm masaüstü testleri tekrar geçti. Mevcut imza yerel ad-hoc hardened runtime imzasıdır; başka Mac'lere dağıtım için Apple Developer ID imzası ve noter onayı ayrıca gereklidir.
