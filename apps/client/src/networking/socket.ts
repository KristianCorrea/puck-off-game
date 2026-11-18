import { io, type Socket } from "socket.io-client";

const DEFAULT_URL = "http://localhost:3001";

export function getServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("server") ??
    (import.meta.env.VITE_SERVER_URL as string | undefined) ??
    DEFAULT_URL
  );
}

export function connectSocket(url = getServerUrl()): Socket {
  return io(url, {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
}
