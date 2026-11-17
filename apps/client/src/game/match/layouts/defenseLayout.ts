import { getFieldBounds } from "../../config/prototypeConfig";
import type { PlayerId } from "../../config/gameConfig";

export type SpawnPoint = { x: number; y: number };

/**
 * Defense-oriented layout: pucks biased toward each player's own goal.
 * Coordinates are world pixels on the playable field.
 */
export function getDefenseLayout(): Record<PlayerId, SpawnPoint[]> {
  const field = getFieldBounds();
  const { left, top, width, height } = field;

  const at = (xRatio: number, yRatio: number): SpawnPoint => ({
    x: left + width * xRatio,
    y: top + height * yRatio,
  });

  // P1 defends left — cluster near left goal / back half
  const player1: SpawnPoint[] = [
    at(0.07, 0.22),
    at(0.07, 0.5),
    at(0.07, 0.78),
    at(0.16, 0.34),
    at(0.16, 0.66),
  ];

  // P2 defends right — mirror
  const player2: SpawnPoint[] = [
    at(0.93, 0.22),
    at(0.93, 0.5),
    at(0.93, 0.78),
    at(0.84, 0.34),
    at(0.84, 0.66),
  ];

  return { player1, player2 };
}
