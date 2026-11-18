# WhatsApp Clone (Achat)

React + Vite + Tailwind frontend, Express 5 + MongoDB + Socket.io backend.

## Features
- Email/phone sign-up with OTP verification, login, forgot/reset password, optional Google sign-in
- **Connected accounts** page (default): only people you're connected with, with last message + unread badge
- **Search**: live, debounced search by name / email / phone across all users
- **"Show non-connected users"** button: lists everyone you're not connected with, with Connect / Requested / Accept / Reject
- Real-time chat: delivery + read ticks, typing indicator, online / last seen, encrypted messages at rest
- **Delete messages**: "Delete for me" (your view only) or "Delete for everyone" (sender only; the stored text is erased)
- **Contact info panel**: click the name in the chat header to see details and **Disconnect**
- Dark mode, mobile layout

## Setup
```bash
# backend
cd backend
cp .env.example .env     # fill in MONGO_URI, JWT_SECRET, MESSAGE_SECRET, EMAIL_USER/PASS
npm install
npm run dev              # http://localhost:5000

# frontend (project root)
cp .env.example .env     # VITE_API_BASE_URL (+ optional VITE_GOOGLE_CLIENT_ID)
npm install
npm run dev              # http://localhost:5173
```
`MESSAGE_SECRET` must be 64 hex chars:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## API (all under `/api`, JWT required unless noted)
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/login`, `/auth/google`, `/auth/forgot-password`, `/auth/reset-password` | public |
| GET | `/auth/me` | current user |
| GET | `/users/connections` | my connected accounts (+ last message, unread) |
| GET | `/users?search=&filter=not_connected` | search / discover |
| GET | `/users/requests` | received + sent requests |
| POST/DELETE | `/users/request/:id` | send / cancel request |
| POST | `/users/accept/:id`, `/users/reject/:id` | answer a request |
| DELETE | `/users/connection/:id` | disconnect (history is kept) |
| GET | `/users/:id` | one user (presence) |
| POST | `/chat/send` · GET `/chat/:userId` · PUT `/chat/read/:userId` | messaging (connections only) |
| DELETE | `/chat/message/:id?scope=me\|everyone` | delete a message |

Socket.io authenticates with the same JWT (`auth: { token }`).
