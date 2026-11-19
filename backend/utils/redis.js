/**
 * Optional Redis. Set REDIS_URL to run several backend instances:
 *  - Socket.io broadcasts reach users connected to ANY instance
 *  - the rate limiter is shared between instances
 * Without REDIS_URL everything works in a single process, exactly as before.
 */
const { createClient } = require("redis");

let client = null;

const enabled = () => !!process.env.REDIS_URL;

/** Shared general-purpose client (used by the rate limiter). */
const getClient = async () => {
    if (!enabled()) return null;
    if (!client) {
        client = createClient({ url: process.env.REDIS_URL });
        client.on("error", (err) => console.error("Redis error:", err.message));
        await client.connect();
    }
    return client;
};

/** Attach the Redis adapter to a Socket.io server. */
const attachSocketAdapter = async (io) => {
    if (!enabled()) return false;

    const { createAdapter } = require("@socket.io/redis-adapter");
    const pub = createClient({ url: process.env.REDIS_URL });
    const sub = pub.duplicate();
    pub.on("error", (err) => console.error("Redis pub error:", err.message));
    sub.on("error", (err) => console.error("Redis sub error:", err.message));
    await Promise.all([pub.connect(), sub.connect()]);

    io.adapter(createAdapter(pub, sub));
    console.log("🔗 Socket.io Redis adapter enabled");
    return true;
};

const closeAll = async () => {
    if (client) {
        await client.quit().catch(() => {});
        client = null;
    }
};

module.exports = { enabled, getClient, attachSocketAdapter, closeAll };
