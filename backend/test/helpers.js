/**
 * Shared test helpers. Tests run the real Express + Socket.io app in-process against a real
 * MongoDB (MONGO_URI, default: local mongod) in a throw-away database.
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.MESSAGE_SECRET =
    process.env.MESSAGE_SECRET || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.CLIENT_URL = "http://localhost:5173";
// in-process tests always use the in-memory limiter / single-node sockets (see redis.test.js for multi-instance)
delete process.env.REDIS_URL;

const mongoose = require("mongoose");
const { io: connectClient } = require("socket.io-client");

const createApp = require("../app");
const sendEmail = require("../utils/sendEmail");

const baseUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/achat_test";

async function startServer() {
    const dbName = `achat_test_${process.pid}_${Date.now()}`;
    const uri = baseUri.replace(/\/[^/?]*(\?|$)/, `/${dbName}$1`);
    await mongoose.connect(uri);

    const { server } = createApp();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const sockets = [];

    const api = async (method, url, token, body) => {
        const res = await fetch(base + url, {
            method,
            headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        let data = null;
        try {
            data = await res.json();
        } catch {
            /* empty body */
        }
        return { status: res.status, data, headers: res.headers };
    };

    /** Open a socket for a token and wait until it is connected. */
    const socket = (token) =>
        new Promise((resolve, reject) => {
            const s = connectClient(base, { auth: { token }, transports: ["websocket"], reconnection: false });
            sockets.push(s);
            s.on("connect", () => resolve(s));
            s.on("connect_error", reject);
        });

    const stop = async () => {
        sockets.forEach((s) => s.disconnect());
        await new Promise((resolve) => server.close(resolve));
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    };

    return { base, api, socket, stop };
}

const lastOtp = (email) => {
    const mail = [...sendEmail.outbox].reverse().find((m) => m.to === email);
    return mail && (mail.html.match(/letter-spacing:6px[^>]*>(\d{6})</) || [])[1];
};

let counter = 0;

/** Register + verify a user through the real API. */
async function registerUser(api, name) {
    counter += 1;
    const email = `${name}${counter}@test.com`.toLowerCase();
    const phone = `9${String(counter).padStart(9, "0")}`;

    const reg = await api("POST", "/api/auth/register", null, { username: name, email, phone, password: "pass1234" });
    if (reg.status !== 200) throw new Error(`register failed: ${JSON.stringify(reg.data)}`);

    const ver = await api("POST", "/api/auth/verify-otp", null, { email, otp: lastOtp(email) });
    if (ver.status !== 200) throw new Error(`verify failed: ${JSON.stringify(ver.data)}`);

    return { id: ver.data.user._id, token: ver.data.accessToken, email, phone, name };
}

/** Connect two users (request + accept). */
async function connectUsers(api, a, b) {
    await api("POST", `/api/users/request/${b.id}`, a.token);
    const res = await api("POST", `/api/users/accept/${a.id}`, b.token);
    if (res.status !== 200) throw new Error(`connect failed: ${JSON.stringify(res.data)}`);
}

/** Resolve with the next `event` on a socket, or null after `ms`. */
const waitEvent = (socket, event, ms = 3000) =>
    new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        socket.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { startServer, registerUser, connectUsers, waitEvent, wait, lastOtp, mongoose, sendEmail };
