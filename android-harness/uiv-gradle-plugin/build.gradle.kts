plugins {
    `kotlin-dsl`
    `maven-publish`
}

group = "com.magpie.uiv"
version = "0.1.0-alpha.2"

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
