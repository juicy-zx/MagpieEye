package com.magpie.uiv.harness.view

import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import java.io.File

/**
 * view-dump-exporter(传统 Android XML/View 体系的语义导出器)。
 * 递归 android.view.View 树,产出与 SemanticsDumpRule **完全同 schema** 的 semantics.json
 * ({density, graphicsMode, root:SemNode}),整条 uiv-core L2 管线零改动通吃。
 *
 * P0-8:去 TestWatcher 空壳继承(codex E 决断:无行为直接删),退化为普通 helper;dump() 显式调用。
 *
 * 字段映射(Codex 冻结口径 D1~D8):
 *  - testTag           = View.getTag() 原样字符串(D2:不清洗/转义;同 dump 内重复 fail-fast)。
 *  - text              = (TextView).text;非 TextView → null。
 *  - positionInRoot    = getLocationInWindow − 根 location(px,unclipped;载重前提=根 rebase 到 (0,0))。
 *  - size              = width/height(measuredW/H,px)。
 *  - touchBoundsInRoot = **显式 null**(D3/CR1:TouchDelegate 无 per-child getter,不可算,诚实缺席;
 *                        禁伪填视觉盒。touchTarget 门缺席即跳过)。
 *  - colorHex          = (TextView).currentTextColor and 0xFFFFFF;非 TextView → null。
 *  - fontSizeSp        = (TextView).textSize / scaledDensity(fontScale=1 时 = textSize/2.0);非 TextView → null。
 *  - cornerRadiusPx    = 恒 null(背景 drawable 圆角无 getter,与 Compose 同为 null)。
 *  - hasVisualOverflow = (TextView):遍历所有 layout 行 getEllipsisCount(i)>0 || lineCount>maxLines(D1);
 *                        非 TextView → null。
 *  - clickable         = View.isClickable(D4:如实平台事实,不置 false/不缺省/不用 hasOnClickListeners)。
 *  - contentDescription= View.contentDescription。
 *  - boundsInRoot      = getGlobalVisibleRect 返回 true 的可见节点导出 clipped 盒(commit2 R1 Codex 校正)。
 *                        坐标以 **fig 根的 getGlobalVisibleRect 原点**(screen 系)重钉:child 各边减根 visible 原点,
 *                        与 positionInRoot(getLocationInWindow−根 location)同系对齐(完全可见时 boundsInRoot==pos+size)。
 *                        getGlobalVisibleRect=false(完全不可见)→ 整键省略(optional;childClipped 对该节点跳过,
 *                        emit null 会令 toDp 解引用崩)。**未标定本期不支持**:屏边裁剪 / 滚动离屏 / 根不完全可见——
 *                        getGlobalVisibleRect 在这些场景语义复杂(窗口/滚动叠加),不在本期口径内(见 dump() 断言约束)。
 *
 * 载重前提:View 须经真 measure+layout(裸 inflate width/height=0);dump 根置于原点(减根 location);
 *          boundsInRoot 载重前提=根经 getGlobalVisibleRect 完全可见(rect 尺寸==根 measured 尺寸,固定 ActivityScenario 下成立)。
 */
class ViewDumpRule(private val outDir: File = File("build/uiv")) {

    fun dump(root: View, name: String, graphicsMode: String = "NATIVE") {
        val density = root.resources.displayMetrics.density
        val rootLoc = IntArray(2).also { root.getLocationInWindow(it) }
        // boundsInRoot 重钉基:fig 根的 getGlobalVisibleRect 原点(screen 系,与 positionInRoot 同系对齐)。
        val rootVisible = Rect().also { root.getGlobalVisibleRect(it) }
        val seenTags = HashSet<String>()
        outDir.mkdirs()
        File(outDir, "$name.semantics.json")
            .writeText("""{"density": $density, "graphicsMode": "$graphicsMode", "root": ${nodeJson(root, rootLoc, rootVisible, seenTags)}}""")
    }

    private fun nodeJson(v: View, rootLoc: IntArray, rootVisible: Rect, seenTags: HashSet<String>): String {
        val tag = v.tag as? String
        // D2:同一 dump 内 tag 唯一,重复 fail-fast(不覆盖)。
        if (tag != null && !seenTags.add(tag)) {
            throw IllegalStateException("duplicate testTag in dump: $tag")
        }
        val loc = IntArray(2).also { v.getLocationInWindow(it) }
        val x = loc[0] - rootLoc[0]
        val y = loc[1] - rootLoc[1]

        val tv = v as? TextView
        val text = tv?.text?.toString()
        val colorHex = tv?.let { "\"#%06X\"".format(it.currentTextColor and 0xFFFFFF) } ?: "null"
        val fontSp = tv?.let { it.textSize / v.resources.displayMetrics.scaledDensity }
        val overflow = tv?.let { textViewOverflow(it).toString() } ?: "null"

        val cd = v.contentDescription?.toString()
        // boundsInRoot:getGlobalVisibleRect=true 才导出(clipped 盒),各边减 fig 根 visible 原点重钉;
        // false(完全不可见)→ 整键省略。完全可见时 = positionInRoot+size(坐标系对齐门,测试断言)。
        val vis = Rect()
        val boundsJson = if (v.getGlobalVisibleRect(vis)) {
            """"boundsInRoot":{"left":${vis.left - rootVisible.left},"top":${vis.top - rootVisible.top},""" +
                """"right":${vis.right - rootVisible.left},"bottom":${vis.bottom - rootVisible.top}},"""
        } else {
            ""
        }
        val kids = if (v is ViewGroup) {
            (0 until v.childCount).joinToString(",") { nodeJson(v.getChildAt(it), rootLoc, rootVisible, seenTags) }
        } else {
            ""
        }
        return """{"testTag":${js(tag)},"text":${js(text)},""" +
            """"positionInRoot":{"x":$x,"y":$y},""" +
            """"size":{"width":${v.width},"height":${v.height}},""" +
            """"touchBoundsInRoot":null,""" +
            """"colorHex":$colorHex,"fontSizeSp":${fontSp ?: "null"},"cornerRadiusPx":null,""" +
            """"hasVisualOverflow":$overflow,"clickable":${v.isClickable},"contentDescription":${js(cd)},""" +
            boundsJson +
            """"children":[$kids]}"""
    }

    /**
     * D1 CS2 通用实现:遍历所有 layout 行,任一行 getEllipsisCount(i)>0 即溢出(不能只查第 0 行——
     * 多行末行 ellipsis 会被漏);lineCount>maxLines 仅补充不替代 ellipsis。未 layout(layout==null)→ false。
     */
    private fun textViewOverflow(tv: TextView): Boolean {
        val layout = tv.layout ?: return false
        for (i in 0 until layout.lineCount) {
            if (layout.getEllipsisCount(i) > 0) return true
        }
        val max = tv.maxLines
        return max in 1 until layout.lineCount
    }

    // 控制字符转义(与 SemanticsDumpRule.js 同口径):多行 TEXT 含 \n 否则产非法 JSON。
    private fun js(v: String?): String =
        v?.let {
            val sb = StringBuilder("\"")
            for (ch in it) {
                when (ch) {
                    '\\' -> sb.append("\\\\")
                    '"' -> sb.append("\\\"")
                    '\n' -> sb.append("\\n")
                    '\r' -> sb.append("\\r")
                    '\t' -> sb.append("\\t")
                    else -> if (ch < ' ') sb.append("\\u%04x".format(ch.code)) else sb.append(ch)
                }
            }
            sb.append("\"").toString()
        } ?: "null"
}
