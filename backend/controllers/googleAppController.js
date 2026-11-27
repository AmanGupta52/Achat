/**
 * "Continue with Google" for the Android app.
 *
 * Google does not allow sign-in inside an embedded WebView, so the app opens the system browser
 * (Chrome Custom Tab) and the sign-in goes through the backend:
 *
 *   app ──(PKCE challenge)──▶ GET  /api/auth/google/start       → redirects to Google
 *   Google ─────────────────▶ GET  /api/auth/google/callback    → verifies, creates a one-time code,
 *                                                                  shows a page that opens achat://auth?code=…
 *   app ──(code + verifier)─▶ POST /api/auth/google/exchange    → session (token + user)
 *
 * The one-time code is useless without the verifier that never left the app (PKCE), so another
 * app that also claims the achat:// link cannot steal the login.
 */
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/User");
const GoogleLoginCode = require("../models/GoogleLoginCode");
const { toSelfUser } = require("../utils/sanitize");
const { findOrCreateGoogleUser } = require("../utils/googleUser");

const APP_SCHEME = "achat";
const GOOGLE_AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const CHALLENGE_RX = /^[A-Za-z0-9_-]{43}$/; // base64url(SHA-256) is always 43 characters

const sha256Hex = (s) => crypto.createHash("sha256").update(s).digest("hex");
const sha256Base64Url = (s) => crypto.createHash("sha256").update(s).digest("base64url");
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const isConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The exact URL registered in Google Cloud → "Authorized redirect URIs". */
const redirectUri = (req) => {
    const base = process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get("host")}`;
    return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
};

/** A small page that sends the browser back to the app (works even when the browser blocks automatic redirects). */
const backToApp = (res, params, { status = 200 } = {}) => {
    const link = `${APP_SCHEME}://auth?${new URLSearchParams(params).toString()}`;
    const failed = !!params.error;
    // helmet's default CSP forbids inline scripts, which silently disabled the auto-redirect below.
    // This page gets its own strict policy that only allows its own (nonce-marked) style and script.
    const nonce = crypto.randomBytes(16).toString("base64");
    res.set(
        "Content-Security-Policy",
        `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    );
    res.status(status).set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Achat</title>
<meta http-equiv="refresh" content="0;url=${escapeHtml(link)}">
<meta name="color-scheme" content="light dark">
<style nonce="${nonce}">body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:#f0f2f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111b21}
.card{background:#fff;border-radius:16px;padding:32px 28px;max-width:360px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.ico{font-size:40px}h1{font-size:22px;margin:12px 0 8px}p{color:#3b4a54;font-size:16px;line-height:1.5;margin:0 0 22px}
a{display:inline-block;background:#008069;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-weight:600;font-size:16px}
@media (prefers-color-scheme:dark){body{background:#0b141a;color:#e9edef}.card{background:#111b21;box-shadow:none;border:1px solid #2c3a42}p{color:#aebac1}}</style></head>
<body><div class="card"><div class="ico">${failed ? "⚠️" : "✅"}</div>
<h1>${failed ? "Sign-in didn't finish" : "Signed in with Google"}</h1>
<p>${failed ? escapeHtml(params.error) : "Returning to the Achat app…"}</p>
<a href="${escapeHtml(link)}">Open Achat</a></div>
<script nonce="${nonce}">setTimeout(function(){location.href=${JSON.stringify(link).replace(/</g, "\\u003c")}},50)</script></body></html>`);
};

/** GET /api/auth/google/start?challenge=<base64url(sha256(verifier))> */
exports.start = (req, res) => {
    const challenge = String(req.query.challenge || "");

    if (!isConfigured()) {
        return backToApp(res, { error: "Google sign-in isn't set up on the server yet." }, { status: 503 });
    }
    if (!CHALLENGE_RX.test(challenge)) {
        return backToApp(res, { error: "Invalid sign-in request. Please try again from the app." }, { status: 400 });
    }

    // the state carries the PKCE challenge through Google and back, signed so it can't be forged
    const state = jwt.sign({ purpose: "google-app", ch: challenge }, process.env.JWT_SECRET, { expiresIn: "10m" });

    const url = new URL(GOOGLE_AUTH_URL());
    url.search = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri(req),
        response_type: "code",
        scope: "openid email profile",
        state,
        prompt: "select_account",
    }).toString();

    res.redirect(url.toString());
};

/** GET /api/auth/google/callback?code=…&state=… (Google sends the browser here) */
exports.callback = async (req, res) => {
    try {
        let challenge;
        try {
            const decoded = jwt.verify(String(req.query.state || ""), process.env.JWT_SECRET);
            if (decoded.purpose !== "google-app") throw new Error("wrong purpose");
            challenge = decoded.ch;
        } catch {
            return backToApp(res, { error: "This sign-in link expired. Please try again." });
        }

        if (req.query.error) return backToApp(res, { error: "Google sign-in was cancelled." });
        if (!req.query.code) return backToApp(res, { error: "Google did not return a sign-in code." });

        // 1) trade Google's code for an ID token
        const tokenRes = await fetch(GOOGLE_TOKEN_URL(), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code: String(req.query.code),
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri(req),
                grant_type: "authorization_code",
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!tokenRes.ok) {
            console.error("GOOGLE TOKEN ERROR:", tokenRes.status, (await tokenRes.text()).slice(0, 300));
            return backToApp(res, { error: "Google rejected the sign-in. Please try again." });
        }
        const { id_token: idToken } = await tokenRes.json();

        // 2) verify the ID token (signature, audience, expiry)
        const ticket = await new OAuth2Client(process.env.GOOGLE_CLIENT_ID).verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const { sub: googleId, email, name, email_verified: emailVerified } = ticket.getPayload();

        if (!email) return backToApp(res, { error: "Your Google account has no email address." });
        if (!emailVerified) return backToApp(res, { error: "Your Google email is not verified." });

        // 3) find / create the account and hand the app a one-time code
        const user = await findOrCreateGoogleUser({ email, name, googleId });
        const code = crypto.randomBytes(32).toString("hex");
        await GoogleLoginCode.create({ codeHash: sha256Hex(code), user: user._id, challenge });

        return backToApp(res, { code });
    } catch (err) {
        console.error("GOOGLE CALLBACK ERROR:", err.message);
        return backToApp(res, { error: "Google sign-in failed. Please try again." });
    }
};

/** POST /api/auth/google/exchange  { code, verifier } → { accessToken, user } */
exports.exchange = async (req, res) => {
    try {
        const code = String(req.body.code || "");
        const verifier = String(req.body.verifier || "");
        if (!/^[a-f0-9]{64}$/.test(code) || verifier.length < 32 || verifier.length > 256) {
            return res.status(400).json({ message: "Invalid sign-in request" });
        }

        // deleting on lookup makes the code single-use, even when the verifier turns out to be wrong
        const record = await GoogleLoginCode.findOneAndDelete({ codeHash: sha256Hex(code) });
        if (!record || record.expiresAt < new Date()) {
            return res.status(400).json({ message: "This sign-in expired. Please try again." });
        }

        const expected = Buffer.from(record.challenge);
        const actual = Buffer.from(sha256Base64Url(verifier));
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
            return res.status(400).json({ message: "Sign-in could not be verified. Please try again." });
        }

        const user = await User.findById(record.user);
        if (!user) return res.status(400).json({ message: "Account not found" });

        res.json({
            message: "Google login successful",
            accessToken: jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" }),
            user: toSelfUser(user),
        });
    } catch (err) {
        console.error("GOOGLE EXCHANGE ERROR:", err.message);
        res.status(500).json({ message: "Google sign-in failed" });
    }
};

exports.isConfigured = isConfigured;
