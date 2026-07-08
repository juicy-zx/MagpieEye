import { expect, it } from 'vitest';
import { QuotaBudgeter, QuotaExceededError } from './quota.js';

it('QuotaBudgeter:窗口滚动排队/日预算拒绝/UTC 日切清零', async () => {
  let t = Date.UTC(2026, 6, 9, 23, 0, 0); const slept: number[] = [];
  const q = new QuotaBudgeter({ perMinute: 2, perDay: 3 }, () => t,
                              async (ms) => { slept.push(ms); t += ms; });
  await q.acquire(); await q.acquire();
  await q.acquire();                 // 窗满:排队到最早一条滚出
  expect(slept).toEqual([60_000]);
  await expect(q.acquire()).rejects.toBeInstanceOf(QuotaExceededError);   // 日预算耗尽
  expect(slept).toEqual([60_000]);   // 拒绝未排队
  t += 86_400_000;
  await q.acquire();                 // 跨 UTC 0 点,新日清零
});
