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
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")
class NativeTextMetricsTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun composeHasVisualOverflow_isTrue_underNative() { // CS1
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
        val overflow = requireNotNull(layoutResult).hasVisualOverflow
        writeProbe("native-compose.json", """{"hasVisualOverflow":$overflow}""")
        assertTrue("CS1:NATIVE 下超长串+maxLines=1 应 hasVisualOverflow==true", overflow)
    }

    @Test
    fun textViewEllipsisCount_isPositive_underNative() { // CS2:真 TextView measure+layout 路径
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
        val count = tv.layout.getEllipsisCount(0)
        writeProbe("native-textview.json", """{"ellipsisCount":$count}""")
        assertTrue("CS2:NATIVE 下真 TextView getEllipsisCount 应 >0,实际 $count", count > 0)
    }

    private fun writeProbe(name: String, json: String) {
        val dir = File("build/text-metrics").apply { mkdirs() }
        File(dir, name).writeText(json)
    }
}
