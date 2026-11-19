/**
 * Multi-instance test — only runs when REDIS_URL is set (CI provides a Redis service).
 * Starts TWO real backend processes sharing one Redis and checks that everything crosses between them.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { io: connectClient } = require("socket.io-client");

const REDIS_URL = process.env.REDIS_URL;
const SECRET = "multi-instance-secret";
const MESSAGE_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const baseUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/achat_test";
const dbUri = baseUri.replace(/\/[^/?]*(\?|$)/, `/achat_multi_${process.pid}$1`);

const waitEvent = (s, ev, ms = 4000) =>
    new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms);
        s.once(ev, (d) => (clearTimeout(t), resolve(d)));
    });

const startInstance = async (port) => {
    const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
        env: {
            ...process.env,
            NODE_ENV: "development",
            PORT: String(port),
            MONGO_URI: dbUri,
            JWT_SECRET: SECRET,
            MESSAGE_SECRET,
            REDIS_URL,
            CLIENT_URL: "http://localhost:5173",
            KEEP_ALIVE: "false",
        },
        stdio: "ignore",
    });

    for (let i = 0; i < 60; i++) {
        try {
            if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return child;
        } catch {
            /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    child.kill();
    throw new Error(`instance on ${port} did not start`);
};

describe("two backend instances sharing Redis", { skip: !REDIS_URL && "REDIS_URL not set" }, () => {
    const PORTS = [5901, 5902];
    const kids = [];
    const sockets = [];
    let User, alice, bob;

    before(async () => {
        await mongoose.connect(dbUri);
        User = require("../models/User");

        const hash = await bcrypt.hash("pass1234", 4);
        const mk = (name, n) => User.create({ username: name, email: `${name}@t.com`, phone: `98000000${n}`, password: hash, isVerified: true });
        const [a, b] = [await mk("alice", 1), await mk("bob", 2)];
        await User.updateOne({ _id: a._id }, { $push: { connections: b._id } });
        await User.updateOne({ _id: b._id }, { $push: { connections: a._id } });

        const token = (u) => jwt.sign({ id: u._id }, SECRET);
        alice = { id: String(a._id), token: token(a) };
        bob = { id: String(b._id), token: token(b) };

        for (const p of PORTS) kids.push(await startInstance(p));
    });

    after(async () => {
        // don't leave rate-limit counters behind for other test runs
        const { createClient } = require("redis");
        const redis = createClient({ url: REDIS_URL });
        await redis.connect();
        for await (const key of redis.scanIterator({ MATCH: "rl:*" })) await redis.del(key);
        await redis.quit();

        sockets.forEach((s) => s.disconnect());
        kids.forEach((k) => k.kill());
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });

    const open = (port, token) =>
        new Promise((resolve, reject) => {
            const s = connectClient(`http://127.0.0.1:${port}`, { auth: { token }, transports: ["websocket"], reconnection: false });
            sockets.push(s);
            s.on("connect", () => resolve(s));
            s.on("connect_error", reject);
        });

    const api = (port, method, url, token, body) =>
        fetch(`http://127.0.0.1:${port}${url}`, {
            method,
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

    it("presence and messages cross between instances", async () => {
        const bobOn2 = await open(PORTS[1], bob.token);

        // alice connects to instance 1 → bob (instance 2) is told she is online
        const online = waitEvent(bobOn2, "presence");
        const aliceOn1 = await open(PORTS[0], alice.token);
        const p = await online;
        assert.equal(p?.userId, alice.id);
        assert.equal(p?.isOnline, true);

        // alice sends through instance 1 → bob receives on instance 2, and it counts as delivered
        const live = waitEvent(bobOn2, "receive_message");
        const r = await api(PORTS[0], "POST", "/api/chat/send", alice.token, { receiverId: bob.id, content: "across nodes" });
        assert.equal(r.status, 200);
        assert.equal(r.data.delivered, true, "bob's socket is on ANOTHER instance and is still found");
        assert.equal((await live)?.content, "across nodes");

        // bob replies through instance 2 → alice receives on instance 1
        const back = waitEvent(aliceOn1, "receive_message");
        await api(PORTS[1], "POST", "/api/chat/send", bob.token, { receiverId: alice.id, content: "got it" });
        assert.equal((await back)?.content, "got it");
    });

    it("logging out on one instance closes the socket held by the other", async () => {
        const s = await open(PORTS[1], alice.token);
        const closed = new Promise((resolve) => s.once("disconnect", () => resolve(true)));
        await api(PORTS[0], "POST", "/api/auth/logout", alice.token);
        assert.equal(await closed, true);
    });

    it("the rate limiter is shared: attempts split across instances still add up", async () => {
        let blocked = 0;
        for (let i = 0; i < 70; i++) {
            const r = await api(PORTS[i % 2], "POST", "/api/auth/login", "x", { loginId: "nobody@t.com", password: "x" });
            if (r.status === 429) blocked++;
        }
        // with per-instance memory each server would only see 35 attempts and never block (limit is 60)
        assert.ok(blocked >= 5, `expected shared limiting, blocked=${blocked}`);
    });
});
