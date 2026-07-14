/**
 * re-persist 触发标记(T3.2 Step 4)。
 * uiv 零 magpie 依赖:pin 成功且有 scope 且探测到工作区 .magpie/ 时,写 .magpie/uiv-repersist.json 触发标记。
 * 消费点在 magpie 侧 T3.1b(execute.ts validateRequirementContract 之前),此处只写不消费。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../util/atomic.js';

export function requestContractRepersist(root: string): boolean {
  const magpieDir = join(root, '.magpie');
  if (!existsSync(magpieDir)) return false;   // 无 .magpie/ = 非 magpie loop 工作区,不触发
  atomicWriteFileSync(join(magpieDir, 'uiv-repersist.json'),
    `${JSON.stringify({ schemaVersion: 1, reason: 'uiv-pin', mappingPath: '.ui-verify/mapping.json', requestedAt: new Date().toISOString() })}\n`,
    'utf8');
  return true;
}
