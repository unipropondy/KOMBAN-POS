import { io, Socket } from "socket.io-client";
import { API_URL } from "./Config";

export const socket: Socket = io(API_URL, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 20,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  autoConnect: true,
  withCredentials: false
});

socket.on("connect", () => {
  console.log("🔌 Socket connected:", socket.id);
});

socket.on("connect_error", (error) => {
  console.error("🔌 Socket connection error:", error);
});
