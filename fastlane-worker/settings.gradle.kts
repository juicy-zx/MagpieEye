// T2.8:快车道 worker 产品化模块(Codex D-05 立项)。
// 结构对齐 experiments/fastlane-spike/coexist-probe(已归档,不改):demo-android 同款
// AGP 9.0.1 + 内建 Kotlin 2.2.10 + Paparazzi 2.0.0-alpha05,叠加 paparazzi 插件。
// 复用 demo-android/.gradle-home 作 GRADLE_USER_HOME 命中已缓存的 layoutlib/compose transforms(离线)。
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

rootProject.name = "uiv-fastlane-worker"
