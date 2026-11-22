import { Capacitor } from "@capacitor/core";

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

/** true inside the Android app (Capacitor WebView), false in a normal browser */
export const IS_NATIVE: boolean =
  Capacitor.isNativePlatform() ||
  // dev/test switch: `VITE_FORCE_NATIVE=true npm run dev` previews the app's native code paths in a desktop browser
  import.meta.env.VITE_FORCE_NATIVE === "true";

/**
 * "Continue with Google".
 *  - website:     Google's button (needs the Web client id)
 *  - Android app: Google blocks sign-in inside embedded WebViews, so the app opens the system browser
 *                 and comes back through the achat:// link (see utils/googleApp.ts)
 * Both are switched on by setting the same Web client id at build time.
 */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const GOOGLE_ENABLED: boolean = !!GOOGLE_CLIENT_ID;

export const TOKEN_KEY = "auth_token";
export const USER_KEY = "auth_user";
export const APP_NAME = "Achat";
