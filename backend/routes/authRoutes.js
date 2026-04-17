const express = require("express");
const router = express.Router();

const {
    register,
    login,
    logout,
    updateProfile,
    googleAuth,
    verifyOTP,
    forgotPassword,
    resetPassword,
} = require("../controllers/authController");

const authMiddleware = require("../middleware/authMiddleware");

// optional validation
const validateGoogleAuth = (req, res, next) => {
    if (!req.body.credential) {
        return res.status(400).json({
            message: "Google credential is required",
        });
    }
    next();
};

// 🔐 Register + OTP
router.post("/register", register);
router.post("/verify-otp", verifyOTP);

// 🔑 Login
router.post("/login", login);
// update profile
router.put("/update-profile", authMiddleware, updateProfile);
// 🔵 Google login
router.post("/google", validateGoogleAuth, googleAuth);

// 🔁 Password reset
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// 🚪 Logout (protected)
router.post("/logout", authMiddleware, logout);

module.exports = router;