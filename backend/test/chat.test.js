const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, registerUser, connectUsers, waitEvent, wait, mongoose } = require("./helpers");
const { decrypt } = require("../utils/crypto");

describe("messaging", () => {
    let t, alice, bob, carol, aSock, bSock;

    const send = async (from, to, content, extra = {}) =>
        (await t.api("POST", "/api/chat/send", from.token, { receiverId: to.id, content, ...extra }));
    const history = async (me, other, qs = "") => (await t.api("GET", `/api/chat/${other.id}${qs}`, me.token));

    before(async () => {
        t = await startServer();
        [alice, bob, carol] = [
            await registerUser(t.api, "Alice"),
            await registerUser(t.api, "Bob"),
            await registerUser(t.api, "Carol"),
        ];
        await connectUsers(t.api, alice, bob);
        [aSock, bSock] = [await t.socket(alice.token), await t.socket(bob.token)];
    });
    after(async () => t.stop());

    it("only connected users can message or read each other", async () => {
        assert.equal((await send(alice, carol, "hi stranger")).status, 403);
        assert.equal((await history(alice, carol)).status, 403);
        assert.equal((await send(alice, bob, "   ")).status, 400, "empty");
        assert.equal((await send(alice, bob, "x".repeat(4001))).status, 400, "too long");
    });

    it("pushes messages from the SERVER with the real sender id, and marks delivered", async () => {
        const live = waitEvent(bSock, "receive_message");
        const echo = waitEvent(aSock, "message_sent");
        const r = await send(alice, bob, "Hello Bob 👋");

        assert.equal(r.status, 200);
        assert.equal(r.data.delivered, true, "bob is online");
        const got = await live;
        assert.equal(got.content, "Hello Bob 👋");
        assert.equal(got.sender, alice.id);
        assert.ok(await echo, "sender's other tabs get an echo");
    });

    it("delivers an offline message the moment the receiver reconnects", async () => {
        bSock.disconnect();
        await wait(300);

        const delivered = waitEvent(aSock, "message_delivered", 4000);
        const r = await send(alice, bob, "are you there?");
        assert.equal(r.data.delivered, false);

        bSock = await t.socket(bob.token);
        assert.equal((await delivered).messageId, r.data._id);
    });

    it("shows unread counts + last message, then read receipts", async () => {
        let list = (await t.api("GET", "/api/users/connections", bob.token)).data;
        assert.equal(list[0].unreadCount, 2);
        assert.equal(list[0].lastMessage, "are you there?");

        const read = waitEvent(aSock, "messages_read");
        assert.equal((await t.api("PUT", `/api/chat/read/${alice.id}`, bob.token)).status, 200);
        assert.equal((await read).readerId, bob.id);

        list = (await t.api("GET", "/api/users/connections", bob.token)).data;
        assert.equal(list[0].unreadCount, 0);
    });

    it("encrypts at rest", async () => {
        const raw = await mongoose.connection.collection("messages").findOne({});
        assert.notEqual(raw.content.data, "Hello Bob 👋");
        assert.equal(decrypt(raw.content), "Hello Bob 👋");
    });

    // ───────────────────────── pagination ─────────────────────────
    it("paginates history with a cursor", async () => {
        for (let i = 1; i <= 7; i++) await send(bob, alice, `page-${i}`);

        let r = await history(alice, bob, "?limit=3");
        assert.deepEqual(r.data.messages.map((m) => m.content), ["page-5", "page-6", "page-7"]);
        assert.equal(r.data.hasMore, true);

        r = await history(alice, bob, `?limit=3&before=${r.data.messages[0]._id}`);
        assert.deepEqual(r.data.messages.map((m) => m.content), ["page-2", "page-3", "page-4"]);

        r = await history(alice, bob, `?limit=50&before=${r.data.messages[0]._id}`);
        assert.equal(r.data.messages.at(-1).content, "page-1");
        assert.equal(r.data.hasMore, false, "reached the beginning");

        assert.equal((await history(alice, bob, "?before=nope")).status, 400);
    });

    // ───────────────────────── reply ─────────────────────────
    it("replies to a message and shows the quoted text", async () => {
        const original = (await send(alice, bob, "What time is the meeting?")).data;
        const live = waitEvent(aSock, "receive_message");
        const reply = await send(bob, alice, "At 5pm", { replyToId: original._id });

        assert.equal(reply.status, 200);
        assert.equal(reply.data.replyTo.content, "What time is the meeting?");
        assert.equal(reply.data.replyTo.sender, alice.id);
        assert.equal((await live).replyTo.content, "What time is the meeting?");

        const page = (await history(alice, bob, "?limit=2")).data.messages;
        assert.equal(page.at(-1).replyTo._id, original._id, "reply preview also comes with the history");
    });

    it("rejects a reply to a message from another conversation or a bad id", async () => {
        await connectUsers(t.api, alice, carol);
        const foreign = (await send(alice, carol, "private with carol")).data;

        assert.equal((await send(alice, bob, "sneaky", { replyToId: foreign._id })).status, 400);
        assert.equal((await send(alice, bob, "x", { replyToId: "nope" })).status, 400);
    });

    // ───────────────────────── reactions ─────────────────────────
    it("reacts: one reaction per person, replaceable, removable, live for both", async () => {
        const m = (await send(alice, bob, "react to me")).data;
        const live = waitEvent(aSock, "message_reaction");

        let r = await t.api("PUT", `/api/chat/message/${m._id}/reaction`, bob.token, { emoji: "❤️" });
        assert.equal(r.status, 200);
        assert.deepEqual((await live).reactions, [{ userId: bob.id, emoji: "❤️" }]);

        r = await t.api("PUT", `/api/chat/message/${m._id}/reaction`, alice.token, { emoji: "😂" });
        assert.equal(r.data.reactions.length, 2);

        r = await t.api("PUT", `/api/chat/message/${m._id}/reaction`, bob.token, { emoji: "👍" });
        assert.equal(r.data.reactions.length, 2, "bob's reaction was replaced, not added");
        assert.equal(r.data.reactions.find((x) => x.userId === bob.id).emoji, "👍");

        r = await t.api("PUT", `/api/chat/message/${m._id}/reaction`, bob.token, { emoji: null });
        assert.deepEqual(r.data.reactions, [{ userId: alice.id, emoji: "😂" }]);

        const page = (await history(bob, alice, "?limit=1")).data.messages[0];
        assert.deepEqual(page.reactions, [{ userId: alice.id, emoji: "😂" }], "persisted");
    });

    it("rejects unsupported emojis and reactions from outsiders", async () => {
        const m = (await send(alice, bob, "another")).data;
        assert.equal((await t.api("PUT", `/api/chat/message/${m._id}/reaction`, bob.token, { emoji: "💩" })).status, 400);
        const mallory = await registerUser(t.api, "Mallory");
        assert.equal((await t.api("PUT", `/api/chat/message/${m._id}/reaction`, mallory.token, { emoji: "👍" })).status, 404);
    });

    // ───────────────────────── edit ─────────────────────────
    it("edits your own message and tells both sides", async () => {
        const m = (await send(alice, bob, "I mispelled this")).data;
        const live = waitEvent(bSock, "message_edited");

        const r = await t.api("PUT", `/api/chat/message/${m._id}`, alice.token, { content: "I misspelled this" });
        assert.equal(r.status, 200);
        assert.equal(r.data.edited, true);
        assert.equal((await live).content, "I misspelled this");

        const list = (await t.api("GET", "/api/users/connections", bob.token)).data;
        assert.equal(list.find((u) => u.username === "Alice").lastMessage, "I misspelled this");
    });

    it("refuses edits by the receiver, of empty text, of deleted messages, and after the time window", async () => {
        const m = (await send(alice, bob, "original")).data;
        assert.equal((await t.api("PUT", `/api/chat/message/${m._id}`, bob.token, { content: "hijack" })).status, 403);
        assert.equal((await t.api("PUT", `/api/chat/message/${m._id}`, alice.token, { content: "  " })).status, 400);

        await mongoose.connection.collection("messages").updateOne(
            { _id: new mongoose.Types.ObjectId(m._id) },
            { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
        );
        const late = await t.api("PUT", `/api/chat/message/${m._id}`, alice.token, { content: "too late" });
        assert.equal(late.status, 403);
        assert.match(late.data.message, /within 15 minutes/);

        const d = (await send(alice, bob, "to delete")).data;
        await t.api("DELETE", `/api/chat/message/${d._id}?scope=everyone`, alice.token);
        assert.equal((await t.api("PUT", `/api/chat/message/${d._id}`, alice.token, { content: "zombie" })).status, 400);
    });

    // ───────────────────────── search ─────────────────────────
    it("searches inside one conversation only, case-insensitively, newest first", async () => {
        await send(alice, bob, "Lunch at the CAFE tomorrow?");
        await send(bob, alice, "Sure, the cafe near the office");
        await send(alice, carol, "cafe secret with carol");

        const r = await t.api("GET", `/api/chat/${bob.id}/search?q=cafe`, alice.token);
        assert.equal(r.status, 200);
        assert.equal(r.data.results.length, 2, "carol's chat is not searched");
        assert.match(r.data.results[0].snippet, /near the office/, "newest first");

        assert.deepEqual((await t.api("GET", `/api/chat/${bob.id}/search?q=c`, alice.token)).data.results, [], "needs 2+ chars");
        assert.equal((await t.api("GET", `/api/chat/${carol.id}/search?q=cafe`, bob.token)).status, 403, "not connected");
    });

    it("search skips messages deleted for everyone or for me", async () => {
        const a = (await send(alice, bob, "zebra crossing one")).data;
        const b = (await send(alice, bob, "zebra crossing two")).data;
        await t.api("DELETE", `/api/chat/message/${a._id}?scope=everyone`, alice.token);
        await t.api("DELETE", `/api/chat/message/${b._id}?scope=me`, alice.token);

        assert.equal((await t.api("GET", `/api/chat/${bob.id}/search?q=zebra`, alice.token)).data.results.length, 0);
        assert.equal((await t.api("GET", `/api/chat/${alice.id}/search?q=zebra`, bob.token)).data.results.length, 1, "bob still has 'two'");
    });

    // ───────────────────────── delete ─────────────────────────
    it("delete for everyone erases the text from the database and notifies both", async () => {
        const m = (await send(alice, bob, "secret to erase")).data;
        const [ea, eb] = [waitEvent(aSock, "message_deleted"), waitEvent(bSock, "message_deleted")];

        assert.equal((await t.api("DELETE", `/api/chat/message/${m._id}?scope=everyone`, bob.token)).status, 403, "only the sender");
        assert.equal((await t.api("DELETE", `/api/chat/message/${m._id}?scope=everyone`, alice.token)).status, 200);
        assert.equal((await ea).scope, "everyone");
        assert.equal((await eb).messageId, m._id);

        const seen = (await history(bob, alice, "?limit=1")).data.messages[0];
        assert.equal(seen.deleted, true);
        assert.equal(seen.content, "");

        const raw = await mongoose.connection.collection("messages").findOne({ _id: new mongoose.Types.ObjectId(m._id) });
        assert.ok(!decrypt(raw.content).includes("secret"), "original text is gone from the database");
        assert.equal((await t.api("DELETE", `/api/chat/message/${m._id}?scope=everyone`, alice.token)).status, 200, "idempotent");
    });

    it("delete for me hides it from me only and stays hidden after reconnecting", async () => {
        const m = (await send(alice, bob, "hide from bob")).data;
        const quiet = waitEvent(aSock, "message_deleted", 1000);
        assert.equal((await t.api("DELETE", `/api/chat/message/${m._id}?scope=me`, bob.token)).status, 200);
        assert.equal(await quiet, null, "alice is not notified");

        assert.ok(!(await history(bob, alice, "?limit=5")).data.messages.some((x) => x._id === m._id));
        assert.ok((await history(alice, bob, "?limit=5")).data.messages.some((x) => x._id === m._id));
    });

    it("hides a deleted message from the chat-list preview and the unread count", async () => {
        const unread = async () =>
            (await t.api("GET", "/api/users/connections", alice.token)).data.find((u) => u.username === "Bob");

        const before = (await unread()).unreadCount;
        const m = (await send(bob, alice, "oops wrong chat")).data;
        assert.equal((await unread()).unreadCount, before + 1);

        await t.api("DELETE", `/api/chat/message/${m._id}?scope=everyone`, bob.token);
        const row = await unread();
        assert.equal(row.lastMessage, "🚫 This message was deleted");
        assert.equal(row.unreadCount, before, "a message deleted for everyone no longer counts as unread");
    });

    it("rejects invalid message ids and outsiders", async () => {
        assert.equal((await t.api("DELETE", "/api/chat/message/nope", alice.token)).status, 400);
        const m = (await send(alice, bob, "private")).data;
        const mallory = await registerUser(t.api, "Mallory2");
        assert.equal((await t.api("DELETE", `/api/chat/message/${m._id}?scope=me`, mallory.token)).status, 404);
    });

    it("keeps history after disconnect+reconnect and respects earlier 'delete for me'", async () => {
        const hidden = (await send(alice, bob, "bob hid this")).data;
        await t.api("DELETE", `/api/chat/message/${hidden._id}?scope=me`, bob.token);

        await t.api("DELETE", `/api/users/connection/${bob.id}`, alice.token);
        assert.equal((await send(alice, bob, "still there?")).status, 403);
        assert.equal((await history(bob, alice)).status, 403);

        await connectUsers(t.api, alice, bob);
        const page = (await history(bob, alice, "?limit=100")).data.messages;
        assert.ok(page.length > 5, "history survived");
        assert.ok(!page.some((m) => m._id === hidden._id), "still hidden for bob");
    });
});
