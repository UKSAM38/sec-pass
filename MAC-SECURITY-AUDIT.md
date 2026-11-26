# SecurePass macOS güvenlik denetimi

Tarih: 21 Eylül 2026

Hedef: `/Applications/SecurePass.app` ve dağıtım DMG'si. Denetimde yapay kasalar kullanıldı; kullanıcının gerçek kasa içeriği veya parolaları okunmadı.

## Sonuç

Denetlenen yerel sürümde kritik veya yüksek önem dereceli uygulama hatası bulunmadı. Electron 44.4.3'e yükseltilen ve ek sertleştirmelerle yeniden paketlenen sürüm `/Applications/SecurePass.app` konumuna kuruldu ve açıldı.

## Geçen kontroller

- Derin macOS kod imzası ve designated requirement doğrulaması geçti.
- DMG CRC bütünlük doğrulaması geçti; SHA-256 özetleri `release/SHA256SUMS.txt` içinde güncellendi.
- Kurulu ASAR içindeki ana süreç, preload, kasa motoru ve arayüz kaynakları doğrulanan üretim paketiyle eşleşti.
- Renderer sandbox, context isolation ve Node izolasyonu doğrulandı.
- `RunAsNode`, `NODE_OPTIONS` ve CLI inspect Electron fuse'ları kapalı.
- Gömülü ASAR bütünlük kontrolü ve yalnızca ASAR'dan yükleme açık.
- Electron çerez deposu şifrelemesi açık.
- macOS App Transport Security için genel ve yerel ağ yüklemeleri kapalı.
- Uygulamanın Electron ağ filtresi HTTP, HTTPS, WebSocket ve güvenli WebSocket isteklerini engelledi.
- Çalışan ana süreç, GPU süreci, network-service ve renderer sürecinde TCP/UDP soketi görülmedi.
- Yetkisiz renderer/iframe IPC çağrıları reddedildi; yeni pencere, gezinme ve webview engelleri doğrulandı.
- Harici kasa dosyası değişikliğinde üzerine yazma reddedildi.
- Değiştirilmiş ciphertext, tag, nonce ve anahtar slotları reddedildi.
- Ana parola değiştirme, eski parolanın geçersizliği ve kurtarma anahtarı akışları geçti.
- Pano yalnızca SecurePass'in yazdığı değer hâlâ bulunuyorsa 30 saniye sonra temizlendi.
- Uyku, ekran kilidi, işletim sistemi boşta kalması, pencere küçültme ve işlem sırasında kilitleme akışları geçti.
- Kullanıcı veri klasörü yalnızca kullanıcıya açık `700`; incelenen veri dosyaları genel olarak `600` izinliydi.
- 14/14 çekirdek test, Electron güvenlik paketi ve gerçek pencere kullanım testi geçti.
- `npm audit` sonucu 0 bilinen güvenlik açığıdır.

## Kalan dağıtım konusu

Kurulu uygulama hardened runtime ile yerel ad-hoc imzalıdır. Bu Mac'te bütünlük kontrolü geçer; başka kullanıcılara güvenilir DMG dağıtımı için Apple Developer ID Application sertifikasıyla imzalama ve Apple noter onayı gerekir. Bu işlem Apple Developer hesabı olmadan tamamlanamaz.

Electron uygulaması yerel paketlenmiş içeriği `file:` protokolüyle açtığı için `GrantFileProtocolExtraPrivileges` fuse'u açıktır. Saldırı yüzeyi; yalnızca paket içi dosyaları yükleme, ASAR bütünlük doğrulaması, sıkı CSP, kapalı gezinme/webview/popup yolları, kaynak doğrulamalı IPC ve çift katmanlı ağ engeliyle sınırlandırılmıştır.
