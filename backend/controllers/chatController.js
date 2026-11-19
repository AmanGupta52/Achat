const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/User");
const { encrypt, decrypt } = require("../utils/crypto");
const { emitToUser, isUserOnline } = require("../socket/socket");

const MAX_LENGTH = 4000;
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SEARCH_SCAN_LIMIT = 5000;
const SEARCH_MAX_RESULTS = 100;
const EDIT_WINDOW_MS = (Number(process.env.EDIT_WINDOW_MINUTES) || 15) * 60 * 1000;

// Quick reactions (one per person per message)
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const sameId = (a, b) => String(a) === String(b);
const isConnectedWith = (userId, otherId) => User.exists({ _id: userId, connections: otherId });

// ---------------------------------------------------------------------------
// serialisation
// ---------------------------------------------------------------------------

/** Preview of the message that was replied to (hides text that is no longer available). */
const toReplyPreview = (ref, viewerId) => {
    if (!ref) return null;
    const hidden =
        ref.deletedForEveryone || (viewerId && (ref.deletedFor || []).some((id) => sameId(id, viewerId)));
    return {
        _id: String(ref._id),
        sender: String(ref.sender),
        deleted: !!hidden,
        content: hidden ? "" : decrypt(ref.content).slice(0, 120),
    };
};

/** One query for all quoted messages of a page. */
const loadReplyMap = async (messages, viewerId) => {
    const ids = [...new Set(messages.map((m) => m.replyTo && String(m.replyTo)).filter(Boolean))];
    if (!ids.length) return new Map();

    const refs = await Message.find({ _id: { $in: ids } }).select("sender content deletedForEveryone deletedFor");
    return new Map(refs.map((r) => [String(r._id), toReplyPreview(r, viewerId)]));
};

const toClientMessage = (msg, reply = null) => {
    const deleted = !!msg.deletedForEveryone;
    return {
        _id: String(msg._id),
        sender: String(msg.sender),
        receiver: String(msg.receiver),
        // never leak the text of a message that was deleted for everyone
        content: deleted ? "" : decrypt(msg.content),
        deleted,
        edited: !!msg.editedAt,
        editableUntil: new Date(new Date(msg.createdAt).getTime() + EDIT_WINDOW_MS),
        delivered: msg.delivered,
        read: msg.read,
        createdAt: msg.createdAt,
        replyTo: deleted ? null : reply,
        reactions: deleted ? [] : (msg.reactions || []).map((r) => ({ userId: String(r.user), emoji: r.emoji })),
    };
};

/** Serialize one message including its quoted message (for realtime events). */
const serialize = async (msg, viewerId = null) => {
    let reply = null;
    if (msg.replyTo) {
        const ref = await Message.findById(msg.replyTo).select("sender content deletedForEveryone deletedFor");
        reply = toReplyPreview(ref, viewerId);
    }
    return toClientMessage(msg, reply);
};

/** Find a message the current user is a participant of. */
const findMyMessage = async (id, userId) => {
    if (!mongoose.isValidObjectId(id)) return { error: { status: 400, message: "Invalid message id" } };

    const message = await Message.findById(id);
    if (!message || (!sameId(message.sender, userId) && !sameId(message.receiver, userId))) {
        return { error: { status: 404, message: "Message not found" } };
    }
    return { message, otherId: sameId(message.sender, userId) ? message.receiver : message.sender };
};

// ---------------------------------------------------------------------------
// SEND
// ---------------------------------------------------------------------------
/**
 * 📩 SEND MESSAGE (optionally as a reply)
 * Saved encrypted, then pushed in real time by the SERVER (clients can't spoof senders).
 */
exports.sendMessage = async (req, res) => {
    try {
        const sender = req.user._id;
        const { receiverId, replyToId } = req.body;
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

        // a reply must quote a message from THIS conversation
        let replyTo = null;
        if (replyToId) {
            if (!mongoose.isValidObjectId(replyToId)) {
                return res.status(400).json({ message: "Invalid reply target" });
            }
            const ref = await Message.findOne({
                _id: replyToId,
                $or: [
                    { sender, receiver: receiverId },
                    { sender: receiverId, receiver: sender },
                ],
            }).select("_id");
            if (!ref) return res.status(400).json({ message: "The message you replied to no longer exists" });
            replyTo = ref._id;
        }

        const encrypted = encrypt(content);
        if (!encrypted) return res.status(500).json({ message: "Failed to encrypt message" });

        const message = await Message.create({ sender, receiver: receiverId, content: encrypted, replyTo });

        // Delivered = receiver has at least one live socket right now
        if (await isUserOnline(receiverId)) {
            message.delivered = true;
            message.deliveredAt = new Date();
            await message.save();
        }

        const payload = await serialize(message);

        emitToUser(receiverId, "receive_message", payload);
        emitToUser(sender, "message_sent", payload); // keeps the sender's other tabs in sync

        return res.status(200).json(payload);
    } catch (err) {
        console.error("SEND MESSAGE ERROR:", err);
        return res.status(500).json({ message: "Failed to send message" });
    }
};

// ---------------------------------------------------------------------------
// HISTORY (paginated)
// ---------------------------------------------------------------------------
/**
 * 📜 CHAT HISTORY — newest page first, then older pages on demand
 *   GET /api/chat/:userId?limit=50&before=<messageId>
 *   → { messages: [...oldest→newest], hasMore }
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

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || PAGE_SIZE, 1), MAX_PAGE_SIZE);

        const query = {
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId },
            ],
            deletedFor: { $ne: userId }, // hide what I deleted "for me"
        };

        if (req.query.before) {
            if (!mongoose.isValidObjectId(req.query.before)) {
                return res.status(400).json({ message: "Invalid cursor" });
            }
            query._id = { $lt: req.query.before };
        }

        const found = await Message.find(query).sort({ _id: -1 }).limit(limit + 1);
        const hasMore = found.length > limit;
        const messages = found.slice(0, limit).reverse();

        // Opening the chat means everything sent to me has been delivered
        const undelivered = messages.filter((m) => sameId(m.receiver, userId) && !m.delivered);
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

        const replies = await loadReplyMap(messages, userId);

        return res.status(200).json({
            messages: messages.map((m) => toClientMessage(m, m.replyTo ? replies.get(String(m.replyTo)) || null : null)),
            hasMore,
        });
    } catch (err) {
        console.error("GET MESSAGES ERROR:", err);
        return res.status(500).json({ message: "Failed to fetch messages" });
    }
};

// ---------------------------------------------------------------------------
// SEARCH INSIDE A CHAT
// ---------------------------------------------------------------------------
/**
 * 🔎 GET /api/chat/:userId/search?q=hello
 * Messages are encrypted at rest, so they are decrypted here and matched in memory
 * (newest SEARCH_SCAN_LIMIT messages of this conversation). Returns newest first.
 */
exports.searchMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const { userId: otherUserId } = req.params;
        const q = String(req.query.q || "").trim().toLowerCase();

        if (!mongoose.isValidObjectId(otherUserId)) {
            return res.status(400).json({ message: "Invalid user id" });
        }
        if (!(await isConnectedWith(userId, otherUserId))) {
            return res.status(403).json({ message: "You are not connected with this user" });
        }
        if (q.length < 2) return res.json({ results: [], truncated: false });

        const candidates = await Message.find({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId },
            ],
            deletedFor: { $ne: userId },
            deletedForEveryone: { $ne: true },
        })
            .sort({ _id: -1 })
            .limit(SEARCH_SCAN_LIMIT)
            .select("sender content createdAt")
            .lean();

        const results = [];
        for (const m of candidates) {
            const text = decrypt(m.content);
            const idx = text.toLowerCase().indexOf(q);
            if (idx === -1) continue;

            const start = Math.max(0, idx - 30);
            results.push({
                _id: String(m._id),
                sender: String(m.sender),
                createdAt: m.createdAt,
                snippet: `${start > 0 ? "…" : ""}${text.slice(start, idx + q.length + 60)}`,
            });
            if (results.length >= SEARCH_MAX_RESULTS) break;
        }

        return res.json({ results, truncated: results.length >= SEARCH_MAX_RESULTS });
    } catch (err) {
        console.error("SEARCH MESSAGES ERROR:", err);
        return res.status(500).json({ message: "Search failed" });
    }
};

// ---------------------------------------------------------------------------
// READ RECEIPTS
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// EDIT
// ---------------------------------------------------------------------------
/**
 * ✏️ EDIT YOUR OWN MESSAGE (within EDIT_WINDOW_MINUTES, default 15)
 *   PUT /api/chat/message/:id   { content }
 */
exports.editMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

        const { message, otherId, error } = await findMyMessage(req.params.id, userId);
        if (error) return res.status(error.status).json({ message: error.message });

        if (!sameId(message.sender, userId)) {
            return res.status(403).json({ message: "You can only edit your own messages" });
        }
        if (message.deletedForEveryone) {
            return res.status(400).json({ message: "A deleted message can't be edited" });
        }
        if (!content) return res.status(400).json({ message: "Message can't be empty" });
        if (content.length > MAX_LENGTH) {
            return res.status(400).json({ message: `Message too long (max ${MAX_LENGTH} characters)` });
        }
        if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
            const minutes = Math.round(EDIT_WINDOW_MS / 60000);
            return res.status(403).json({ message: `Messages can only be edited within ${minutes} minutes` });
        }
        if (!(await isConnectedWith(userId, otherId))) {
            return res.status(403).json({ message: "You are not connected with this user" });
        }

        message.content = encrypt(content);
        message.editedAt = new Date();
        await message.save();

        const payload = await serialize(message);
        emitToUser(otherId, "message_edited", payload);
        emitToUser(userId, "message_edited", payload);

        return res.status(200).json(payload);
    } catch (err) {
        console.error("EDIT MESSAGE ERROR:", err);
        return res.status(500).json({ message: "Failed to edit message" });
    }
};

// ---------------------------------------------------------------------------
// REACTIONS
// ---------------------------------------------------------------------------
/**
 * 😀 REACT TO A MESSAGE (one reaction per person; send emoji = null to remove yours)
 *   PUT /api/chat/message/:id/reaction   { emoji }
 */
exports.reactToMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const emoji = req.body.emoji || null;

        if (emoji !== null && !REACTION_EMOJIS.includes(emoji)) {
            return res.status(400).json({ message: "Unsupported reaction" });
        }

        const { message, otherId, error } = await findMyMessage(req.params.id, userId);
        if (error) return res.status(error.status).json({ message: error.message });

        if (message.deletedForEveryone) {
            return res.status(400).json({ message: "You can't react to a deleted message" });
        }
        if (!(await isConnectedWith(userId, otherId))) {
            return res.status(403).json({ message: "You are not connected with this user" });
        }

        // atomic: drop my previous reaction, then add the new one (if any)
        await Message.updateOne({ _id: message._id }, [
            {
                $set: {
                    reactions: {
                        $concatArrays: [
                            {
                                $filter: {
                                    input: { $ifNull: ["$reactions", []] },
                                    cond: { $ne: ["$$this.user", userId] },
                                },
                            },
                            emoji ? [{ user: userId, emoji }] : [],
                        ],
                    },
                },
            },
        ], { updatePipeline: true });

        const fresh = await Message.findById(message._id);
        const payload = {
            messageId: String(fresh._id),
            reactions: (fresh.reactions || []).map((r) => ({ userId: String(r.user), emoji: r.emoji })),
        };

        emitToUser(otherId, "message_reaction", payload);
        emitToUser(userId, "message_reaction", payload);

        return res.status(200).json(payload);
    } catch (err) {
        console.error("REACTION ERROR:", err);
        return res.status(500).json({ message: "Failed to react" });
    }
};

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
/**
 * 🗑️ DELETE A MESSAGE
 *   DELETE /api/chat/message/:id?scope=me        → remove it from MY view only (sender or receiver)
 *   DELETE /api/chat/message/:id?scope=everyone  → erase it for both people (sender only)
 */
exports.deleteMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const scope = req.query.scope === "everyone" ? "everyone" : "me";

        const { message, otherId, error } = await findMyMessage(req.params.id, userId);
        if (error) return res.status(error.status).json({ message: error.message });

        if (scope === "everyone") {
            if (!sameId(message.sender, userId)) {
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
                            reactions: [],
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

exports.REACTION_EMOJIS = REACTION_EMOJIS;
