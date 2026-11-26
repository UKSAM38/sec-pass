# SecurePass iOS

SwiftUI iPhone/iPad uygulaması ve Apple AutoFill Credential Provider uzantısıdır. Masaüstündeki `securepass-v1` kasa biçimini AES-256-GCM + scrypt ile okur/yazar.

## Projeyi üretme

Bu klasörde `.xcodeproj` dosyası kaynak tanımından üretilir:

```sh
xcodegen generate
open SecurePass.xcodeproj
```

`project.yml` içinde Apple Developer Team ayarlanmalı; bundle kimlikleri ve `group.local.securepass.shared` App Group değeri geliştirici hesabındaki benzersiz değerlerle değiştirilmelidir. Xcode'da ana uygulama ve uzantı için App Groups ile AutoFill Credential Provider yetenekleri doğrulanmalıdır.

CryptoSwift 1.10.0 yalnızca masaüstü kasa biçimindeki scrypt anahtar türetimini uyumlu uygulamak için kullanılır. AES-GCM Apple CryptoKit ile yapılır.

## Güvenlik davranışı

- Aktif `.spvault` dosyası App Group içindeki korumalı klasörde tutulur.
- Ana parola saklanmaz. Başarılı parola açılışından sonra kullanıcı isterse veri anahtarı Keychain'e `WhenUnlockedThisDeviceOnly + biometryCurrentSet` korumasıyla yazılır.
- Kasa ana uygulama arka plana geçtiğinde bellekten kilitlenir.
- AutoFill uzantısı yalnızca Keychain biyometrik doğrulaması başarılı olursa kasayı çözer.
- Liste görünümü parola içermez; parola yalnızca seçim anında uzantıya aktarılır.
- İçe aktarılan dosya aktif konuma kopyalanır. Dışa aktarım şifreli `.spvault` dosyasını üretir.

## Mevcut sınırlar

Passkey ve TOTP bu sürümde yoktur. Bulut eşitleme yoktur. AutoFill kimlik indeksini güncellemek için kasa her kaydedildiğinde `ASCredentialIdentityStore` yenilenir. Gerçek cihazda Face ID/Touch ID ve AutoFill testleri yapılmadan mağazaya gönderilmemelidir.

