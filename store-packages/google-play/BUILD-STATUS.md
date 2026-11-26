# Google Play Paket Durumu — SecPass

Hazır ve doğrulanmış bileşenler:

- Kotlin Android kaynak projesi (`applicationId: io.github.uksam38.secpass`, `targetSdk: 36`, `minSdk: 28`)
- Hem biyometrik (`BiometricPrompt` + Android Keystore) hem Ana Parola destekli `SecPassAutofillService`
- Ana parola değişiminde 32 baytlık veri anahtarını (`dataKey`) ve kurtarma anahtarını yenileyen kriptografi katmanı
- Doğrudan telefondan Google Password Manager CSV içe aktarma, yazarken anlık arama ve Android 13+ `EXTRA_IS_SENSITIVE` hassas pano maskelemesi
- Bilerek `INTERNET` izni içermeyen `AndroidManifest.xml` ve `FLAG_SECURE` ekran koruma bayrağı
- Tam kare `512×512` Google Play ikonu, `1024×500` Feature Graphic ve `1080×1920` telefon ekran görüntüleri
- Kalıcı 4096-bit RSA upload anahtarıyla imzalanmış, `jarsigner` ve `bundletool` ile doğrulanmış `artifacts/SecPass-1.0.0-release.aab`
