/**
 * Tiny in-memory rate limiter (no extra dependency).
 * Good enough for a single-instance deployment; use Redis-backed limiting if you scale out.
 */
const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 60 } = {}) => {
    const hits = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }, windowMs).unref();

    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        let entry = hits.get(key);

        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(key, entry);
        }

        entry.count += 1;

        if (entry.count > max) {
            res.set("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
            return res.status(429).json({ message: "Too many requests. Please try again later." });
        }
        next();
    };
};

module.exports = rateLimit;
