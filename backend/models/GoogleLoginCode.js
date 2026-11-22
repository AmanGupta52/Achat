const mongoose = require("mongoose");

/**
 * One-time code handed to the Android app after a successful Google sign-in in the browser.
 * It is only useful together with the PKCE `verifier` the app generated, lives for 2 minutes
 * and is deleted on first use. (Only a SHA-256 hash of the code is stored.)
 */
const GoogleLoginCodeSchema = new mongoose.Schema({
    codeHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    challenge: { type: String, required: true },
    expiresAt: { type: Date, required: true, default: () => new Date(Date.now() + 2 * 60 * 1000), index: { expireAfterSeconds: 0 } },
});

module.exports = mongoose.model("GoogleLoginCode", GoogleLoginCodeSchema);
