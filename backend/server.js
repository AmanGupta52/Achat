require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");

const connectDB = require("./config/db");
const { socketInit } = require("./socket/socket");

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
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

/**
 * 🚀 START SERVER
 */
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});