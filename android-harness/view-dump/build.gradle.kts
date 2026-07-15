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

// P0-8:发布制品 Kotlin 元数据向后兼容(codex A 支持区间)。harness 用 AGP9 内建 Kotlin 2.2.x 编 → mv=2.2.0,
// Kotlin 2.0.x 消费者(如真实 AGP8/Kotlin2.0 工程)编译期拒收"compiled with a newer version of Kotlin"。
// language/apiVersion 下探 2.0 → mv 降至 2.0.x,Kotlin>=2.0 消费者可编译。
kotlin {
    compilerOptions {
        languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
        apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
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
                version = "0.1.0-alpha.3"
            }
        }
    }
}
