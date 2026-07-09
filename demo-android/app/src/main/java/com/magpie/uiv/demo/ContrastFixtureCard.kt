package com.magpie.uiv.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * T4.5 专用 fixture(对比度 WCAG advisory 检查红绿两态)。
 * 禁碰 CalibCard.kt(标定合同排他);比照 FixtureCard.kt 先例独立最小组件,显式字面量色值零主题依赖,
 * 保证 ATF ContrastCheck 结果确定性,不受 Material3 主题解析影响。
 * lowContrast=true:字色与底色完全相同(对比度 1:1,WCAG 必不达标);
 * lowContrast=false:白字深底(对比度约 11:1,WCAG 4.5:1 常规文本门槛清白通过)。
 */
private val BACKGROUND = Color(0xFF3A3A3A)

@Composable
fun ContrastFixtureCard(lowContrast: Boolean) {
    Box(
        modifier = Modifier
            .testTag("contrastFixtureCard")
            .size(width = 160.dp, height = 60.dp)
            .background(BACKGROUND),
    ) {
        Text(
            text = "Contrast sample",
            fontSize = 14.sp,
            color = if (lowContrast) BACKGROUND else Color(0xFFFFFFFF),
            modifier = Modifier.testTag("contrastFixtureText"),
        )
    }
}
