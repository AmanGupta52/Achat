const mongoose = require("mongoose");

const ref = { type: mongoose.Schema.Types.ObjectId, ref: "User" };

const UserSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, trim: true, maxlength: 50 },

        email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },

        phone: { type: String, unique: true, sparse: true, trim: true },

        // Secrets are `select: false` so they can never leak by accident.
        // Use `.select("+password")` explicitly where they are really needed.
        password: {
            type: String,
            select: false,
            required: function () {
                return this.authProvider === "local";
            },
        },

        authProvider: { type: String, enum: ["local", "google"], default: "local" },
        googleId: { type: String, default: null },

        // OTP system
        otp: { type: String, default: null, select: false },
        otpExpiry: { type: Date, default: null, select: false },
        otpType: { type: String, enum: ["verify", "reset", null], default: null, select: false },
        otpAttempts: { type: Number, default: 0, select: false },

        isVerified: { type: Boolean, default: false },

        // Profile
        about: { type: String, default: "Hey there! I am using Achat.", maxlength: 140, trim: true },
        // Avatar image is stored in the DB (Render's disk is wiped on every deploy).
        // `avatarVersion` changes on every update so browsers can cache the image forever.
        avatar: {
            type: new mongoose.Schema({ data: Buffer, contentType: String }, { _id: false }),
            select: false,
        },
        avatarVersion: { type: Number, default: 0 },

        isOnline: { type: Boolean, default: false },
        lastSeen: { type: Date, default: Date.now },

        connectionRequestsSent: [ref],
        connectionRequestsReceived: [ref],
        connections: [ref],
        blocked: [ref],
    },
    { timestamps: true }
);

// Search support
UserSchema.index({ username: 1 });

module.exports = mongoose.model("User", UserSchema);
