const User = require("../models/User");
const mailer = require("./mailer");

/**
 * Find the account for a verified Google identity, linking or creating it as needed.
 * Shared by the website button (ID token) and the Android app flow (authorization code).
 */
const findOrCreateGoogleUser = async ({ email, name, googleId }) => {
    const normalized = email.toLowerCase();
    let user = await User.findOne({ email: normalized });

    if (!user) {
        user = await User.create({
            username: (name || normalized.split("@")[0]).slice(0, 50),
            email: normalized,
            googleId,
            authProvider: "google",
            isVerified: true,
        });

        // best effort — never block the login because of an email problem
        mailer.sendWelcomeEmail({ to: normalized, name: user.username }).catch((err) =>
            console.error("WELCOME EMAIL ERROR:", err.message)
        );
    } else if (!user.googleId || !user.isVerified) {
        // Link Google to the existing account (keeps its original auth type)
        user.googleId = user.googleId || googleId;
        user.isVerified = true;
        await user.save();
    }

    return user;
};

module.exports = { findOrCreateGoogleUser };
