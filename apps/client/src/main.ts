import Phaser from "phaser";
import { ArenaScene } from "./game/ArenaScene";
import { PROTOTYPE_CONFIG } from "./game/config/prototypeConfig";
import { installPlayShell } from "./mobile/playShell";
import { getPlayMode, setPlayMode, type PlayMode } from "./networking/playMode";

const parent = document.getElementById("game");

if (!parent) {
  throw new Error("Missing #game container");
}

installPlayShell();

const { width, height } = PROTOTYPE_CONFIG.arena;

function startGame(): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#050b12",
    width,
    height,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width,
      height,
      expandParent: true,
      autoRound: true,
    },
    input: {
      activePointers: 3,
    },
    render: {
      antialias: true,
      antialiasGL: true,
      pixelArt: false,
      roundPixels: false,
      powerPreference: "high-performance",
    },
    physics: {
      default: "matter",
      matter: {
        gravity: { x: 0, y: 0 },
        enableSleeping: false,
        positionIterations: 8,
        velocityIterations: 6,
      },
    },
    scene: [ArenaScene],
  });
}

/** Deep-link: ?mode=local|online skips the chooser after shell is wired. */
function modeFromQuery(): PlayMode | null {
  const params = new URLSearchParams(window.location.search);
  const m = params.get("mode");
  if (m === "online" || m === "local") return m;
  return null;
}

const queryMode = modeFromQuery();
if (queryMode) {
  setPlayMode(queryMode);
  // Still show tap gate on coarse pointers for fullscreen; desktop starts now.
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!coarse) {
    startGame();
  } else {
    window.addEventListener(
      "puckoff-mode-chosen",
      () => startGame(),
      { once: true },
    );
  }
} else {
  window.addEventListener(
    "puckoff-mode-chosen",
    () => {
      void getPlayMode();
      startGame();
    },
    { once: true },
  );
}
