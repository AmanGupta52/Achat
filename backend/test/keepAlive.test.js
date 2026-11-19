const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

describe("keep-alive pinger", () => {
    it("pings <url>/health on an interval, and is off in test mode / when disabled", async () => {
        const startKeepAlive = require("../utils/keepAlive");

        let hits = 0;
        const server = http.createServer((req, res) => {
            if (req.url === "/health") hits++;
            res.end("{}");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const url = `http://127.0.0.1:${server.address().port}`;

        // NODE_ENV=test → disabled
        process.env.NODE_ENV = "test";
        process.env.KEEP_ALIVE_URL = url;
        assert.equal(startKeepAlive(), null);

        // enabled outside of test mode
        process.env.NODE_ENV = "production";
        process.env.KEEP_ALIVE_INTERVAL_MS = "100";
        const timer = startKeepAlive();
        assert.ok(timer);
        await new Promise((r) => setTimeout(r, 450));
        clearInterval(timer);
        assert.ok(hits >= 3, `expected several pings, got ${hits}`);

        // explicit opt-out
        process.env.KEEP_ALIVE = "false";
        assert.equal(startKeepAlive(), null);

        process.env.NODE_ENV = "test";
        delete process.env.KEEP_ALIVE;
        await new Promise((r) => server.close(r));
    });
});
