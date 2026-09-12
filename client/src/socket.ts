import { io, Socket } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

// A single shared socket instance for the whole app lifecycle.
// autoConnect: false lets App decide exactly when to connect
// (avoids opening a socket before the user has even entered a name).
export const socket: Socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
