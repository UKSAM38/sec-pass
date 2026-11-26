# App Store Paket Durumu — SecPass

Hazır ve doğrulanmış bileşenler:

- SwiftUI iPhone & iPad kaynak projesi (`io.github.uksam38.secpass`) ve `SecurePass.xcodeproj`
- Apple AutoFill Credential Provider uzantısı (`io.github.uksam38.secpass.credential-provider`) — hem Face ID / Touch ID hem de Ana Parola ile kilit açma destekli
- Ana parola değişiminde 32 baytlık veri anahtarını (`dataKey`) ve kurtarma anahtarını yenileyen kriptografi katmanı
- Doğrudan telefondan Google Password Manager CSV içe aktarma ve `.spvault` dosya açma (`onOpenURL`)
- Hem ana uygulamada hem AutoFill uzantısında gömülü `PrivacyInfo.xcprivacy` gizlilik manifestleri
- Tam kare (full-bleed), alfa kanalsız `1024×1024` App Store uygulama ikonu
- `1290×2796` iPhone 6.7"/6.9" ve `2048×2732` iPad 13" mağaza ekran görüntüleri
- 9/9 XCTest birim testi ve cihaz hedefli Release `.xcarchive` derleme doğrulaması
