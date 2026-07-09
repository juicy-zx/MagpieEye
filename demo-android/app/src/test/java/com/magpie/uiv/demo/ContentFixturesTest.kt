package com.magpie.uiv.demo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** amplify 纯函数验收(纯 JVM,无 Android 依赖):零随机确定性、长度=targetLen、前缀=base。 */
class ContentFixturesTest {

    @Test
    fun amplifyIsDeterministicTruncatedAndPrefixed() {
        val a = ContentFixtures.amplify(ContentFixtures.TITLE, 120)
        val b = ContentFixtures.amplify(ContentFixtures.TITLE, 120)
        assertEquals("同输入两次调用全等(零随机源)", a, b)
        assertEquals("长度=targetLen", 120, a.length)
        assertTrue("前缀=base", a.startsWith(ContentFixtures.TITLE))
    }
}
