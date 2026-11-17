import Phaser from "phaser";
import { ArenaScene } from "./game/ArenaScene";
import { PROTOTYPE_CONFIG } from "./game/config/prototypeConfig";
import { installPlayShell } from "./mobile/playShell";

const parent = document.getElementById("game");

if (!parent) {
  throw new Error("Missing #game container");
}

installPlayShell();

const { width, height } = PROTOTYPE_CONFIG.arena;

new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: "#050b12",
  width,
  height,
  scale: {
    // Canvas fills the phone; ArenaScene letterboxes the fixed world via camera zoom.
    // That keeps FIT-style bars *inside* the canvas so flicks track over them.
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
      // Settling is handled in ArenaScene; sleeping + setVelocity caused stuck pucks.
      enableSleeping: false,
      positionIterations: 8,
      velocityIterations: 6,
    },
  },
  scene: [ArenaScene],
});
