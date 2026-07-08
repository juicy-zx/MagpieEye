export class QuotaExceededError extends Error {}

export class QuotaBudgeter {   // 策略见口径 2
  private stamps: number[] = []; private day = -1; private used = 0;
  constructor(private cfg: { perMinute: number; perDay: number } = { perMinute: 15, perDay: 200 },
              private now: () => number = Date.now,
              private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}
  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < 60_000);
      const day = Math.floor(t / 86_400_000);
      if (day !== this.day) { this.day = day; this.used = 0; }
      if (this.used >= this.cfg.perDay) throw new QuotaExceededError('daily budget exhausted');
      if (this.stamps.length < this.cfg.perMinute) { this.stamps.push(t); this.used++; return; }
      await this.sleep(this.stamps[0]! + 60_000 - t);
    }
  }
}
