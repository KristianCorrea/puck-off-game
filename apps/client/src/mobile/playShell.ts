/**
 * Mobile play shell: rotate hint, tap-to-play gate, fullscreen + landscape lock.
 * Does not change game/physics coordinates — Phaser Scale.FIT still owns sizing.
 */

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
 * On touch phones, blocks input until TAP TO PLAY (also requests fullscreen).
 */
export function installPlayShell(): void {
  const tap = document.getElementById("tap-to-play");
  const tapBtn = document.getElementById("tap-to-play-btn");
  const rotate = document.getElementById("rotate-overlay");

  // Coarse pointers (phones/tablets): require an explicit gesture for fullscreen.
  let playStarted = !isCoarsePointer();

  const syncOverlays = (): void => {
    const needRotate =
      isPortrait() && (isCoarsePointer() || window.innerWidth < 900);
    setVisible(rotate, needRotate);
    // Rotate takes priority; restore tap gate after they flip to landscape.
    setVisible(tap, !needRotate && !playStarted);
  };

  let entering = false;
  const dismissTapGate = async (): Promise<void> => {
    if (playStarted || entering) return;
    entering = true;
    playStarted = true;
    setVisible(tap, false);
    await enterPlayMode();
    entering = false;
    syncOverlays();
  };

  tapBtn?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      void dismissTapGate();
    },
    { passive: false },
  );

  // Whole overlay is tappable (easier than hunting the button).
  tap?.addEventListener(
    "pointerup",
    (event) => {
      if (!tap.classList.contains("is-visible")) return;
      event.preventDefault();
      void dismissTapGate();
    },
    { passive: false },
  );

  syncOverlays();
  window.addEventListener("resize", syncOverlays);
  window.addEventListener("orientationchange", syncOverlays);
  document.addEventListener("fullscreenchange", syncOverlays);
}
