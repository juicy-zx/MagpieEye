// 模板:View/XML 屏的 ScreenshotTest。每屏只改三处:①类名 <Name>ScreenshotTest ②R.layout.<布局> ③屏名字符串(两处)。
// 命名铁律:类名去掉 ScreenshotTest = dump 名 = PNG 文件名 = --preview 的 <Name>。
package com.example.app   // ← 改成你的测试包

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import com.github.takahirom.roborazzi.captureRoboImage
import com.magpie.uiv.harness.view.ViewDumpRule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)                     // 真字体度量,必须
@Config(sdk = [36], qualifiers = "w360dp-h800dp-xhdpi")     // sdk 钉已缓存 android-all;宽度=设计画板宽
class PlayerScreenshotTest {                                 // ← ①

    private val dumpRule = ViewDumpRule()

    @Test
    fun capture() {
        val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
        activity.setContentView(R.layout.fragment_player)    // ← ②
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        val dm = activity.resources.displayMetrics
        content.measure(
            View.MeasureSpec.makeMeasureSpec(dm.widthPixels, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(dm.heightPixels, View.MeasureSpec.EXACTLY),
        )
        content.layout(0, 0, content.measuredWidth, content.measuredHeight)
        val root = content.getChildAt(0)

        root.captureRoboImage("src/test/snapshots/Player.png")  // ← ③ L1 像素通道
        dumpRule.dump(root, "Player")                            // ← ③ L2 结构通道(不要改产物路径)
        // 不写断言:pass/fail 由 uiv check 的 L2 引擎判
    }
}
