# Doğrulama kaydı — SecurePass 1.0.0

Geliştirme ortamı: Apple Silicon macOS; Electron 44.4.3, React 18, TypeScript, Vite 8.3.0. Tüm test verileri yapaydır. Kullanıcının gerçek parolaları veya eski kasa verileri okunmadı.

- TypeScript kontrolü ve üretim derlemesi başarılı.
- 14 çekirdek test geçti: AES-GCM roundtrip, yanlış parola/anahtar reddi, ciphertext/tag/nonce/slot değişikliği, yeni nonce, sürüm/şema kontrolü, anahtar yenileme, özel dosya izinleri, atomik yazma, parola üretimi, parolasız listeleme ve tekrar grupları, güvenli URL doğrulama, CSV tırnak/satır/boşluk/tekrar/bozuk veri durumları ve mobil uyumluluk kasası.
- Gerçek Electron penceresinde kullanım testi geçti: kasa oluşturma, kurtarma anahtarı teyidi, kayıt ekleme, parola gösterme/gizleme, kopyalama, panodaki kullanıcı içeriğini koruma, kilit/açma, Google CSV aktarımı, tekrar uyarısı ve gruplama, düzenleme sonrası uyarının kalkması, şifreli yedek ve kurtarma anahtarıyla geri açma. Renderer hatası gözlenmedi.
- Ek güvenlik testi: renderer sandbox/context isolation, Node erişimi olmaması, ağ engeli, geçersiz ayarların reddi, dışarıdan dosya değişikliği algılama, 30 saniyelik pano süresi ve kilitte temizlenmesi (kullanıcı panosundan yalıtılmış test panosu), uyku kilidi, ana parola değişimi ve eski parolanın reddi, işletim sistemi boşta kalma kilidi, sürmekte olan girişin kilitlemeyle iptali.
- Bağımlılık güncellemeleri sonrası npm taraması 0 bilinen açık bildirdi. Bu sonuç tarama anı ve veritabanı kapsamıyla sınırlıdır.
- Kaynak ve sürüm geçmişinde `.env` dosyası veya yaygın özel anahtar/API anahtarı kalıbı bulunmadı; bağımlılık ve derleme çıktıları tarama dışında bırakıldı.
- Mobil sertleştirme: ana parola ve kurtarma anahtarı yenileme, eski kimlik bilgilerinin reddi, biyometrik anahtar sıfırlama, artan giriş gecikmesi, onaylı içe aktarma/silme, cihaz içi şifreli geri dönüş kopyası ve iOS uygulama değiştirici gizlilik perdesi eklendi.
- iOS Xcode doğrulaması 21 Eylül 2026 tarihinde yeniden çalıştırıldı: 5/5 XCTest geçti. Kaynak kod uyarıları giderildikten sonra cihaz hedefli imzasız Release arşivi başarıyla üretildi; Info.plist ve entitlement dosyaları doğrulandı.
- Android, resmi Temurin JDK 17 ve Android SDK 36 ile doğrulandı: debug/release birim testleri 2/2 + 2/2, Android 36 ARM emülatöründeki cihaz testleri 4/4 geçti. Gradle derlemesi, R8 release küçültmesi, lint, debug APK ve unsigned release AAB üretimi başarılı. Lint sonucu 0 hata ve 7 bilinçli uyumluluk/güncellik uyarısıdır; seçilen AndroidX sürümleri compileSdk 36/AGP 8.13 ile uyumluluk için sabitlenmiştir.
- Android için kalıcı 4096 bit RSA upload anahtarı oluşturuldu ve kaynak paketlerden ayrı, kısıtlı izinlerle saklandı. Bu anahtarla imzalanan Release AAB resmi bundletool ile doğrulandı; AAB'den üretilen evrensel Release APK Android 36 emülatörüne kuruldu ve açıldı.
- Paket Electron fuse sertleştirmeleriyle oluşturuldu. Yerel ad-hoc imza ve DMG bütünlüğü macOS araçlarıyla doğrulandı; Apple Developer/noter onayı değildir.
- 21 Eylül 2026 kurulu macOS uygulama denetimi: `/Applications/SecurePass.app` derin kod imzası ve designated requirement doğrulamasını geçti; paket içindeki ana süreç, preload, kasa motoru ve arayüz dosyaları kaynakla eşleşti. `RunAsNode`, `NODE_OPTIONS` ve CLI inspect fuse'ları kapalı; gömülü ASAR bütünlük kontrolü ve yalnızca ASAR'dan yükleme açık. Çalışan ana, GPU, network-service ve renderer süreçlerinde TCP/UDP soketi gözlenmedi. Kullanıcı veri klasörü `700`, içerdiği dosyalar genel olarak `600` izinliydi.
- Denetim sırasında Electron 44.4.2'den güncel 44.4.3 yama sürümüne yükseltildi; üretim derlemesi, 14/14 çekirdek testi, Electron güvenlik testi ve gerçek pencere kullanım testi yeniden geçti. Yeni DMG bütünlüğü doğrulandı ve güncel uygulama `/Applications/SecurePass.app` konumuna kuruldu.
- Savunma katmanı olarak Electron çerez deposu şifrelemesi açıldı; macOS App Transport Security'de genel ve yerel ağ yüklemeleri kapatıldı. Son kurulumda bu ayarlar ve çalışan dört SecurePass sürecinde 0 ağ soketi doğrulandı.

Testler bağımsız güvenlik denetimi veya gelecekte açık bulunmayacağı garantisi değildir. Tehdit modeli ve sınırlar SECURITY.md dosyasındadır.

Kurulu `/Applications/SecurePass.app` paketinin giriş ekranı ayrıca görsel olarak doğrulandı. Eski Password Manager kurulumuna dokunulmadı.
