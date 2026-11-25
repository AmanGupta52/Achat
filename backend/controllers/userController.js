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
const LIST_FIELDS = "username email phone about avatarVersion isOnline lastSeen isVerified createdAt";

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
        const skip = Math.min(Math.max(parseInt(req.query.skip, 10) || 0, 0), 10000); // for "Show more"

        // never list myself, people I blocked, or people who blocked me
        const excluded = [me._id, ...(me.blocked || [])];
        if (onlyNotConnected) excluded.push(...(me.connections || []));

        const query = { _id: { $nin: excluded }, isVerified: true, blocked: { $ne: me._id } };

        if (search) {
            // 🛡️ escape user input — raw input used to crash the server (e.g. "(")
            const rx = new RegExp(escapeRegex(search), "i");
            query.$or = [{ username: rx }, { email: rx }, { phone: rx }];
        }

        const users = await User.find(query)
            .select(LIST_FIELDS)
            .sort({ username: 1, _id: 1 }) // _id makes the order stable, so pages never overlap
            .skip(skip)
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

        const user = await User.findOne({ _id: id, isVerified: true }).select(`${LIST_FIELDS} blocked`).lean();
        const blockedEitherWay =
            user && ((user.blocked || []).some((x) => toId(x) === toId(req.user._id)) ||
                (req.user.blocked || []).some((x) => toId(x) === id));
        if (!user || blockedEitherWay) return res.status(404).json({ message: "User not found" });

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

        const target = await User.findOne({ _id: targetId, isVerified: true }).select("_id blocked");

        // If they blocked me, behave exactly as if they didn't exist (don't reveal the block)
        if (!target || (target.blocked || []).some((x) => toId(x) === toId(me._id))) {
            return res.status(404).json({ message: "User not found" });
        }
        if ((me.blocked || []).some((x) => toId(x) === targetId)) {
            return res.status(400).json({ message: "Unblock this user first" });
        }

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

/**
 * 🚫 BLOCK A USER
 * Removes any connection / pending requests in both directions, and stops them from
 * finding you, sending you requests or messaging you. They are not told.
 */
exports.blockUser = async (req, res) => {
    try {
        const me = req.user;
        const targetId = req.params.id;

        if (!validId(targetId)) return res.status(400).json({ message: "Invalid user id" });
        if (toId(me._id) === targetId) return res.status(400).json({ message: "You cannot block yourself" });

        const target = await User.findById(targetId).select("_id");
        if (!target) return res.status(404).json({ message: "User not found" });

        const wipe = (other) => ({
            $pull: { connections: other, connectionRequestsSent: other, connectionRequestsReceived: other },
        });

        await Promise.all([
            User.updateOne({ _id: me._id }, { ...wipe(target._id), $addToSet: { blocked: target._id } }),
            User.updateOne({ _id: target._id }, wipe(me._id)),
        ]);

        // closes an open chat / refreshes lists on both sides
        emitToUser(target._id, "connection_removed", { userId: toId(me._id) });
        emitToUser(me._id, "connection_removed", { userId: toId(target._id) });

        res.json({ message: "User blocked" });
    } catch (err) {
        console.error("BLOCK ERROR:", err);
        res.status(500).json({ message: "Failed to block user" });
    }
};

/** ✅ UNBLOCK (does not restore the connection — they have to connect again) */
exports.unblockUser = async (req, res) => {
    try {
        const targetId = req.params.id;
        if (!validId(targetId)) return res.status(400).json({ message: "Invalid user id" });

        await User.updateOne({ _id: req.user._id }, { $pull: { blocked: targetId } });
        res.json({ message: "User unblocked" });
    } catch (err) {
        console.error("UNBLOCK ERROR:", err);
        res.status(500).json({ message: "Failed to unblock user" });
    }
};

/** 📋 PEOPLE I BLOCKED */
exports.getBlocked = async (req, res) => {
    try {
        const users = await User.find({ _id: { $in: req.user.blocked || [] } })
            .select("username avatarVersion")
            .sort({ username: 1 })
            .lean();

        res.json(users.map((u) => ({ _id: u._id, username: u.username, avatarVersion: u.avatarVersion || 0 })));
    } catch (err) {
        console.error("BLOCKED LIST ERROR:", err);
        res.status(500).json({ message: "Failed to fetch blocked users" });
    }
};

/**
 * 🖼️ AVATAR IMAGE (public — <img> tags can't send an Authorization header).
 * The URL carries ?v=<avatarVersion>, so browsers cache it for a year.
 */
exports.getAvatar = async (req, res) => {
    try {
        if (!validId(req.params.id)) return res.status(400).end();

        const user = await User.findById(req.params.id).select("+avatar");
        if (!user?.avatar?.data) return res.status(404).end();

        res.set({
            "Content-Type": user.avatar.contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            // helmet's default would stop the frontend (another origin) from showing the image
            "Cross-Origin-Resource-Policy": "cross-origin",
        });
        res.send(Buffer.from(user.avatar.data));
    } catch (err) {
        console.error("AVATAR ERROR:", err);
        res.status(500).end();
    }
};
