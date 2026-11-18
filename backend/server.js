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

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const User = require("./models/User");
const { socketInit, getOnlineUserIds } = require("./socket/socket");

const app = express();
const server = http.createServer(app);

const CLIENT_URLS = (process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);

// ---------------------------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------------------------
app.use(cors({ origin: CLIENT_URLS, credentials: true }));
app.use(express.json({ limit: "100kb" }));

// ---------------------------------------------------------------------------
// SOCKET.IO
// ---------------------------------------------------------------------------
const io = new Server(server, {
    cors: { origin: CLIENT_URLS, methods: ["GET", "POST"], credentials: true },
});
socketInit(io);

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/users", require("./routes/userRoutes"));

app.get("/health", (req, res) => res.json({ status: "ok" }));

// 404 + error handlers (always JSON, never an HTML stack trace)
app.use((req, res) => res.status(404).json({ message: "Route not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("UNHANDLED ERROR:", err);
    res.status(err.status || 500).json({ message: err.status ? err.message : "Something went wrong" });
});

// ---------------------------------------------------------------------------
// STALE-PRESENCE CLEANUP
// Users with no live socket and no heartbeat for 2 minutes are marked offline.
// ---------------------------------------------------------------------------
const startPresenceCleanup = () => {
    setInterval(async () => {
        try {
            const cutoff = new Date(Date.now() - 2 * 60 * 1000);
            await User.updateMany(
                { isOnline: true, lastSeen: { $lt: cutoff }, _id: { $nin: getOnlineUserIds() } },
                { $set: { isOnline: false } }
            );
        } catch (err) {
            console.error("Presence cleanup error:", err.message);
        }
    }, 60 * 1000).unref();
};

// ---------------------------------------------------------------------------
// START (only after the database is ready)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    startPresenceCleanup();
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
