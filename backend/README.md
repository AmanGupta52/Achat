# Backend (API)

Express 5 + MongoDB (Mongoose) + Socket.io.

```bash
cp .env.example .env     # MONGO_URI, JWT_SECRET, MESSAGE_SECRET, CLIENT_URL (+ EmailJS, optional Google)
npm install
npm run dev              # http://localhost:5000   (npm start in production)
npm test                 # real app + real MongoDB; set REDIS_URL to include the two-instance test
```

- **Emails** go through EmailJS: follow [`emailjs/README.md`](emailjs/README.md) (it includes the template). While `EMAILJS_*` is empty, emails and their codes are printed in the terminal, so local development needs no setup.
- **Google sign-in**: website needs `GOOGLE_CLIENT_ID`; the Android app also needs `GOOGLE_CLIENT_SECRET`. See the main README, section "Google sign-in".
- The environment variables are documented in `.env.example`; the API and socket events are listed in the main README.
