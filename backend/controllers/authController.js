const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/User");
const mailer = require("../utils/mailer");
const { findOrCreateGoogleUser } = require("../utils/googleUser");
const { toSelfUser } = require("../utils/sanitize");
const { disconnectUser } = require("../socket/socket");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const OTP_TTL_MS = mailer.OTP_TTL_MINUTES * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const OTP_FIELDS = "+otp +otpExpiry +otpType +otpAttempts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const generateToken = (userId) =>
    jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });

const generateOTP = () => crypto.randomInt(100000, 1000000).toString();

const normalizeEmail = (v) => String(v || "").trim().toLowerCase();
const normalizePhone = (v) => String(v || "").replace(/[\s()-]/g, "");

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RX = /^\+?\d{7,15}$/;

/** Store a fresh OTP (atomic) and return it. */
const issueOtp = async (userId, type) => {
    const otp = generateOTP();
    await User.updateOne(
        { _id: userId },
        { $set: { otp, otpType: type, otpExpiry: new Date(Date.now() + OTP_TTL_MS), otpAttempts: 0 } }
    );
    return otp;
};

/**
 * Validate an OTP. Wrong guesses are counted; after MAX_OTP_ATTEMPTS the code is dead.
 * Returns null when valid, otherwise { status, message }.
 */
const checkOtp = async (user, otp, type) => {
    if (!user.otp || user.otpType !== type || !user.otpExpiry || user.otpExpiry < new Date()) {
        return { status: 400, message: "Invalid or expired OTP" };
    }

    if ((user.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
        return { status: 429, message: "Too many wrong attempts. Please request a new OTP." };
    }

    if (String(otp || "").trim() !== user.otp) {
        await User.updateOne({ _id: user._id }, { $inc: { otpAttempts: 1 } });
        return { status: 400, message: "Invalid or expired OTP" };
    }

    return null;
};

const sendSession = (res, user, message) =>
    res.status(200).json({ message, accessToken: generateToken(user._id), user: toSelfUser(user) });

// ---------------------------------------------------------------------------
// REGISTER (step 1) → sends OTP
// ---------------------------------------------------------------------------
exports.register = async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const email = normalizeEmail(req.body.email);
        const phone = normalizePhone(req.body.phone);
        const password = String(req.body.password || "");

        if (username.length < 2 || username.length > 50) {
            return res.status(400).json({ message: "Name must be 2–50 characters" });
        }
        if (!EMAIL_RX.test(email)) return res.status(400).json({ message: "Enter a valid email address" });
        if (!PHONE_RX.test(phone)) return res.status(400).json({ message: "Enter a valid phone number (7–15 digits)" });
        if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

        const existing = await User.findOne({ $or: [{ email }, { phone }] });

        // A verified account blocks the email/phone. An UNVERIFIED one is just an abandoned
        // sign-up (e.g. the OTP mail never arrived) — let the person start over.
        if (existing && (existing.isVerified || existing.authProvider !== "local")) {
            const field = existing.email === email ? "email" : "phone number";
            return res.status(409).json({ message: `An account with this ${field} already exists` });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        let user;

        if (existing) {
            existing.username = username;
            existing.email = email;
            existing.phone = phone;
            existing.password = hashedPassword;
            user = await existing.save();
        } else {
            user = await User.create({
                username,
                email,
                phone,
                password: hashedPassword,
                authProvider: "local",
                isVerified: false,
            });
        }

        const otp = await issueOtp(user._id, "verify");

        try {
            await mailer.sendOtpEmail({ to: email, name: username, purpose: "verify", otp });
        } catch (mailErr) {
            console.error("OTP EMAIL ERROR:", mailErr.message);
            return res.status(502).json({
                message: "We couldn't send the verification email. Please check the address and try again.",
            });
        }

        res.status(200).json({ message: "OTP sent. Please verify your account" });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "An account with this email or phone already exists" });
        }
        console.error("REGISTER ERROR:", error);
        res.status(500).json({ message: "Registration failed" });
    }
};

// ---------------------------------------------------------------------------
// RESEND VERIFICATION OTP
// ---------------------------------------------------------------------------
exports.resendOTP = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const user = await User.findOne({ email });

        // Same answer whether or not the account exists (no user enumeration)
        if (user && !user.isVerified && user.authProvider === "local") {
            const otp = await issueOtp(user._id, "verify");
            await mailer.sendOtpEmail({ to: email, name: user.username, purpose: "verify", otp, resend: true });
        }

        res.json({ message: "If the account is waiting for verification, a new OTP has been sent" });
    } catch (error) {
        console.error("RESEND OTP ERROR:", error);
        res.status(500).json({ message: "Failed to send OTP" });
    }
};

// ---------------------------------------------------------------------------
// VERIFY OTP (step 2) → logs the user in
// ---------------------------------------------------------------------------
exports.verifyOTP = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const user = await User.findOne({ email }).select(OTP_FIELDS);

        if (!user) return res.status(400).json({ message: "Invalid or expired OTP" });

        const problem = await checkOtp(user, req.body.otp, "verify");
        if (problem) return res.status(problem.status).json({ message: problem.message });

        await User.updateOne(
            { _id: user._id },
            { $set: { isVerified: true, otp: null, otpExpiry: null, otpType: null, otpAttempts: 0 } }
        );

        user.isVerified = true;

        // best effort — never block the sign-up because of an email problem
        mailer.sendWelcomeEmail({ to: user.email, name: user.username }).catch((err) =>
            console.error("WELCOME EMAIL ERROR:", err.message)
        );

        sendSession(res, user, "Account verified");
    } catch (error) {
        console.error("VERIFY OTP ERROR:", error);
        res.status(500).json({ message: "OTP verification failed" });
    }
};

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
exports.login = async (req, res) => {
    try {
        const loginId = String(req.body.loginId || "").trim();
        const password = String(req.body.password || "");

        if (!loginId || !password) {
            return res.status(400).json({ message: "Phone/email and password required" });
        }

        const user = await User.findOne({
            $or: [{ email: loginId.toLowerCase() }, { phone: normalizePhone(loginId) }],
        }).select("+password");

        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.authProvider === "google" && !user.password) {
            return res.status(400).json({ message: "This account uses Google. Please sign in with Google." });
        }

        const isMatch = user.password && (await bcrypt.compare(password, user.password));
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        if (!user.isVerified) {
            return res.status(403).json({
                message: "Please verify your account first",
                needsVerification: true,
                email: user.email,
            });
        }

        sendSession(res, user, "Login successful");
    } catch (error) {
        console.error("LOGIN ERROR:", error);
        res.status(500).json({ message: "Login failed" });
    }
};

// ---------------------------------------------------------------------------
// FORGOT PASSWORD → sends OTP
// ---------------------------------------------------------------------------
exports.forgotPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        if (!EMAIL_RX.test(email)) return res.status(400).json({ message: "Enter a valid email address" });

        const user = await User.findOne({ email });

        // Always the same response → attackers can't discover which emails are registered
        if (user && user.authProvider === "local") {
            const otp = await issueOtp(user._id, "reset");
            await mailer.sendOtpEmail({ to: email, name: user.username, purpose: "reset", otp });
        }

        res.json({ message: "If an account exists for this email, a reset code has been sent" });
    } catch (error) {
        console.error("FORGOT PASSWORD ERROR:", error);
        res.status(500).json({ message: "Failed to send OTP" });
    }
};

// ---------------------------------------------------------------------------
// RESET PASSWORD
// ---------------------------------------------------------------------------
exports.resetPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const newPassword = String(req.body.newPassword || "");

        if (newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const user = await User.findOne({ email }).select(OTP_FIELDS);
        if (!user) return res.status(400).json({ message: "Invalid or expired OTP" });

        const problem = await checkOtp(user, req.body.otp, "reset");
        if (problem) return res.status(problem.status).json({ message: problem.message });

        const hashed = await bcrypt.hash(newPassword, 10);

        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    password: hashed,
                    isVerified: true, // reaching this point proves they own the email
                    otp: null,
                    otpExpiry: null,
                    otpType: null,
                    otpAttempts: 0,
                },
            }
        );

        mailer.sendPasswordChangedEmail({ to: user.email, name: user.username }).catch((err) =>
            console.error("PASSWORD CHANGED EMAIL ERROR:", err.message)
        );

        res.json({ message: "Password reset successful" });
    } catch (error) {
        console.error("RESET PASSWORD ERROR:", error);
        res.status(500).json({ message: "Reset failed" });
    }
};

// ---------------------------------------------------------------------------
// GOOGLE LOGIN / SIGN-UP
// ---------------------------------------------------------------------------
exports.googleAuth = async (req, res) => {
    try {
        const { credential } = req.body;

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const { sub: googleId, email, name, email_verified } = ticket.getPayload();

        if (!email) return res.status(400).json({ message: "Google account has no email" });
        if (!email_verified) return res.status(403).json({ message: "Google email not verified" });

        const user = await findOrCreateGoogleUser({ email, name, googleId });

        sendSession(res, user, "Google login successful");
    } catch (error) {
        console.error("GOOGLE AUTH ERROR:", error.message);
        res.status(401).json({ message: "Google authentication failed" });
    }
};

// ---------------------------------------------------------------------------
// CURRENT USER (used to validate a stored session on app start)
// ---------------------------------------------------------------------------
exports.me = async (req, res) => {
    res.json({ user: toSelfUser(req.user) });
};

// ---------------------------------------------------------------------------
// UPDATE PROFILE (username + phone only)
// ---------------------------------------------------------------------------
exports.updateProfile = async (req, res) => {
    try {
        if (req.body.email) return res.status(400).json({ message: "Email cannot be changed" });

        const username = String(req.body.username || "").trim();
        const phone = normalizePhone(req.body.phone);
        const about = req.body.about === undefined ? undefined : String(req.body.about).trim();

        if (username.length < 2 || username.length > 50) {
            return res.status(400).json({ message: "Name must be 2–50 characters" });
        }
        if (about !== undefined && about.length > 140) {
            return res.status(400).json({ message: "About must be 140 characters or fewer" });
        }
        if (phone && !PHONE_RX.test(phone)) {
            return res.status(400).json({ message: "Enter a valid phone number (7–15 digits)" });
        }

        if (phone) {
            const taken = await User.exists({ phone, _id: { $ne: req.user._id } });
            if (taken) return res.status(409).json({ message: "Phone already in use" });
        }

        // Google users have no phone — an empty value removes it instead of storing ""
        const update = phone
            ? { $set: { username, phone } }
            : { $set: { username }, $unset: { phone: 1 } };
        if (about !== undefined) update.$set.about = about;

        const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });

        res.status(200).json({ message: "Profile updated successfully", user: toSelfUser(user) });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: "Phone already in use" });
        console.error("UPDATE PROFILE ERROR:", error);
        res.status(500).json({ message: "Failed to update profile" });
    }
};

// ---------------------------------------------------------------------------
// HEARTBEAT (fallback presence when websockets are blocked)
// ---------------------------------------------------------------------------
exports.heartbeat = async (req, res) => {
    try {
        await User.updateOne({ _id: req.user._id }, { $set: { isOnline: true, lastSeen: new Date() } });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: "Heartbeat failed" });
    }
};

// ---------------------------------------------------------------------------
// LOGOUT
// ---------------------------------------------------------------------------
exports.logout = async (req, res) => {
    try {
        await User.updateOne({ _id: req.user._id }, { $set: { isOnline: false, lastSeen: new Date() } });
        disconnectUser(req.user._id);
        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ message: "Logout failed" });
    }
};

// ---------------------------------------------------------------------------
// AVATAR (profile picture)
// ---------------------------------------------------------------------------
const MAX_AVATAR_BYTES = 200 * 1024;

/** Identify the image by its real bytes — the declared type can't be trusted. */
const sniffImage = (buf) => {
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
    if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return "image/png";
    }
    if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }
    return null;
};

/** PUT /api/auth/avatar  { image: "data:image/jpeg;base64,..." } */
exports.uploadAvatar = async (req, res) => {
    try {
        const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image || ""));
        if (!match) return res.status(400).json({ message: "Please choose a JPEG, PNG or WebP image" });

        const data = Buffer.from(match[1], "base64");
        if (data.length > MAX_AVATAR_BYTES) {
            return res.status(413).json({ message: "Image is too large (max 200 KB after resizing)" });
        }

        const contentType = sniffImage(data);
        if (!contentType) return res.status(400).json({ message: "That file is not a valid image" });

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { avatar: { data, contentType }, avatarVersion: Date.now() } },
            { new: true }
        );

        res.json({ message: "Profile picture updated", user: toSelfUser(user) });
    } catch (error) {
        console.error("UPLOAD AVATAR ERROR:", error);
        res.status(500).json({ message: "Failed to update profile picture" });
    }
};

/** DELETE /api/auth/avatar */
exports.removeAvatar = async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $unset: { avatar: 1 }, $set: { avatarVersion: 0 } },
            { new: true }
        );
        res.json({ message: "Profile picture removed", user: toSelfUser(user) });
    } catch (error) {
        console.error("REMOVE AVATAR ERROR:", error);
        res.status(500).json({ message: "Failed to remove profile picture" });
    }
};
