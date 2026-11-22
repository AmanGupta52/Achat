require("dotenv").config();

// ---------------------------------------------------------------------------
// Fail fast with a clear message instead of crashing later with a cryptic one
// ---------------------------------------------------------------------------
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET", "MESSAGE_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);

if (missing.length) {
    console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
    console.error("   Copy backend/.env.example to backend/.env and fill it in.");
    process.exit(1);
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.MESSAGE_SECRET)) {
    console.error("❌ MESSAGE_SECRET must be 64 hex characters (32 bytes).");
    console.error('   Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

const createApp = require("./app");
const connectDB = require("./config/db");
const User = require("./models/User");
const { getOnlineUserIds } = require("./socket/socket");
const { attachSocketAdapter } = require("./utils/redis");
const startKeepAlive = require("./utils/keepAlive");
const mailer = require("./utils/mailer");
const googleApp = require("./controllers/googleAppController");
const { renameDefaultAbout } = require("./utils/migrations");

const { server, io } = createApp();

// ---------------------------------------------------------------------------
// STALE-PRESENCE CLEANUP
// Users with no live socket and no heartbeat for 2 minutes are marked offline.
// ---------------------------------------------------------------------------
const startPresenceCleanup = () => {
    setInterval(async () => {
        try {
            const cutoff = new Date(Date.now() - 2 * 60 * 1000);
            await User.updateMany(
                { isOnline: true, lastSeen: { $lt: cutoff }, _id: { $nin: await getOnlineUserIds() } },
                { $set: { isOnline: false } }
            );
        } catch (err) {
            console.error("Presence cleanup error:", err.message);
        }
    }, 60 * 1000).unref();
};

// ---------------------------------------------------------------------------
// START (only after the database — and Redis, if configured — are ready)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

(async () => {
    await connectDB();
    await attachSocketAdapter(io);

    // one-time data fix after the rename to "Achat" (idempotent)
    renameDefaultAbout()
        .then((n) => n && console.log(`✏️  Updated the default About text of ${n} existing account(s) to "Achat"`))
        .catch((err) => console.error("Migration error:", err.message));

    // tell the person running the server what is (not) configured
    if (!mailer.isConfigured()) {
        console.warn(
            process.env.NODE_ENV === "production"
                ? "❌ EmailJS is NOT configured: sign-up and password-reset emails will fail. Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY (see backend/emailjs/README.md)."
                : "ℹ️  EmailJS is not configured — emails (and their codes) will be printed in this terminal instead of being sent."
        );
    }
    if (process.env.GOOGLE_CLIENT_ID && !googleApp.isConfigured()) {
        console.warn("ℹ️  GOOGLE_CLIENT_SECRET is not set: Google sign-in works on the website but not in the Android app.");
    }

    startPresenceCleanup();
    startKeepAlive();

    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})().catch((err) => {
    console.error("❌ Failed to start:", err);
    process.exit(1);
});

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
