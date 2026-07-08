package com.magpie.uiv.demo

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Canonical Calibration Contract 的 Compose 实现(单一事实源见子计划 header 后合同表)。
 * 几何/色值/文案不得偏离合同表;T1.4 的 seeded deviations 以本文件为唯一被改对象。
 * CalibBadge 独立为单行调用,供 T1.4 D4(缺失节点)做单行机械移除。
 */
@Composable
fun CalibCard(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .testTag("fig:1:100")
            .size(width = 360.dp, height = 200.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF3366CC))
    ) {
        Text(
            text = "Calibration Card",
            fontSize = 16.sp,
            color = Color(0xFFFFFFFF),
            modifier = Modifier
                .testTag("fig:1:101")
                .offset(x = 12.dp, y = 12.dp)
                .size(width = 200.dp, height = 20.dp),
        )
        Text(
            text = "Known geometry fixture",
            fontSize = 12.sp,
            color = Color(0xFFCCE0FF),
            modifier = Modifier
                .testTag("fig:1:102")
                .offset(x = 12.dp, y = 36.dp)
                .size(width = 200.dp, height = 16.dp),
        )
        Box(
            Modifier
                .testTag("fig:1:103")
                .offset(x = 12.dp, y = 60.dp)
                .size(width = 80.dp, height = 40.dp)
                .background(Color(0xFFFF9900))
        )
        CalibBadge()
    }
}

@Composable
private fun CalibBadge() {
    Box(
        Modifier
            .testTag("fig:1:104")
            .offset(x = 296.dp, y = 12.dp)
            .size(width = 52.dp, height = 20.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFFFF3B30))
    )
}

@Preview(name = "CalibCard", widthDp = 360, heightDp = 200, showBackground = true)
@Composable
fun CalibCardPreview() {
    CalibCard()
}
