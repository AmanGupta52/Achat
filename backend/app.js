/**
 * Builds the Express app + Socket.io server WITHOUT starting anything,
 * so tests can run it in-process on a random port.
 */
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");

const { socketInit } = require("./socket/socket");

const createApp = () => {
    const app = express();
    const server = http.createServer(app);

    const CLIENT_URLS = (process.env.CLIENT_URL || "http://localhost:5173")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);

    // ---------------------------------------------------------------------
    // MIDDLEWARE
    // ---------------------------------------------------------------------
    app.use(helmet()); // security headers (nosniff, HSTS, frameguard, …)
    app.use(cors({ origin: CLIENT_URLS, credentials: true }));
    app.use(express.json({ limit: "400kb" })); // avatars are ≤200 KB (+ base64 overhead)

    // ---------------------------------------------------------------------
    // SOCKET.IO
    // ---------------------------------------------------------------------
    const io = new Server(server, {
        cors: { origin: CLIENT_URLS, methods: ["GET", "POST"], credentials: true },
    });
    socketInit(io);

    // ---------------------------------------------------------------------
    // ROUTES
    // ---------------------------------------------------------------------
    app.use("/api/auth", require("./routes/authRoutes"));
    app.use("/api/chat", require("./routes/chatRoutes"));
    app.use("/api/users", require("./routes/userRoutes"));

    app.get("/health", (req, res) => res.json({ status: "ok" }));

    // 404 + error handlers (always JSON, never an HTML stack trace)
    app.use((req, res) => res.status(404).json({ message: "Route not found" }));
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err.type === "entity.too.large") return res.status(413).json({ message: "Request is too large" });
        if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON" });

        console.error("UNHANDLED ERROR:", err);
        res.status(err.status || 500).json({ message: err.status ? err.message : "Something went wrong" });
    });

    return { app, server, io };
};

module.exports = createApp;
