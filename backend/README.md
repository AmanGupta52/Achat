# Backend (API)

Express 5 + MongoDB (Mongoose) + Socket.io.

```bash
cp .env.example .env     # MONGO_URI, JWT_SECRET, MESSAGE_SECRET, EMAIL_USER / EMAIL_PASS, CLIENT_URL
npm install
npm run dev              # http://localhost:5000   (npm start in production)
npm test                 # real app + real MongoDB; set REDIS_URL to include the two-instance test
```

The environment variables are documented in `.env.example` and in the main README. The API and socket events are listed in the main README.
