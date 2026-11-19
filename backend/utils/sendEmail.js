const nodemailer = require("nodemailer");

let transporter = null;

const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
    }
    return transporter;
};

const sendEmail = async (to, subject, html) => {
    // Under `npm test` nothing is sent — tests read the OTP from `sendEmail.outbox`
    if (process.env.NODE_ENV === "test") {
        sendEmail.outbox.push({ to, subject, html });
        return;
    }

    await getTransporter().sendMail({
        from: `"WhatsApp Clone" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
    });
};

sendEmail.outbox = [];

module.exports = sendEmail;
