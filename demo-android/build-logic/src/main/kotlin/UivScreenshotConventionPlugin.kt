import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.testing.Test

/**
 * 渲染挽具 convention plugin 雏形(T1.1,设计文档 2.2 节"接入打包")。
 * 当前只承载渲染环境钉死三件事(C2 边界);后续里程碑并入
 * Roborazzi 配置、SemanticsDumpRule、qualifiers 约定。
 */
class UivScreenshotConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        tasks.withType(Test::class.java).configureEach { test ->
            // C2:封死测试代码误初始化 AWT Toolkit -> WindowServer 的路径
            test.jvmArgs("-Djava.awt.headless=true")
            // C2:可写且可从中加载 dylib 的 tmpdir(RNG dylib 与字体解包后 System.load)
            val tmpDir = layout.buildDirectory.dir("robolectric-tmp").get().asFile
            test.systemProperty("java.io.tmpdir", tmpDir.absolutePath)
            test.doFirst { tmpDir.mkdirs() }
            // 关键:gradlew 命令行 -D 只落在 Gradle daemon JVM 上,
            // 必须显式透传给 fork 出来的 test worker JVM,离线验收才真正生效
            listOf("robolectric.offline", "robolectric.dependency.dir").forEach { key ->
                providers.systemProperty(key).orNull?.let { test.systemProperty(key, it) }
            }
            test.maxHeapSize = "2g"
        }
    }
}
