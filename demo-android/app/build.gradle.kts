plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose) // AGP 9 内建 Kotlin,不 apply kotlin-android
    alias(libs.plugins.roborazzi)
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
            // 以下渲染环境钉死逐字迁自原 demo-android/build-logic/UivScreenshotConventionPlugin
            // (该 convention plugin 已随本次 init-script 迁移退场;uiv.device/uiv.state 的 -P 转发
            // 已改由 uiv CLI 每次 spawn 前写盘的 init script 接管,见 packages/uiv-core/src/check/run.ts
            // 的 INIT_SCRIPT_CONTENT,此处不再重复)。
            all {
                // C2:封死测试代码误初始化 AWT Toolkit -> WindowServer 的路径
                it.jvmArgs("-Djava.awt.headless=true")
                // C2:可写且可从中加载 dylib 的 tmpdir(RNG dylib 与字体解包后 System.load)
                val tmpDir = layout.buildDirectory.dir("robolectric-tmp").get().asFile
                it.systemProperty("java.io.tmpdir", tmpDir.absolutePath)
                it.doFirst { tmpDir.mkdirs() }
                // 关键:gradlew 命令行 -D 只落在 Gradle daemon JVM 上,
                // 必须显式透传给 fork 出来的 test worker JVM,离线验收才真正生效
                // T4.5:对比度 ATF 检查须 robolectric.useRealAni(4.15+)才能查到真实 Compose 渲染内容;
                // 转发能力全局可用,但属性本身默认未设,仅显式 -D 调用时生效(局部/advisory,不改变默认测试行为)。
                listOf("robolectric.offline", "robolectric.dependency.dir", "robolectric.useRealAni").forEach { key ->
                    providers.systemProperty(key).orNull?.let { v -> it.systemProperty(key, v) }
                }
                // uiv.ci.threshold 双保险静态搬入:门 B(ci-gate.sh)的 gradle 调用不一定经 uiv CLI,
                // 与 CLI init script 的同名转发重复设置同值无害。uiv.device/uiv.state 不在此静态搬入之
                // 列——已由 init script 转发,静态搬入反而会在没有 init script 的裸调用下掩盖假矩阵。
                providers.gradleProperty("uiv.ci.threshold").orNull?.let { v -> it.systemProperty("uiv.ci.threshold", v) }
                it.maxHeapSize = "2g"
            }
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
    testImplementation(libs.roborazzi.accessibility.check) // T4.5:ATF ContrastCheck advisory(不进门禁)
    testImplementation(libs.coil.test)   // T3.4:FakeImageLoaderEngine 确定性图片注入

    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
}
