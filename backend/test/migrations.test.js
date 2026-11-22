const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, registerUser, mongoose } = require("./helpers");
const { renameDefaultAbout, OLD_DEFAULT_ABOUT } = require("../utils/migrations");

describe("rename migration", () => {
    let t;
    before(async () => (t = await startServer()));
    after(async () => t.stop());

    it("new accounts get the Achat default About text", async () => {
        const u = await registerUser(t.api, "Fresh");
        const me = await t.api("GET", "/api/auth/me", u.token);
        assert.equal(me.data.user.about, "Hey there! I am using Achat.");
    });

    it("updates old default About texts, leaves custom ones alone, and is idempotent", async () => {
        const a = await registerUser(t.api, "OldDefault");
        const b = await registerUser(t.api, "Custom");
        const users = mongoose.connection.collection("users");
        await users.updateOne({ _id: new mongoose.Types.ObjectId(a.id) }, { $set: { about: OLD_DEFAULT_ABOUT } });
        await users.updateOne({ _id: new mongoose.Types.ObjectId(b.id) }, { $set: { about: "Busy with exams" } });

        assert.equal(await renameDefaultAbout(), 1);
        assert.equal((await t.api("GET", "/api/auth/me", a.token)).data.user.about, "Hey there! I am using Achat.");
        assert.equal((await t.api("GET", "/api/auth/me", b.token)).data.user.about, "Busy with exams");
        assert.equal(await renameDefaultAbout(), 0, "second run changes nothing");
    });
});
