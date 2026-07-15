plugins {
    alias(libs.plugins.android.library)
    `maven-publish`
}

// view-dump:ViewDumpRule(传统 Android XML/View 语义导出器)test-support artifact。
// codex 决断:无 Compose / Robolectric / Roborazzi 传递约束;编译期仅 Android SDK。
// ViewDumpRule 用 android.view.* / android.graphics.Rect,故取 android-library 形态(AAR),
// android.* 由 compileSdk 提供(bootclasspath,永不进 POM)。
android {
    namespace = "com.magpie.uiv.harness.view"
    compileSdk = 36

    defaultConfig {
        minSdk = 26 // CS2:NATIVE ellipsis 断言要求 sdk>=26(与 demo 对齐)
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    publishing {
        singleVariant("release")
    }
}

// 主源集零第三方依赖:ViewDumpRule 仅用 android.*(SDK bootclasspath)+ java.io。
// -> POM 不含 Compose / Robolectric / Roborazzi 任何传递。

afterEvaluate {
    publishing {
        publications {
            register<MavenPublication>("release") {
                from(components["release"])
                groupId = "com.magpie.uiv"
                artifactId = "view-dump"
                version = "0.1.0-alpha.2"
            }
        }
    }
}
