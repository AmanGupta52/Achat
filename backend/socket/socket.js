let ioInstance = null;

// userId -> socketId
const onlineUsers = new Map();

const socketInit = (io) => {
    ioInstance = io;

    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        /**
         * 👤 REGISTER USER
         */
        socket.on("register", (userId) => {
            if (!userId) return;

            onlineUsers.set(userId.toString(), socket.id);
            socket.userId = userId.toString();

            socket.emit("online_status", { status: "online" });
        });

        /**
         * 💬 SEND MESSAGE (REAL-TIME)
         */
        socket.on("send_message", (data) => {
            try {
                if (!data || !data.receiver) return;

                const receiverSocket = onlineUsers.get(
                    data.receiver.toString()
                );

                // -----------------------------
                // SEND TO RECEIVER
                // -----------------------------
                if (receiverSocket) {
                    io.to(receiverSocket).emit("receive_message", {
                        _id: data._id,
                        sender: data.sender,
                        receiver: data.receiver,
                        content: data.content,
                        createdAt: data.createdAt,
                        delivered: true,
                        read: false,
                    });

                    // -----------------------------
                    // NOTIFY SENDER (DELIVERED)
                    // -----------------------------
                    socket.emit("message_delivered", {
                        messageId: data._id,
                    });
                }

            } catch (err) {
                console.error("SOCKET SEND MESSAGE ERROR:", err);
            }
        });

        /**
         * 👁️ MESSAGE READ
         */
        socket.on("mark_read", (data) => {
            try {
                if (!data || !data.sender) return;

                const senderSocket = onlineUsers.get(
                    data.sender.toString()
                );

                if (senderSocket) {
                    io.to(senderSocket).emit("messages_read", {
                        senderId: data.sender,
                    });
                }

            } catch (err) {
                console.error("READ SOCKET ERROR:", err);
            }
        });

        /**
         * ⌨️ TYPING INDICATOR
         */
        socket.on("typing", (data) => {
            if (!data || !data.receiver) return;

            const socketId = onlineUsers.get(data.receiver.toString());

            if (socketId) {
                io.to(socketId).emit("typing", {
                    sender: data.sender,
                    isTyping: data.isTyping,
                });
            }
        });

        /**
         * ❌ DISCONNECT
         */
        socket.on("disconnect", () => {
            if (socket.userId) {
                onlineUsers.delete(socket.userId);
            }
            console.log("Socket disconnected:", socket.id);
        });
    });
};

/**
 * 🎯 SAFE EMIT
 */
const emitToUser = (io, userId, event, payload) => {
    const socketId = onlineUsers.get(userId.toString());

    if (socketId) {
        io.to(socketId).emit(event, payload);
    }
};

const getIO = () => {
    if (!ioInstance) {
        throw new Error("Socket.io not initialized");
    }
    return ioInstance;
};

module.exports = {
    socketInit,
    getIO,
    emitToUser,
};