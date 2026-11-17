import { MATCH_CONFIG } from "../config/gameConfig";

/** Countdown timer; only ticks while `running` is true. */
export class MatchTimer {
  remainingMs: number;
  running = true;

  constructor(durationMs = MATCH_CONFIG.matchDurationMs) {
    this.remainingMs = durationMs;
  }

  /** @returns true if time just expired this tick */
  tick(deltaMs: number): boolean {
    if (!this.running || this.remainingMs <= 0) return false;
    this.remainingMs = Math.max(0, this.remainingMs - deltaMs);
    if (this.remainingMs <= 0) {
      this.running = false;
      return true;
    }
    return false;
  }

  format(): string {
    const totalSec = Math.ceil(this.remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  get expired(): boolean {
    return this.remainingMs <= 0;
  }
}
