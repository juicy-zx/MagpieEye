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
  it('缺 --node 抛 CliUsageError', () => {
    expect(() => parseCliArgs(['baseline', 'pull', '--fixture', 'f.json', '--file', 'FKEY'])).toThrow(/--node/);
  });
});

describe('parseCliArgs: check', () => {
  it('解析 --preview/--node/--demo(无 ignore-region 时为 null,缺省 record=false,version=null)', () => {
    expect(parseCliArgs(['check', '--preview', 'com.magpie.uiv.demo.CalibCardPreview', '--node', '1:100', '--demo', 'demo-android'])).toEqual({
      kind: 'check', preview: 'com.magpie.uiv.demo.CalibCardPreview', node: '1:100', demo: 'demo-android', version: null, ignoreRegion: null, record: false,
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
        session: 'S1', version: null, states: ['empty', 'longText'], matrix: 'full', json: true, out: '/tmp/r.json',
      });
  });
  it('缺省:version=null、states=[]、matrix=l-shape、json=false、out=null', () => {
    expect(parseCliArgs(['verify-page', '--test', 'T', '--node', '1:100', '--demo', 'd', '--session', 'standalone']))
      .toEqual({ kind: 'verify-page', test: 'T', node: '1:100', demo: 'd', session: 'standalone',
        version: null, states: [], matrix: 'l-shape', json: false, out: null });
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
