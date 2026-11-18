const express = require("express");
const router = express.Router();

const c = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const rateLimit = require("../utils/rateLimit");

// Brute-force protection for every unauthenticated endpoint
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });

const validateGoogleAuth = (req, res, next) => {
    if (!req.body.credential) {
        return res.status(400).json({ message: "Google credential is required" });
    }
    next();
};

// 🔐 Register + OTP
router.post("/register", limiter, c.register);
router.post("/verify-otp", limiter, c.verifyOTP);
router.post("/resend-otp", limiter, c.resendOTP);

// 🔑 Login
router.post("/login", limiter, c.login);
router.post("/google", limiter, validateGoogleAuth, c.googleAuth);

// 🔁 Password reset
router.post("/forgot-password", limiter, c.forgotPassword);
router.post("/reset-password", limiter, c.resetPassword);

// 👤 Protected
router.get("/me", authMiddleware, c.me);
router.put("/update-profile", authMiddleware, c.updateProfile);
router.post("/heartbeat", authMiddleware, c.heartbeat);
router.post("/logout", authMiddleware, c.logout);

module.exports = router;
