import Phaser from "phaser";
import { PROTOTYPE_CONFIG } from "../config/prototypeConfig";

/**
 * Keep a fixed design-resolution world, but make the canvas fill the parent.
 * Letterbox bars are drawn by the camera background — still inside the canvas —
 * so flicks keep tracking when the finger moves into those bars.
 */
export function applyLetterboxCamera(scene: Phaser.Scene): void {
  const { width: worldW, height: worldH, backgroundColor } =
    PROTOTYPE_CONFIG.arena;
  const cam = scene.cameras.main;
  // Prefer Scale Manager size (updates on refresh); fall back to camera.
  const viewW = scene.scale.width || cam.width;
  const viewH = scene.scale.height || cam.height;
  if (viewW < 2 || viewH < 2) return;

  const zoom = Math.min(viewW / worldW, viewH / worldH);
  cam.setBackgroundColor(backgroundColor);
  cam.setZoom(zoom);
  cam.centerOn(worldW / 2, worldH / 2);
  cam.setSize(viewW, viewH);
}

/** Re-apply letterboxing whenever the Scale Manager resizes the game. */
export function bindLetterboxCamera(scene: Phaser.Scene): void {
  applyLetterboxCamera(scene);
  const onResize = (): void => applyLetterboxCamera(scene);
  scene.scale.on("resize", onResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off("resize", onResize);
  });
}
