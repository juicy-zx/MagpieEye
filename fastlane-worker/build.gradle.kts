// T2.8 快车道 worker 构建(钉版本硬门禁,见 docs/fastlane-feasibility.md「钉版本」条款)。
// 版本三件套必须与 demo-android/gradle/libs.versions.toml 逐一对齐;任一升级须重跑 T2.3 spike 判据。
plugins {
    id("com.android.application") version "9.0.1"            // = demo-android agp
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.10" // = demo-android kotlinComposePlugin(AGP 9 内建 Kotlin)
    id("app.cash.paparazzi") version "2.0.0-alpha05"          // 快车道渲染引擎(T2.3 spike 实证共存)
}

android {
    namespace = "com.magpie.uiv.fastlane"
    compileSdk = 36
    defaultConfig {
        minSdk = 26
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
    // 关键(T2.8 正确性):快车道渲染的必须是慢车道同一份 CalibCard 源,而非静态副本——
    // 否则 demo-android 写偏后 fast/slow 的 L2 violations 无法一致。构建期 Sync demo-android 组件源到
    // build/uiv-shared-src(工程内目录),再作 srcDir 纳入编译:既"同一份源"又每次构建自动新鲜。
    sourceSets.getByName("main").kotlin.srcDir("build/uiv-shared-src")
}

// demo-android 组件源单一事实源:构建期同步进本模块,禁止手工副本漂移(钉版本硬门禁的一部分)。
val syncSharedSource = tasks.register<Sync>("syncSharedSource") {
    from(rootProject.file("../demo-android/app/src/main/java"))
    // 只同步 worker 白名单消费的组件源(CalibCard 自足于 androidx.compose.*);
    // demo 其余源(如 FixtureCard 依赖 coil)超出 worker 钉版本依赖面,不得纳入。
    include("com/magpie/uiv/demo/CalibCard.kt")
    into(layout.buildDirectory.dir("uiv-shared-src"))
}
tasks.named("preBuild").configure { dependsOn(syncSharedSource) }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.06.00")) // = demo-android composeBom
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    testImplementation("junit:junit:4.13.2")
}
