const User = require("../models/User");

/**
 * Utility helpers
 */
const toId = (id) => id?.toString();

const hasInArray = (arr, id) => {
    return (arr || []).some(x => toId(x) === toId(id));
};

/**
 * 🔍 SEARCH USERS
 */
exports.searchUsers = async (req, res) => {
    try {
        const search = req.query.search?.trim() || "";

        const currentUser = await User.findById(req.user.id)
            .select("connections connectionRequestsSent connectionRequestsReceived")
            .lean();

        if (!currentUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const connections = new Set((currentUser.connections || []).map(toId));
        const sent = new Set((currentUser.connectionRequestsSent || []).map(toId));
        const received = new Set((currentUser.connectionRequestsReceived || []).map(toId));

        const users = await User.find({
            _id: { $ne: req.user.id },
            $or: [
                { username: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
            ],
        })
            .select("-password")
            .lean();

        const result = users.map(user => {
            const uid = toId(user._id);

            return {
                ...user,
                isConnected: connections.has(uid),
                isRequested: sent.has(uid),
                isPending: received.has(uid),
            };
        });

        res.json(result);

    } catch (err) {
        console.error("SEARCH ERROR:", err);
        res.status(500).json({ message: "Error fetching users" });
    }
};

/**
 * 📊 GET MY RELATIONS
 */
exports.getMyRelations = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select("connections connectionRequestsSent connectionRequestsReceived")
            .lean();

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            connections: (user.connections || []).map(toId),
            connectionRequestsSent: (user.connectionRequestsSent || []).map(toId),
            connectionRequestsReceived: (user.connectionRequestsReceived || []).map(toId),
        });

    } catch (err) {
        console.error("RELATIONS ERROR:", err);
        res.status(500).json({ message: "Failed to fetch relations" });
    }
};

/**
 * 📤 SEND REQUEST
 */
exports.sendRequest = async (req, res) => {
    try {
        const userId = toId(req.user.id);
        const targetId = toId(req.params.id);

        if (userId === targetId) {
            return res.status(400).json({ message: "Cannot send request to yourself" });
        }

        const user = await User.findById(userId);
        const target = await User.findById(targetId);

        if (!user || !target) {
            return res.status(404).json({ message: "User not found" });
        }

        if (hasInArray(user.connections, targetId)) {
            return res.status(400).json({ message: "Already connected" });
        }

        if (hasInArray(user.connectionRequestsSent, targetId)) {
            return res.status(400).json({ message: "Request already sent" });
        }

        if (hasInArray(user.connectionRequestsReceived, targetId)) {
            return res.status(400).json({ message: "Already received request" });
        }

        user.connectionRequestsSent = user.connectionRequestsSent || [];
        target.connectionRequestsReceived = target.connectionRequestsReceived || [];

        user.connectionRequestsSent.push(targetId);
        target.connectionRequestsReceived.push(userId);

        await user.save();
        await target.save();

        res.json({ message: "Request sent" });

    } catch (err) {
        console.error("SEND REQUEST ERROR:", err);
        res.status(500).json({ message: "Failed to send request" });
    }
};

/**
 * ✅ ACCEPT REQUEST
 */
exports.acceptRequest = async (req, res) => {
    try {
        const userId = toId(req.user.id);
        const senderId = toId(req.params.id);

        const user = await User.findById(userId);
        const sender = await User.findById(senderId);

        if (!user || !sender) {
            return res.status(404).json({ message: "User not found" });
        }

        const hasRequest = hasInArray(user.connectionRequestsReceived, senderId);

        if (!hasRequest) {
            return res.status(400).json({ message: "No request found" });
        }

        user.connectionRequestsReceived = user.connectionRequestsReceived || [];
        sender.connectionRequestsSent = sender.connectionRequestsSent || [];
        user.connections = user.connections || [];
        sender.connections = sender.connections || [];

        user.connectionRequestsReceived = user.connectionRequestsReceived.filter(
            id => toId(id) !== senderId
        );

        sender.connectionRequestsSent = sender.connectionRequestsSent.filter(
            id => toId(id) !== userId
        );

        if (!hasInArray(user.connections, senderId)) {
            user.connections.push(senderId);
        }

        if (!hasInArray(sender.connections, userId)) {
            sender.connections.push(userId);
        }

        await user.save();
        await sender.save();

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
        const userId = toId(req.user.id);
        const senderId = toId(req.params.id);

        const user = await User.findById(userId);
        const sender = await User.findById(senderId);

        if (!user || !sender) {
            return res.status(404).json({ message: "User not found" });
        }

        user.connectionRequestsReceived = (user.connectionRequestsReceived || [])
            .filter(id => toId(id) !== senderId);

        sender.connectionRequestsSent = (sender.connectionRequestsSent || [])
            .filter(id => toId(id) !== userId);

        await user.save();
        await sender.save();

        res.json({ message: "Request rejected" });

    } catch (err) {
        console.error("REJECT ERROR:", err);
        res.status(500).json({ message: "Reject failed" });
    }
};