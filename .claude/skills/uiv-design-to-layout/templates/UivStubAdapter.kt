package com.example.app   // ← 改成你的测试包

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.MarginLayoutParams
import android.widget.TextView
import androidx.annotation.LayoutRes
import androidx.recyclerview.widget.RecyclerView
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * 通用列表 fixture 灌注 Adapter(测试源集,零业务知识):
 * 构造入参 = item 布局资源 + fixture(每 position 一组 op)。
 * onCreate 仅 inflate;onBind 逐 op 执行 setTag / setText / visibility / 盒参数覆盖。
 *
 * fixture JSON 契约(spec_to_list_fixture.py 产出):
 * { "positions": [ { "ops": [ { "viewId": "...", "visible": true|false,
 *     "tag"?: "fig:<figmaId>", "text"?: "...", "fontSizeSp"?: 12.0,
 *     "box"?: {x,y,w,h(dp,相对 item 根)} } ] } ] }
 *
 * fail-fast 纪律(无静默兜底,一律 IllegalStateException):
 * - viewId 解析不到资源 id / item 树中找不到对应 View;
 * - text 目标不是 TextView;
 * - box 目标无 MarginLayoutParams;
 * - fixture 全量 tag 有重复(构造期即校验,dump 重复必崩,提前到这里崩)。
 */
class UivStubAdapter(
    @LayoutRes private val itemLayoutRes: Int,
    private val fixture: Fixture,
) : RecyclerView.Adapter<UivStubAdapter.Holder>() {

    class Holder(view: View) : RecyclerView.ViewHolder(view)

    data class Box(val x: Double, val y: Double, val w: Double, val h: Double)

    data class Op(
        val viewId: String,
        val visible: Boolean,
        val tag: String?,
        val text: String?,
        val fontSizeSp: Float?,
        val box: Box?,
    )

    data class Fixture(val positions: List<List<Op>>) {
        init {
            val seen = mutableSetOf<String>()
            positions.flatten().mapNotNull { it.tag }.forEach { tag ->
                check(seen.add(tag)) { "UivStubAdapter: duplicate tag \"$tag\" across fixture positions" }
            }
        }

        companion object {
            /** 从 fixture JSON 字符串解析;字段名/结构不符即抛(org.json 缺 key 自带异常)。 */
            fun parse(json: String): Fixture {
                val rootObj = JSONObject(json)
                val positionsArr = rootObj.getJSONArray("positions")
                val positions = (0 until positionsArr.length()).map { p ->
                    val opsArr = positionsArr.getJSONObject(p).getJSONArray("ops")
                    (0 until opsArr.length()).map { i ->
                        val o = opsArr.getJSONObject(i)
                        Op(
                            viewId = o.getString("viewId"),
                            visible = o.getBoolean("visible"),
                            tag = if (o.has("tag")) o.getString("tag") else null,
                            text = if (o.has("text")) o.getString("text") else null,
                            fontSizeSp = if (o.has("fontSizeSp")) o.getDouble("fontSizeSp").toFloat() else null,
                            box = if (o.has("box")) o.getJSONObject("box").let {
                                Box(it.getDouble("x"), it.getDouble("y"), it.getDouble("w"), it.getDouble("h"))
                            } else null,
                        )
                    }
                }
                return Fixture(positions)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
        Holder(LayoutInflater.from(parent.context).inflate(itemLayoutRes, parent, false))

    override fun getItemCount(): Int = fixture.positions.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val itemView = holder.itemView
        for (op in fixture.positions[position]) {
            val view = resolveView(itemView, op.viewId, position)

            view.visibility = if (op.visible) View.VISIBLE else View.GONE
            view.tag = op.tag   // 无 tag 的 op 显式置 null,防 holder 复用残留

            if (op.text != null) {
                check(view is TextView) {
                    "UivStubAdapter: op for \"${op.viewId}\" (position $position) has text but view is ${view.javaClass.name}, not TextView"
                }
                view.text = op.text
            }

            if (op.fontSizeSp != null) {
                check(view is TextView) {
                    "UivStubAdapter: op for \"${op.viewId}\" (position $position) has fontSizeSp but view is ${view.javaClass.name}, not TextView"
                }
                view.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, op.fontSizeSp)
            }

            if (op.box != null) {
                val lp = view.layoutParams
                check(lp is MarginLayoutParams) {
                    "UivStubAdapter: op for \"${op.viewId}\" (position $position) has box but layoutParams is ${lp?.javaClass?.name}, not MarginLayoutParams"
                }
                val density = view.resources.displayMetrics.density
                lp.width = (op.box.w * density).roundToInt()
                lp.height = (op.box.h * density).roundToInt()
                lp.marginStart = (op.box.x * density).roundToInt()
                lp.topMargin = (op.box.y * density).roundToInt()
                view.layoutParams = lp
            }
        }
    }

    private fun resolveView(itemView: View, viewId: String, position: Int): View {
        val resId = itemView.resources.getIdentifier(viewId, "id", itemView.context.packageName)
        check(resId != 0) { "UivStubAdapter: viewId \"$viewId\" (position $position) did not resolve to a resource id" }
        return itemView.findViewById(resId)
            ?: error("UivStubAdapter: viewId \"$viewId\" (resId=$resId, position $position) not found in inflated item tree")
    }
}
