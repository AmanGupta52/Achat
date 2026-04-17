const crypto = require("crypto");

// -----------------------------
// CONFIG
// -----------------------------
const ALGORITHM = "aes-256-gcm";
const SECRET = process.env.MESSAGE_SECRET;

// -----------------------------
// VALIDATION
// -----------------------------
if (!SECRET || SECRET.length !== 64) {
    throw new Error(
        "MESSAGE_SECRET must be 32 bytes (64 hex characters)"
    );
}

const KEY = Buffer.from(SECRET, "hex");

// -----------------------------
// 🔐 ENCRYPT
// -----------------------------
const encrypt = (text) => {
    try {
        if (!text) return null;

        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");

        const tag = cipher.getAuthTag();

        return {
            iv: iv.toString("hex"),
            data: encrypted,
            tag: tag.toString("hex"),
        };

    } catch (err) {
        console.error("ENCRYPT ERROR:", err);
        return null;
    }
};

// -----------------------------
// 🔓 DECRYPT
// -----------------------------
const decrypt = (content) => {
    try {
        if (!content || !content.iv || !content.data || !content.tag) {
            return "";
        }

        const iv = Buffer.from(content.iv, "hex");
        const tag = Buffer.from(content.tag, "hex");

        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            KEY,
            iv
        );

        decipher.setAuthTag(tag);

        let decrypted = decipher.update(content.data, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;

    } catch (err) {
        console.error("DECRYPT ERROR:", err);
        return "";
    }
};

module.exports = {
    encrypt,
    decrypt,
};