// T2.3 S2:共存性机判 probe——demo-android 同款 AGP 9.0.1 + 内建 Kotlin,叠加 paparazzi 插件。
// 实验专用,不回流产品代码。
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "coexist-probe"
