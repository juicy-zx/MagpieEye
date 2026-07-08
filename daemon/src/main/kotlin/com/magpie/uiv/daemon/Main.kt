package com.magpie.uiv.daemon

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.OutputStream
import java.net.StandardProtocolFamily
import java.net.UnixDomainSocketAddress
import java.nio.channels.SocketChannel
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.ConcurrentHashMap
import kotlin.system.exitProcess
import org.gradle.tooling.BuildException
import org.gradle.tooling.GradleConnectionException
import org.gradle.tooling.GradleConnector
import org.gradle.tooling.ProjectConnection

/**
 * Tooling API 执行器:按 projectDir 缓存复用 ProjectConnection,Gradle daemon 常驻保暖。
 * GRADLE_USER_HOME 钉在 cwd/.gradle-home(对齐 Spawn 路径约定)。
 */
class TapiGradleExecutor : GradleExecutor, AutoCloseable {
    private val conns = ConcurrentHashMap<String, ProjectConnection>()

    private fun connect(cwd: File): ProjectConnection = conns.computeIfAbsent(cwd.canonicalPath) {
        GradleConnector.newConnector()
            .forProjectDirectory(cwd)
            .useBuildDistribution()
            .useGradleUserHomeDir(File(cwd, ".gradle-home"))
            .connect()
    }

    override fun run(cwd: File, args: List<String>): RunPayload {
        val err = ByteArrayOutputStream()
        return try {
            connect(cwd).newBuild()
                .withArguments(args)
                .setStandardOutput(OutputStream.nullOutputStream())
                .setStandardError(err)
                .run()
            RunPayload(0, err.tail())
        } catch (e: BuildException) {
            RunPayload(1, err.tail())
        } catch (e: GradleConnectionException) {
            conns.remove(cwd.canonicalPath)?.let { runCatching { it.close() } }
            RunPayload(1, "GradleConnectionException: ${e.message}\n${err.tail()}")
        }
    }

    private fun ByteArrayOutputStream.tail(n: Int = 200_000) = toString(Charsets.UTF_8).takeLast(n)

    override fun close() {
        conns.values.forEach { runCatching { it.close() } }
    }
}

fun parseWorkspace(a: Array<String>): Path {
    val i = a.indexOf("--workspace")
    require(i >= 0 && i + 1 < a.size) { "usage: uiv-render-daemon --workspace <dir>" }
    return Path.of(a[i + 1]).toAbsolutePath().normalize()
}

fun main(a: Array<String>) {
    val ws = parseWorkspace(a)
    val sock = ws.resolve(".ui-verify/daemon.sock")
    Files.createDirectories(sock.parent)
    check(sock.toString().toByteArray().size <= 100) { "socket path too long for AF_UNIX: $sock" }
    if (Files.exists(sock)) {
        val alive = runCatching {
            SocketChannel.open(StandardProtocolFamily.UNIX).use { it.connect(UnixDomainSocketAddress.of(sock)) }
            true
        }.getOrDefault(false)
        if (alive) {
            System.err.println("daemon already running")
            exitProcess(11)
        }
        Files.delete(sock)
    }
    val ex = TapiGradleExecutor()
    val server = DaemonServer(sock, ex, ws)
    Runtime.getRuntime().addShutdownHook(Thread { server.stop(); ex.close() })
    println("listening on $sock")
    server.start().join()
}
