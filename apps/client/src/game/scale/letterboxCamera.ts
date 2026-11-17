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
  const zoom = Math.min(cam.width / worldW, cam.height / worldH);

  cam.setBackgroundColor(backgroundColor);
  cam.setZoom(zoom);
  cam.centerOn(worldW / 2, worldH / 2);
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
