import { Browser } from "@capacitor/browser";
import { API_BASE_URL } from "../config";

/**
 * Google sign-in for the Android app.
 *
 *  1. begin(): make a random PKCE `verifier`, keep it on the device, open the system browser at
 *     <backend>/api/auth/google/start?challenge=sha256(verifier)
 *  2. the user signs in with Google in the browser; the backend ends on a page that opens
 *     achat://auth?code=…   (or ?error=…)
 *  3. the app receives that link (AuthContext) and trades code + verifier for a session
 *
 * The code alone is worthless: only this app instance knows the verifier.
 */
const STORAGE_KEY = "google_pkce";
const MAX_AGE_MS = 15 * 60 * 1000;

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const beginGoogleSignIn = async (): Promise<void> => {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const challenge = toBase64Url(digest);

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ verifier, at: Date.now() }));
  await Browser.open({ url: `${API_BASE_URL}/api/auth/google/start?challenge=${challenge}` });
};

/** The verifier for the sign-in in progress (single use). */
export const takeVerifier = (): string | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const { verifier, at } = JSON.parse(raw) as { verifier: string; at: number };
    return Date.now() - at < MAX_AGE_MS ? verifier : null;
  } catch {
    return null;
  }
};

export type AuthLink = { kind: "code"; code: string } | { kind: "error"; message: string };

/** Understands achat://auth?code=… and achat://auth?error=…; anything else is not ours. */
export const parseAuthLink = (url: string): AuthLink | null => {
  if (!url.startsWith("achat://auth")) return null;
  const params = new URLSearchParams(url.split("?")[1] ?? "");
  const error = params.get("error");
  if (error) return { kind: "error", message: error };
  const code = params.get("code");
  return code ? { kind: "code", code } : { kind: "error", message: "Google sign-in did not finish. Please try again." };
};

export const closeBrowser = (): void => {
  Browser.close().catch(() => {});
};
