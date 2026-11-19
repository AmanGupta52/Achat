const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, registerUser, connectUsers, waitEvent, wait } = require("./helpers");

describe("socket security and presence", () => {
    let t, alice, bob;

    before(async () => {
        t = await startServer();
        [alice, bob] = [await registerUser(t.api, "Alice"), await registerUser(t.api, "Bob")];
        await connectUsers(t.api, alice, bob);
    });
    after(async () => t.stop());

    it("rejects sockets without a valid token", async () => {
        await assert.rejects(() => t.socket("garbage"));
        await assert.rejects(() => t.socket(""));
    });

    it("relays typing with the VERIFIED sender id (spoofing is ignored)", async () => {
        const [a, b] = [await t.socket(alice.token), await t.socket(bob.token)];
        const typing = waitEvent(b, "typing");
        a.emit("typing", { receiver: bob.id, isTyping: true, sender: "SPOOFED" });
        const got = await typing;
        assert.equal(got.sender, alice.id);
        assert.equal(got.isTyping, true);
        a.disconnect();
        b.disconnect();
        await wait(200);
    });

    it("stays online while any tab is open, and goes offline (live) when the last one closes", async () => {
        const watcher = await t.socket(bob.token);
        const tab1 = await t.socket(alice.token);
        const tab2 = await t.socket(alice.token);

        tab1.disconnect();
        await wait(400);
        assert.equal((await t.api("GET", `/api/users/${alice.id}`, bob.token)).data.isOnline, true, "still online");

        const offline = waitEvent(watcher, "presence");
        tab2.disconnect();
        const p = await offline;
        assert.equal(p.userId, alice.id);
        assert.equal(p.isOnline, false);
        assert.equal((await t.api("GET", `/api/users/${alice.id}`, bob.token)).data.isOnline, false);
    });

    it("logout closes the user's sockets", async () => {
        const s = await t.socket(alice.token);
        const closed = new Promise((resolve) => s.once("disconnect", resolve));
        await t.api("POST", "/api/auth/logout", alice.token);
        assert.ok(await closed);
    });
});
