// 模板:Compose 屏的 ScreenshotTest。每屏只改三处:①类名 ②setContent 内容 ③屏名字符串(三处)。
// 参照通过件:magpie_eye demo-android UploadContentScreenshotTest(39 tag 全咬合)。
package com.example.app   // ← 改成你的测试包

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.github.takahirom.roborazzi.captureRoboImage
import com.magpie.uiv.harness.semantics.SemanticsDumpRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class PlayerScreenshotTest {                                 // ← ①

    @get:Rule
    val composeRule = createComposeRule()

    // 已发布 semantics-dump 制品:普通字段 + 显式 dump() 调用(非 TestWatcher Rule)
    private val dumpRule = SemanticsDumpRule()

    @Test
    fun capture() {
        composeRule.setContent {
            // 外层垫底色仅为目检可读(不挂 tag,无语义节点);根 Composable 须 testTag("fig:<根节点id>")
            Box(Modifier.background(Color(0xFF121212))) { PlayerScreen() }   // ← ②
        }
        // node capture 裁到根 tag 的 unclipped bounds
        composeRule.onNodeWithTag("fig:39:10822")            // ← 根 figmaId
            .captureRoboImage("src/test/snapshots/Player.png")  // ← ③
        dumpRule.dump(composeRule, "Player")                    // ← ③
    }
}
