import { createContext, useContext, useEffect, useState } from "react";
import api, { getErrorMessage } from "../api";
import { connectSocket, disconnectSocket } from "../socket";
import { TOKEN_KEY, USER_KEY } from "../config";

const AuthContext = createContext(null);

const readStoredSession = () => {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const user = localStorage.getItem(USER_KEY);
        if (token && user) return { token, user: JSON.parse(user) };
    } catch {
        /* corrupted storage → treat as logged out */
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { token: null, user: null };
};

/** Run an API call and rethrow as a plain Error with a readable message. */
const call = async (fn, fallback) => {
    try {
        return await fn();
    } catch (err) {
        const e = new Error(getErrorMessage(err, fallback));
        e.needsVerification = !!err.response?.data?.needsVerification;
        e.email = err.response?.data?.email;
        throw e;
    }
};

export const AuthProvider = ({ children }) => {
    const [session] = useState(readStoredSession); // read once, synchronously → no loading flash
    const [currentUser, setCurrentUser] = useState(session.user);
    const [accessToken, setAccessToken] = useState(session.token);

    const isAuthenticated = !!(currentUser && accessToken);

    // -----------------------------
    // session helpers
    // -----------------------------
    const persistUser = (user) => {
        setCurrentUser(user);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    };

    const setSession = ({ user, accessToken: token }) => {
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

    // Any API call that gets a 401 asks us to log out (see api.js)
    useEffect(() => {
        const onExpired = () => clearSession();
        window.addEventListener("auth:expired", onExpired);
        return () => window.removeEventListener("auth:expired", onExpired);
    }, []);

    // Validate the stored session on startup and refresh the profile
    useEffect(() => {
        if (!accessToken) return;
        api.get("/api/auth/me")
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

        return () => {
            clearInterval(id);
            disconnectSocket();
        };
    }, [accessToken]);

    // -----------------------------
    // actions
    // -----------------------------
    const login = async ({ loginId, password }) => {
        const { data } = await call(() => api.post("/api/auth/login", { loginId, password }), "Login failed");
        setSession(data);
        return data;
    };

    const loginWithGoogle = async (credential) => {
        const { data } = await call(() => api.post("/api/auth/google", { credential }), "Google login failed");
        setSession(data);
        return data;
    };

    const register = async (payload) => {
        const { data } = await call(() => api.post("/api/auth/register", payload), "Registration failed");
        return data;
    };

    const verifyOtp = async (email, otp) => {
        const { data } = await call(() => api.post("/api/auth/verify-otp", { email, otp }), "OTP verification failed");
        setSession(data); // ← the old Register page saved the token under the wrong key
        return data;
    };

    const resendOtp = async (email) => {
        const { data } = await call(() => api.post("/api/auth/resend-otp", { email }), "Failed to resend OTP");
        return data;
    };

    const forgotPassword = async (email) => {
        const { data } = await call(() => api.post("/api/auth/forgot-password", { email }), "Failed to send OTP");
        return data;
    };

    const resetPassword = async ({ email, otp, newPassword }) => {
        const { data } = await call(
            () => api.post("/api/auth/reset-password", { email, otp, newPassword }),
            "Password reset failed"
        );
        return data;
    };

    const updateProfile = async ({ username, phone }) => {
        const { data } = await call(
            () => api.put("/api/auth/update-profile", { username, phone }),
            "Failed to update profile"
        );
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
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used inside AuthProvider");
    return context;
};
