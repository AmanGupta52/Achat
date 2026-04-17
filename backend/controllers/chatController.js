const Message = require("../models/Message");
const { encrypt, decrypt } = require("../utils/crypto");

/**
 * 📩 SEND MESSAGE (encrypted + DB save + socket-ready)
 */
exports.sendMessage = async (req, res) => {
    try {
        const sender = req.user._id;
        const { receiverId, content } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ message: "Missing fields" });
        }

        const encryptedContent = encrypt(content);

        const message = await Message.create({
            sender,
            receiver: receiverId,
            content: encryptedContent,
        });

        // return plain message to sender
        return res.status(200).json({
            _id: message._id,
            sender: message.sender,
            receiver: message.receiver,
            content: content,
            delivered: message.delivered,
            read: message.read,
            createdAt: message.createdAt,
        });

    } catch (err) {
        console.error("SEND MESSAGE ERROR:", err);
        return res.status(500).json({ message: "Failed to send message" });
    }
};


/**
 * 📜 GET CHAT BETWEEN TWO USERS (decrypt + auto mark delivered)
 */
exports.getMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const { userId: otherUserId } = req.params;

        // -----------------------------
        // FETCH MESSAGES
        // -----------------------------
        let messages = await Message.find({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId },
            ],
        }).sort({ createdAt: 1 });

        // -----------------------------
        // AUTO MARK DELIVERED
        // (messages sent TO current user)
        // -----------------------------
        await Message.updateMany(
            {
                sender: otherUserId,
                receiver: userId,
                delivered: false,
            },
            {
                delivered: true,
                deliveredAt: new Date(),
            }
        );

        // -----------------------------
        // DECRYPT RESPONSE
        // -----------------------------
        const decryptedMessages = messages.map((msg) => ({
            _id: msg._id,
            sender: msg.sender,
            receiver: msg.receiver,
            content: decrypt(msg.content),
            delivered: msg.delivered,
            read: msg.read,
            createdAt: msg.createdAt,
        }));

        return res.status(200).json(decryptedMessages);

    } catch (err) {
        console.error("GET MESSAGES ERROR:", err);
        return res.status(500).json({ message: "Failed to fetch messages" });
    }
};


/**
 * 👁️ MARK MESSAGES AS READ
 */
exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user._id;
        const { userId: otherUserId } = req.params;

        // mark all messages from other user as read
        await Message.updateMany(
            {
                sender: otherUserId,
                receiver: userId,
                read: false,
            },
            {
                read: true,
                readAt: new Date(),
            }
        );

        return res.status(200).json({ message: "Messages marked as read" });

    } catch (err) {
        console.error("MARK READ ERROR:", err);
        return res.status(500).json({ message: "Failed to mark as read" });
    }
};