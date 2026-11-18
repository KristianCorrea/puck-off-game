/**
 * Mobile play shell: rotate hint, tap-to-play gate, fullscreen + landscape lock.
 * Does not change game/physics coordinates — canvas RESIZE + camera letterbox.
 */

import { setPlayMode, type PlayMode } from "../networking/playMode";
import {
  startServerHealthPolling,
  type ServerHealthStatus,
} from "../networking/serverHealth";
import {
  installViewportRefresh,
  refreshGameViewport,
} from "./viewportRefresh";

type OrientationLockType = "landscape" | "landscape-primary" | "landscape-secondary";

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: OrientationLockType) => Promise<void>;
};

function isCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

function isPortrait(): boolean {
  return window.matchMedia("(orientation: portrait)").matches;
}

function isFullscreen(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

async function requestFullscreen(): Promise<void> {
  if (isFullscreen()) return;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    }
  } catch {
    // iOS Safari / denied — continue without fullscreen.
  }
}

async function lockLandscape(): Promise<void> {
  const orientation = screen.orientation as ScreenOrientationWithLock | undefined;
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    // Not allowed outside fullscreen / installed PWA on many browsers.
  }
}

/** Enter immersive play mode (safe to call from any user gesture). */
export async function enterPlayMode(): Promise<void> {
  window.dispatchEvent(new Event("puckoff-play-gesture"));
  await requestFullscreen();
  await lockLandscape();
  refreshGameViewport();
}

function setVisible(el: HTMLElement | null, visible: boolean): void {
  if (!el) return;
  el.classList.toggle("is-visible", visible);
  el.setAttribute("aria-hidden", visible ? "false" : "true");
}

function applyOnlineButtonStatus(
  btn: HTMLButtonElement,
  status: ServerHealthStatus,
): void {
  if (status === "online") {
    btn.disabled = false;
    btn.textContent = "ONLINE";
    btn.title = "Multiplayer server is up";
    return;
  }
  btn.disabled = true;
  if (status === "checking") {
    btn.textContent = "ONLINE · CHECKING…";
    btn.title = "Checking multiplayer server…";
  } else {
    btn.textContent = "ONLINE · OFFLINE";
    btn.title = "Multiplayer server unreachable — retrying every 10s";
  }
}

/**
 * Wire DOM overlays. Call once from main before/after creating the Phaser game.
 * Mode buttons set local/online then dismiss the gate (and request fullscreen on touch).
 * ONLINE stays disabled until GET /health succeeds (polled every 10s).
 */
export function installPlayShell(): void {
  installViewportRefresh();

  const tap = document.getElementById("tap-to-play");
  const resume = document.getElementById("tap-to-resume");
  const rotate = document.getElementById("rotate-overlay");
  const localBtn = document.getElementById("play-local-btn");
  const onlineBtn = document.getElementById(
    "play-online-btn",
  ) as HTMLButtonElement | null;
  const resumeBtn = document.getElementById("resume-play-btn");

  // Desktop with ?mode=… can skip the chooser; touch still needs a gesture.
  const params = new URLSearchParams(window.location.search);
  const queryMode = params.get("mode");
  let playStarted =
    !isCoarsePointer() && (queryMode === "local" || queryMode === "online");

  const syncOverlays = (): void => {
    const needRotate =
      isPortrait() && (isCoarsePointer() || window.innerWidth < 900);
    setVisible(rotate, needRotate);
    setVisible(tap, !needRotate && !playStarted);
  };

  const needRotateNow = (): boolean =>
    isPortrait() && (isCoarsePointer() || window.innerWidth < 900);

  const showResumeGate = (): void => {
    if (!playStarted || !isCoarsePointer()) return;
    if (needRotateNow()) return;
    setVisible(resume, true);
  };

  let stopHealthPoll: (() => void) | null = null;

  let entering = false;
  const dismissTapGate = async (mode: PlayMode): Promise<void> => {
    if (playStarted || entering) return;
    if (mode === "online" && onlineBtn?.disabled) return;
    entering = true;
    stopHealthPoll?.();
    stopHealthPoll = null;
    setPlayMode(mode);
    playStarted = true;
    setVisible(tap, false);
    setVisible(resume, false);
    await enterPlayMode();
    entering = false;
    syncOverlays();
    window.dispatchEvent(
      new CustomEvent("puckoff-mode-chosen", { detail: { mode } }),
    );
  };

  const onModeClick = (event: Event, mode: PlayMode): void => {
    event.preventDefault();
    event.stopPropagation();
    void dismissTapGate(mode);
  };

  localBtn?.addEventListener(
    "click",
    (e) => onModeClick(e, "local"),
    { passive: false },
  );
  onlineBtn?.addEventListener(
    "click",
    (e) => onModeClick(e, "online"),
    { passive: false },
  );

  resumeBtn?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setVisible(resume, false);
      void enterPlayMode();
    },
    { passive: false },
  );

  // Gate ONLINE on server health while the mode chooser is visible.
  if (onlineBtn && !playStarted) {
    applyOnlineButtonStatus(onlineBtn, "checking");
    stopHealthPoll = startServerHealthPolling({
      intervalMs: 10_000,
      shouldContinue: () => !playStarted,
      onStatus: (status) => {
        if (!playStarted) applyOnlineButtonStatus(onlineBtn, status);
      },
    });
  }

  syncOverlays();
  window.addEventListener("resize", syncOverlays);
  window.addEventListener("orientationchange", syncOverlays);
  document.addEventListener("fullscreenchange", () => {
    syncOverlays();
    // Left fullscreen while playing (common after app switch on iOS).
    if (playStarted && !isFullscreen() && isCoarsePointer()) {
      showResumeGate();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    syncOverlays();
    if (playStarted && isCoarsePointer() && !needRotateNow()) {
      // Always offer a tap so we can re-request fullscreen + force scale refresh.
      showResumeGate();
    }
  });
}
