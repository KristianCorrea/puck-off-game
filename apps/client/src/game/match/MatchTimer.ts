import { MATCH_CONFIG } from "../config/gameConfig";

/** Per-turn move countdown; expires → skip turn. */
export class MatchTimer {
  remainingMs: number;
  running = true;

  constructor(durationMs = MATCH_CONFIG.turnDurationMs) {
    this.remainingMs = durationMs;
  }

  reset(durationMs = MATCH_CONFIG.turnDurationMs): void {
    this.remainingMs = durationMs;
    this.running = true;
  }

  stop(): void {
    this.running = false;
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
    const totalSec = Math.max(0, Math.ceil(this.remainingMs / 1000));
    return `${totalSec}s`;
  }

  get expired(): boolean {
    return this.remainingMs <= 0;
  }

  get urgent(): boolean {
    return this.remainingMs > 0 && this.remainingMs <= 5_000;
  }
}
