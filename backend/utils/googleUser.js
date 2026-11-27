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
    } else if (!user.isVerified) {
        // A sign-up that never confirmed its email: whoever typed this address first chose the password,
        // and may not own the mailbox. Google just proved the real owner, so throw that password away —
        // otherwise the person who pre-registered the address could still log in to this account.
        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    googleId,
                    authProvider: "google",
                    isVerified: true,
                    otp: null,
                    otpExpiry: null,
                    otpType: null,
                    otpAttempts: 0,
                },
                $unset: { password: 1 },
            }
        );
        user = await User.findById(user._id);
    } else if (!user.googleId) {
        // Link Google to the existing, verified account (keeps its original auth type)
        user.googleId = googleId;
        await user.save();
    }

    return user;
};

module.exports = { findOrCreateGoogleUser };
