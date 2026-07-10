package com.magpie.uiv.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * UploadContent(Figma 39:10822)组件级截图测试,骨架照 HashtagPanelScreenshotTest。
 * 短名 "UploadContent" 锚定三处产物口径:PNG needle / build/uiv/UploadContent.semantics.json / golden 路径。
 * 宿主外层垫 #121212(不挂 tag,无语义节点):根 Figma 无 fill、baseline 为透明底,
 * 垫深底仅为目检可读;L1 diffRatio 因此参考价值低(advisory 不进 pass 判定,规格 §6-1)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class UploadContentScreenshotTest {

    @get:Rule
    val composeRule = createComposeRule()

    @get:Rule
    val dumpRule = SemanticsDumpRule()

    @Test
    fun captureUploadContent() {
        composeRule.setContent {
            Box(Modifier.background(Color(0xFF121212))) { UploadContent() }
        }
        // node capture 裁到 fig:39:10822 的 unclipped bounds:360x530dp * 2.0 = 720x1060 px
        composeRule.onNodeWithTag("fig:39:10822")
            .captureRoboImage("src/test/snapshots/UploadContent.png")
        dumpRule.dump(composeRule, "UploadContent")
    }
}
