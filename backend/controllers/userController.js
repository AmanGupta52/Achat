const mongoose = require("mongoose");
const User = require("../models/User");
const Message = require("../models/Message");
const { decrypt } = require("../utils/crypto");
const { toListUser, escapeRegex } = require("../utils/sanitize");
const { emitToUser } = require("../socket/socket");

const toId = (id) => (id ? id.toString() : "");
const validId = (id) => mongoose.isValidObjectId(id);

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** Public fields we ever read for other users */
const LIST_FIELDS = "username email phone isOnline lastSeen isVerified createdAt";

/** Relationship of `me` to another user id. */
const statusFor = (me, otherId) => {
    const id = toId(otherId);
    if ((me.connections || []).some((x) => toId(x) === id)) return "connected";
    if ((me.connectionRequestsSent || []).some((x) => toId(x) === id)) return "sent";
    if ((me.connectionRequestsReceived || []).some((x) => toId(x) === id)) return "received";
    return "none";
};

/**
 * 🔍 SEARCH / DISCOVER USERS
 *
 *   GET /api/users?search=ali             → every verified user matching "ali"
 *   GET /api/users?filter=not_connected   → every user I'm NOT connected with
 *   GET /api/users?search=ali&filter=not_connected  → both
 *
 * Each result carries `status`: connected | sent | received | none.
 */
exports.searchUsers = async (req, res) => {
    try {
        const me = req.user;
        const search = String(req.query.search || "").trim().slice(0, 60);
        const onlyNotConnected = req.query.filter === "not_connected";
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

        const query = { _id: { $ne: me._id }, isVerified: true };

        if (onlyNotConnected) {
            query._id = { $nin: [me._id, ...(me.connections || [])] };
        }

        if (search) {
            // 🛡️ escape user input — raw input used to crash the server (e.g. "(")
            const rx = new RegExp(escapeRegex(search), "i");
            query.$or = [{ username: rx }, { email: rx }, { phone: rx }];
        }

        const users = await User.find(query)
            .select(LIST_FIELDS)
            .sort({ username: 1 })
            .limit(limit)
            .lean();

        const result = users.map((u) => toListUser(u, statusFor(me, u._id)));

        // Connected people first when searching everyone
        if (!onlyNotConnected) {
            const rank = { connected: 0, received: 1, sent: 2, none: 3 };
            result.sort((a, b) => rank[a.status] - rank[b.status]);
        }

        res.json(result);
    } catch (err) {
        console.error("SEARCH ERROR:", err);
        res.status(500).json({ message: "Error fetching users" });
    }
};

/**
 * 💬 MY CONNECTED ACCOUNTS (the "normal page" list)
 * Includes last message + unread count, newest conversation first.
 */
exports.getConnections = async (req, res) => {
    try {
        const me = req.user;
        const connectionIds = me.connections || [];

        if (!connectionIds.length) return res.json([]);

        const [users, stats] = await Promise.all([
            User.find({ _id: { $in: connectionIds }, isVerified: true }).select(LIST_FIELDS).lean(),
            Message.aggregate([
                {
                    $match: {
                        $or: [
                            { sender: me._id, receiver: { $in: connectionIds } },
                            { receiver: me._id, sender: { $in: connectionIds } },
                        ],
                        deletedFor: { $ne: me._id }, // messages I deleted "for me" don't count
                    },
                },
                {
                    $addFields: {
                        other: { $cond: [{ $eq: ["$sender", me._id] }, "$receiver", "$sender"] },
                    },
                },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: "$other",
                        last: { $first: "$$ROOT" },
                        unread: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$receiver", me._id] },
                                            { $eq: ["$read", false] },
                                            { $ne: ["$deletedForEveryone", true] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },
            ]),
        ]);

        const byUser = new Map(stats.map((s) => [toId(s._id), s]));

        const result = users.map((u) => {
            const s = byUser.get(toId(u._id));
            return {
                ...toListUser(u, "connected"),
                unreadCount: s?.unread || 0,
                lastMessage: s
                    ? s.last.deletedForEveryone
                        ? "🚫 This message was deleted"
                        : decrypt(s.last.content).slice(0, 120)
                    : null,
                lastMessageAt: s ? s.last.createdAt : null,
                lastMessageFromMe: s ? toId(s.last.sender) === toId(me._id) : false,
            };
        });

        // Conversations with messages first (newest on top), then the rest A-Z
        result.sort((a, b) => {
            if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
            if (a.lastMessageAt) return -1;
            if (b.lastMessageAt) return 1;
            return a.username.localeCompare(b.username);
        });

        res.json(result);
    } catch (err) {
        console.error("CONNECTIONS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch connections" });
    }
};

/**
 * 📥 PENDING REQUESTS (received + sent, as full user objects)
 */
exports.getRequests = async (req, res) => {
    try {
        const me = req.user;

        const [received, sent] = await Promise.all([
            User.find({ _id: { $in: me.connectionRequestsReceived || [] }, isVerified: true })
                .select(LIST_FIELDS)
                .lean(),
            User.find({ _id: { $in: me.connectionRequestsSent || [] }, isVerified: true })
                .select(LIST_FIELDS)
                .lean(),
        ]);

        res.json({
            received: received.map((u) => toListUser(u, "received")),
            sent: sent.map((u) => toListUser(u, "sent")),
        });
    } catch (err) {
        console.error("REQUESTS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch requests" });
    }
};

/**
 * 📊 RELATIONS (ids only — kept for backward compatibility)
 */
exports.getMyRelations = async (req, res) => {
    const me = req.user;
    res.json({
        connections: (me.connections || []).map(toId),
        connectionRequestsSent: (me.connectionRequestsSent || []).map(toId),
        connectionRequestsReceived: (me.connectionRequestsReceived || []).map(toId),
    });
};

/**
 * 👤 ONE USER (used by the chat header for fresh online / last-seen state)
 */
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!validId(id)) return res.status(400).json({ message: "Invalid user id" });

        const user = await User.findOne({ _id: id, isVerified: true }).select(LIST_FIELDS).lean();
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json(toListUser(user, statusFor(req.user, user._id)));
    } catch (err) {
        console.error("GET USER ERROR:", err);
        res.status(500).json({ message: "Failed to fetch user" });
    }
};

/**
 * 📤 SEND CONNECTION REQUEST
 */
exports.sendRequest = async (req, res) => {
    try {
        const me = req.user;
        const targetId = req.params.id;

        if (!validId(targetId)) return res.status(400).json({ message: "Invalid user id" });
        if (toId(me._id) === targetId) {
            return res.status(400).json({ message: "You cannot connect with yourself" });
        }

        const target = await User.findOne({ _id: targetId, isVerified: true }).select("_id");
        if (!target) return res.status(404).json({ message: "User not found" });

        const status = statusFor(me, targetId);
        if (status === "connected") return res.status(400).json({ message: "Already connected" });
        if (status === "sent") return res.status(400).json({ message: "Request already sent" });
        if (status === "received") {
            return res.status(400).json({ message: "This user already sent you a request — accept it instead" });
        }

        await Promise.all([
            User.updateOne({ _id: me._id }, { $addToSet: { connectionRequestsSent: target._id } }),
            User.updateOne({ _id: target._id }, { $addToSet: { connectionRequestsReceived: me._id } }),
        ]);

        emitToUser(target._id, "request_received", { from: toId(me._id) });

        res.json({ message: "Request sent" });
    } catch (err) {
        console.error("SEND REQUEST ERROR:", err);
        res.status(500).json({ message: "Failed to send request" });
    }
};

/**
 * ↩️ CANCEL A REQUEST I SENT
 */
exports.cancelRequest = async (req, res) => {
    try {
        const me = req.user;
        const targetId = req.params.id;
        if (!validId(targetId)) return res.status(400).json({ message: "Invalid user id" });

        await Promise.all([
            User.updateOne({ _id: me._id }, { $pull: { connectionRequestsSent: targetId } }),
            User.updateOne({ _id: targetId }, { $pull: { connectionRequestsReceived: me._id } }),
        ]);

        emitToUser(targetId, "request_rejected", { from: toId(me._id) });

        res.json({ message: "Request cancelled" });
    } catch (err) {
        console.error("CANCEL REQUEST ERROR:", err);
        res.status(500).json({ message: "Failed to cancel request" });
    }
};

/**
 * ✅ ACCEPT REQUEST
 */
exports.acceptRequest = async (req, res) => {
    try {
        const me = req.user;
        const senderId = req.params.id;
        if (!validId(senderId)) return res.status(400).json({ message: "Invalid user id" });

        if (statusFor(me, senderId) !== "received") {
            return res.status(400).json({ message: "No request found" });
        }

        await Promise.all([
            User.updateOne(
                { _id: me._id },
                { $pull: { connectionRequestsReceived: senderId }, $addToSet: { connections: senderId } }
            ),
            User.updateOne(
                { _id: senderId },
                { $pull: { connectionRequestsSent: me._id }, $addToSet: { connections: me._id } }
            ),
        ]);

        emitToUser(senderId, "request_accepted", { by: toId(me._id) });

        res.json({ message: "Connected successfully" });
    } catch (err) {
        console.error("ACCEPT ERROR:", err);
        res.status(500).json({ message: "Accept failed" });
    }
};

/**
 * ❌ REJECT REQUEST
 */
exports.rejectRequest = async (req, res) => {
    try {
        const me = req.user;
        const senderId = req.params.id;
        if (!validId(senderId)) return res.status(400).json({ message: "Invalid user id" });

        await Promise.all([
            User.updateOne({ _id: me._id }, { $pull: { connectionRequestsReceived: senderId } }),
            User.updateOne({ _id: senderId }, { $pull: { connectionRequestsSent: me._id } }),
        ]);

        emitToUser(senderId, "request_rejected", { by: toId(me._id) });

        res.json({ message: "Request rejected" });
    } catch (err) {
        console.error("REJECT ERROR:", err);
        res.status(500).json({ message: "Reject failed" });
    }
};

/**
 * 🔌 DISCONNECT from a connected user (both sides are removed).
 * Chat history is kept, but nobody can open or send messages until they connect again.
 */
exports.removeConnection = async (req, res) => {
    try {
        const me = req.user;
        const otherId = req.params.id;
        if (!validId(otherId)) return res.status(400).json({ message: "Invalid user id" });

        if (statusFor(me, otherId) !== "connected") {
            return res.status(400).json({ message: "You are not connected with this user" });
        }

        await Promise.all([
            User.updateOne({ _id: me._id }, { $pull: { connections: otherId } }),
            User.updateOne({ _id: otherId }, { $pull: { connections: me._id } }),
        ]);

        // both people (and all their tabs) update their lists / close the chat
        emitToUser(otherId, "connection_removed", { userId: toId(me._id) });
        emitToUser(me._id, "connection_removed", { userId: toId(otherId) });

        res.json({ message: "Disconnected" });
    } catch (err) {
        console.error("DISCONNECT ERROR:", err);
        res.status(500).json({ message: "Failed to disconnect" });
    }
};
