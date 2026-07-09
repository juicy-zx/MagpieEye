plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose) // AGP 9 内建 Kotlin,不 apply kotlin-android
    alias(libs.plugins.roborazzi)
    id("uiv.screenshot")
}

android {
    namespace = "com.magpie.uiv.demo"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.magpie.uiv.demo"
        minSdk = 26 // CS2:NATIVE ellipsis 断言要求 sdk>=26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true // Robolectric 必需
        }
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.coil.compose)   // T3.4:内容态 fixture 图片(FakeImageLoaderEngine/model=null,零网络)
    debugImplementation(libs.androidx.compose.ui.tooling)
    // ui-test-manifest 须 debugImplementation:Robolectric unit test 的 merged manifest
    // 只吃 variant 依赖,testImplementation 的 AndroidManifest 不参与 merge,
    // 否则 createComposeRule 因 ComponentActivity 未注册而无法启动(Roborazzi 官方 sample 同此接法)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.junit4)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.preview.scanner.support)
    testImplementation(libs.composable.preview.scanner)
    testImplementation(libs.coil.test)   // T3.4:FakeImageLoaderEngine 确定性图片注入

    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
}
