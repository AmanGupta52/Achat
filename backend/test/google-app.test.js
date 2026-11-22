const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const { startServer, mailer, mongoose } = require("./helpers");

const pkce = () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    return { verifier, challenge: crypto.createHash("sha256").update(verifier).digest("base64url") };
};
const codeFrom = (html) => (html.match(/achat:\/\/auth\?code=([a-f0-9]{64})/) || [])[1];
const errorFrom = (html) => (html.match(/achat:\/\/auth\?error=([^"&]*)/) || [])[1];

describe("Google sign-in for the Android app (browser + PKCE)", () => {
    let t, google, tokenCalls, tokenReply, idPayload;
    const { OAuth2Client } = require("google-auth-library");
    const originalVerify = OAuth2Client.prototype.verifyIdToken;

    before(async () => {
        // mock Google token endpoint
        tokenCalls = [];
        tokenReply = { status: 200, json: { id_token: "fake.id.token" } };
        google = http.createServer((req, res) => {
            let raw = "";
            req.on("data", (c) => (raw += c));
            req.on("end", () => {
                tokenCalls.push(Object.fromEntries(new URLSearchParams(raw)));
                res.writeHead(tokenReply.status, { "Content-Type": "application/json" });
                res.end(JSON.stringify(tokenReply.json));
            });
        });
        await new Promise((r) => google.listen(0, "127.0.0.1", r));
        const port = google.address().port;

        process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
        process.env.GOOGLE_CLIENT_SECRET = "client-secret";
        process.env.BACKEND_PUBLIC_URL = "https://api.example.com";
        process.env.GOOGLE_AUTH_URL = `http://127.0.0.1:${port}/authorize`;
        process.env.GOOGLE_TOKEN_URL = `http://127.0.0.1:${port}/token`;

        // only the signature check needs Google's real certificates → stub just that
        idPayload = { sub: "g-123", email: "gina@gmail.com", name: "Gina Google", email_verified: true };
        OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => idPayload });

        t = await startServer();
    });

    after(async () => {
        OAuth2Client.prototype.verifyIdToken = originalVerify;
        await t.stop();
        await new Promise((r) => google.close(r));
        for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "BACKEND_PUBLIC_URL", "GOOGLE_AUTH_URL", "GOOGLE_TOKEN_URL"]) delete process.env[k];
    });

    const get = (path) => fetch(t.base + path, { redirect: "manual" });
    const signIn = async (p = pkce()) => {
        const start = await get(`/api/auth/google/start?challenge=${p.challenge}`);
        const state = new URL(start.headers.get("location")).searchParams.get("state");
        const cb = await get(`/api/auth/google/callback?code=google-code&state=${encodeURIComponent(state)}`);
        return { ...p, state, html: await cb.text(), status: cb.status };
    };
    const exchange = (code, verifier) => t.api("POST", "/api/auth/google/exchange", null, { code, verifier });

    it("start sends the browser to Google with the right parameters", async () => {
        const { challenge } = pkce();
        const res = await get(`/api/auth/google/start?challenge=${challenge}`);
        assert.equal(res.status, 302);

        const url = new URL(res.headers.get("location"));
        assert.equal(url.pathname, "/authorize");
        assert.equal(url.searchParams.get("client_id"), "client-id.apps.googleusercontent.com");
        assert.equal(url.searchParams.get("redirect_uri"), "https://api.example.com/api/auth/google/callback");
        assert.equal(url.searchParams.get("response_type"), "code");
        assert.match(url.searchParams.get("scope"), /openid email profile/);
        assert.ok(url.searchParams.get("state"));
    });

    it("start rejects a missing or malformed PKCE challenge", async () => {
        for (const bad of ["", "short", "x".repeat(60), "../../etc/passwd"]) {
            const res = await get(`/api/auth/google/start?challenge=${encodeURIComponent(bad)}`);
            assert.equal(res.status, 400, `challenge ${JSON.stringify(bad)}`);
            assert.match(await res.text(), /achat:\/\/auth\?error=/);
        }
    });

    it("full happy path: new Google user → one-time code → session", async () => {
        tokenCalls.length = 0;
        const s = await signIn();

        // the backend really called Google's token endpoint with its secret
        assert.equal(tokenCalls.length, 1);
        assert.equal(tokenCalls[0].code, "google-code");
        assert.equal(tokenCalls[0].client_secret, "client-secret");
        assert.equal(tokenCalls[0].grant_type, "authorization_code");
        assert.equal(tokenCalls[0].redirect_uri, "https://api.example.com/api/auth/google/callback");

        // the page sends the user back to the app with a code (and a tappable fallback button)
        assert.equal(s.status, 200);
        const code = codeFrom(s.html);
        assert.ok(code, "page contains achat://auth?code=…");
        assert.match(s.html, /Open Achat/);

        const r = await exchange(code, s.verifier);
        assert.equal(r.status, 200);
        assert.ok(r.data.accessToken);
        assert.equal(r.data.user.email, "gina@gmail.com");
        assert.equal(r.data.user.username, "Gina Google");
        assert.equal(r.data.user.authProvider, "google");
        assert.equal(r.data.user.isVerified, true);
        for (const secret of ["password", "otp", "connections", "avatar"]) assert.ok(!(secret in r.data.user));

        assert.equal((await t.api("GET", "/api/auth/me", r.data.accessToken)).data.user.email, "gina@gmail.com", "the session works");
        assert.ok(mailer.outbox.some((m) => m.to === "gina@gmail.com" && /Welcome to Achat/.test(m.params.subject)), "welcome email sent");
    });

    it("the code is useless with the wrong verifier — and is burned afterwards", async () => {
        const s = await signIn();
        const code = codeFrom(s.html);

        const wrong = await exchange(code, pkce().verifier);
        assert.equal(wrong.status, 400);

        // even the legitimate app can't use it any more (guessing isn't possible)
        assert.equal((await exchange(code, s.verifier)).status, 400);
    });

    it("the code works only once", async () => {
        const s = await signIn();
        const code = codeFrom(s.html);
        assert.equal((await exchange(code, s.verifier)).status, 200);
        assert.equal((await exchange(code, s.verifier)).status, 400);
    });

    it("an expired code is refused", async () => {
        const s = await signIn();
        const code = codeFrom(s.html);
        await mongoose.connection.collection("googlelogincodes").updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        const r = await exchange(code, s.verifier);
        assert.equal(r.status, 400);
        assert.match(r.data.message, /expired/);
    });

    it("exchange validates its input", async () => {
        assert.equal((await exchange("nope", "x".repeat(43))).status, 400);
        assert.equal((await exchange("a".repeat(64), "short")).status, 400);
        assert.equal((await t.api("POST", "/api/auth/google/exchange", null, {})).status, 400);
    });

    it("shows a friendly page for a forged or expired state, a cancelled sign-in, and a Google error", async () => {
        let res = await get("/api/auth/google/callback?code=x&state=forged");
        assert.match(await res.text(), /expired/i);

        const { challenge } = pkce();
        const state = new URL((await get(`/api/auth/google/start?challenge=${challenge}`)).headers.get("location")).searchParams.get("state");

        res = await get(`/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`);
        assert.match(await res.text(), /cancelled/);

        tokenReply = { status: 400, json: { error: "invalid_grant" } };
        res = await get(`/api/auth/google/callback?code=bad&state=${encodeURIComponent(state)}`);
        assert.match(await res.text(), /rejected the sign-in/);
        tokenReply = { status: 200, json: { id_token: "fake.id.token" } };
    });

    it("links Google to an existing email/password account instead of creating a duplicate", async () => {
        const { registerUser } = require("./helpers");
        const local = await registerUser(t.api, "Local");
        idPayload = { sub: "g-999", email: local.email, name: "Someone Else", email_verified: true };

        const s = await signIn();
        const r = await exchange(codeFrom(s.html), s.verifier);
        assert.equal(r.status, 200);
        assert.equal(r.data.user._id, local.id, "same account, not a new one");
        assert.equal(r.data.user.authProvider, "local", "keeps its original sign-in type");
        assert.equal(await mongoose.connection.collection("users").countDocuments({ email: local.email }), 1);
        idPayload = { sub: "g-123", email: "gina@gmail.com", name: "Gina Google", email_verified: true };
    });

    it("refuses a Google account whose email is not verified", async () => {
        idPayload = { sub: "g-5", email: "unverified@gmail.com", name: "U", email_verified: false };
        const s = await signIn();
        assert.ok(!codeFrom(s.html));
        assert.match(s.html, /not verified/);
        assert.equal(await mongoose.connection.collection("users").countDocuments({ email: "unverified@gmail.com" }), 0);
        idPayload = { sub: "g-123", email: "gina@gmail.com", name: "Gina Google", email_verified: true };
    });

    it("explains clearly when the server has no Google credentials", async () => {
        const saved = process.env.GOOGLE_CLIENT_SECRET;
        delete process.env.GOOGLE_CLIENT_SECRET;
        const res = await get(`/api/auth/google/start?challenge=${pkce().challenge}`);
        assert.equal(res.status, 503);
        assert.match(await res.text(), /isn(&#39;|')t set up/);
        process.env.GOOGLE_CLIENT_SECRET = saved;
    });
});
