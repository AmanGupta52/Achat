import { Capacitor } from "@capacitor/core";

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

/** true inside the Android app (Capacitor WebView), false in a normal browser */
export const IS_NATIVE: boolean =
  Capacitor.isNativePlatform() ||
  // dev/test switch: `VITE_FORCE_NATIVE=true npm run dev` previews the app's native code paths in a desktop browser
  import.meta.env.VITE_FORCE_NATIVE === "true";

/**
 * "Sign in with Google" only works in a normal browser: Google blocks OAuth inside embedded
 * WebViews, so the button is hidden in the Android app (email + OTP login works everywhere).
 */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
export const GOOGLE_ENABLED: boolean = !!GOOGLE_CLIENT_ID && !IS_NATIVE;

export const TOKEN_KEY = "auth_token";
export const USER_KEY = "auth_user";
export const APP_NAME = "WhatsApp Clone";
