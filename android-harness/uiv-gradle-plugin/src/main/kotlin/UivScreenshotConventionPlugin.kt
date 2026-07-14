import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.testing.Test

/**
 * uiv.screenshot 渲染挽具 convention plugin(P0-8 产品化:默认"零覆盖")。
 *
 * codex Phase 1 决断(严格遵守):
 *  - 默认不注入 maxHeapSize / java.awt.headless / java.io.tmpdir;目标工程 Test task 既有配置优先。
 *  - headless 经 DSL 显式 opt-in(默认 false);真渲染需要时由目标工程开启,插件不无条件强加。
 *  - 系统属性 / Gradle 属性透传改为目标工程"显式声明的受控映射"(默认空集),
 *    不硬编码闭集、不扩大成任意系统属性透传。
 *  - 全部经 lazy provider 读取,保持 configuration-cache 安全。
 */
class UivScreenshotConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        val ext = extensions.create("uivScreenshot", UivScreenshotExtension::class.java)
        val headless = ext.headless.convention(false)
        val sysKeys = ext.forwardSystemProperties.convention(emptyList())
        val gradleKeys = ext.forwardGradleProperties.convention(emptyList())

        tasks.withType(Test::class.java).configureEach {
            // headless 默认关;仅目标工程显式 opt-in 时注入(封死误初始化 AWT Toolkit -> WindowServer 的路径)。
            if (headless.get()) {
                jvmArgs("-Djava.awt.headless=true")
            }
            // 受控系统属性透传:仅转发目标工程显式声明的 key(gradlew -D 落 daemon,须显式转发给 test worker)。
            sysKeys.get().forEach { key ->
                providers.systemProperty(key).orNull?.let { systemProperty(key, it) }
            }
            // 受控 Gradle 属性 -> test worker system property:仅转发目标工程显式声明的 key。
            gradleKeys.get().forEach { key ->
                providers.gradleProperty(key).orNull?.let { systemProperty(key, it) }
            }
            // 不默认写 maxHeapSize / java.io.tmpdir:目标工程 Test task 既有配置优先(零覆盖)。
        }
    }
}
