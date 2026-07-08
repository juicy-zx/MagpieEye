package com.magpie.uiv.daemon

import java.io.File
import java.net.StandardProtocolFamily
import java.net.UnixDomainSocketAddress
import java.nio.channels.Channels
import java.nio.channels.SocketChannel
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermissions
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DaemonTest {
    private val ws = Files.createTempDirectory("uivd")
    private val sock = ws.resolve("daemon.sock")
    private val fake = FakeExec()
    private val server = DaemonServer(sock, fake, ws).also { it.start() }

    class FakeExec : GradleExecutor {
        val calls = mutableListOf<Pair<File, List<String>>>()
        override fun run(cwd: File, args: List<String>): RunPayload {
            calls.add(cwd to args)
            return RunPayload(0, "fake-stderr")
        }
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
}
