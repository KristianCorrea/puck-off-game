import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { bindSocketHandlers } from "./networking/events";
import { RoomManager } from "./rooms/RoomManager";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

/**
 * Comma-separated browser origins allowed to talk to this server.
 * Example: https://puck-off.pages.dev,http://localhost:5173
 */
function parseClientOrigins(raw: string | undefined): string | string[] {
  const parts = (raw ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "http://localhost:5173";
  if (parts.length === 1) return parts[0]!;
  return parts;
}

const CLIENT_ORIGIN = parseClientOrigins(process.env.CLIENT_ORIGIN);

const app = express();
app.use(
  cors({
    origin: CLIENT_ORIGIN,
  }),
);
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "puck-off-server" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
  // Prefer websocket; polling still allowed for stubborn networks.
  transports: ["websocket", "polling"],
});

const rooms = new RoomManager(io);
bindSocketHandlers(io, rooms);

httpServer.listen(PORT, HOST, () => {
  const origins = Array.isArray(CLIENT_ORIGIN)
    ? CLIENT_ORIGIN.join(", ")
    : CLIENT_ORIGIN;
  console.log(`[puck-off/server] listening on http://${HOST}:${PORT}`);
  console.log(`[puck-off/server] CORS origin(s): ${origins}`);
});

function shutdown(): void {
  console.log("[puck-off/server] shutting down…");
  rooms.destroy();
  io.close();
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
