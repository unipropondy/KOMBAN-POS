import { io, Socket } from "socket.io-client";
import { API_URL } from "./Config";

export const socket: Socket = io(API_URL, {
  transports: ["websocket"],
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  autoConnect: true,
});

socket.on("connect", () => {
  console.log("🔌 Socket connected:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("🔌 Socket connection error:", error);
});
