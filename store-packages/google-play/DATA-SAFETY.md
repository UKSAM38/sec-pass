# Google Play Data Safety Cevapları — SecPass

Bu cevaplar `io.github.uksam38.secpass` paketindeki mevcut kaynak kod için geçerlidir:

- **Uygulamanız gerekli kullanıcı verisi türlerinden herhangi birini topluyor veya paylaşıyor mu?** → **Hayır.**
- **İnternet erişimi:** Uygulama `android.permission.INTERNET` izni talep etmez ve sunucuyla iletişim kurmaz.
- **Cihaz içi koruma:** Kasa verileri `AES-256-GCM` + `scrypt` ile cihazda `noBackupFilesDir` altında şifrelenir; biyometrik anahtar Android Keystore içinde donanım destekli olarak tutulur.
- **Veri silme:** Sunucu veya kullanıcı hesabı verisi yoktur. Uygulama içinden kayıtlar silinebilir; uygulama kaldırıldığında yerel veriler Android tarafından otomatik silinir.
- **Bağımsız güvenlik denetimi (Independent security review):** **Hayır** (henüz ticari üçüncü taraf MASA sertifikasyonu alınmamıştır).
- **Reklam kimliği (Advertising ID):** **Hayır.**
