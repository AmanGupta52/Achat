const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
        },

        phone: {
            type: String,
            unique: true,
            sparse: true,
        },

        password: {
            type: String,
            required: function () {
                return this.authProvider === "local";
            },
        },

        authProvider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
        },

        googleId: {
            type: String,
            default: null,
        },

        // 🔐 OTP SYSTEM
        otp: {
            type: String,
            default: null,
        },

        otpExpiry: {
            type: Date,
            default: null,
        },

        otpType: {
            type: String,
            enum: ["verify", "reset"],
            default: null,
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        isOnline: {
            type: Boolean,
            default: false,
        },

        connectionRequestsSent: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],

        connectionRequestsReceived: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        connections: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);