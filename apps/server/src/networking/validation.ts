import { SHOT_CONFIG, type LaunchPuckPayload } from "@puck-off/shared";

export type LaunchParseResult =
  | { ok: true; payload: LaunchPuckPayload }
  | { ok: false; reason: string };

/**
 * Harden LAUNCH_PUCK before it hits MatchManager.
 * Engine validateLaunch still owns turn/ownership/phase.
 */
export function parseLaunchPayload(raw: unknown): LaunchParseResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }

  const body = raw as Record<string, unknown>;
  const puckId = body.puckId;
  const angle = body.angle;
  const power = body.power;

  if (typeof puckId !== "string" || puckId.length === 0 || puckId.length > 32) {
    return { ok: false, reason: "INVALID_PUCK_ID" };
  }

  if (typeof angle !== "number" || !Number.isFinite(angle)) {
    return { ok: false, reason: "INVALID_ANGLE" };
  }

  if (typeof power !== "number" || !Number.isFinite(power)) {
    return { ok: false, reason: "INVALID_POWER" };
  }

  if (power < SHOT_CONFIG.minPower || power > 1) {
    return { ok: false, reason: "INVALID_POWER" };
  }

  return {
    ok: true,
    payload: { puckId, angle, power },
  };
}
