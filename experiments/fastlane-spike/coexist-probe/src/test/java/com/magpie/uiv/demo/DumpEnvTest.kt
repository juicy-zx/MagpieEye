package com.magpie.uiv.demo

import org.junit.Test
import java.io.File
import java.lang.management.ManagementFactory

/**
 * T2.3 S4 前置:抓取 Paparazzi 测试 JVM 的地面真值(系统属性/JVM args/classpath),
 * 供 JUnit-free 常驻 worker 以相同环境直启 `java` 进程(绕开 Gradle)。
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
