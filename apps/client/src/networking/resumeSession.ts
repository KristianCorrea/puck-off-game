import type { PlayerId } from "@puck-off/shared";

const STORAGE_KEY = "puckoff-resume";

export type ResumeSession = {
  code: string;
  playerId: PlayerId;
  resumeToken: string;
};

export function saveResumeSession(session: ResumeSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // private mode / quota — reconnect just won't work after refresh
  }
}

export function loadResumeSession(): ResumeSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResumeSession>;
    if (
      typeof parsed.code !== "string" ||
      typeof parsed.resumeToken !== "string" ||
      (parsed.playerId !== "player1" && parsed.playerId !== "player2")
    ) {
      return null;
    }
    return {
      code: parsed.code,
      playerId: parsed.playerId,
      resumeToken: parsed.resumeToken,
    };
  } catch {
    return null;
  }
}

export function clearResumeSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
