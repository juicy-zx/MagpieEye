package com.magpie.uiv.fastlane

import org.junit.Test
import java.io.File
import java.lang.management.ManagementFactory

/**
 * T2.8(来源:T2.3 spike DumpEnvTest):抓取 Paparazzi 测试 JVM 的地面真值
 * (系统属性/JVM args/classpath),供 daemon 以相同环境直启 worker `java` 子进程(绕开 Gradle)。
 * 由 `demo-android/gradlew -p fastlane-worker testDebugUnitTest --tests *DumpEnvTest --offline` 落 build/worker-env/。
 */
class DumpEnvTest {
    @Test
    fun dump() {
        val dir = File("build/worker-env").apply { mkdirs() }
        val props = System.getProperties().entries
            .filter { (k, _) -> k.toString().startsWith("paparazzi.") }
            .joinToString("\n") { (k, v) -> "-D$k=$v" }
        File(dir, "paparazzi-props.txt").writeText(props + "\n")
        File(dir, "jvm-args.txt").writeText(
            ManagementFactory.getRuntimeMXBean().inputArguments.joinToString("\n") + "\n"
        )
        File(dir, "classpath.txt").writeText(System.getProperty("java.class.path") + "\n")
        File(dir, "cwd.txt").writeText(System.getProperty("user.dir") + "\n")
    }
}
