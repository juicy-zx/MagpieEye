#!/usr/bin/env python3
"""spec.json + rolemap.json → 10 position 的 UivStubAdapter fixture JSON。

用法:
  python3 spec_to_list_fixture.py <spec.json> <rolemap.json> <out_fixture.json>

规则(见 rolemap 的 _comment):
- 每个 role 的 path 是一串 {name, type} 匹配器,从 item 子树根开始逐级"该层子树内首个匹配"
  深度优先搜索(任意深度,不要求直接子节点——item0 因 HD 徽标存在会多一层 Figma 自动布局包裹帧)。
- path 任一级找不到 且 role.optional=true → 该 op 只有 {viewId, visible:false},不产生 tag/text/box。
- path 全部找到但 visibilitySource 节点 visible=false(该行此 role 隐藏)→ 同上只输出
  {viewId, visible:false}:隐藏 Figma 节点不进可比对集 N,GONE 视图带 tag 只会被当 extra。
- path 全部找到且可见 → tag=fig:<叶子节点 id>;bindText=true 则 text=叶子节点原始
  text.characters(一字不改);visible 取 path 中标 visibilitySource:true 的那一级节点的
  visible 字段(!==false 记 true);若 path 中没有任何 visibilitySource 标记,则默认 visible=true。
- checkBox=true 的 role:计算叶子节点相对 item 根的 bbox,与 rolemap.staticBox 比对,
  偏差 > 0.05dp 才产出 box(仅在该行几何偏离布局静态值时产出,常规行不产出)。
- role 带 staticFontSizeSp:spec 叶子 text.fontSize 偏离该静态值 > 0.05sp 才产出 fontSizeSp
  (与 box 同口径:仅设计稿逐行手工微调时覆盖)。
- itemRoot(isItemRoot):tag=fig:<item 自身 id>,恒 visible=true,不做其余绑定。

地面真值自检(强制,每接入一个新屏都要做一次):
  生成 fixture 后,任选 ≥3 个 position(至少含 1 个变体行——可选徽标可见/隐藏切换、
  逐行字号或 box 覆盖等),脱离本脚本的生成逻辑,直接肉眼核对 spec.json 原始数值
  (节点 id、text.characters、bbox、fontSize)手抄出期望的 ops 数组,与生成器实际
  输出逐字段比对。任何字段不一致 → 判定 rolemap 或生成器有误,禁止默默放行。
  这份期望值必须是脱离生成器代码、直接读 spec.json 原文手抄的,不能从生成器输出反推
  (反推等于自己验证自己,发现不了 rolemap path/matcher 写错的情况)。
  参考落地方式:另写一个独立脚本,把手抄的 EXPECTED[position] = [...] 字典与
  fixture["positions"][position]["ops"] 逐字段比较,不一致打印 diff 并 exit(1);
  每接一屏都要重新手抄一份 EXPECTED,不能复用上一屏的期望值。
"""
import json
import sys

EPS = 0.05


def matches(node, matcher):
    if matcher.get("name") is not None and node.get("name") != matcher["name"]:
        return False
    if matcher.get("type") is not None and node.get("type") != matcher["type"]:
        return False
    return True


def find_descendant(scope, matcher):
    """scope 子树内(不含 scope 自身)深度优先搜索首个匹配节点。"""
    for child in scope.get("children") or []:
        if matches(child, matcher):
            return child
        found = find_descendant(child, matcher)
        if found is not None:
            return found
    return None


def resolve_path(item, path):
    """返回 (leaf_node, visible: bool) 或 (None, False)(path 未能全部解析)。"""
    scope = item
    visible = True
    for matcher in path:
        target = find_descendant(scope, matcher)
        if target is None:
            return None, False
        if matcher.get("visibilitySource"):
            visible = target.get("visible") is not False
        scope = target
    return scope, visible


def leaf_text(node):
    t = node.get("text") if node else None
    if isinstance(t, dict):
        return t.get("characters")
    return None


def rel_box(node, item_x, item_y):
    b = node["bbox"]
    return {"x": b["x"] - item_x, "y": b["y"] - item_y, "w": b["w"], "h": b["h"]}


def box_deviates(box, static_box):
    return (
        abs(box["x"] - static_box["x"]) > EPS
        or abs(box["y"] - static_box["y"]) > EPS
        or abs(box["w"] - static_box["w"]) > EPS
        or abs(box["h"] - static_box["h"]) > EPS
    )


def build_op(role, item):
    view_id = role["viewId"]

    if role.get("isItemRoot"):
        return {"viewId": view_id, "visible": True, "tag": f"fig:{item['id']}"}

    leaf, visible = resolve_path(item, role["path"])

    if leaf is None:
        if not role.get("optional"):
            raise SystemExit(f"role {view_id} 在 item {item['id']} 中未能解析(非 optional,path={role['path']})")
        return {"viewId": view_id, "visible": False}

    op = {"viewId": view_id, "visible": visible}

    if role.get("isVisibilityOnly") or not visible:
        return op

    op["tag"] = f"fig:{leaf['id']}"

    if role.get("bindText"):
        text = leaf_text(leaf)
        if text is not None:
            op["text"] = text

    static_font = role.get("staticFontSizeSp")
    if static_font is not None:
        t = leaf.get("text")
        font = t.get("fontSize") if isinstance(t, dict) else None
        if font is not None and abs(font - static_font) > EPS:
            op["fontSizeSp"] = font

    if role.get("checkBox"):
        box = rel_box(leaf, item["bbox"]["x"], item["bbox"]["y"])
        if box_deviates(box, role["staticBox"]):
            op["box"] = box

    return op


def build_fixture(spec, rolemap):
    items = spec["root"]["children"]
    positions = []
    for item in items:
        ops = [build_op(role, item) for role in rolemap["roles"]]
        positions.append({"ops": ops})
    return {"itemLayoutRes": rolemap["itemLayoutRes"], "positions": positions}


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        raise SystemExit(2)
    spec = json.load(open(sys.argv[1]))
    rolemap = json.load(open(sys.argv[2]))
    fixture = build_fixture(spec, rolemap)
    with open(sys.argv[3], "w") as f:
        json.dump(fixture, f, ensure_ascii=False, indent=2)
    n_ops = sum(len(p["ops"]) for p in fixture["positions"])
    print(f"wrote {sys.argv[3]}: {len(fixture['positions'])} positions, {n_ops} ops total")


if __name__ == "__main__":
    main()
