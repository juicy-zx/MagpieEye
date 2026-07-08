package com.magpie.uiv.daemon

import java.io.File
import java.net.StandardProtocolFamily
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.ServerSocketChannel
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class RunArgs(val cwd: String? = null, val args: List<String> = emptyList())

@Serializable
data class RenderArgs(val previewFqn: String, val outPng: String, val outSemantics: String)

@Serializable
data class Request(val id: String, val cmd: String, val args: RunArgs? = null, val render: RenderArgs? = null)

data class RunPayload(val exitCode: Int, val stderr: String)

interface GradleExecutor {
    fun run(cwd: File, args: List<String>): RunPayload
}

private val json = Json { ignoreUnknownKeys = true }

private fun ok(id: String, p: JsonObject): String =
    buildJsonObject { put("id", id); put("ok", true); put("payload", p) }.toString()

private fun err(id: String, m: String): String =
    buildJsonObject { put("id", id); put("ok", false); put("error", m) }.toString()

/** 单线程顺序服务:一连接多行,EOF 收尾;UDS 绑定即 0600。 */
class DaemonServer(private val sock: Path, private val exec: GradleExecutor, private val ws: Path, private val renderer: PreviewRenderer) {
    private val ch = ServerSocketChannel.open(StandardProtocolFamily.UNIX)
        .bind(UnixDomainSocketAddress.of(sock))
        .also { Files.setPosixFilePermissions(sock, PosixFilePermissions.fromString("rw-------")) }

    fun start(): Thread = Thread {
        while (ch.isOpen) {
            val conn = runCatching { ch.accept() }.getOrNull() ?: break
            conn.use {
                val w = Channels.newOutputStream(it).bufferedWriter()
                Channels.newInputStream(it).bufferedReader().forEachLine { l ->
                    w.write(handle(l)); w.write("\n"); w.flush()
                }
            }
        }
    }.also { it.isDaemon = true; it.start() }

    fun stop() {
        runCatching { ch.close() }
        Files.deleteIfExists(sock)
    }

    private fun handle(line: String): String {
        val q = runCatching { json.decodeFromString<Request>(line) }.getOrElse { return err("?", "bad_request: ${it.message}") }
        return when (q.cmd) {
            "ping" -> ok(q.id, buildJsonObject { put("pong", true); put("pid", ProcessHandle.current().pid()); put("workspace", "$ws") })
            "gradle.run" -> {
                val cwd = q.args?.cwd?.let { File(it).canonicalFile } ?: return err(q.id, "bad_request: args.cwd required")
                if (!cwd.toPath().startsWith(ws.toRealPath())) return err(q.id, "cwd_outside_workspace: $cwd")
                val r = exec.run(cwd, q.args.args)
                ok(q.id, buildJsonObject { put("exitCode", r.exitCode); put("stderr", r.stderr) })
            }
            "renderPreview" -> {
                val ra = q.render ?: return err(q.id, "bad_request: render args required")
                val png = File(ra.outPng).canonicalFile
                val sem = File(ra.outSemantics).canonicalFile
                if (!png.toPath().startsWith(ws.toRealPath()) || !sem.toPath().startsWith(ws.toRealPath())) {
                    return err(q.id, "path_outside_workspace")
                }
                val r = renderer.render(ra.previewFqn, png, sem)
                if (!r.ok) return err(q.id, r.error ?: "render_failed")
                ok(q.id, buildJsonObject {
                    put("png", png.toString()); put("semantics", sem.toString())
                    put("renderMs", r.renderMs ?: 0L); put("semanticsMs", r.semanticsMs ?: 0L)
                })
            }
            else -> err(q.id, "unknown_cmd: ${q.cmd}")
        }
    }
}
