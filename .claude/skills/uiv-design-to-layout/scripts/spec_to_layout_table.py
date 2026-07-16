#!/usr/bin/env python3
"""spec.json → 布局转写表:每个待 tag 节点的绝对 bbox + 相对最近祖先的偏移(= XML margin / Compose place 坐标)。

用法:
  python3 spec_to_layout_table.py <spec.json>              # 全部节点(设计树全量)
  python3 spec_to_layout_table.py <spec.json> --tags a.txt # 只输出 a.txt 里列的 figmaId(每行一个)

输出列:figmaId | name | type | 绝对bbox(x,y,w,h) | 父figmaId | 相对父偏移(relX,relY) | text
规约:XML 里该节点 = 尺寸 w/h dp + layout_marginStart=relX dp + layout_marginTop=relY dp(父用
FrameLayout,layout_gravity="top|start");Compose 自定义 Layout place(relX.dp, relY.dp)。
单位:dp = 设计单位原值,不乘 density(L2 按 dump 的 density 字段归一)。
"""
import json
import sys


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    spec = json.load(open(sys.argv[1]))
    only: set[str] | None = None
    if '--tags' in sys.argv:
        f = sys.argv[sys.argv.index('--tags') + 1]
        only = {line.strip() for line in open(f) if line.strip()}

    rows = []

    def walk(node, parent_entry):
        nid = node.get('id', '')
        bbox = node.get('bbox') or {}
        take = bool(nid) and (only is None or nid in only)
        entry = parent_entry
        if take:
            x, y = bbox.get('x', 0), bbox.get('y', 0)
            px, py, pid = (parent_entry or (0, 0, None))[:3]
            t = node.get('text')
            if isinstance(t, dict):
                t = t.get('characters', '')
            rows.append({
                'id': nid, 'name': node.get('name', ''), 'type': node.get('type', ''),
                'x': x, 'y': y, 'w': bbox.get('w'), 'h': bbox.get('h'),
                'parent': pid, 'relX': x - px, 'relY': y - py,
                'text': (t or '')[:40],
            })
            entry = (x, y, nid)
        for c in node.get('children', []):
            walk(c, entry)

    walk(spec['root'], None)
    print(f"# {len(rows)} nodes  (tag 写法: android:tag=\"fig:<figmaId>\" / Modifier.testTag(\"fig:<figmaId>\"))")
    for r in rows:
        rel = f"rel=({r['relX']:g},{r['relY']:g}) of {r['parent']}" if r['parent'] else 'ROOT'
        text = f"  text={r['text']!r}" if r['text'] else ''
        print(f"{r['id']:52s} {r['name'][:22]:22s} {r['type']:9s} abs=({r['x']:g},{r['y']:g},{r['w']:g},{r['h']:g})  {rel}{text}")


if __name__ == '__main__':
    main()
