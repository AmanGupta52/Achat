import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import api, { getErrorMessage } from "../api";
import { connectSocket, disconnectSocket } from "../socket";
import { App as CapacitorApp } from "@capacitor/app";
import { isPageVisible, subscribeVisibility } from "../utils/appState";
import { beginGoogleSignIn, closeBrowser, parseAuthLink, takeVerifier } from "../utils/googleApp";
import { IS_NATIVE, TOKEN_KEY, USER_KEY } from "../config";
import type { SelfUser, SessionPayload } from "../types";
import { isAxiosError } from "axios";

/** An error whose message is safe to show, plus hints the login page can act on. */
export class AuthError extends Error {
  needsVerification = false;
  email?: string;
}

export interface AuthContextValue {
  currentUser: SelfUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (creds: { loginId: string; password: string }) => Promise<SessionPayload>;
  loginWithGoogle: (credential: string) => Promise<SessionPayload>;
  register: (payload: { username: string; email: string; password: string; phone: string }) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<SessionPayload>;
  resendOtp: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (payload: { email: string; otp: string; newPassword: string }) => Promise<void>;
  /** Android app: open Google sign-in in the system browser */
  startGoogleApp: () => Promise<void>;
  googleAppPending: boolean;
  googleAppError: string;
  updateProfile: (payload: { username: string; phone: string; about: string }) => Promise<SelfUser>;
  uploadAvatar: (dataUrl: string) => Promise<SelfUser>;
  removeAvatar: () => Promise<SelfUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const readStoredSession = (): { token: string | null; user: SelfUser | null } => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = localStorage.getItem(USER_KEY);
    if (token && user) return { token, user: JSON.parse(user) as SelfUser };
  } catch {
    /* corrupted storage → treat as logged out */
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  return { token: null, user: null };
};

/** Run an API call and rethrow as an AuthError with a readable message. */
async function call<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = new AuthError(getErrorMessage(err, fallback));
    if (isAxiosError(err)) {
      const data = err.response?.data as { needsVerification?: boolean; email?: string } | undefined;
      e.needsVerification = !!data?.needsVerification;
      e.email = data?.email;
    }
    throw e;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session] = useState(readStoredSession); // read once, synchronously → no loading flash
  const [currentUser, setCurrentUser] = useState<SelfUser | null>(session.user);
  const [accessToken, setAccessToken] = useState<string | null>(session.token);

  const isAuthenticated = !!(currentUser && accessToken);

  // Google sign-in in the Android app (browser round trip)
  const [googleBrowserOpen, setGoogleBrowserOpen] = useState(false);
  const [googleExchanging, setGoogleExchanging] = useState(false);
  const [googleAppError, setGoogleAppError] = useState("");

  // ───────── session helpers ─────────
  const persistUser = (user: SelfUser) => {
    setCurrentUser(user);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const setSession = ({ user, accessToken: token }: SessionPayload) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setAccessToken(token);
    setCurrentUser(user);
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAccessToken(null);
    setCurrentUser(null);
  };

  // Any API call that gets a 401 asks us to log out (see api.ts)
  useEffect(() => {
    const onExpired = () => clearSession();
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  // The system browser hands the app back an achat://auth?code=… link: trade it for a session
  useEffect(() => {
    if (!IS_NATIVE) return;

    const handleLink = async (url: string) => {
      const link = parseAuthLink(url);
      if (!link) return; // some other link
      closeBrowser();
      setGoogleBrowserOpen(false);

      if (link.kind === "error") return setGoogleAppError(link.message);

      const verifier = takeVerifier();
      if (!verifier) return setGoogleAppError("This sign-in expired. Please try again.");

      setGoogleExchanging(true);
      try {
        const { data } = await api.post<SessionPayload>("/api/auth/google/exchange", { code: link.code, verifier });
        setSession(data);
      } catch (err) {
        setGoogleAppError(getErrorMessage(err, "Google sign-in failed. Please try again."));
      } finally {
        setGoogleExchanging(false);
      }
    };

    const subscription = CapacitorApp.addListener("appUrlOpen", ({ url }) => handleLink(url));
    CapacitorApp.getLaunchUrl()
      .then((launch) => {
        if (launch?.url) handleLink(launch.url);
      })
      .catch(() => {});

    // dev/test hook (only exists in builds made with VITE_FORCE_NATIVE=true): lets a browser deliver the link
    if (import.meta.env.VITE_FORCE_NATIVE === "true") {
      (window as unknown as { __achatDeepLink?: (url: string) => Promise<void> }).__achatDeepLink = handleLink;
    }

    return () => {
      subscription.then((handle) => handle.remove());
    };
  }, []);

  // If the user comes back from the browser without finishing (pressed Back), stop showing "waiting…"
  useEffect(() => {
    if (!googleBrowserOpen) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeVisibility(() => {
      clearTimeout(timer);
      if (isPageVisible()) timer = setTimeout(() => setGoogleBrowserOpen(false), 2500);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [googleBrowserOpen]);

  // Validate the stored session on startup and refresh the profile
  useEffect(() => {
    if (!accessToken) return;
    api
      .get<{ user: SelfUser }>("/api/auth/me")
      .then(({ data }) => persistUser(data.user))
      .catch(() => {}); // a 401 is handled globally; network errors are ignored
  }, [accessToken]);

  // Realtime connection + heartbeat (fallback presence if websockets are blocked)
  useEffect(() => {
    if (!accessToken) return;

    connectSocket();

    const beat = () => api.post("/api/auth/heartbeat").catch(() => {});
    beat();
    const id = setInterval(beat, 60 * 1000);

    // phones suspend background connections → reconnect as soon as the app is visible again
    const unsubscribe = subscribeVisibility(() => {
      if (isPageVisible()) {
        connectSocket();
        beat();
      }
    });

    return () => {
      clearInterval(id);
      unsubscribe();
      disconnectSocket();
    };
  }, [accessToken]);

  // ───────── actions ─────────
  const login: AuthContextValue["login"] = async ({ loginId, password }) => {
    const { data } = await call(() => api.post<SessionPayload>("/api/auth/login", { loginId, password }), "Login failed");
    setSession(data);
    return data;
  };

  const loginWithGoogle: AuthContextValue["loginWithGoogle"] = async (credential) => {
    const { data } = await call(() => api.post<SessionPayload>("/api/auth/google", { credential }), "Google login failed");
    setSession(data);
    return data;
  };

  const startGoogleApp: AuthContextValue["startGoogleApp"] = async () => {
    setGoogleAppError("");
    setGoogleBrowserOpen(true);
    try {
      await beginGoogleSignIn();
    } catch {
      setGoogleBrowserOpen(false);
      setGoogleAppError("Could not open the browser for Google sign-in.");
    }
  };

  const register: AuthContextValue["register"] = async (payload) => {
    await call(() => api.post("/api/auth/register", payload), "Registration failed");
  };

  const verifyOtp: AuthContextValue["verifyOtp"] = async (email, otp) => {
    const { data } = await call(() => api.post<SessionPayload>("/api/auth/verify-otp", { email, otp }), "OTP verification failed");
    setSession(data);
    return data;
  };

  const resendOtp: AuthContextValue["resendOtp"] = async (email) => {
    await call(() => api.post("/api/auth/resend-otp", { email }), "Failed to resend OTP");
  };

  const forgotPassword: AuthContextValue["forgotPassword"] = async (email) => {
    await call(() => api.post("/api/auth/forgot-password", { email }), "Failed to send OTP");
  };

  const resetPassword: AuthContextValue["resetPassword"] = async (payload) => {
    await call(() => api.post("/api/auth/reset-password", payload), "Password reset failed");
  };

  const updateProfile: AuthContextValue["updateProfile"] = async (payload) => {
    const { data } = await call(() => api.put<{ user: SelfUser }>("/api/auth/update-profile", payload), "Failed to update profile");
    persistUser(data.user);
    return data.user;
  };

  const uploadAvatar: AuthContextValue["uploadAvatar"] = async (image) => {
    const { data } = await call(() => api.put<{ user: SelfUser }>("/api/auth/avatar", { image }), "Failed to update picture");
    persistUser(data.user);
    return data.user;
  };

  const removeAvatar: AuthContextValue["removeAvatar"] = async () => {
    const { data } = await call(() => api.delete<{ user: SelfUser }>("/api/auth/avatar"), "Failed to remove picture");
    persistUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* even if the server is unreachable, always log out locally */
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        accessToken,
        isAuthenticated,
        login,
        loginWithGoogle,
        register,
        verifyOtp,
        resendOtp,
        forgotPassword,
        resetPassword,
        updateProfile,
        uploadAvatar,
        removeAvatar,
        startGoogleApp,
        googleAppPending: googleBrowserOpen || googleExchanging,
        googleAppError,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
