const User = require("../models/User");

const OLD_DEFAULT_ABOUT = "Hey there! I am using WhatsApp Clone.";
const NEW_DEFAULT_ABOUT = "Hey there! I am using Achat.";

/**
 * The app was renamed to "Achat". Accounts created before that still carry the old default
 * "About" text; update those (people who wrote their own About text are left alone).
 * Idempotent: safe to run on every start.
 */
const renameDefaultAbout = async () => {
    const result = await User.updateMany({ about: OLD_DEFAULT_ABOUT }, { $set: { about: NEW_DEFAULT_ABOUT } });
    return result.modifiedCount;
};

module.exports = { renameDefaultAbout, OLD_DEFAULT_ABOUT, NEW_DEFAULT_ABOUT };
