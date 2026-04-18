require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");

const connectDB = require("./config/db");
const { socketInit } = require("./socket/socket");

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const User = require("./models/User"); 
/**
 * 🔌 SOCKET INIT
 */
const io = require("socket.io")(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
});

/**
 * 🗄️ DATABASE
 */
connectDB();

/**
 * ⚡ SOCKET START (IMPORTANT ORDER)
 */
socketInit(io);

/**
 * 🌐 MIDDLEWARE
 */
app.use(cors({
    origin: CLIENT_URL,
    credentials: true
}));

app.use(express.json());

/**
 * 📦 ROUTES
 */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api/users", require("./routes/userRoutes"));

/**
 * 🧠 HEALTH CHECK (GOOD PRACTICE)
 */
app.get("/health", (req, res) => {
    res.json({ status: "ok", socket: !!io });
});

// ✅ AUTO OFFLINE CRON — after DB connected
setInterval(async () => {
    try {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        await User.updateMany(
            { isOnline: true, lastSeen: { $lt: twoMinutesAgo } },
            { $set: { isOnline: false } }
        );
        console.log("🔄 Online status cleaned up");
    } catch (err) {
        console.error("Cleanup error:", err);
    }
}, 2 * 60 * 1000);


/**
 * 🚀 START SERVER
 */
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});