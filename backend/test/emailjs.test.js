const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

// These tests use the REAL EmailJS client against a local mock of the EmailJS REST API.
process.env.NODE_ENV = "test";
delete process.env.REDIS_URL;

describe("EmailJS delivery", () => {
    let server, apiUrl, requests, nextResponse;

    const setEnv = () => {
        process.env.EMAILJS_SERVICE_ID = "service_test";
        process.env.EMAILJS_TEMPLATE_ID = "template_test";
        process.env.EMAILJS_PUBLIC_KEY = "public_test";
        process.env.EMAILJS_PRIVATE_KEY = "private_test";
        process.env.EMAILJS_API_URL = apiUrl;
    };

    before(async () => {
        requests = [];
        nextResponse = { status: 200, body: "OK" };
        server = http.createServer((req, res) => {
            let raw = "";
            req.on("data", (c) => (raw += c));
            req.on("end", () => {
                requests.push({ method: req.method, url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
                res.writeHead(nextResponse.status, { "Content-Type": "text/plain" });
                res.end(nextResponse.body);
            });
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        apiUrl = `http://127.0.0.1:${server.address().port}/api/v1.0/email/send`;
        setEnv();
    });

    after(async () => {
        await new Promise((r) => server.close(r));
        for (const k of ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY", "EMAILJS_API_URL"]) delete process.env[k];
    });

    it("posts the exact payload EmailJS expects", async () => {
        const mailer = require("../utils/mailer");
        requests.length = 0;
        await mailer.sendOtpEmail({ to: "ana@test.com", name: "Ana", purpose: "verify", otp: "123456" });

        assert.equal(requests.length, 1);
        const r = requests[0];
        assert.equal(r.method, "POST");
        assert.match(r.headers["content-type"], /application\/json/);
        assert.equal(r.body.service_id, "service_test");
        assert.equal(r.body.template_id, "template_test");
        assert.equal(r.body.user_id, "public_test");
        assert.equal(r.body.accessToken, "private_test");

        const p = r.body.template_params;
        assert.equal(p.to_email, "ana@test.com");
        assert.equal(p.to_name, "Ana");
        assert.equal(p.otp, "123456");
        assert.equal(p.otp_display, "block");
        assert.equal(p.expiry_minutes, "5");
        assert.equal(p.app_name, "Achat");
        assert.match(p.subject, /Verify your Achat account/);
        assert.ok(p.title && p.message && p.year);
    });

    it("omits the private key when none is configured", async () => {
        const mailer = require("../utils/mailer");
        delete process.env.EMAILJS_PRIVATE_KEY;
        requests.length = 0;
        await mailer.sendWelcomeEmail({ to: "ana@test.com", name: "Ana" });
        assert.ok(!("accessToken" in requests[0].body));
        assert.equal(requests[0].body.template_params.otp_display, "none");
        process.env.EMAILJS_PRIVATE_KEY = "private_test";
    });

    it("turns EmailJS errors into readable messages", async () => {
        const mailer = require("../utils/mailer");

        nextResponse = { status: 403, body: "API calls are disabled for non-browser applications" };
        await assert.rejects(() => mailer.sendOtpEmail({ to: "a@b.com", name: "A", purpose: "reset", otp: "111111" }), /Allow EmailJS API for non-browser/);

        nextResponse = { status: 400, body: "The service ID not found" };
        await assert.rejects(() => mailer.sendOtpEmail({ to: "a@b.com", name: "A", purpose: "reset", otp: "111111" }), /EMAILJS_SERVICE_ID/);

        nextResponse = { status: 200, body: "OK" };
    });

    it("reports a failed email as a friendly 502 and keeps the account unverified", async () => {
        const { startServer, mongoose } = require("./helpers");
        const t = await startServer();
        try {
            nextResponse = { status: 412, body: "Gmail_API: invalid grant" };
            const r = await t.api("POST", "/api/auth/register", null, { username: "Fail", email: "fail@test.com", phone: "9666666666", password: "pass1234" });
            assert.equal(r.status, 502);
            assert.match(r.data.message, /couldn't send the verification email/);
            assert.ok(!/EmailJS|412|Gmail/.test(r.data.message), "internal details must not reach the client");

            const user = await mongoose.connection.collection("users").findOne({ email: "fail@test.com" });
            assert.equal(user.isVerified, false);

            // once EmailJS works again the same person can simply try again
            nextResponse = { status: 200, body: "OK" };
            const retry = await t.api("POST", "/api/auth/register", null, { username: "Fail", email: "fail@test.com", phone: "9666666666", password: "pass1234" });
            assert.equal(retry.status, 200);
        } finally {
            await t.stop();
        }
    });

    it("without EmailJS: prints the code in development, refuses in production", async () => {
        const mailer = require("../utils/mailer");
        const saved = { ...process.env };
        for (const k of ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_API_URL"]) delete process.env[k];

        const logs = [];
        const origLog = console.log;
        console.log = (...a) => logs.push(a.join(" "));
        try {
            process.env.NODE_ENV = "development";
            await mailer.sendOtpEmail({ to: "dev@test.com", name: "Dev", purpose: "verify", otp: "424242" });
            assert.ok(logs.some((l) => l.includes("424242") && l.includes("dev@test.com")), "OTP shown in the terminal");

            process.env.NODE_ENV = "production";
            await assert.rejects(() => mailer.sendOtpEmail({ to: "dev@test.com", name: "Dev", purpose: "verify", otp: "424242" }), /not configured/);
        } finally {
            console.log = origLog;
            Object.assign(process.env, saved);
            process.env.NODE_ENV = "test";
        }
    });
});
