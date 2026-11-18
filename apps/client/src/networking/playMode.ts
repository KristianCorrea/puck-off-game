export type PlayMode = "local" | "online";

const STORAGE_KEY = "puckoff-play-mode";

export function getPlayMode(): PlayMode {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("mode");
  if (fromQuery === "online" || fromQuery === "local") return fromQuery;

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored === "online" || stored === "local") return stored;

  return "local";
}

export function setPlayMode(mode: PlayMode): void {
  sessionStorage.setItem(STORAGE_KEY, mode);
}
