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

    // The Android app (Capacitor) runs inside a WebView whose page origin is https://localhost
    // (capacitor://localhost on iOS). Requests are authenticated with a bearer token, not cookies,
    // so allowing these origins does not let other websites act on a user's behalf.
    const MOBILE_APP_ORIGINS = ["https://localhost", "http://localhost", "capacitor://localhost"];
    const ALLOWED_ORIGINS = [...new Set([...CLIENT_URLS, ...MOBILE_APP_ORIGINS])];

    // Behind a reverse proxy (Render sets RENDER=true) req.ip would be the proxy for EVERY user, so the
    // per-IP rate limiter would lock everybody out together after 60 requests. Trust one proxy hop there.
    if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);
    else if (process.env.RENDER) app.set("trust proxy", 1);

    // ---------------------------------------------------------------------
    // MIDDLEWARE
    // ---------------------------------------------------------------------
    app.use(helmet()); // security headers (nosniff, HSTS, frameguard, …)
    app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
    app.use(express.json({ limit: "400kb" })); // avatars are ≤200 KB (+ base64 overhead)

    // ---------------------------------------------------------------------
    // SOCKET.IO
    // ---------------------------------------------------------------------
    const io = new Server(server, {
        cors: { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"], credentials: true },
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
