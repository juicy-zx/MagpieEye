import { describe, expect, it } from 'vitest';
import { buildColdPathProfile, escapeSbplString } from './sandbox-profile.js';

const HOME = '/Users/dev';

describe('escapeSbplString(SBPL 双引号字面量转义)', () => {
  it('转义双引号', () => {
    expect(escapeSbplString('/a/b"c')).toBe('/a/b\\"c');
  });
  it('转义反斜杠', () => {
    expect(escapeSbplString('/a\\b')).toBe('/a\\\\b');
  });
  it('反斜杠 + 双引号混合(先反斜杠后引号,不二次转义)', () => {
    // 输入 `/x\"y`(反斜杠 + 引号)→ 反斜杠→`\\`、引号→`\"` ⇒ `/x\\\"y`
    expect(escapeSbplString('/x\\"y')).toBe('/x\\\\\\"y');
  });
  it('普通路径原样', () => {
    expect(escapeSbplString('/Users/dev/proj')).toBe('/Users/dev/proj');
  });
});

describe('buildColdPathProfile(冷路径 SBPL 结构)', () => {
  it('骨架:version/allow default/网络双闸/Home 读闸 + workspace 放行恒在', () => {
    const p = buildColdPathProfile({ userHome: HOME, workspaceRoot: '/Users/dev/proj' });
    expect(p).toContain('(version 1)');
    expect(p).toContain('(allow default)');
    expect(p).toContain('(deny network-outbound)');
    expect(p).toContain('(allow network-outbound (remote ip "localhost:*"))');
    // 用 file-read-data(仅内容),非 file-read*(会连带禁元数据 → JVM 启动 SIGSEGV)。
    expect(p).toContain(`(deny file-read-data (subpath "${HOME}"))`);
    expect(p).toContain('(allow file-read-data (subpath "/Users/dev/proj"))');
    // 断言绝不禁 file-read*(元数据必须放行)。
    expect(p).not.toContain('(deny file-read* ');
  });

  it('deny userHome 行在 allow workspace 行之前(后者覆盖语义)', () => {
    const p = buildColdPathProfile({ userHome: HOME, workspaceRoot: '/Users/dev/proj' });
    expect(p.indexOf('(deny file-read-data (subpath')).toBeLessThan(
      p.indexOf('(allow file-read-data (subpath "/Users/dev/proj"))'),
    );
    // 网络 deny 亦在 loopback 放行之前
    expect(p.indexOf('(deny network-outbound)')).toBeLessThan(
      p.indexOf('(allow network-outbound'),
    );
  });

  it('javaHome 在 userHome 之下 → 输出放行行', () => {
    const javaHome = '/Users/dev/Library/Java/corretto-21/Contents/Home';
    const p = buildColdPathProfile({ userHome: HOME, workspaceRoot: '/Users/dev/proj', javaHome });
    expect(p).toContain(`(allow file-read-data (subpath "${javaHome}"))`);
  });

  it('javaHome 不在 userHome 之下 → 不输出放行行(系统 JDK 已被 allow default 覆盖)', () => {
    const javaHome = '/Library/Java/JavaVirtualMachines/jdk-21/Contents/Home';
    const p = buildColdPathProfile({ userHome: HOME, workspaceRoot: '/Users/dev/proj', javaHome });
    expect(p).not.toContain(`(allow file-read-data (subpath "${javaHome}"))`);
  });

  it('androidSdk 在/不在 userHome 之下的两分支', () => {
    const inHome = buildColdPathProfile({
      userHome: HOME, workspaceRoot: '/Users/dev/proj', androidSdk: '/Users/dev/Library/Android/sdk',
    });
    expect(inHome).toContain('(allow file-read-data (subpath "/Users/dev/Library/Android/sdk"))');
    const outHome = buildColdPathProfile({
      userHome: HOME, workspaceRoot: '/Users/dev/proj', androidSdk: '/opt/android/sdk',
    });
    expect(outHome).not.toContain('(allow file-read-data (subpath "/opt/android/sdk"))');
  });

  it('前缀伪装不误判为 subpath 内(/Users/devil 不属于 /Users/dev)', () => {
    const p = buildColdPathProfile({
      userHome: HOME, workspaceRoot: '/Users/dev/proj', javaHome: '/Users/devil/jdk',
    });
    // /Users/devil 不在 /Users/dev 之下 → 不放行
    expect(p).not.toContain('(allow file-read-data (subpath "/Users/devil/jdk"))');
  });

  it('mavenRepo(~/.m2/repository)在 home 下 → 输出放行行(Robolectric 依赖来源)', () => {
    const mavenRepo = '/Users/dev/.m2/repository';
    const p = buildColdPathProfile({ userHome: HOME, workspaceRoot: '/Users/dev/proj', mavenRepo });
    expect(p).toContain(`(allow file-read-data (subpath "${mavenRepo}"))`);
    // 未提供 mavenRepo 时不输出
    const none = buildColdPathProfile({ userHome: HOME, workspaceRoot: '/Users/dev/proj' });
    expect(none).not.toContain('.m2/repository');
  });

  it('路径转义嵌入(含双引号的诡异路径)', () => {
    const p = buildColdPathProfile({ userHome: HOME, workspaceRoot: '/Users/dev/a"b' });
    expect(p).toContain('(allow file-read-data (subpath "/Users/dev/a\\"b"))');
  });
});
