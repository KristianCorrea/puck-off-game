import { getServerUrl } from "./socket";

const DEFAULT_TIMEOUT_MS = 4_000;

export type ServerHealthStatus = "checking" | "online" | "offline";

/**
 * One-shot GET /health against the configured multiplayer server.
 */
export async function probeServerHealth(
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${getServerUrl()}/health`, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll /health on an interval. Returns a stop function.
 */
export function startServerHealthPolling(opts: {
  intervalMs?: number;
  onStatus: (status: ServerHealthStatus) => void;
  /** Return false to stop (e.g. after play starts). */
  shouldContinue?: () => boolean;
}): () => void {
  const intervalMs = opts.intervalMs ?? 10_000;
  let stopped = false;
  let inFlight = false;
  let announced = false;

  const stop = (): void => {
    stopped = true;
    clearInterval(handle);
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (opts.shouldContinue && !opts.shouldContinue()) {
      stop();
      return;
    }
    if (inFlight) return;
    inFlight = true;
    // Only show "checking" on the first probe so ONLINE doesn't flicker every 10s.
    if (!announced) opts.onStatus("checking");
    const ok = await probeServerHealth();
    inFlight = false;
    if (stopped) return;
    if (opts.shouldContinue && !opts.shouldContinue()) {
      stop();
      return;
    }
    announced = true;
    opts.onStatus(ok ? "online" : "offline");
  };

  void tick();
  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return stop;
}

/** Keep probing until online (for ?mode=online deep links). */
export async function waitUntilServerOnline(
  intervalMs = 10_000,
): Promise<void> {
  for (;;) {
    if (await probeServerHealth()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
