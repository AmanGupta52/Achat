const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
/**
 * Generate JWT
 */
const generateToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};

/**
 * Generate OTP
 */
const generateOTP = () =>
    Math.floor(100000 + Math.random() * 900000).toString();

/**
 * REGISTER USER (with OTP)
 */
exports.register = async (req, res) => {
    try {
        const { username, phone, email, password } = req.body;

        if (!username || !phone || !password) {
            return res.status(400).json({ message: "All required fields missing" });
        }

        const existingUser = await User.findOne({
            $or: [{ phone }, { email }],
        });

        if (existingUser) {
            return res.status(409).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const otp = generateOTP();

        await User.create({
            username,
            phone,
            email,
            password: hashedPassword,
            authProvider: "local",
            otp,
            otpExpiry: Date.now() + 5 * 60 * 1000,
            isVerified: false,
        });

        await sendEmail(
            email,
            "🔐 Verify Your Account",
            `
    <h2>Account Verification</h2>
    <p>Hello <b>${username || "User"}</b>,</p>

    <p>Welcome! Please verify your account using the OTP below:</p>

    <h1 style="letter-spacing: 5px;">${otp}</h1>

    <p>This OTP is valid for <b>5 minutes</b>.</p>

    <p>If you did not create this account, ignore this email.</p>

    <p style="color:red;"><b>Do not share this OTP.</b></p>

    <br/>
    <p>— WhatsApp Clone Team</p>
    `
        );
        res.status(200).json({
            message: "OTP sent. Please verify your account",
        });

    } catch (error) {
        res.status(500).json({ message: "Registration failed" });
    }
};

/**
 * VERIFY OTP
 */
exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.otp !== otp || user.otpExpiry < Date.now()) {
            return res.status(400).json({
                message: "Invalid or expired OTP",
            });
        }

        user.isVerified = true;
        user.otp = null;
        user.otpExpiry = null;

        await user.save();

        const token = generateToken(user._id);

        res.json({
            message: "Account verified",
            accessToken: token,
            user,
        });

    } catch (error) {
        res.status(500).json({ message: "OTP verification failed" });
    }
};

/**
 * LOGIN USER
 */
exports.login = async (req, res) => {
    try {
        const { loginId, password } = req.body;

        if (!loginId || !password) {
            return res.status(400).json({
                message: "Phone/email and password required",
            });
        }

        const user = await User.findOne({
            $or: [{ phone: loginId }, { email: loginId }],
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 🔒 block unverified users
        if (!user.isVerified) {
            return res.status(403).json({
                message: "Please verify your account first",
            });
        }

        if (!user.password) {
            return res.status(400).json({
                message: "Password not set. Use Google login.",
            });
        }

        if (user.authProvider === "google") {
            return res.status(400).json({
                message: "Please login using Google",
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        user.isOnline = true;
        await user.save();

        const token = generateToken(user._id);

        res.status(200).json({
            message: "Login successful",
            accessToken: token,
            user,
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);
        res.status(500).json({ message: "Login failed" });
    }
};

/**
 * FORGOT PASSWORD (send OTP)
 */
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });

        const otp = generateOTP();

        user.otp = otp;
        user.otpExpiry = Date.now() + 5 * 60 * 1000;

        await user.save();

        await sendEmail(
            email,
            "🔐 Password Reset OTP",
            `
    <h2>Password Reset Request</h2>
    <p>Hello <b>${user.username || "User"}</b>,</p>

    <p>Your OTP is:</p>
    <h1 style="letter-spacing: 5px;">${otp}</h1>

    <p>This OTP is valid for <b>5 minutes</b>.</p>

    <p>If you didn’t request this, ignore this email.</p>

    <p style="color:red;"><b>Do not share this OTP.</b></p>

    <br/>
    <p>— WhatsApp Clone Team</p>
    `
        );
        res.json({ message: "OTP sent for password reset" });

    } catch (error) {
        res.status(500).json({ message: "Failed to send OTP" });
    }
};

/**
 * RESET PASSWORD
 */
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.otp !== otp || user.otpExpiry < Date.now()) {
            return res.status(400).json({
                message: "Invalid or expired OTP",
            });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.otp = null;
        user.otpExpiry = null;

        await user.save();

        res.json({ message: "Password reset successful" });

    } catch (error) {
        res.status(500).json({ message: "Reset failed" });
    }
};

/**
 * GOOGLE AUTH (LOGIN / SIGNUP)
 */
exports.googleAuth = async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({
                message: "Google credential token is required",
            });
        }

        // 1. Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();

        const { sub: googleId, email, name, email_verified } = payload;

        if (!email) {
            return res.status(400).json({
                message: "Google account has no email",
            });
        }

        if (!email_verified) {
            return res.status(403).json({
                message: "Google email not verified",
            });
        }

        // 2. Find user
        let user = await User.findOne({ email });

        // 3. Create if not exists
        if (!user) {
            user = await User.create({
                username: name,
                email,
                googleId,
                authProvider: "google",
                isVerified: true,
                password: null,
                isOnline: true,
            });
        }

        // 4. Link Google account ONLY (do not overwrite auth type)
        if (!user.googleId) {
            user.googleId = googleId;
        }

        user.isOnline = true;
        user.isVerified = true;

        await user.save();

        // 5. JWT
        const token = generateToken(user._id);

        return res.status(200).json({
            message: "Google login successful",
            accessToken: token,
            user,
        });

    } catch (error) {
        console.error("GOOGLE AUTH ERROR:", error);

        return res.status(500).json({
            message: "Google authentication failed",
        });
    }
};
/**
 * UPDATE PROFILE (username + phone only)
 */
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { username, phone } = req.body;

        // ❌ email not allowed
        if (req.body.email) {
            return res.status(400).json({
                message: "Email cannot be changed",
            });
        }

        // validation
        if (!username || !phone) {
            return res.status(400).json({
                message: "Username and phone are required",
            });
        }

        // check phone uniqueness
        const existingUser = await User.findOne({
            phone,
            _id: { $ne: userId },
        });

        if (existingUser) {
            return res.status(409).json({
                message: "Phone already in use",
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        user.username = username;
        user.phone = phone;

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user,
        });

    } catch (error) {
        console.error("UPDATE PROFILE ERROR:", error);
        res.status(500).json({
            message: "Failed to update profile",
        });
    }
};
/**
 * LOGOUT
 */
exports.logout = async (req, res) => {
    try {
        req.user.isOnline = false;
        await req.user.save();

        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ message: "Logout failed" });
    }
};