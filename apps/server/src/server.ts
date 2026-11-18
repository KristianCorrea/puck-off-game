import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { bindSocketHandlers } from "./networking/events";
import { RoomManager } from "./rooms/RoomManager";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

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
});

const rooms = new RoomManager(io);
bindSocketHandlers(io, rooms);

httpServer.listen(PORT, () => {
  console.log(`[puck-off/server] listening on http://localhost:${PORT}`);
  console.log(`[puck-off/server] CORS origin: ${CLIENT_ORIGIN}`);
});

function shutdown(): void {
  console.log("[puck-off/server] shutting down…");
  rooms.destroy();
  io.close();
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
