/**
 * Every email Achat sends goes through here. One EmailJS template (backend/emailjs/achat-template.html)
 * renders all of them; only the variables change:
 *
 *   to_email, to_name, subject, title, message, otp, otp_display, expiry_minutes, app_name, year
 *
 * Behaviour by environment:
 *   production   → real EmailJS call; an error is thrown if EmailJS is not configured or fails
 *   development  → if EmailJS is not configured the email is printed to the console instead (so you can
 *                  register and log in locally without setting anything up)
 *   test         → collected in `mailer.outbox` (or sent to EMAILJS_API_URL if that is set)
 */
const emailjs = require("./emailjs");

const APP_NAME = "Achat";
const OTP_TTL_MINUTES = 5;

const outbox = [];

const deliver = async ({ to, params }) => {
    const isTest = process.env.NODE_ENV === "test";

    if (isTest && !process.env.EMAILJS_API_URL) {
        outbox.push({ to, params });
        return;
    }

    if (!emailjs.isConfigured()) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("EmailJS is not configured on the server");
        }
        // local development without EmailJS: show the email in the terminal
        console.log(
            `\n📧  [DEV — EmailJS not configured] To: ${to}\n    Subject: ${params.subject}\n    ${params.message}\n` +
                (params.otp ? `    >>> CODE: ${params.otp}  (valid ${params.expiry_minutes} min)\n` : "")
        );
        return;
    }

    await emailjs.sendTemplate({ to_email: to, ...params });
};

const base = (to, name) => ({
    to_name: name || "there",
    app_name: APP_NAME,
    year: String(new Date().getFullYear()),
    otp: "",
    otp_display: "none", // the template hides the code box when there is no code
    expiry_minutes: String(OTP_TTL_MINUTES),
    _to: to,
});

const send = (to, params) => {
    const { _to, ...rest } = params;
    return deliver({ to: _to || to, params: rest });
};

/** purpose: "verify" (sign-up / resend) or "reset" (forgot password) */
const sendOtpEmail = ({ to, name, purpose, otp, resend = false }) => {
    const p = base(to, name);
    if (purpose === "reset") {
        return send(to, {
            ...p,
            subject: `Reset your ${APP_NAME} password`,
            title: "Reset your password",
            message: `Hi ${p.to_name}, we received a request to reset the password of your ${APP_NAME} account. Enter the code below to choose a new password.`,
            otp,
            otp_display: "block",
        });
    }
    return send(to, {
        ...p,
        subject: resend ? `Your new ${APP_NAME} verification code` : `Verify your ${APP_NAME} account`,
        title: "Verify your email",
        message: resend
            ? `Hi ${p.to_name}, here is your new verification code.`
            : `Hi ${p.to_name}, welcome to ${APP_NAME}! Enter the code below to verify your email address and finish creating your account.`,
        otp,
        otp_display: "block",
    });
};

/** Sent once after an account is verified (or created with Google). */
const sendWelcomeEmail = ({ to, name }) => {
    const p = base(to, name);
    return send(to, {
        ...p,
        subject: `Welcome to ${APP_NAME} 🎉`,
        title: "You're all set!",
        message: `Hi ${p.to_name}, your ${APP_NAME} account is ready. Open the app, use the search bar to find your friends and send them a connection request. Once they accept, you can start chatting.`,
    });
};

/** Security notice after the password was changed with the reset code. */
const sendPasswordChangedEmail = ({ to, name }) => {
    const p = base(to, name);
    return send(to, {
        ...p,
        subject: `Your ${APP_NAME} password was changed`,
        title: "Password changed",
        message: `Hi ${p.to_name}, the password of your ${APP_NAME} account was just changed. If this was you, there is nothing more to do. If it was not you, reset your password again right away.`,
    });
};

module.exports = {
    sendOtpEmail,
    sendWelcomeEmail,
    sendPasswordChangedEmail,
    outbox,
    isConfigured: emailjs.isConfigured,
    OTP_TTL_MINUTES,
};
