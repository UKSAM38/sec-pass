# SecPass iOS

SwiftUI iPhone & iPad uygulaması ve Apple AutoFill Credential Provider uzantısıdır. Masaüstü ve Android ile aynı `securepass-v1` (`.spvault`) şifreli kasa biçimini AES-256-GCM + scrypt ile kullanır.

## Projeyi Üretme ve Açma

```sh
xcodegen generate
open SecurePass.xcodeproj
```

- **Ana Uygulama Bundle ID:** `io.github.uksam38.secpass`
- **AutoFill Uzantısı Bundle ID:** `io.github.uksam38.secpass.credential-provider`
- **App Group:** `group.io.github.uksam38.secpass`
- **Gizlilik Manifestleri:** `SecurePass/PrivacyInfo.xcprivacy` ve `SecurePassCredentialProvider/PrivacyInfo.xcprivacy`

## Güvenlik ve Özellikler

- Aktif `.spvault` dosyası App Group içindeki dosya korumalı (`FileProtectionType.complete`) klasörde tutulur ve yedeklerden hariç tutulur.
- Ana parola değişiminde yeni 32 baytlık veri anahtarı (`dataKey`), yeni salt ve yeni 64 karakterlik kurtarma anahtarı üretilir.
- Uygulama `.inactive` durumunda gizlilik perdesi gösterir, `.background` durumunda kasayı bellekten kilitler.
- AutoFill uzantısı hem Face ID / Touch ID hızlı kilit açmayı hem de doğrudan Ana Parola ile kilit açmayı destekler.
- Doğrudan Google Password Manager CSV şifre içe aktarma ve `.spvault` dosyasına dokunarak açma (`onOpenURL`) desteklenir.
