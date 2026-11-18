/**
 * Helpers that decide exactly which user fields may leave the server.
 * Never send a raw mongoose document to a client.
 */

const maskEmail = (email) => {
    if (!email || !email.includes("@")) return null;
    const [name, domain] = email.split("@");
    return `${name.charAt(0)}${"*".repeat(Math.min(Math.max(name.length - 1, 2), 5))}@${domain}`;
};

const maskPhone = (phone) => {
    if (!phone) return null;
    const s = String(phone);
    if (s.length <= 4) return "*".repeat(s.length);
    return `${"*".repeat(s.length - 4)}${s.slice(-4)}`;
};

/** The logged-in user's own profile. */
const toSelfUser = (u) => ({
    _id: u._id,
    username: u.username,
    email: u.email || null,
    phone: u.phone || null,
    authProvider: u.authProvider,
    isVerified: u.isVerified,
    isOnline: u.isOnline,
    lastSeen: u.lastSeen,
    createdAt: u.createdAt,
});

/**
 * Another user as shown in lists.
 * status: "connected" | "sent" | "received" | "none"
 * Contact details are only revealed for connected users.
 */
const toListUser = (u, status = "none") => {
    const connected = status === "connected";
    return {
        _id: u._id,
        username: u.username,
        email: connected ? u.email || null : maskEmail(u.email),
        phone: connected ? u.phone || null : maskPhone(u.phone),
        isOnline: !!u.isOnline,
        lastSeen: u.lastSeen,
        joinedAt: u.createdAt || null,
        status,
    };
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = { toSelfUser, toListUser, maskEmail, maskPhone, escapeRegex };
