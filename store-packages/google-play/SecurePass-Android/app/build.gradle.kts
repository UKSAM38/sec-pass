import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.isFile) keystorePropertiesFile.inputStream().use(::load)
}
fun signingValue(environmentName: String, propertyName: String): String? =
    System.getenv(environmentName)?.takeIf(String::isNotBlank)
        ?: keystoreProperties.getProperty(propertyName)?.takeIf(String::isNotBlank)

val signingStoreFile = signingValue("SECUREPASS_KEYSTORE_PATH", "storeFile")
val signingStorePassword = signingValue("SECUREPASS_KEYSTORE_PASSWORD", "storePassword")
val signingKeyAlias = signingValue("SECUREPASS_KEY_ALIAS", "keyAlias")
val signingKeyPassword = signingValue("SECUREPASS_KEY_PASSWORD", "keyPassword")
val hasUploadSigning = listOf(signingStoreFile, signingStorePassword, signingKeyAlias, signingKeyPassword).all { it != null }

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "local.securepass.android"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.uksam38.secpass"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    val uploadSigning = if (hasUploadSigning) {
        signingConfigs.create("upload") {
            storeFile = rootProject.file(requireNotNull(signingStoreFile))
            storePassword = requireNotNull(signingStorePassword)
            keyAlias = requireNotNull(signingKeyAlias)
            keyPassword = requireNotNull(signingKeyPassword)
        }
    } else null

    buildTypes {
        release {
            uploadSigning?.let { signingConfig = it }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
    testOptions { unitTests.isReturnDefaultValues = true }
    packaging { resources.excludes += setOf("META-INF/NOTICE*", "META-INF/LICENSE*") }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("org.bouncycastle:bcprov-jdk18on:1.86")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
}
