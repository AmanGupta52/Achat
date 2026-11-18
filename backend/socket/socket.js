const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Message = require("../models/Message");

let ioInstance = null;

// userId -> number of open sockets (multiple tabs / devices)
const socketCounts = new Map();

const room = (userId) => `user:${userId}`;

const getIO = () => {
    if (!ioInstance) throw new Error("Socket.io not initialized");
    return ioInstance;
};

const isUserOnline = (userId) => (socketCounts.get(String(userId)) || 0) > 0;
const getOnlineUserIds = () => [...socketCounts.keys()];

/** Emit to every socket of a user. Safe to call when the user is offline. */
const emitToUser = (userId, event, payload) => {
    if (!ioInstance || !userId) return;
    ioInstance.to(room(userId)).emit(event, payload);
};

/** Update presence in DB and tell this user's connections. */
const setPresence = async (userId, isOnline) => {
    try {
        const lastSeen = new Date();
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { isOnline, lastSeen } },
            { new: true }
        ).select("connections");

        if (!user) return;

        for (const contactId of user.connections) {
            emitToUser(contactId, "presence", { userId: String(userId), isOnline, lastSeen });
        }
    } catch (err) {
        console.error("PRESENCE ERROR:", err.message);
    }
};

/** Messages that arrived while the user was offline become "delivered" on connect. */
const markPendingDelivered = async (userId) => {
    try {
        const pending = await Message.find({ receiver: userId, delivered: false }).select("_id sender");
        if (!pending.length) return;

        await Message.updateMany(
            { _id: { $in: pending.map((m) => m._id) } },
            { $set: { delivered: true, deliveredAt: new Date() } }
        );

        for (const m of pending) {
            emitToUser(m.sender, "message_delivered", { messageId: String(m._id) });
        }
    } catch (err) {
        console.error("DELIVERY SYNC ERROR:", err.message);
    }
};

/** Force-close all sockets of a user (used on logout). */
const disconnectUser = (userId) => {
    if (!ioInstance) return;
    ioInstance.in(room(userId)).disconnectSockets(true);
};

const socketInit = (io) => {
    ioInstance = io;

    // 🔐 Authenticate every socket with the same JWT used by the REST API
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) return next(new Error("Unauthorized"));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = String(decoded.id);
            next();
        } catch (err) {
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.userId;

        socket.join(room(userId));

        const count = (socketCounts.get(userId) || 0) + 1;
        socketCounts.set(userId, count);

        if (count === 1) setPresence(userId, true);
        markPendingDelivered(userId);

        // ⌨️ Typing indicator — sender id comes from the verified token, never the client
        socket.on("typing", (data) => {
            const receiver = data?.receiver;
            if (!receiver || !mongoose.isValidObjectId(receiver)) return;

            emitToUser(receiver, "typing", {
                sender: userId,
                isTyping: !!data.isTyping,
            });
        });

        socket.on("disconnect", () => {
            const remaining = (socketCounts.get(userId) || 1) - 1;

            if (remaining <= 0) {
                socketCounts.delete(userId);
                setPresence(userId, false);
            } else {
                socketCounts.set(userId, remaining);
            }
        });
    });
};

module.exports = {
    socketInit,
    getIO,
    emitToUser,
    isUserOnline,
    getOnlineUserIds,
    disconnectUser,
};
