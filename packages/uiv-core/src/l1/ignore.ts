/**
 * --ignore-region 持久化(T1.2 Step 6)。
 * 格式:.ui-verify/ignore-regions.json = { "<nodeId>": [{x,y,w,h}] };文件不存在视为空表。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IgnoreRegion } from './engine.js';

type IgnoreTable = Record<string, IgnoreRegion[]>;

function tablePath(uiVerifyDir: string): string {
  return join(uiVerifyDir, 'ignore-regions.json');
}

function readTable(uiVerifyDir: string): IgnoreTable {
  let text: string;
  try {
    text = readFileSync(tablePath(uiVerifyDir), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
  return JSON.parse(text) as IgnoreTable;
}

export function loadIgnoreRegions(uiVerifyDir: string, nodeId: string): IgnoreRegion[] {
  return readTable(uiVerifyDir)[nodeId] ?? [];
}

export function addIgnoreRegion(uiVerifyDir: string, nodeId: string, r: IgnoreRegion): void {
  const table = readTable(uiVerifyDir);
  table[nodeId] = [...(table[nodeId] ?? []), r];
  mkdirSync(uiVerifyDir, { recursive: true });
  writeFileSync(tablePath(uiVerifyDir), `${JSON.stringify(table, null, 2)}\n`, 'utf8');
}
