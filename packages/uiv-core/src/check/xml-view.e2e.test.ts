/**
 * T4.4 commit2:XML/View producer → 正式 runCheckL2 端到端(runL2.ts:119 语义文件发现路径,D8④)。
 * 引擎零改;只新增测试、只读被测源。语义树 fixture 为 demo-android Robolectric 真 inflate+measure+layout 产物;
 * spec 为 39:10822 冻结子树确定性提取(D7)。覆盖:主靶 pass(D8①)、几何负例 fail(D8⑤)、
 * source 非误归因(D5)、XML↔Compose 弱交叉印证 same-in→same-out(D6)。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, it, expect } from 'vitest';
import { baselineDirName } from '../baseline/pull.js';
import { runL2 } from '../l2/report.js';
import type { SemanticsDump } from '../l2/types.js';
import { attributeSource } from '../page/source-attr.js';
import { runCheckL2, specNodeToFigma } from './runL2.js';
import type { GradleRunner } from './run.js';

const NODE_ID = '39:10826';
const VERSION = '2342874355766877359';
const fx = (name: string): string => fileURLToPath(new URL(`../../fixtures/xml/${name}`, import.meta.url));
const readFx = (name: string): SemanticsDump => JSON.parse(readFileSync(fx(name), 'utf8')) as SemanticsDump;
const REAL_DEMO_DIR = fileURLToPath(new URL('../../../../demo-android', import.meta.url));

class FakeRunner implements GradleRunner {
  async run(): Promise<{ exitCode: number; stderr: string }> { return { exitCode: 0, stderr: '' }; }
}

function writeWhitePng(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const png = new PNG({ width: 8, height: 8 });
  png.data.fill(255);
  writeFileSync(path, PNG.sync.write(png));
}

/** 布置临时 demoDir/uiVerifyDir:spec.json(冻结子树)+ rendered.png + build/uiv/<shortName>.semantics.json。 */
function setup(testFqn: string, semanticsFixture: string): { demoDir: string; uiVerifyDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'uiv-xml-'));
  const demoDir = join(root, 'demo-android');
  const uiVerifyDir = join(root, '.ui-verify');
  const nodeDir = baselineDirName(NODE_ID, VERSION);
  // spec.json = 冻结 39:10826 子树(readSpecRoot 读 spec.root)
  const specDir = join(uiVerifyDir, 'baselines', nodeDir);
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, 'spec.json'), readFileSync(fx('language-select-39-10826.spec.json')));
  // rendered.png:v0 管线判成功需要(名含 shortName、非 _compare)
  const shortName = (testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '').replace(/Test$/, '');
  writeWhitePng(join(demoDir, 'app', 'build', 'outputs', 'roborazzi', `${testFqn}.${shortName}.png`));
  // semantics.json:ViewDumpRule 真 dump 落位(runL2.ts:119 discovery)
  const uiDir = join(demoDir, 'app', 'build', 'uiv');
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(join(uiDir, `${shortName}.semantics.json`), readFileSync(fx(semanticsFixture)));
  return { demoDir, uiVerifyDir };
}
const opts = (demoDir: string, uiVerifyDir: string, testFqn: string) =>
  ({ demoDir, testFqn, nodeId: NODE_ID, version: VERSION, uiVerifyDir });

describe('T4.4 commit2:runCheckL2 官方发现路径(D8①④)', () => {
  it('主靶 XML dump → pass, coverage 1, matchRate 1, matched {39:10826,39:10827,39:10828}, 无违规', async () => {
    const fqn = 'com.magpie.uiv.demo.LanguageSelectXmlScreenshotTest';
    const { demoDir, uiVerifyDir } = setup(fqn, 'language-select-xml.semantics.json');
    const { report } = await runCheckL2(new FakeRunner(), opts(demoDir, uiVerifyDir, fqn));
    expect(report.pass).toBe(true);
    expect(report.structural?.untaggedCoverage).toBe(1);
    expect(report.structural?.matchRate).toBe(1);
    expect(report.score).toBe(1);
    expect(new Set((report.structural?.matchedNodes ?? []).map((m) => m.figmaId)))
      .toEqual(new Set(['39:10826', '39:10827', '39:10828']));
    expect(report.structural?.violations).toEqual([]);
  });

  it('几何负例(ic_arrow 40x40)XML dump → fail,fig:39:10828 size high 违规真现(D8⑤)', async () => {
    const fqn = 'com.magpie.uiv.demo.LanguageSelectXmlBadGeomScreenshotTest';
    const { demoDir, uiVerifyDir } = setup(fqn, 'language-select-xml-badgeom.semantics.json');
    const { report } = await runCheckL2(new FakeRunner(), opts(demoDir, uiVerifyDir, fqn));
    expect(report.pass).toBe(false);
    const sizeViol = (report.structural?.violations ?? []).find((v) => v.testTag === 'fig:39:10828' && v.property === 'size');
    expect(sizeViol?.severity).toBe('high');
    expect(sizeViol?.actual).toBe('40x40');    // 应为 24x24
  });

  it('恢复(good fixture)后再过:证明负例可复现且非环境噪声(D8⑤)', async () => {
    const fqn = 'com.magpie.uiv.demo.LanguageSelectXmlScreenshotTest';
    const { demoDir, uiVerifyDir } = setup(fqn, 'language-select-xml.semantics.json');
    const { report } = await runCheckL2(new FakeRunner(), opts(demoDir, uiVerifyDir, fqn));
    expect(report.pass).toBe(true);
  });
});

describe('T4.4 commit2:D5 source 非误归因', () => {
  it('XML violation.source 不被富化(保持 undefined/null),不误挂同 nodeId 的 Compose .kt', async () => {
    const fqn = 'com.magpie.uiv.demo.LanguageSelectXmlBadGeomScreenshotTest';
    const { demoDir, uiVerifyDir } = setup(fqn, 'language-select-xml-badgeom.semantics.json');
    const { report } = await runCheckL2(new FakeRunner(), opts(demoDir, uiVerifyDir, fqn));
    for (const v of report.structural?.violations ?? []) {
      expect(v.source == null).toBe(true);     // runCheckL2 不调 enrichViolations → source 恒缺席
    }
    // 若误富化,attributeSource 会把 fig:39:10828 挂到 Compose UploadContent.kt —— 证明该风险真实存在:
    const misattrib = attributeSource('fig:39:10828', REAL_DEMO_DIR);
    expect(misattrib).not.toBeNull();
    expect(misattrib).toContain('UploadContent.kt');   // XML 路径正确回避了这条错误归因
  });
});

describe('T4.4 commit2:D6 XML↔Compose 弱交叉印证(same design → same L2 verdict)', () => {
  const spec = JSON.parse(readFileSync(fx('language-select-39-10826.spec.json'), 'utf8')) as { root: Parameters<typeof specNodeToFigma>[0] };
  const fig = specNodeToFigma(spec.root);
  const xml = readFx('language-select-xml.semantics.json');
  const compose = readFx('language-select-compose-subtree.semantics.json');
  const rx = runL2(fig, xml, { prevState: null });
  const rc = runL2(fig, compose, { prevState: null });

  const ids = (r: typeof rx): Set<string> => new Set((r.structural?.matchedNodes ?? []).map((m) => m.figmaId));
  const violKeys = (r: typeof rx): string[] =>
    (r.structural?.violations ?? []).map((v) => `${v.testTag}:${v.property}:${v.severity}`).sort();
  const pixKeys = (r: typeof rx): string[] =>
    (r.structural?.diagnostics.pixel ?? []).map((d) => `${d.testTag}:${d.code}:${d.reason ?? ''}`).sort();

  it('匹配 tag 集一致', () => {
    expect(ids(rx)).toEqual(new Set(['39:10826', '39:10827', '39:10828']));
    expect(ids(rx)).toEqual(ids(rc));
  });

  it('parity 执行结果一致:verdict/score/违规/像素诊断(相同 assert 执行集与跳过集)', () => {
    expect(rx.pass).toBe(rc.pass);
    expect(rx.pass).toBe(true);
    expect(rx.score).toBe(rc.score);
    expect(violKeys(rx)).toEqual(violKeys(rc));
    expect(violKeys(rx)).toEqual([]);
    // SPACE_BETWEEN 跳 itemSpacing + paddingTop/Bottom design_derivation_mismatch + Text 半透明色跳 ΔE:两侧逐字一致
    expect(pixKeys(rx)).toEqual(pixKeys(rc));
  });

  it('归一化测量值逐字一致(position/size/color/fontSize/overflow;排除来源专属 touchBounds/boundsInRoot)', () => {
    const measure = (d: SemanticsDump): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      const walk = (n: SemanticsDump['root']): void => {
        if (n.testTag !== null) {
          out[n.testTag] = { pos: n.positionInRoot, size: n.size, color: n.colorHex, font: n.fontSizeSp, overflow: n.hasVisualOverflow ?? null };
        }
        for (const c of n.children) walk(c);
      };
      walk(d.root);
      return out;
    };
    expect(measure(xml)).toEqual(measure(compose));
  });

  it('boundsInRoot 后 executed=4(XML)/5(Compose):10827/10828 两侧都执行 childClipped 且无违规,唯一差=Compose 多出的内部叶,verdict 同 pass', () => {
    const xInv = rx.structural?.invariant?.executed ?? 0;
    const cInv = rc.structural?.invariant?.executed ?? 0;
    // commit2 R1:XML 亦对 10827/10828 输出 boundsInRoot → 两侧 childClipped 都执行(非静默跳过);
    // 差值恰为 1 = Compose 子树 fig:39:10828 下多出的 (sem) 内部叶(ImageView 内部图标叶)childClipped 执行(来源专属树结构,同 touchBounds 类)。
    expect(xInv).toBe(4);
    expect(cInv).toBe(5);
    // 两侧 10827/10828 均携带 boundsInRoot(childClipped 真执行的证据),非诚实缺席。
    const boundsOf = (d: SemanticsDump, tag: string): unknown => {
      let found: unknown;
      const walk = (n: SemanticsDump['root']): void => { if (n.testTag === tag) found = n.boundsInRoot; for (const c of n.children) walk(c); };
      walk(d.root);
      return found;
    };
    for (const d of [xml, compose]) for (const tag of ['fig:39:10827', 'fig:39:10828']) expect(boundsOf(d, tag)).toBeDefined();
    // childClipped 两侧均不产违规(节点未被裁),共享 invariant 违规集为空,verdict 一致 —— executed 差不改判定。
    expect((rx.structural?.violations ?? []).filter((v) => v.judgePath === 'invariant')).toEqual([]);
    expect((rc.structural?.violations ?? []).filter((v) => v.judgePath === 'invariant')).toEqual([]);
    expect(rx.pass).toBe(rc.pass);
  });
});
