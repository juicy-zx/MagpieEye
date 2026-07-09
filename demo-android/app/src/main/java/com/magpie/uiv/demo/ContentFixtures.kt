package com.magpie.uiv.demo

import androidx.compose.ui.tooling.preview.PreviewParameterProvider

/** 内容态七态表(设计 3.3)。 */
enum class ContentState { TYPICAL, EMPTY, LONG_TEXT, ERROR, LOADING, LARGE_LIST, RTL }

/**
 * 内容态 fixture 文案与放大器(T3.4)。amplify 为纯函数零随机源(禁 Random;"种子固定"以零随机上位满足),
 * 同输入恒等输出,供 LONG_TEXT 态强制文本溢出。
 */
object ContentFixtures {
    const val TITLE = "Calibration Report"
    const val BODY = "All geometry checks passed within tolerance."
    private const val CJK = "鹊眼校准超长中文混排样例"
    private const val EMOJI = "🦅📐"

    /** base + (CJK 块 + emoji 块)循环拼接后截断到 targetLen(纯函数,零随机)。 */
    fun amplify(base: String, targetLen: Int): String {
        if (base.length >= targetLen) return base.substring(0, targetLen)
        val filler = CJK + EMOJI
        val sb = StringBuilder(base)
        while (sb.length < targetLen) sb.append(filler)
        return sb.substring(0, targetLen)
    }
}

/** @PreviewParameter 提供器:七态全序展开(CS5:scanner 扫描期逐值展开)。 */
class ContentStateProvider : PreviewParameterProvider<ContentState> {
    override val values: Sequence<ContentState> = ContentState.entries.asSequence()
}
