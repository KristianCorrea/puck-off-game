/**
 * Mobile play shell: rotate hint, tap-to-play gate, fullscreen + landscape lock.
 * Does not change game/physics coordinates — canvas RESIZE + camera letterbox.
 */

import { setPlayMode, type PlayMode } from "../networking/playMode";

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
  window.dispatchEvent(new Event("resize"));
}

function setVisible(el: HTMLElement | null, visible: boolean): void {
  if (!el) return;
  el.classList.toggle("is-visible", visible);
  el.setAttribute("aria-hidden", visible ? "false" : "true");
}

/**
 * Wire DOM overlays. Call once from main before/after creating the Phaser game.
 * Mode buttons set local/online then dismiss the gate (and request fullscreen on touch).
 */
export function installPlayShell(): void {
  const tap = document.getElementById("tap-to-play");
  const rotate = document.getElementById("rotate-overlay");
  const localBtn = document.getElementById("play-local-btn");
  const onlineBtn = document.getElementById("play-online-btn");

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

  let entering = false;
  const dismissTapGate = async (mode: PlayMode): Promise<void> => {
    if (playStarted || entering) return;
    entering = true;
    setPlayMode(mode);
    playStarted = true;
    setVisible(tap, false);
    await enterPlayMode();
    entering = false;
    syncOverlays();
    // Arena may already be creating — reload so create() sees the mode.
    // Only reload if Phaser already booted past create with wrong mode.
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

  syncOverlays();
  window.addEventListener("resize", syncOverlays);
  window.addEventListener("orientationchange", syncOverlays);
  document.addEventListener("fullscreenchange", syncOverlays);
}
