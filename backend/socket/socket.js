const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Message = require("../models/Message");

let ioInstance = null;

const room = (userId) => `user:${userId}`;

const getIO = () => {
    if (!ioInstance) throw new Error("Socket.io not initialized");
    return ioInstance;
};

/**
 * Presence is derived from the sockets that actually exist (cluster-wide when the Redis
 * adapter is on), so it stays correct with several backend instances.
 */
const isUserOnline = async (userId) => {
    if (!ioInstance) return false;
    const sockets = await ioInstance.in(room(userId)).fetchSockets();
    return sockets.length > 0;
};

const getOnlineUserIds = async () => {
    if (!ioInstance) return [];
    const sockets = await ioInstance.fetchSockets();
    return [...new Set(sockets.map((s) => s.data.userId).filter(Boolean))];
};

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
            { returnDocument: "after" }
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
            socket.data.userId = socket.userId;
            next();
        } catch (err) {
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.userId;

        // ⚠️ Register every listener synchronously, BEFORE the first await. Events that arrive while
        // we are still awaiting (a typing event, or a very quick disconnect) would otherwise be lost,
        // which left people stuck "online".

        // ⌨️ Typing indicator — sender id comes from the verified token, never the client
        socket.on("typing", (data) => {
            const receiver = data?.receiver;
            if (!receiver || !mongoose.isValidObjectId(receiver)) return;

            emitToUser(receiver, "typing", {
                sender: userId,
                isTyping: !!data.isTyping,
            });
        });

        socket.on("disconnect", async () => {
            try {
                // the leaving socket is already out of its rooms here
                const remaining = await io.in(room(userId)).fetchSockets();
                if (remaining.length === 0) setPresence(userId, false);
            } catch (err) {
                console.error("DISCONNECT ERROR:", err.message);
            }
        });

        (async () => {
            try {
                await socket.join(room(userId));
                if (!socket.connected) return; // already gone again: the disconnect handler took care of it

                // first socket of this user (on any instance) → they just came online
                const sockets = await io.in(room(userId)).fetchSockets();
                if (sockets.length === 1) setPresence(userId, true);
                markPendingDelivered(userId);
            } catch (err) {
                console.error("CONNECTION SETUP ERROR:", err.message);
            }
        })();
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
