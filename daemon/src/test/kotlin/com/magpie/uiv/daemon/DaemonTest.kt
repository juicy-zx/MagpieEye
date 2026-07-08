package com.magpie.uiv.daemon

import java.io.File
import java.net.StandardProtocolFamily
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.SocketChannel
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class DaemonTest {
    private val ws = Files.createTempDirectory("uivd")
    private val sock = ws.resolve("daemon.sock")
    private val fake = FakeExec()
    private val renderer = FakeRenderer()
    private val server = DaemonServer(sock, fake, ws, renderer).also { it.start() }

    class FakeExec : GradleExecutor {
        val calls = mutableListOf<Pair<File, List<String>>>()
        override fun run(cwd: File, args: List<String>): RunPayload {
            calls.add(cwd to args)
            return RunPayload(0, "fake-stderr")
        }
    }

    class FakeRenderer : PreviewRenderer {
        var result = RenderResult(true, null, 12L, 8L)
        val calls = mutableListOf<Triple<String, File, File>>()
        override fun render(previewFqn: String, outPng: File, outSemantics: File): RenderResult {
            calls.add(Triple(previewFqn, outPng, outSemantics)); return result
        }
        override fun close() {}
    }

    @AfterTest
    fun tearDown() {
        server.stop()
    }

    @Test
    fun `perms + protocol routing`() {
        val ch = SocketChannel.open(StandardProtocolFamily.UNIX).apply {
            connect(UnixDomainSocketAddress.of(sock))
        }
        val w = Channels.newOutputStream(ch).bufferedWriter()
        val r = Channels.newInputStream(ch).bufferedReader()
        fun rpc(line: String): String {
            w.write(line); w.write("\n"); w.flush(); return r.readLine()
        }

        // 1. 0600 权限
        assertEquals("rw-------", PosixFilePermissions.toString(Files.getPosixFilePermissions(sock)))
        // 2. ping(忽略未知键 extra)
        assertTrue(rpc("""{"id":"1","cmd":"ping","extra":1}""").contains("\"pong\":true"))
        // 3. gradle.run 透传参数序 + exitCode + stderr
        val g = rpc("""{"id":"2","cmd":"gradle.run","args":{"cwd":"$ws","args":["t","--tests","X"]}}""")
        assertTrue(g.contains("\"exitCode\":0"))
        assertTrue(g.contains("fake-stderr"))
        assertEquals(listOf("t", "--tests", "X"), fake.calls.single().second)
        // 4. workspace 外 cwd 拒绝
        assertTrue(rpc("""{"id":"3","cmd":"gradle.run","args":{"cwd":"/private/tmp","args":[]}}""").contains("cwd_outside_workspace"))
        // 5. 未知命令
        assertTrue(rpc("""{"id":"4","cmd":"nope"}""").contains("unknown_cmd"))

        ch.close()
    }

    @Test
    fun `renderPreview routing + workspace 边界`() {
        val ch = SocketChannel.open(StandardProtocolFamily.UNIX).apply { connect(UnixDomainSocketAddress.of(sock)) }
        val w = Channels.newOutputStream(ch).bufferedWriter()
        val r = Channels.newInputStream(ch).bufferedReader()
        fun rpc(line: String): String { w.write(line); w.write("\n"); w.flush(); return r.readLine() }
        val fqn = "com.magpie.uiv.demo.CalibCardPreview"

        // 1. 成功:透传 previewFqn + 回显 png/semantics/renderMs
        val okResp = rpc("""{"id":"1","cmd":"renderPreview","render":{"previewFqn":"$fqn","outPng":"$ws/.ui-verify/r.png","outSemantics":"$ws/.ui-verify/s.json"}}""")
        assertTrue(okResp.contains("\"ok\":true"), okResp)
        assertTrue(okResp.contains("\"renderMs\":12"), okResp)
        assertEquals(fqn, renderer.calls.single().first)

        // 2. 失败原因如实上抛(供 CLI 回落判定)
        renderer.result = RenderResult(false, "worker_stale: rebuild required")
        assertTrue(rpc("""{"id":"2","cmd":"renderPreview","render":{"previewFqn":"$fqn","outPng":"$ws/.ui-verify/r.png","outSemantics":"$ws/.ui-verify/s.json"}}""").contains("worker_stale"))

        // 3. workspace 外输出路径拒绝
        assertTrue(rpc("""{"id":"3","cmd":"renderPreview","render":{"previewFqn":"$fqn","outPng":"/private/tmp/r.png","outSemantics":"/private/tmp/s.json"}}""").contains("path_outside_workspace"))

        // 4. 缺 render 参数
        assertTrue(rpc("""{"id":"4","cmd":"renderPreview"}""").contains("bad_request"))

        ch.close()
    }
}

class MainArgsTest {
    @Test
    fun `parseWorkspace 解析 --workspace,缺失即抛`() {
        assertEquals(Path.of("/w"), parseWorkspace(arrayOf("--workspace", "/w")))
        assertFailsWith<IllegalArgumentException> { parseWorkspace(emptyArray()) }
    }
}
