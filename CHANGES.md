# Changes in this revision

## Bugs fixed
| Where | Problem | Fix |
|---|---|---|
| `frontend/src/pages/Register.tsx` | Phone `pattern` had unescaped `()` inside a character class. Browsers compile `pattern` with the `v` flag, where that is a syntax error → validation silently ignored + console error. | Escaped: `[0-9\s\(\)\-]` |
| `frontend/src/hooks/usePersonActions.ts` | Ref written during render (fails `npm run lint` with react-hooks v7 / React Compiler, so CI failed). | Updated inside `useEffect` |
| `backend/socket/socket.js` | `typing` / `disconnect` listeners were attached **after** an `await`; events in that gap were lost (users stuck "online"). | Listeners registered synchronously; setup runs afterwards and bails out if the socket already left |
| `backend/utils/googleUser.js` | **Security:** someone could pre-register a victim's email with their own password; when the victim later used "Continue with Google" the account was linked and the attacker's password kept working. | A never-verified local sign-up now loses its password and becomes a Google account |
| `backend/controllers/googleAppController.js` | Helmet's default CSP blocked the inline redirect script on the "return to app" page, so the Android auto-redirect never ran (only the manual button worked). | Page gets its own strict nonce-based CSP |
| `backend/app.js` | Behind Render without `TRUST_PROXY`, all users shared one IP in the rate limiter. | Trusts one proxy hop automatically when `RENDER` is set |
| `backend/utils/emailjs.js` | User-facing error contained a stray "?". | Reworded |
| `frontend/src/components/Message.tsx` | Non-existent `italic-0` class. | Removed |

Two regression tests were added to `backend/test/google-app.test.js`.

## UI / design
* **One theme, two modes.** Colours are CSS-variable tokens (`bg-panel`, `text-ink`, `bg-brand`, `border-line`, …) defined in `src/index.css` and mapped in `tailwind.config.js`. Replaces ~150 scattered `dark:` pairs and three different greens (`#00a884`, `emerald-600/700`, `#25d366`).
* **Contrast:** brand fill `#008069` (white text 4.9:1); muted text `#667781` / `#8696a0` (≥4.6:1); avatar palette darkened so the white initial is readable.
* **Dark mode** now follows the device setting until you choose manually; the browser/Android `theme-color` follows the theme.
* **Type scale:** no more 10–11 px text (timestamps are 11 px, everything else ≥ 12 px); body 15 px, inputs 16 px on phones (prevents iOS zoom-on-focus), headings/titles larger.
* **Composer** is now a growing multi-line text box (Enter sends on desktop, Shift+Enter = new line; on phones Enter = new line and the ➤ button sends).
* **Phones:** safe-area padding for notch / gesture bar (header, composer, floating button), 44 px touch targets, `viewport-fit=cover`.
* Visible keyboard focus ring, reduced-motion support, larger bubbles on small screens, clearer buttons and dialogs.
