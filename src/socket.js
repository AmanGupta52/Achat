import { io } from "socket.io-client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * =========================
 * SOCKET INSTANCE
 * =========================
 */
export const socket = io(API_BASE_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket"],
});

/**
 * =========================
 * CONNECT
 * =========================
 */
export const connectSocket = (userId) => {
    if (!userId) return;

    const id = userId.toString(); // ✅ normalize

    if (!socket.connected) {
        socket.connect();
    }

    socket.emit("register", id);
};

/**
 * =========================
 * DISCONNECT
 * =========================
 */
export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
};

/**
 * =========================
 * AUTO RECONNECT
 * =========================
 */
socket.on("connect", () => {
    const userId = localStorage.getItem("userId");

    if (userId) {
        socket.emit("register", userId.toString()); // ✅ normalize
    }
});

/**
 * =========================
 * EVENT REGISTRATION
 * =========================
 */
export const registerSocketEvents = (handlers = {}) => {
    // clean old listeners
    socket.off("request_received");
    socket.off("request_accepted");
    socket.off("request_rejected");
    socket.off("connection_updated");
    socket.off("receive_message");
    socket.off("message_sent");
    socket.off("typing");
    socket.off("online_status");

    // -------------------------
    // CONNECTION EVENTS
    // -------------------------
    socket.on("request_received", (data) => {
        handlers.onRequestReceived?.(data);
    });

    socket.on("request_accepted", (data) => {
        handlers.onRequestAccepted?.(data);
    });

    socket.on("request_rejected", (data) => {
        handlers.onRequestRejected?.(data);
    });

    socket.on("connection_updated", (data) => {
        handlers.onConnectionUpdated?.(data);
    });

    // -------------------------
    // CHAT EVENTS
    // -------------------------

    socket.on("receive_message", (data) => {
        handlers.onReceiveMessage?.({
            ...data,
            sender: data.sender?.toString(),
            receiver: data.receiver?.toString(),
        });
    });

    socket.on("message_sent", (data) => {
        handlers.onMessageSent?.(data);
    });

    socket.on("typing", (data) => {
        handlers.onTyping?.({
            ...data,
            sender: data.sender?.toString(),
            receiver: data.receiver?.toString(),
        });
    });

    socket.on("online_status", (data) => {
        handlers.onOnlineStatus?.(data);
    });
};

/**
 * =========================
 * CHAT HELPERS
 * =========================
 */

// ✅ FIXED: normalize payload before sending
export const sendSocketMessage = (payload) => {
    if (!payload) return;

    socket.emit("send_message", {
        ...payload,
        sender: payload.sender?.toString(),
        receiver: payload.receiver?.toString(),
    });
};

// typing helper
export const sendTypingEvent = (receiver, sender, isTyping) => {
    socket.emit("typing", {
        receiver: receiver?.toString(),
        sender: sender?.toString(),
        isTyping,
    });
};