# EmailJS setup (all of Achat's emails)

Achat sends five kinds of email — **sign-up verification code, new code, password-reset code, welcome, password-changed** — through [EmailJS](https://www.emailjs.com). They all use **one template** ([`achat-template.html`](achat-template.html)); only the variables change.

## 1. Create the email service
1. Sign up at emailjs.com (free plan: 200 emails/month).
2. **Email Services → Add New Service** → pick Gmail (or Outlook, …) and connect your account.
3. Copy the **Service ID** (looks like `service_abc123`).

## 2. Create the template
1. **Email Templates → Create New Template**.
2. In the template editor choose **Edit Content → Code Editor (`</>`)**, delete what's there and paste the whole of [`achat-template.html`](achat-template.html).
3. Open the **Settings** tab of the template and set:

| Field | Value |
|---|---|
| To Email | `{{to_email}}` |
| From Name | `Achat` |
| Reply To | your support address (optional) |
| Subject | `{{subject}}` |

4. **Save**, then copy the **Template ID** (looks like `template_xyz789`).

> Tip: use **Test it** in the template editor with the sample values below to preview the email.

```json
{
  "to_email": "you@example.com", "to_name": "Alex", "subject": "Verify your Achat account",
  "title": "Verify your email",
  "message": "Hi Alex, welcome to Achat! Enter the code below to verify your email address and finish creating your account.",
  "otp": "482913", "otp_display": "block", "expiry_minutes": "5", "app_name": "Achat", "year": "2026"
}
```
For a message **without** a code (welcome / password changed) use `"otp": ""` and `"otp_display": "none"`.

## 3. Keys and security switch
1. **Account → General → Public Key** — copy it.
2. **Account → Security** → turn **ON** "Allow EmailJS API for non-browser applications". *Without this the server gets a 403.*
3. Recommended: also enable "Use Private Key (recommended)" and copy the **Private Key**.

## 4. Give them to the backend
In `backend/.env` locally, and in the Render dashboard (Environment) in production:

```
EMAILJS_SERVICE_ID=service_abc123
EMAILJS_TEMPLATE_ID=template_xyz789
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key
```

Without these, local development still works: the email (and its code) is **printed in the backend terminal**. In production a missing configuration makes registration fail with a clear server log.

## Variables the backend sends

| Variable | Example | Used for |
|---|---|---|
| `to_email` | `alex@example.com` | recipient |
| `to_name` | `Alex` | greeting |
| `subject` | `Verify your Achat account` | subject line |
| `title` | `Verify your email` | big heading |
| `message` | `Hi Alex, welcome to Achat! …` | paragraph |
| `otp` | `482913` | the code (empty when there is none) |
| `otp_display` | `block` / `none` | shows or hides the code box |
| `expiry_minutes` | `5` | "expires in …" |
| `app_name` | `Achat` | branding |
| `year` | `2026` | footer |

EmailJS escapes `{{double braces}}` values, so a username like `<b>x</b>` can't inject HTML into an email.

## Troubleshooting (the backend log prints the reason)

| Log message | Fix |
|---|---|
| `enable "Allow EmailJS API for non-browser applications"` | Account → Security → turn it on |
| `rejected the request (400) … SERVICE_ID / TEMPLATE_ID / PUBLIC_KEY` | one of the IDs/keys is wrong or has a typo |
| `authentication failed` | wrong Public/Private key, or Private Key not enabled/sent |
| `could not use the connected email service (412)` | reconnect Gmail/Outlook in Email Services |
| `rate limit` | free plan limit reached; wait or upgrade |
| email goes to spam | send from a domain-based service or add SPF/DKIM; Gmail services work but may land in spam at first |
