package com.magpie.uiv.demo

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
 * HashtagPanel(Figma 39:10844)组件级截图测试,骨架照 CalibCardScreenshotTest。
 * 短名 "HashtagPanel" 锚定三处产物口径:PNG needle / build/uiv/HashtagPanel.semantics.json / golden 路径。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class HashtagPanelScreenshotTest {

    @get:Rule
    val composeRule = createComposeRule()

    @get:Rule
    val dumpRule = SemanticsDumpRule()

    @Test
    fun captureHashtagPanel() {
        composeRule.setContent { HashtagPanel() }
        // node capture 裁到 fig:39:10844 的 unclipped bounds:360x475dp * 2.0 = 720x950 px
        composeRule.onNodeWithTag("fig:39:10844")
            .captureRoboImage("src/test/snapshots/HashtagPanel.png")
        dumpRule.dump(composeRule, "HashtagPanel")
    }
}
