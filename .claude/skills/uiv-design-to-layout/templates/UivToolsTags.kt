package com.example.app   // ← 改成你的测试包

import android.view.View
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

private const val TOOLS_NS = "http://schemas.android.com/tools"
private const val ANDROID_NS = "http://schemas.android.com/apk/res/android"

/**
 * v1(模板):将布局 XML 中的设计态 `tools:tag`(仅编译期可见,不进入运行时视图树)
 * 重新绑定到已 inflate 的运行时 View 的 `view.tag` 上,供 L2 结构校验 join 使用。
 *
 * v1 边界(KISS,不做规格外扩展):
 * - 仅支持单个 main 源集布局文件(不递归解析 `<include>`)。
 * - 锚定方式为 `android:id`——每个带 `tools:tag` 的元素必须同时声明 `android:id`,
 *   通过 `Resources.getIdentifier` + `View.findViewById` 定位运行时节点。
 * - 不做任何静默兜底:锚点缺失、id 未注册、id 在树中找不到、或同文件内 tag 值重复,
 *   一律抛 [IllegalStateException] 并在消息中给出可定位的上下文。
 */
object UivToolsTags {

    fun apply(root: View, layoutXml: File) {
        val factory = DocumentBuilderFactory.newInstance()
        factory.isNamespaceAware = true
        val document = factory.newDocumentBuilder().parse(layoutXml)

        val seenTags = mutableSetOf<String>()
        val elements = document.getElementsByTagName("*")
        for (i in 0 until elements.length) {
            val element = elements.item(i) as Element
            val figTag = element.getAttributeNS(TOOLS_NS, "tag").takeIf { it.isNotEmpty() } ?: continue

            if (!seenTags.add(figTag)) {
                error("UivToolsTags: duplicate tools:tag=\"$figTag\" found in ${layoutXml.path}")
            }

            val idAttr = element.getAttributeNS(ANDROID_NS, "id").takeIf { it.isNotEmpty() }
                ?: error("UivToolsTags: element <${element.tagName}> with tools:tag=\"$figTag\" has no android:id")

            val idName = idAttr.removePrefix("@+id/").removePrefix("@id/")
            val resId = root.resources.getIdentifier(idName, "id", root.context.packageName)
            if (resId == 0) {
                error("UivToolsTags: android:id=\"$idAttr\" (element <${element.tagName}>, tools:tag=\"$figTag\") did not resolve to a resource id")
            }

            val view = root.findViewById<View>(resId)
                ?: error("UivToolsTags: id \"$idName\" resolved (resId=$resId) but no matching View found in the inflated tree (element <${element.tagName}>, tools:tag=\"$figTag\")")

            view.tag = figTag
        }
    }
}
