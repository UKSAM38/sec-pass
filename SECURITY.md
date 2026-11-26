# Güvenlik modeli ve sınırlar

## Dosya biçimi

`securepass-v1` zarfı; 32 bayt rastgele veri anahtarı, AES-256-GCM, her şifrelemede yeni 12 bayt nonce ve 16 bayt doğrulama etiketi kullanır. Verilerin tamamı (site, kullanıcı adı, parola, not, kategori ve ayarlar) şifrelenir. AAD, biçim sürümünü ve kullanım amacını (`password`, `recovery`, `data`) bağlar.

Ana paroladan 32 bayt anahtar, Node/OpenSSL scrypt ile türetilir: N=131072, r=8, p=1; rastgele 32 bayt salt. Türetilen anahtar veri anahtarını sarar. 32 bayt rastgele kurtarma anahtarı, veri anahtarını ayrı bir AES-GCM yuvasında sarar. Ana parola ve kurtarma anahtarı dosyaya yazılmaz. Kurtarma anahtarına sahip olmak, kasayı açmak için yeterlidir.

Algoritma/KDF parametreleri v1 içinde sabittir; saldırganın dosyada kontrol ettiği iş yükü parametreleri kabul edilmez. Desteklenmeyen sürümler reddedilir. Şifre çözme/doğrulama veya veri şeması denetimi başarısızsa dosya değiştirilmez. Yanlış parola denemelerine işlem içi artan bekleme uygulanır; bu önlem dosyayı ele geçiren saldırganın çevrimdışı denemelerini engellemez. Ana parola kalitesi ve scrypt çevrimdışı korumayı belirler.

## İşlem ve arayüz sınırı

Şifre çözme, anahtarlar, dosya erişimi ve pano Electron ana işlemindedir. Arayüze listeleme sırasında parola gönderilmez; açık gösterim veya düzenleme için gerekli olduğunda alan bazında işlem yapılır. Kasa anahtarları renderer’a verilmez. Parolalar web storage’a yazılmaz. IPC sabit izinli işlemlerle sınırlıdır; gönderen pencere, ana frame ve yerel sayfa adresi doğrulanır.

Renderer sandbox, context isolation, Node integration kapatma, kısıtlı CSP, izin isteklerini reddetme ve gezinme/yeni pencere engeli vardır. Renderer ağ istekleri CSP ve Electron session filtresiyle engellenir. Site bağlantıları yalnızca doğrulanan HTTPS adresleriyle dış tarayıcıya verilir; bu tarayıcı normal şekilde internete bağlanır. Üretim DevTools kapalıdır.

Paketlemede Electron fuse ayarları: RunAsNode, NODE_OPTIONS ve CLI inspect kapalı; OnlyLoadAppFromAsar ve embedded ASAR integrity açık. Yerel ad-hoc imza geliştirici kimliği sağlamaz; bilgisayarı değiştirme yetkisine sahip saldırganın uygulamayı değiştirmesine karşı mutlak koruma değildir.

## Yazma ve oturum

Dosyalar 0600 izinleriyle rastgele geçici ada yazılır, fsync yapılır ve aynı klasörde atomik rename ile değiştirilir. Yeni kasa oluşturma var olan dosyayı ezmez. İşlemler sıraya alınır. Bekleyen işlemler için kilitleme nesli izlenir; kilitleme sırasında süren anahtar türetme kasayı yeniden açamaz. Her yazma öncesi diskteki dosyanın hash’i açılan sürümle karşılaştırılır; farklılık varsa üzerine yazma reddedilir. Uygulama tek örnek çalışır. Başka bir programın tam kontrolündeki dosya sistemi için bu mekanizma bir dağıtık kilit değildir.

Anahtar Buffer’ları ve geçici açık JSON Buffer’ları kullanımdan sonra sıfırlanır. JavaScript string’leri ve GC kopyaları güvenilir biçimde sıfırlanamaz; kilitleme veriye uygulama erişimini kaldırır, donanım düzeyinde RAM silme garantisi vermez. Bellek/swap/core dump’a karşı FileVault ve işletim sistemi korumaları önemlidir. Kasa boyutu en fazla 16 MB, CSV 8 MB, kayıt sayısı 10.000’dir.

Mobil sürümler de her başarılı yazmadan önce cihaz içinde `previous.spvault` adlı şifreli bir geri dönüş kopyası tutar. Bu kopya iOS ve Android sistem yedeklerinden hariç tutulur. İçe aktarma ve geri dönme işlemleri açık onay ister; kayıt silme işlemi de doğrulama adımı olmadan gerçekleşmez. Ana parola yenilendiğinde tüm platformlarda yeni 32 bayt veri anahtarı (`dataKey`), yeni salt, yeni parola yuvası ve yeni kurtarma anahtarı üretilir; eski veri anahtarı, eski ana parola ve eski kurtarma anahtarı geçersiz olur. Biyometrik hızlı açılış anahtarı yenileme ve kasa değiştirme sonrasında silinir.

iOS, uygulama etkin durumdan çıktığında (`.inactive`) uygulama değiştirici görüntüsünü bir gizlilik perdesiyle örter ve arka plana geçtiğinde (`.background`) kasayı kilitler. Android `FLAG_SECURE` ile ekran görüntüsü/son uygulamalar önizlemesini engeller, Android 13+ üzerinde panoya kopyalanan parolaları `EXTRA_IS_SENSITIVE` ile maskeler ve uygulama arka plana geçtiğinde oturumu yok eder. İki platformda da (AutoFill kilit açma ekranları dahil) art arda başarısız kilit açma denemelerine artan bekleme uygulanır. Bu bekleme, kasa dosyasını ele geçiren çevrimdışı saldırgana karşı koruma değildir; scrypt ve güçlü ana parola bu tehdidin temel savunmasıdır.

## Bilinçli sınırlar

- Bulut eşitleme, tarayıcı uzantısı, otomatik form doldurma, passkey/TOTP veya sızıntı servisi bağlantısı yoktur.
- Eski uygulamanın düz metin verileri otomatik taşınmaz/silinmez. Yeni şifreli kasa oluşturmak eski kopyaları şifrelemez.
- Yedekler ve dışa aktarılan eski CSV kopyaları ayrı yönetilmelidir. Yeni ana parola eski yedekleri değiştirmez.
- Kurtarma anahtarının kaybında, ana parola hâlâ biliniyorsa ana parola değişimiyle yeni anahtar üretilebilir. İkisi de kayıpsa kurtarma yoktur.
- Açık kasayı kullanan kötü amaçlı yazılım, yönetici erişimi, ekran yakalama, keylogger, pano geçmişi ve fiziksel erişim bu uygulamanın koruma sınırları dışındadır.
- Testler ve bağımlılık taraması bağımsız güvenlik denetimi yerine geçmez.
