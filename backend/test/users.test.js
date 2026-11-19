const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, registerUser, connectUsers, waitEvent } = require("./helpers");

// 1x1 PNG
const PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("search, discover and connections", () => {
    let t, alice, bob, carol, dave;

    before(async () => {
        t = await startServer();
        [alice, bob, carol, dave] = [
            await registerUser(t.api, "Alice"),
            await registerUser(t.api, "Bob"),
            await registerUser(t.api, "Carol"),
            await registerUser(t.api, "Dave"),
        ];
    });
    after(async () => t.stop());

    it("search never crashes on regex characters and never leaks secrets", async () => {
        let r = await t.api("GET", "/api/users?search=(", alice.token);
        assert.equal(r.status, 200);

        r = await t.api("GET", "/api/users?search=bob", alice.token);
        assert.equal(r.data.length, 1);
        const u = r.data[0];
        for (const secret of ["otp", "otpExpiry", "password", "avatar", "blocked", "connections"]) {
            assert.ok(!(secret in u), `must not expose ${secret}`);
        }
        assert.match(u.email, /\*/, "email of a stranger is masked");
        assert.match(u.phone, /\*/, "phone of a stranger is masked");
        assert.equal(u.status, "none");
    });

    it("never lists yourself, and 'not_connected' lists everyone you're not connected with", async () => {
        const r = await t.api("GET", "/api/users?filter=not_connected", alice.token);
        const names = r.data.map((x) => x.username).sort();
        assert.deepEqual(names, ["Bob", "Carol", "Dave"]);
    });

    it("sends, cancels and accepts requests with live events", async () => {
        const bobSocket = await t.socket(bob.token);
        const gotRequest = waitEvent(bobSocket, "request_received");
        assert.equal((await t.api("POST", `/api/users/request/${bob.id}`, alice.token)).status, 200);
        assert.ok(await gotRequest, "bob gets a live request_received");

        assert.equal((await t.api("POST", `/api/users/request/${bob.id}`, alice.token)).status, 400, "duplicate");
        assert.equal((await t.api("GET", "/api/users?search=bob", alice.token)).data[0].status, "sent");
        assert.equal((await t.api("GET", "/api/users?search=alice", bob.token)).data[0].status, "received");
        assert.equal((await t.api("GET", "/api/users/requests", bob.token)).data.received[0].username, "Alice");

        // cancel flow on carol
        await t.api("POST", `/api/users/request/${carol.id}`, alice.token);
        assert.equal((await t.api("DELETE", `/api/users/request/${carol.id}`, alice.token)).status, 200);
        assert.equal((await t.api("GET", "/api/users/requests", carol.token)).data.received.length, 0);

        const aliceSocket = await t.socket(alice.token);
        const accepted = waitEvent(aliceSocket, "request_accepted");
        assert.equal((await t.api("POST", `/api/users/accept/${alice.id}`, bob.token)).status, 200);
        assert.ok(await accepted);

        const mine = (await t.api("GET", "/api/users/connections", alice.token)).data;
        assert.deepEqual(mine.map((x) => x.username), ["Bob"]);
        assert.equal(mine[0].email, bob.email, "connections show the full email");

        const discover = (await t.api("GET", "/api/users?filter=not_connected", alice.token)).data;
        assert.deepEqual(discover.map((x) => x.username).sort(), ["Carol", "Dave"]);
        assert.equal((await t.api("GET", "/api/users/connections", bob.token)).data[0].username, "Alice", "mutual");
    });

    it("returns one user (200) and rejects bad ids (400)", async () => {
        const r = await t.api("GET", `/api/users/${bob.id}`, alice.token);
        assert.equal(r.status, 200);
        assert.ok(r.data.joinedAt);
        assert.equal((await t.api("GET", "/api/users/not-an-id", alice.token)).status, 400);
    });

    it("disconnect removes both sides and notifies them", async () => {
        const [a, b] = [await t.socket(alice.token), await t.socket(bob.token)];
        const [ea, eb] = [waitEvent(a, "connection_removed"), waitEvent(b, "connection_removed")];

        assert.equal((await t.api("DELETE", `/api/users/connection/${carol.id}`, alice.token)).status, 400, "not connected");
        assert.equal((await t.api("DELETE", `/api/users/connection/${bob.id}`, alice.token)).status, 200);

        assert.equal((await ea).userId, bob.id);
        assert.equal((await eb).userId, alice.id);
        assert.equal((await t.api("GET", "/api/users/connections", alice.token)).data.length, 0);
        assert.equal((await t.api("GET", "/api/users/connections", bob.token)).data.length, 0);
    });

    it("rejects a request when the other user does not exist or ids are invalid", async () => {
        assert.equal((await t.api("POST", "/api/users/request/not-an-id", alice.token)).status, 400);
        assert.equal((await t.api("POST", `/api/users/request/${alice.id}`, alice.token)).status, 400, "self");
    });

    it("dave stays untouched by all of this", async () => {
        assert.equal((await t.api("GET", "/api/users/requests", dave.token)).data.received.length, 0);
    });
});

describe("blocking", () => {
    let t, alice, bob, carol;

    before(async () => {
        t = await startServer();
        [alice, bob, carol] = [
            await registerUser(t.api, "Alice"),
            await registerUser(t.api, "Bob"),
            await registerUser(t.api, "Carol"),
        ];
    });
    after(async () => t.stop());

    it("blocking disconnects, closes the chat live, and hides both people from each other", async () => {
        await connectUsers(t.api, alice, bob);
        const bobSocket = await t.socket(bob.token);
        const closed = waitEvent(bobSocket, "connection_removed");

        assert.equal((await t.api("POST", `/api/users/block/${bob.id}`, alice.token)).status, 200);
        assert.equal((await closed).userId, alice.id, "bob's open chat is closed");

        assert.equal((await t.api("GET", "/api/users/connections", alice.token)).data.length, 0);
        assert.equal((await t.api("GET", "/api/users/connections", bob.token)).data.length, 0);

        // invisible in search / discover in BOTH directions
        assert.equal((await t.api("GET", "/api/users?search=bob", alice.token)).data.length, 0);
        assert.equal((await t.api("GET", "/api/users?search=alice", bob.token)).data.length, 0);
        assert.ok(!(await t.api("GET", "/api/users?filter=not_connected", bob.token)).data.some((u) => u.username === "Alice"));
        assert.equal((await t.api("GET", `/api/users/${alice.id}`, bob.token)).status, 404);
    });

    it("a blocked user cannot send requests, and is not told why", async () => {
        const r = await t.api("POST", `/api/users/request/${alice.id}`, bob.token);
        assert.equal(r.status, 404);
        assert.equal(r.data.message, "User not found");
    });

    it("the blocker must unblock before sending a request", async () => {
        const r = await t.api("POST", `/api/users/request/${bob.id}`, alice.token);
        assert.equal(r.status, 400);
    });

    it("lists blocked users and unblocking makes them visible again (but not connected)", async () => {
        const list = (await t.api("GET", "/api/users/blocked", alice.token)).data;
        assert.deepEqual(list.map((u) => u.username), ["Bob"]);

        assert.equal((await t.api("DELETE", `/api/users/block/${bob.id}`, alice.token)).status, 200);
        assert.equal((await t.api("GET", "/api/users/blocked", alice.token)).data.length, 0);
        assert.equal((await t.api("GET", "/api/users?search=bob", alice.token)).data[0].status, "none");
    });

    it("blocking a stranger who sent a request clears that request", async () => {
        await t.api("POST", `/api/users/request/${alice.id}`, carol.token);
        assert.equal((await t.api("GET", "/api/users/requests", alice.token)).data.received.length, 1);

        await t.api("POST", `/api/users/block/${carol.id}`, alice.token);
        assert.equal((await t.api("GET", "/api/users/requests", alice.token)).data.received.length, 0);
        assert.equal((await t.api("GET", "/api/users/requests", carol.token)).data.sent.length, 0);
    });

    it("validates ids and prevents self-block", async () => {
        assert.equal((await t.api("POST", "/api/users/block/not-an-id", alice.token)).status, 400);
        assert.equal((await t.api("POST", `/api/users/block/${alice.id}`, alice.token)).status, 400);
    });
});

describe("profile picture & about", () => {
    let t, alice, bob;

    before(async () => {
        t = await startServer();
        [alice, bob] = [await registerUser(t.api, "Alice"), await registerUser(t.api, "Bob")];
    });
    after(async () => t.stop());

    it("uploads, serves (publicly, cached) and removes an avatar", async () => {
        let r = await t.api("PUT", "/api/auth/avatar", alice.token, { image: PNG });
        assert.equal(r.status, 200);
        const version = r.data.user.avatarVersion;
        assert.ok(version > 0);
        assert.ok(!("avatar" in r.data.user), "image bytes are never put in JSON");

        // <img> tags can't send a token → public, immutable-cached, cross-origin friendly
        const img = await fetch(`${t.base}/api/users/${alice.id}/avatar?v=${version}`);
        assert.equal(img.status, 200);
        assert.equal(img.headers.get("content-type"), "image/png");
        assert.match(img.headers.get("cache-control"), /immutable/);
        assert.equal(img.headers.get("cross-origin-resource-policy"), "cross-origin");
        assert.ok((await img.arrayBuffer()).byteLength > 20);

        r = await t.api("DELETE", "/api/auth/avatar", alice.token);
        assert.equal(r.data.user.avatarVersion, 0);
        assert.equal((await fetch(`${t.base}/api/users/${alice.id}/avatar`)).status, 404);
    });

    it("rejects non-images, fake images and oversized uploads", async () => {
        const text = "data:image/png;base64," + Buffer.from("definitely not an image").toString("base64");
        assert.equal((await t.api("PUT", "/api/auth/avatar", alice.token, { image: text })).status, 400);
        assert.equal((await t.api("PUT", "/api/auth/avatar", alice.token, { image: "hello" })).status, 400);
        assert.equal((await t.api("PUT", "/api/auth/avatar", alice.token, { image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" })).status, 400);

        const big = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(250 * 1024)]).toString("base64");
        assert.equal((await t.api("PUT", "/api/auth/avatar", alice.token, { image: big })).status, 413);
    });

    it("anyone can see an avatar version, but 'about' is only shown to connections", async () => {
        await t.api("PUT", "/api/auth/avatar", alice.token, { image: PNG });
        await t.api("PUT", "/api/auth/update-profile", alice.token, { username: "Alice", about: "Out for lunch" });

        let r = await t.api("GET", "/api/users?search=alice", bob.token);
        assert.ok(r.data[0].avatarVersion > 0);
        assert.equal(r.data[0].about, "", "not connected → about hidden");

        await connectUsers(t.api, alice, bob);
        r = await t.api("GET", `/api/users/${alice.id}`, bob.token);
        assert.equal(r.data.about, "Out for lunch");
    });
});
