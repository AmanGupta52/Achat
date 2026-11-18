import { io } from "socket.io-client";
import { API_BASE_URL, TOKEN_KEY } from "./config";

/**
 * Authenticated socket. The JWT is sent in the handshake, so the server knows who we
 * are without trusting a user id from the browser. `auth` is a function, so every
 * automatic reconnect picks up the latest token.
 */
export const socket = io(API_BASE_URL, {
    autoConnect: false,
    withCredentials: true,
    auth: (cb) => cb({ token: localStorage.getItem(TOKEN_KEY) }),
});

export const connectSocket = () => {
    if (!socket.connected && !socket.active) socket.connect();
};

export const disconnectSocket = () => {
    socket.disconnect();
};

export const sendTypingEvent = (receiverId, isTyping) => {
    if (!socket.connected || !receiverId) return;
    socket.emit("typing", { receiver: String(receiverId), isTyping: !!isTyping });
};
