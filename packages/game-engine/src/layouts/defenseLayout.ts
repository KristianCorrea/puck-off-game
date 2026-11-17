import { getFieldBounds, type PlayerId } from "@puck-off/shared";

export type SpawnPoint = { x: number; y: number };

/** Defense-oriented layout: pucks biased toward each player's own goal. */
export function getDefenseLayout(): Record<PlayerId, SpawnPoint[]> {
  const field = getFieldBounds();
  const { left, top, width, height } = field;

  const at = (xRatio: number, yRatio: number): SpawnPoint => ({
    x: left + width * xRatio,
    y: top + height * yRatio,
  });

  return {
    player1: [
      at(0.07, 0.22),
      at(0.07, 0.5),
      at(0.07, 0.78),
      at(0.16, 0.34),
      at(0.16, 0.66),
    ],
    player2: [
      at(0.93, 0.22),
      at(0.93, 0.5),
      at(0.93, 0.78),
      at(0.84, 0.34),
      at(0.84, 0.66),
    ],
  };
}
