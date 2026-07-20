import { describe, it, expect } from 'vitest';
import { CliUsageError, parseCliArgs, parseIgnoreRegion, previewToTestFqn } from './args.js';
import type { CheckCmd, VerifyPageCmd } from './args.js';

describe('parseCliArgs: baseline pull', () => {
  it('解析 --fixture/--file/--node', () => {
    expect(parseCliArgs(['baseline', 'pull', '--fixture', 'f.json', '--file', 'FKEY', '--node', '1:100'])).toEqual({
      kind: 'baseline-pull', fixture: 'f.json', file: 'FKEY', node: '1:100',
    });
  });
  it('缺 --fixture 抛 CliUsageError(T1.2 仅 fixture 模式,REST 通道待 PAT)', () => {
    expect(() => parseCliArgs(['baseline', 'pull', '--file', 'FKEY', '--node', '1:100'])).toThrow(/--fixture/);
  });
  // 批次⑤欠2:baseline pull 只支持 fixture 模式,缺 --fixture 时的报错须指向在线冻结通道(uiv pin),
  // 而非让用户误以为 baseline pull 也能在线拉取。
  it('缺 --fixture 的报错文案指向 uiv pin(在线冻结通道)', () => {
    expect(() => parseCliArgs(['baseline', 'pull', '--file', 'FKEY', '--node', '1:100']))
      .toThrow(/uiv pin/);
  });
  it('缺 --node 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['baseline', 'pull', '--fixture', 'f.json', '--file', 'FKEY'])).toThrow(/--node/);
  });
});

describe('parseCliArgs: baseline pull --check-version(T4.3 哨兵,与 baseline-pull 分离)', () => {
  it('解析 --file(--meta-fixture 缺省 null)', () => {
    expect(parseCliArgs(['baseline', 'pull', '--check-version', '--file', 'FKEY'])).toEqual({
      kind: 'baseline-check-version', file: 'FKEY', metaFixture: null,
    });
  });
  it('解析可选 --meta-fixture', () => {
    expect(parseCliArgs(['baseline', 'pull', '--check-version', '--file', 'FKEY', '--meta-fixture', 'p.json'])).toEqual({
      kind: 'baseline-check-version', file: 'FKEY', metaFixture: 'p.json',
    });
  });
  it('缺 --file 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['baseline', 'pull', '--check-version'])).toThrow(/--file/);
  });
});

describe('parseCliArgs: check', () => {
  it('解析 --preview/--node/--demo(无 ignore-region 时为 null,缺省 record=false,version=null)', () => {
    expect(parseCliArgs(['check', '--preview', 'com.magpie.uiv.demo.CalibCardPreview', '--node', '1:100', '--demo', 'demo-android'])).toEqual({
      kind: 'check', preview: 'com.magpie.uiv.demo.CalibCardPreview', node: '1:100', demo: 'demo-android', module: ':app', variant: 'debug', version: null, ignoreRegion: null, record: false, sandbox: false,
    });
  });
  it('check 解析可选 --version(D-02/M3 消歧;缺省 null)', () => {
    expect((parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:100', '--demo', 'd', '--version', 'V2']) as CheckCmd).version).toBe('V2');
    expect((parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:100', '--demo', 'd']) as CheckCmd).version).toBeNull();
  });
  it('解析 --ignore-region x,y,w,h', () => {
    const c = parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:100', '--demo', 'd', '--ignore-region', '4,8,15,16']);
    expect(c).toMatchObject({ kind: 'check', ignoreRegion: { x: 4, y: 8, w: 15, h: 16 } });
  });
  it('缺 --preview 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['check', '--node', '1:100', '--demo', 'd'])).toThrow(/--preview/);
  });
  it('check --record 解析为 record:true;缺省 false', () => {
    const b = ['check', '--preview', 'a.BPreview', '--node', '1:1', '--demo', 'd'];
    expect((parseCliArgs([...b, '--record']) as CheckCmd).record).toBe(true);
    expect((parseCliArgs(b) as CheckCmd).record).toBe(false);
  });
  // P0-8 双 lane:--sandbox 布尔旗标(默认 false → direct;true → 冷道沙箱 opt-in),与 --record 同剔除范式可共存。
  it('check --sandbox 解析为 sandbox:true;缺省 false;与 --record 共存', () => {
    const b = ['check', '--preview', 'a.BPreview', '--node', '1:1', '--demo', 'd'];
    expect((parseCliArgs(b) as CheckCmd).sandbox).toBe(false);
    expect((parseCliArgs([...b, '--sandbox']) as CheckCmd).sandbox).toBe(true);
    const both = parseCliArgs([...b, '--record', '--sandbox']) as CheckCmd;
    expect(both.record).toBe(true);
    expect(both.sandbox).toBe(true);
    // --sandbox/--record 剔除后成对解析不受污染(module/variant 仍正确)
    expect((parseCliArgs([...b, '--sandbox', '--module', ':feature:x']) as CheckCmd).module).toBe(':feature:x');
  });
  // P0-8 批次②:参数化旗标(--project 等价 --demo;--module 默认 :app;--variant 默认 debug)。
  it('check --module/--variant 解析;缺省 :app / debug', () => {
    const c = parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:1', '--demo', 'd', '--module', ':feature:login', '--variant', 'freeDebug']) as CheckCmd;
    expect(c.module).toBe(':feature:login');
    expect(c.variant).toBe('freeDebug');
    const d = parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:1', '--demo', 'd']) as CheckCmd;
    expect(d.module).toBe(':app');
    expect(d.variant).toBe('debug');
  });
  it('check --project 等价 --demo(工程根),二者皆缺抛 CliUsageError', () => {
    const c = parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:1', '--project', 'proj-root']) as CheckCmd;
    expect(c.demo).toBe('proj-root');
    expect(() => parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:1'])).toThrow(/--project.*--demo|--demo/);
  });
});

describe('parseCliArgs: pin', () => {
  it('pin argv:repeatable --state/--min-score 域/--matrix 白名单', () => {
    expect(parseCliArgs(['pin', '--file', 'F', '--node', '9:100', '--test', 'com.magpie.uiv.demo.CalibCardTest',
      '--demo', 'demo-android', '--fixture', 'f.json', '--source', 'docs/req.md',
      '--state', 'empty=9:101', '--state', 'error=9:103', '--min-score', '0.95', '--matrix', 'full']))
      .toEqual({ kind: 'pin', file: 'F', node: '9:100', test: 'com.magpie.uiv.demo.CalibCardTest', demo: 'demo-android',
        fixture: 'f.json', source: 'docs/req.md',
        states: [{ name: 'empty', judgePath: 'parity', figmaVariantNodeId: '9:101' },
          { name: 'error', judgePath: 'parity', figmaVariantNodeId: '9:103' }],
        minScore: 0.95, matrix: 'full' });
  });
  it('可选旗标缺省:fixture/source/min-score/matrix 为 null,states 空数组', () => {
    expect(parseCliArgs(['pin', '--file', 'F', '--node', '9:100', '--test', 'T', '--demo', 'd'])).toEqual({
      kind: 'pin', file: 'F', node: '9:100', test: 'T', demo: 'd',
      fixture: null, source: null, states: [], minScore: null, matrix: null,
    });
  });
  it('反例各抛 CliUsageError:无=/越域/非白名单/缺 --test/缺 --demo', () => {
    const b = ['pin', '--file', 'F', '--node', '9:100', '--test', 'T', '--demo', 'd'];
    expect(() => parseCliArgs([...b, '--state', 'empty'])).toThrow(CliUsageError);
    expect(() => parseCliArgs([...b, '--min-score', '1.2'])).toThrow(CliUsageError);
    expect(() => parseCliArgs([...b, '--matrix', 'diag'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['pin', '--file', 'F', '--node', '9:100', '--demo', 'd'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['pin', '--file', 'F', '--node', '9:100', '--test', 'T'])).toThrow(CliUsageError);
  });
});

describe('parseCliArgs: verify-page', () => {
  it('全旗标解析(含 --session/--states/--matrix/--json/--out)', () => {
    expect(parseCliArgs(['verify-page', '--test', 'com.magpie.uiv.demo.CalibPageScreenshotTest', '--node', '1:100',
      '--demo', 'demo-android', '--session', 'S1', '--states', 'empty,longText', '--matrix', 'full',
      '--out', '/tmp/r.json', '--json'])).toEqual({
        kind: 'verify-page', test: 'com.magpie.uiv.demo.CalibPageScreenshotTest', node: '1:100', demo: 'demo-android',
        module: ':app', variant: 'debug',
        session: 'S1', version: null, states: ['empty', 'longText'], matrix: 'full', json: true, out: '/tmp/r.json', sandbox: false,
      });
  });
  it('缺省:version=null、states=[]、matrix=l-shape、json=false、out=null、sandbox=false', () => {
    expect(parseCliArgs(['verify-page', '--test', 'T', '--node', '1:100', '--demo', 'd', '--session', 'standalone']))
      .toEqual({ kind: 'verify-page', test: 'T', node: '1:100', demo: 'd', module: ':app', variant: 'debug', session: 'standalone',
        version: null, states: [], matrix: 'l-shape', json: false, out: null, sandbox: false });
  });
  // P0-8 双 lane:verify-page --sandbox 布尔旗标,与 --json 同剔除范式可共存。
  it('verify-page --sandbox 解析为 sandbox:true;缺省 false;与 --json 共存', () => {
    const b = ['verify-page', '--test', 'T', '--node', '1:100', '--demo', 'd', '--session', 'S'];
    expect((parseCliArgs(b) as VerifyPageCmd).sandbox).toBe(false);
    expect((parseCliArgs([...b, '--sandbox']) as VerifyPageCmd).sandbox).toBe(true);
    const both = parseCliArgs([...b, '--json', '--sandbox']) as VerifyPageCmd;
    expect(both.json).toBe(true);
    expect(both.sandbox).toBe(true);
  });
  it('解析可选 --version(D-02/M3 消歧;给定即取值)', () => {
    const c = parseCliArgs(['verify-page', '--test', 'T', '--node', '1:100', '--demo', 'd', '--session', 'S', '--version', 'T1_0A_V1']) as VerifyPageCmd;
    expect(c.version).toBe('T1_0A_V1');
  });
  it('缺 --test / 缺 --session 各抛 CliUsageError', () => {
    expect(() => parseCliArgs(['verify-page', '--node', '1:100', '--demo', 'd', '--session', 'S'])).toThrow(/--test/);
    expect(() => parseCliArgs(['verify-page', '--test', 'T', '--node', '1:100', '--demo', 'd'])).toThrow(/--session/);
  });
});

describe('parseCliArgs: report', () => {
  it('解析 --junit --in(--out/--suite 缺省 null)', () => {
    expect(parseCliArgs(['report', '--junit', '--in', 'a.json'])).toEqual({
      kind: 'report', junit: true, in: 'a.json', out: null, suite: null,
    });
  });
  it('解析可选 --out/--suite', () => {
    expect(parseCliArgs(['report', '--junit', '--in', 'a.json', '--out', 'o.xml', '--suite', 'S'])).toEqual({
      kind: 'report', junit: true, in: 'a.json', out: 'o.xml', suite: 'S',
    });
  });
  it('缺 --junit 抛 CliUsageError(现阶段仅支持 junit 转换)', () => {
    expect(() => parseCliArgs(['report', '--in', 'a.json'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['report', '--in', 'a.json'])).toThrow(/--junit/);
  });
  it('缺 --in 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['report', '--junit'])).toThrow(/--in/);
  });
});

describe('parseCliArgs: preflight(P0-8 批次②)', () => {
  it('解析 --project/--module/--json;module 缺省 :app,json 缺省 false', () => {
    expect(parseCliArgs(['preflight', '--project', 'proj', '--module', ':app', '--json'])).toEqual({
      kind: 'preflight', demo: 'proj', module: ':app', json: true,
    });
    expect(parseCliArgs(['preflight', '--project', 'proj'])).toEqual({
      kind: 'preflight', demo: 'proj', module: ':app', json: false,
    });
  });
  it('--demo 向后兼容工程根;--project/--demo 皆缺抛 CliUsageError', () => {
    expect((parseCliArgs(['preflight', '--demo', 'demo-android']) as { demo: string }).demo).toBe('demo-android');
    expect(() => parseCliArgs(['preflight'])).toThrow(CliUsageError);
  });
});

describe('parseCliArgs: 非法输入', () => {
  it('未知子命令抛 CliUsageError(消息含 verify-page 与 report)', () => {
    expect(() => parseCliArgs(['frobnicate'])).toThrow(CliUsageError);
    expect(() => parseCliArgs(['frobnicate'])).toThrow(/verify-page/);
    expect(() => parseCliArgs(['frobnicate'])).toThrow(/report/);
  });
  it('未知 flag 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['check', '--preview', 'a.BPreview', '--node', '1:100', '--demo', 'd', '--wat'])).toThrow(/--wat/);
  });
});

describe('previewToTestFqn(--preview → --tests 映射规则,Phase 0 写死)', () => {
  it('<pkg>.<Name>Preview → <pkg>.<Name>ScreenshotTest', () => {
    expect(previewToTestFqn('com.magpie.uiv.demo.CalibCardPreview')).toBe('com.magpie.uiv.demo.CalibCardScreenshotTest');
  });
  it('非 Preview 后缀抛 CliUsageError', () => {
    expect(() => previewToTestFqn('com.magpie.uiv.demo.CalibCard')).toThrow(CliUsageError);
  });
});

describe('parseIgnoreRegion', () => {
  it('四元组解析', () => {
    expect(parseIgnoreRegion('1,2,3,4')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
  it('格式非法抛 CliUsageError', () => {
    expect(() => parseIgnoreRegion('1,2,3')).toThrow(CliUsageError);
    expect(() => parseIgnoreRegion('1,2,3,nope')).toThrow(CliUsageError);
  });
});

describe('parseCliArgs: l3-attach(T4.2 回填通道)', () => {
  it('解析 --report/--verdicts/--pack(三必选)', () => {
    expect(parseCliArgs(['l3-attach', '--report', 'r.json', '--verdicts', 'v.json', '--pack', 'p.json'])).toEqual({
      kind: 'l3-attach', report: 'r.json', verdicts: 'v.json', pack: 'p.json',
    });
  });
  it('缺 --report 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['l3-attach', '--verdicts', 'v.json', '--pack', 'p.json'])).toThrow(/--report/);
  });
  it('缺 --verdicts 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['l3-attach', '--report', 'r.json', '--pack', 'p.json'])).toThrow(/--verdicts/);
  });
  it('缺 --pack 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['l3-attach', '--report', 'r.json', '--verdicts', 'v.json'])).toThrow(/--pack/);
  });
  it('未知命令提示串含 l3-attach', () => {
    expect(() => parseCliArgs(['bogus'])).toThrow(/l3-attach/);
  });
});
