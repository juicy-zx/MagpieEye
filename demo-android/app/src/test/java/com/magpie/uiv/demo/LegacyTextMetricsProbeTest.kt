package com.magpie.uiv.demo

import android.text.TextUtils
import android.view.View
import android.widget.TextView
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * LEGACY 图形模式对比探针(CS1/CS2 对照组)。
 * 预期 LEGACY 伪造文本测量:hasVisualOverflow 假阴 / getEllipsisCount 恒 0(PR #9834 已 revert 模拟)。
 * 只记录实测值供 T1.1.12 汇总,不做硬断言(LEGACY 行为非本工具链依赖项)。
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.LEGACY)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class LegacyTextMetricsProbeTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun recordComposeOverflowUnderLegacy() {
        val result = runCatching {
            var layoutResult: TextLayoutResult? = null
            composeRule.setContent {
                Text(
                    text = "超长文本溢出探针".repeat(40),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    onTextLayout = { layoutResult = it },
                    modifier = Modifier.width(100.dp),
                )
            }
            composeRule.waitForIdle()
            requireNotNull(layoutResult).hasVisualOverflow
        }
        writeProbe(
            "legacy-compose.json",
            result.fold(
                { """{"hasVisualOverflow":$it,"error":null}""" },
                { """{"hasVisualOverflow":null,"error":"${it.javaClass.simpleName}"}""" },
            ),
        )
    }

    @Test
    fun recordTextViewEllipsisUnderLegacy() {
        val result = runCatching {
            val tv = TextView(ApplicationProvider.getApplicationContext()).apply {
                text = "x".repeat(500)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            }
            tv.measure(
                View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
            )
            tv.layout(0, 0, tv.measuredWidth, tv.measuredHeight)
            tv.layout.getEllipsisCount(0)
        }
        writeProbe(
            "legacy-textview.json",
            result.fold(
                { """{"ellipsisCount":$it,"error":null}""" },
                { """{"ellipsisCount":null,"error":"${it.javaClass.simpleName}"}""" },
            ),
        )
    }

    private fun writeProbe(name: String, json: String) {
        val dir = File("build/text-metrics").apply { mkdirs() }
        File(dir, name).writeText(json)
    }
}
