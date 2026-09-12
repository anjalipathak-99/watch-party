const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const RoomManager = require("./models/RoomManager");
const MessageHandler = require("./handlers/MessageHandler");

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Simple health check + room stats endpoints (useful for deployment platforms
// like Render, which ping a health check URL).
const roomManager = new RoomManager();

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptimeSeconds: process.uptime() });
});

app.get("/api/stats", (req, res) => {
  res.json(roomManager.stats());
});

app.get("/api/rooms/:roomId/exists", (req, res) => {
  res.json({ exists: roomManager.roomExists(req.params.roomId.toUpperCase()) });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  const handler = new MessageHandler(io, socket, roomManager);
  handler.register();
});

server.listen(PORT, () => {
  console.log(`Watch Party server listening on port ${PORT}`);
  console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
});
