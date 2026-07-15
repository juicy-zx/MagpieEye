plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
    `maven-publish`
}

// semantics-dump:SemanticsDumpRule(Compose 语义树导出器)test-support artifact。
// codex 决断:Compose 用 compileOnly —— 目标工程供自己的 Compose 测试运行时;
// compileOnly 不进 POM 的 compile/runtime scope。
android {
    namespace = "com.magpie.uiv.harness.semantics"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true }

    publishing {
        singleVariant("release")
    }
}

// P0-8:发布制品 Kotlin 元数据向后兼容(codex A 支持区间)——language/apiVersion 下探 2.0,
// 使 mv 降至 2.0.x,Kotlin>=2.0 消费者可编译(见 view-dump 同注)。
kotlin {
    compilerOptions {
        languageVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
        apiVersion.set(org.jetbrains.kotlin.gradle.dsl.KotlinVersion.KOTLIN_2_0)
    }
}

dependencies {
    // Compose 全部 compileOnly:仅供 SemanticsDumpRule 编译,不进 POM;运行时由目标工程提供。
    compileOnly(platform(libs.androidx.compose.bom))
    compileOnly(libs.androidx.compose.ui)
    compileOnly(libs.androidx.compose.ui.graphics)
    compileOnly(libs.androidx.compose.ui.text)
    compileOnly(libs.androidx.compose.ui.unit)
    compileOnly(libs.androidx.compose.ui.test.junit4) // ComposeContentTestRule 编译期符号
    compileOnly(kotlin("stdlib", "2.0.21")) // 全局 flag 关闭内建 stdlib,compileOnly 不进 POM,消费者自供
}

afterEvaluate {
    publishing {
        publications {
            register<MavenPublication>("release") {
                from(components["release"])
                groupId = "com.magpie.uiv"
                artifactId = "semantics-dump"
                version = "0.1.0-alpha.4"
            }
        }
    }
}
