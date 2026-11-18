/**
 * Per-room launch gate: reject a second LAUNCH while settle/replay is in flight.
 * Node is single-threaded, so this mainly catches client double-emits that
 * arrive before TURN_RESOLVED is processed client-side.
 */
export class LaunchActionGuard {
  private busy = false;

  tryBegin(): boolean {
    if (this.busy) return false;
    this.busy = true;
    return true;
  }

  end(): void {
    this.busy = false;
  }

  get isBusy(): boolean {
    return this.busy;
  }
}
