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

        // -----------------------------
        // REPLY / REACTIONS / EDIT
        // -----------------------------
        replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },

        // one reaction per person per message
        reactions: [
            {
                _id: false,
                user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                emoji: { type: String, required: true },
            },
        ],

        editedAt: { type: Date },

        // -----------------------------
        // DELETION
        // -----------------------------
        // "Delete for me": users who removed this message from their own view
        deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

        // "Delete for everyone": the text is erased for both people
        deletedForEveryone: { type: Boolean, default: false },
        deletedAt: { type: Date },
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