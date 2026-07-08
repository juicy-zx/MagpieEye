// T2.3 S2/S3:AGP 9.0.1(demo-android 同款)× Paparazzi 2.0.0-alpha05 共存机判 + 官方路线首图。
// S2 判据 = `gradlew tasks` 配置成功(已过);S3 = recordPaparazziDebug 出首张 PNG。
plugins {
    id("com.android.application") version "9.0.1"
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.10" // AGP 9 内建 Kotlin,不 apply kotlin-android(与 demo-android 一致)
    id("app.cash.paparazzi") version "2.0.0-alpha05"
}

android {
    namespace = "com.magpie.uiv.spike.coexist"
    compileSdk = 36
    defaultConfig {
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.06.00")) // 对齐 demo-android BOM
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    testImplementation("junit:junit:4.13.2")
}
