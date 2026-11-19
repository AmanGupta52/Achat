/**
 * Rate limiter. In-memory by default; automatically shared across instances when REDIS_URL is set.
 */
const redis = require("./redis");

const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 60 } = {}) => {
    const hits = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }, windowMs).unref();

    const tooMany = (res, retryAfterSec) => {
        res.set("Retry-After", Math.max(1, retryAfterSec));
        return res.status(429).json({ message: "Too many requests. Please try again later." });
    };

    return async (req, res, next) => {
        try {
            // ---- shared (Redis) ----
            const client = await redis.getClient();
            if (client) {
                const key = `rl:${req.ip}`;
                const count = await client.incr(key);
                if (count === 1) await client.pExpire(key, windowMs);
                if (count > max) return tooMany(res, Math.ceil((await client.pTTL(key)) / 1000));
                return next();
            }
        } catch (err) {
            console.error("Rate limiter Redis error (falling back to memory):", err.message);
        }

        // ---- in-memory ----
        const now = Date.now();
        let entry = hits.get(req.ip);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(req.ip, entry);
        }
        entry.count += 1;

        if (entry.count > max) return tooMany(res, Math.ceil((entry.resetAt - now) / 1000));
        next();
    };
};

module.exports = rateLimit;
