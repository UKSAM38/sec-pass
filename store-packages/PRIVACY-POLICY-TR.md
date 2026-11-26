# SecPass Gizlilik Politikası

Son güncelleme: 26 Kasım 2026

SecPass, kullanıcıların hesap bilgilerini kendi cihazlarında şifreli bir kasa (`.spvault`) içinde saklamasını sağlayan yerel bir parola yöneticisidir.

Bu uygulama kullanıcı hesabı oluşturmaz; reklam, analitik, izleme (tracking) veya üçüncü taraf hata raporlama hizmeti kullanmaz. Kasa içeriği, ana parola, kurtarma anahtarı, kullanıcı adları, web sitesi adresleri, parolalar ve notlar geliştiriciye veya başka bir sunucuya gönderilmez.

Kullanıcı açıkça içe veya dışa aktarma işlemi yaptığında seçtiği dosya sağlayıcısı kasanın şifreli kopyasını işleyebilir. iCloud Drive, Google Drive veya başka bir bulut sağlayıcısı seçilirse o sağlayıcının gizlilik politikası geçerlidir. SecPass bu sağlayıcıları kendiliğinden kullanmaz.

Otomatik doldurma (AutoFill) özelliği, kullanıcının işletim sistemi ayarlarından açıkça etkinleştirmesinden sonra çalışır. Uygulama yalnızca uygun giriş alanlarına kullanıcının seçtiği kaydı sağlar. Biyometrik kilit açma (Face ID / Touch ID / Android BiometricPrompt) işletim sisteminin donanım destekli güvenli alanında çalışır; biyometrik veriler uygulamaya aktarılmaz.

Uygulama silindiğinde uygulamaya özel yerel kasa kopyası ve güvenli anahtar deposu kaydı işletim sistemi tarafından kaldırılır. Kullanıcının dışa aktardığı `.spvault` yedekleri seçilen konumda kalır ve kullanıcı tarafından yönetilir.

- **Veri Sorumlusu / Geliştirici:** Samet Uçar
- **İletişim ve Destek E-postası:** sametucar2738@gmail.com
- **Gizlilik Politikası URL'si:** https://uksam38.github.io/sec-pass/privacy.html
- **Destek Sayfası URL'si:** https://uksam38.github.io/sec-pass/support.html
