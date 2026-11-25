# Frontend (web app)

React 19 + TypeScript + Vite + Tailwind. This same build is also packaged into the Android app by [`../mobile`](../mobile).

```bash
cp .env.example .env     # set VITE_API_BASE_URL (and optionally VITE_GOOGLE_CLIENT_ID)
npm install
npm run dev              # http://localhost:5173
npm run lint && npm run typecheck && npm run build
```

| Folder | What's inside |
|---|---|
| `src/components` | ChatList, ChatBox, Message, MessageMenu, UserInfo, Navbar, … |
| `src/pages` | Login, Register, Chat, FindPeople (the "Non-connected users" page, route `/people`) |
| `src/hooks/usePersonActions.ts` | connect / accept / reject / block, shared by the chat list and the FindPeople page |
| `src/context/AuthContext.tsx` | session, profile, socket lifecycle |
| `src/api.ts`, `src/socket.ts` | axios client (auto logout on 401), authenticated Socket.io |
| `src/utils` | time formatting, image resize, notifications (`notify.ts`), foreground/background (`appState.ts`) |
| `src/types.ts` | shapes of everything the API returns |

`VITE_FORCE_NATIVE=true npm run dev` previews the Android-app behaviour (hash routing, no Google button) in a desktop browser.
