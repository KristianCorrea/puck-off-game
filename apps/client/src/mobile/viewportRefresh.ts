import type Phaser from "phaser";

/**
 * After iOS backgrounding, Safari often changes the viewport / drops
 * fullscreen while Phaser keeps a stale Scale size → broken letterbox.
 * Force a refresh when the page becomes visible again.
 */

let game: Phaser.Game | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function registerGameForViewportRefresh(instance: Phaser.Game): void {
  game = instance;
}

export function unregisterGameForViewportRefresh(): void {
  game = null;
}

export function refreshGameViewport(): void {
  // Nudge layout first so Scale Manager reads fresh client sizes.
  window.dispatchEvent(new Event("resize"));
  if (!game) return;
  try {
    game.scale.refresh();
  } catch {
    // Game may be mid-destroy.
  }
}

function scheduleRefresh(delayMs = 80): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    refreshGameViewport();
    // iOS sometimes settles chrome one frame later.
    requestAnimationFrame(() => refreshGameViewport());
  }, delayMs);
}

/**
 * Call once from play shell. Safe before Phaser boots (no-ops until registered).
 */
export function installViewportRefresh(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleRefresh(100);
      scheduleRefresh(400);
    }
  });

  window.addEventListener("pageshow", (event) => {
    scheduleRefresh(event.persisted ? 50 : 100);
  });

  window.addEventListener("orientationchange", () => {
    scheduleRefresh(150);
    scheduleRefresh(500);
  });

  document.addEventListener("fullscreenchange", () => {
    scheduleRefresh(50);
  });

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", () => scheduleRefresh(50));
  }
}
