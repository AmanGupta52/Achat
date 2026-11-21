const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, registerUser, lastOtp, sendEmail } = require("./helpers");

describe("auth", () => {
    let t;
    before(async () => (t = await startServer()));
    after(async () => t.stop());

    it("rejects invalid registration details", async () => {
        const r = await t.api("POST", "/api/auth/register", null, { username: "A", email: "bad", phone: "1", password: "x" });
        assert.equal(r.status, 400);
    });

    it("registers, verifies with OTP and returns a session without secrets", async () => {
        const email = "flow@test.com";
        let r = await t.api("POST", "/api/auth/register", null, { username: "Flow", email, phone: "9111111111", password: "pass1234" });
        assert.equal(r.status, 200);

        r = await t.api("POST", "/api/auth/verify-otp", null, { email, otp: lastOtp(email) });
        assert.equal(r.status, 200);
        assert.ok(r.data.accessToken);
        for (const secret of ["password", "otp", "otpExpiry", "connections", "avatar"]) {
            assert.ok(!(secret in r.data.user), `response must not contain ${secret}`);
        }
    });

    it("lets an UNVERIFIED sign-up start over (old code was stuck forever)", async () => {
        const body = { username: "Retry", email: "retry@test.com", phone: "9222222222", password: "pass1234" };
        assert.equal((await t.api("POST", "/api/auth/register", null, body)).status, 200);
        assert.equal((await t.api("POST", "/api/auth/register", null, body)).status, 200);
    });

    it("blocks an OTP after 5 wrong guesses, even the correct code", async () => {
        const email = "lock@test.com";
        await t.api("POST", "/api/auth/register", null, { username: "Lock", email, phone: "9333333333", password: "pass1234" });
        for (let i = 0; i < 5; i++) await t.api("POST", "/api/auth/verify-otp", null, { email, otp: "000000" });
        const r = await t.api("POST", "/api/auth/verify-otp", null, { email, otp: lastOtp(email) });
        assert.equal(r.status, 429);
    });

    it("logs in case-insensitively and leaks no secrets", async () => {
        const u = await registerUser(t.api, "Login");
        let r = await t.api("POST", "/api/auth/login", null, { loginId: u.email.toUpperCase(), password: "pass1234" });
        assert.equal(r.status, 200);
        assert.ok(!("password" in r.data.user));

        r = await t.api("POST", "/api/auth/login", null, { loginId: u.email, password: "wrong" });
        assert.equal(r.status, 401);
    });

    it("answers forgot-password identically for unknown emails and resets with the right OTP", async () => {
        const u = await registerUser(t.api, "Reset");
        assert.equal((await t.api("POST", "/api/auth/forgot-password", null, { email: "nobody@test.com" })).status, 200);

        await t.api("POST", "/api/auth/forgot-password", null, { email: u.email });
        let r = await t.api("POST", "/api/auth/reset-password", null, { email: u.email, otp: "111111", newPassword: "newpass99" });
        assert.equal(r.status, 400);

        r = await t.api("POST", "/api/auth/reset-password", null, { email: u.email, otp: lastOtp(u.email), newPassword: "newpass99" });
        assert.equal(r.status, 200);
        r = await t.api("POST", "/api/auth/login", null, { loginId: u.email, password: "newpass99" });
        assert.equal(r.status, 200);
    });

    it("does not accept a reset OTP to verify an account", async () => {
        const email = "cross@test.com";
        await t.api("POST", "/api/auth/register", null, { username: "Cross", email, phone: "9444444444", password: "pass1234" });
        await t.api("POST", "/api/auth/forgot-password", null, { email });
        const r = await t.api("POST", "/api/auth/verify-otp", null, { email, otp: lastOtp(email) });
        assert.equal(r.status, 400);
    });

    it("returns the current user, and 401 JSON for bad tokens", async () => {
        const u = await registerUser(t.api, "Me");
        let r = await t.api("GET", "/api/auth/me", u.token);
        assert.equal(r.status, 200);
        assert.equal(r.data.user.username, "Me");

        r = await t.api("GET", "/api/users", "bad.token.here");
        assert.equal(r.status, 401);
        assert.ok(r.data.message);
    });

    it("updates the profile: about text, clearing the phone, duplicate phone", async () => {
        const a = await registerUser(t.api, "ProfA");
        const b = await registerUser(t.api, "ProfB");

        let r = await t.api("PUT", "/api/auth/update-profile", a.token, { username: "Prof A2", phone: "", about: "Busy coding" });
        assert.equal(r.status, 200);
        assert.equal(r.data.user.about, "Busy coding");
        assert.ok(!r.data.user.phone);

        r = await t.api("PUT", "/api/auth/update-profile", a.token, { username: "Prof A2", phone: b.phone });
        assert.equal(r.status, 409);

        r = await t.api("PUT", "/api/auth/update-profile", a.token, { username: "Prof A2", about: "x".repeat(141) });
        assert.equal(r.status, 400);
    });

    it("sends security headers and JSON errors", async () => {
        const r = await t.api("GET", "/nope");
        assert.equal(r.status, 404);
        assert.ok(r.data.message);
        assert.equal(r.headers.get("x-content-type-options"), "nosniff");
        assert.ok(!r.headers.get("x-powered-by"));
    });

    it("allows the Android app origin (and the configured website) but not other sites (CORS)", async () => {
        const preflight = (origin) =>
            fetch(`${t.base}/api/auth/login`, {
                method: "OPTIONS",
                headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,authorization" },
            });

        for (const origin of ["https://localhost", "capacitor://localhost", "http://localhost:5173"]) {
            assert.equal((await preflight(origin)).headers.get("access-control-allow-origin"), origin, `${origin} should be allowed`);
        }
        assert.equal((await preflight("https://evil.example")).headers.get("access-control-allow-origin"), null);
    });

    it("emails are captured in the test outbox, never really sent", () => {
        assert.ok(sendEmail.outbox.length > 0);
    });
});
