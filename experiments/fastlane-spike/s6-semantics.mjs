#!/usr/bin/env node
/** T2.3 S6:常驻 worker 内语义树可达性探测(记录项,不改判 G1/G2)。 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const probe = join(here, 'coexist-probe');
const envDir = join(probe, 'build', 'worker-env');
const outJson = join(here, 'evidence', 'fastlane-semantics.json');

const jvmArgs = readFileSync(join(envDir, 'jvm-args.txt'), 'utf8').split('\n').filter(Boolean)
  .filter((a) => a !== '-Duser.variant');
const classpath = readFileSync(join(envDir, 'classpath.txt'), 'utf8').trim();

const worker = spawn('java', [...jvmArgs, '-cp', classpath, 'com.magpie.uiv.demo.RenderWorkerKt'], {
  cwd: probe, stdio: ['pipe', 'pipe', 'pipe'],
});
let out = '', err = '';
worker.stdout.on('data', (d) => { out += d; });
worker.stderr.on('data', (d) => { err += d; });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('ready timeout')), 120_000);
  const iv = setInterval(() => { if (err.includes('"event":"ready"')) { clearTimeout(t); clearInterval(iv); resolve(); } }, 50);
  worker.on('exit', () => reject(new Error('worker died:\n' + err)));
});
worker.stdin.write(`semantics ${outJson}\n`);
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('semantics timeout')), 60_000);
  const iv = setInterval(() => { if (out.includes('"event":"semantics"')) { clearTimeout(t); clearInterval(iv); resolve(); } }, 50);
});
worker.stdin.write('quit\n'); worker.stdin.end();
console.log(out.trim());
