const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html) => {
    // ✅ Create transporter INSIDE function (reads env vars fresh every time)
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    try {
        const info = await transporter.sendMail({
            from: `"WhatsApp Clone" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log("✅ Email sent to:", to, "| ID:", info.messageId);
    } catch (error) {
        console.error("❌ Email failed:");
        console.error("USER:", process.env.EMAIL_USER);
        console.error("PASS EXISTS:", !!process.env.EMAIL_PASS);
        console.error("ERROR:", error.message);
        throw error; // still throw so controller catches it
    }
};

module.exports = sendEmail;