// DEPRECATED(2026-07-16 起退出 alpha 交付):本插件职能已由 uiv CLI 的 init script
// 接管(消费模块零构建文件改动,无需 apply 本插件)。坐标 0.1.0-alpha.4 留存不变、
// 不再随交付演进;源码保留供 v0.2 前追溯,不建议新工程接入。

plugins {
    `kotlin-dsl`
    `maven-publish`
}

group = "com.magpie.uiv"
version = "0.1.0-alpha.4"

// P0-8:插件 Kotlin 元数据向后兼容(与两 AAR 同,codex A 支持区间)。kotlin-dsl 默认用 Gradle 内建
// Kotlin(9.5.1→2.2)编 → mv=2.2.0;下探 language/apiVersion 至 2.0 使 Gradle 8.5(内建 Kotlin 更低)
// 加载/DSL 访问器读该插件元数据时不因版本超前受阻。
kotlin {
    compilerOptions {
        // kotlin-dsl 钉死 language/apiVersion 保插件 ABI,故用 -Xmetadata-version 直接下探写出的元数据版本。
        freeCompilerArgs.add("-Xmetadata-version=2.0.0")
    }
}

gradlePlugin {
    plugins {
        register("uivScreenshot") {
            id = "uiv.screenshot"
            implementationClass = "UivScreenshotConventionPlugin"
        }
    }
}

// java-gradle-plugin(经 kotlin-dsl 引入)+ maven-publish 自动生成:
//  - pluginMaven 发布(实现 jar + POM)
//  - uivScreenshotPluginMarkerMaven 发布(plugin marker POM,指向实现坐标)
// publishToMavenLocal 一并落 ~/.m2。
