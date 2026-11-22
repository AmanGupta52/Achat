/**
 * Minimal EmailJS client (https://www.emailjs.com) — uses their REST API with Node's built-in fetch,
 * so there is no extra dependency.
 *
 * EmailJS dashboard setup (one-time, see backend/emailjs/README.md):
 *   • Email Services  → connect Gmail / Outlook / … → copy the Service ID
 *   • Email Templates → create the Achat template     → copy the Template ID
 *   • Account → General  → Public Key
 *   • Account → Security → turn ON "Allow EmailJS API for non-browser applications"
 *                          (and copy the Private Key if you enable "Use Private Key")
 */
const DEFAULT_API_URL = "https://api.emailjs.com/api/v1.0/email/send";

const config = () => ({
    serviceId: process.env.EMAILJS_SERVICE_ID,
    templateId: process.env.EMAILJS_TEMPLATE_ID,
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY, // optional, needed when "Use Private Key" is on
    apiUrl: process.env.EMAILJS_API_URL || DEFAULT_API_URL,
});

const isConfigured = () => {
    const c = config();
    return !!(c.serviceId && c.templateId && c.publicKey);
};

/** What the EmailJS error responses usually mean, in plain words. */
const explain = (status, body) => {
    const text = String(body || "").trim().slice(0, 300);
    if (status === 403 && /non-browser/i.test(text)) {
        return `EmailJS refused the request: enable "Allow EmailJS API for non-browser applications" in Account → Security. (${text})`;
    }
    if (status === 400 || status === 404) {
        return `EmailJS rejected the request (${status}): check EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID and EMAILJS_PUBLIC_KEY. (${text})`;
    }
    if (status === 401 || status === 403) {
        return `EmailJS authentication failed (${status}): check EMAILJS_PUBLIC_KEY / EMAILJS_PRIVATE_KEY. (${text})`;
    }
    if (status === 412) {
        return `EmailJS could not use the connected email service (${status}). Reconnect it in the EmailJS dashboard. (${text})`;
    }
    if (status === 429) return "EmailJS rate limit reached (free plan: 200 emails / month, 50 / day?). Try again later.";
    return `EmailJS error ${status}: ${text}`;
};

/** Send one email through the configured template. Throws an Error with a readable message on failure. */
const sendTemplate = async (templateParams) => {
    const c = config();
    if (!isConfigured()) throw new Error("EmailJS is not configured (EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY)");

    const payload = {
        service_id: c.serviceId,
        template_id: c.templateId,
        user_id: c.publicKey,
        template_params: templateParams,
    };
    if (c.privateKey) payload.accessToken = c.privateKey;

    let res;
    try {
        res = await fetch(c.apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });
    } catch (err) {
        throw new Error(`Could not reach EmailJS: ${err.message}`);
    }

    if (!res.ok) throw new Error(explain(res.status, await res.text().catch(() => "")));
};

module.exports = { sendTemplate, isConfigured };
