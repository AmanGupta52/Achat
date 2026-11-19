/**
 * Render's free tier puts the service to sleep after ~15 minutes without incoming traffic
 * (and the first request afterwards takes 30–60 s). While the service is awake, pinging
 * its own public URL counts as traffic and keeps it awake.
 *
 *  - On Render, RENDER_EXTERNAL_URL is set automatically → works with zero config.
 *  - Elsewhere set KEEP_ALIVE_URL, or set KEEP_ALIVE=false to disable.
 *
 * To also wake it up after a full sleep, add a free UptimeRobot monitor that calls /health every 5 min.
 */
const startKeepAlive = () => {
    const base = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!base || process.env.KEEP_ALIVE === "false" || process.env.NODE_ENV === "test") return null;

    const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS) || 10 * 60 * 1000; // < Render's 15 min
    const url = `${base.replace(/\/$/, "")}/health`;

    const timer = setInterval(async () => {
        try {
            const res = await fetch(url);
            if (!res.ok) console.warn(`Keep-alive ping returned ${res.status}`);
        } catch (err) {
            console.warn("Keep-alive ping failed:", err.message);
        }
    }, intervalMs);

    timer.unref();
    console.log(`⏰ Keep-alive ping every ${Math.round(intervalMs / 60000)} min → ${url}`);
    return timer;
};

module.exports = startKeepAlive;
