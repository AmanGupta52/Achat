const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const { encrypt, decrypt } = require("../utils/crypto");
const { emitToUser, isUserOnline } = require("../socket/socket");

const MAX_LENGTH = 4000;
const HISTORY_LIMIT = 300;

const isConnectedWith = (userId, otherId) =>
    User.exists({ _id: userId, connections: otherId });

const toClientMessage = (msg, plainText) => ({
    _id: String(msg._id),
    sender: String(msg.sender),
    receiver: String(msg.receiver),
    // never leak the text of a message that was deleted for everyone
    content: msg.deletedForEveryone ? "" : plainText,
    deleted: !!msg.deletedForEveryone,
    delivered: msg.delivered,
    read: msg.read,
    createdAt: msg.createdAt,
});

/**
 * 📩 SEND MESSAGE
 * Saved encrypted, then pushed in real time by the SERVER (clients can't spoof senders).
 */
exports.sendMessage = async (req, res) => {
    try {
        const sender = req.user._id;
        const receiverId = req.body.receiverId;
        const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

        if (!receiverId || !mongoose.isValidObjectId(receiverId) || !content) {
            return res.status(400).json({ message: "Receiver and message are required" });
        }

        if (content.length > MAX_LENGTH) {
            return res.status(400).json({ message: `Message too long (max ${MAX_LENGTH} characters)` });
        }

        if (!(await isConnectedWith(sender, receiverId))) {
            return res.status(403).json({ message: "You can only message your connections" });
        }

        const encrypted = encrypt(content);
        if (!encrypted) {
            return res.status(500).json({ message: "Failed to encrypt message" });
        }

        const message = await Message.create({ sender, receiver: receiverId, content: encrypted });

        // Delivered = receiver has at least one live socket right now
        if (isUserOnline(receiverId)) {
            message.delivered = true;
            message.deliveredAt = new Date();
            await message.save();
        }

        const payload = toClientMessage(message, content);

        emitToUser(receiverId, "receive_message", payload);
        emitToUser(sender, "message_sent", payload); // keeps the sender's other tabs in sync

        return res.status(200).json(payload);
    } catch (err) {
        console.error("SEND MESSAGE ERROR:", err);
        return res.status(500).json({ message: "Failed to send message" });
    }
};

/**
 * 📜 CHAT HISTORY (decrypted, latest HISTORY_LIMIT messages)
 */
exports.getMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const { userId: otherUserId } = req.params;

        if (!mongoose.isValidObjectId(otherUserId)) {
            return res.status(400).json({ message: "Invalid user id" });
        }

        if (!(await isConnectedWith(userId, otherUserId))) {
            return res.status(403).json({ message: "You are not connected with this user" });
        }

        const latest = await Message.find({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId },
            ],
            deletedFor: { $ne: userId }, // hide what I deleted "for me"
        })
            .sort({ createdAt: -1 })
            .limit(HISTORY_LIMIT);

        const messages = latest.reverse();

        // Opening the chat means everything sent to me has been delivered
        const undelivered = messages.filter(
            (m) => String(m.receiver) === String(userId) && !m.delivered
        );

        if (undelivered.length) {
            await Message.updateMany(
                { _id: { $in: undelivered.map((m) => m._id) } },
                { $set: { delivered: true, deliveredAt: new Date() } }
            );
            undelivered.forEach((m) => {
                m.delivered = true;
                emitToUser(m.sender, "message_delivered", { messageId: String(m._id) });
            });
        }

        return res.status(200).json(
            messages.map((m) => toClientMessage(m, m.deletedForEveryone ? "" : decrypt(m.content)))
        );
    } catch (err) {
        console.error("GET MESSAGES ERROR:", err);
        return res.status(500).json({ message: "Failed to fetch messages" });
    }
};

/**
 * 👁️ MARK MESSAGES FROM :userId AS READ
 */
exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user._id;
        const { userId: otherUserId } = req.params;

        if (!mongoose.isValidObjectId(otherUserId)) {
            return res.status(400).json({ message: "Invalid user id" });
        }

        const result = await Message.updateMany(
            { sender: otherUserId, receiver: userId, read: false },
            { $set: { read: true, readAt: new Date(), delivered: true } }
        );

        // Tell the original sender so their ticks turn blue
        if (result.modifiedCount > 0) {
            emitToUser(otherUserId, "messages_read", { readerId: String(userId) });
        }

        return res.status(200).json({ message: "Messages marked as read" });
    } catch (err) {
        console.error("MARK READ ERROR:", err);
        return res.status(500).json({ message: "Failed to mark as read" });
    }
};

/**
 * 🗑️ DELETE A MESSAGE
 *   DELETE /api/chat/message/:id?scope=me        → remove it from MY view only (sender or receiver)
 *   DELETE /api/chat/message/:id?scope=everyone  → erase it for both people (sender only)
 */
exports.deleteMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const scope = req.query.scope === "everyone" ? "everyone" : "me";

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid message id" });
        }

        const message = await Message.findById(id);

        // Only the two people in the conversation may touch it
        const isSender = String(message?.sender) === String(userId);
        const isReceiver = String(message?.receiver) === String(userId);
        if (!message || (!isSender && !isReceiver)) {
            return res.status(404).json({ message: "Message not found" });
        }

        const otherId = isSender ? message.receiver : message.sender;

        if (scope === "everyone") {
            if (!isSender) {
                return res.status(403).json({ message: "You can only delete your own messages for everyone" });
            }

            if (!message.deletedForEveryone) {
                // overwrite the stored ciphertext so the original text is really gone
                await Message.updateOne(
                    { _id: message._id },
                    {
                        $set: {
                            deletedForEveryone: true,
                            deletedAt: new Date(),
                            content: encrypt("This message was deleted"),
                        },
                    }
                );
            }

            const payload = { messageId: String(message._id), scope: "everyone", by: String(userId) };
            emitToUser(otherId, "message_deleted", payload);
            emitToUser(userId, "message_deleted", payload);
        } else {
            await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: userId } });

            // only my own tabs need to know
            emitToUser(userId, "message_deleted", { messageId: String(message._id), scope: "me", by: String(userId) });
        }

        return res.status(200).json({ message: "Message deleted", scope });
    } catch (err) {
        console.error("DELETE MESSAGE ERROR:", err);
        return res.status(500).json({ message: "Failed to delete message" });
    }
};
