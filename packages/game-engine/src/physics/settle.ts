import { SETTLE_CONFIG } from "@puck-off/shared";
import type { Body } from "matter-js";

export function bodySpeed(body: Body): number {
  return Math.hypot(body.velocity.x, body.velocity.y);
}

export function bodiesSettled(bodies: Body[]): boolean {
  const stop = SETTLE_CONFIG.stopSpeed;
  return bodies.every((b) => bodySpeed(b) <= stop);
}

export function dampenBodies(
  bodies: Body[],
  setVelocity: (body: Body, v: { x: number; y: number }) => void,
  setAngularVelocity: (body: Body, w: number) => void,
): void {
  const stop = SETTLE_CONFIG.stopSpeed;
  for (const body of bodies) {
    const speed = bodySpeed(body);
    if (speed > 0 && speed < stop) {
      setVelocity(body, { x: 0, y: 0 });
      setAngularVelocity(body, 0);
    }
  }
}
