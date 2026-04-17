const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        content: {
            data: {
                type: String,
                required: true,
            },
            iv: {
                type: String,
                required: true,
            },
            tag: {
                type: String,
                required: true,
            },
        },

        // -----------------------------
        // DELIVERY STATUS
        // -----------------------------
        delivered: {
            type: Boolean,
            default: false,
        },

        deliveredAt: {
            type: Date,
        },

        // -----------------------------
        // READ STATUS
        // -----------------------------
        read: {
            type: Boolean,
            default: false,
            index: true,
        },

        readAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

/**
 * -----------------------------
 * INDEXES (IMPORTANT)
 * -----------------------------
 */

// Fast chat query (existing)
MessageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });

// Fast unread messages lookup
MessageSchema.index({ receiver: 1, read: 1 });

// Optional: sort conversations faster
MessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Message", MessageSchema);