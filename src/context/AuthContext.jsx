import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

const API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL}/api/auth`;

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // -----------------------------
    // Restore session
    // -----------------------------
    useEffect(() => {
        const storedUser = localStorage.getItem("auth_user");
        const storedToken = localStorage.getItem("auth_token");

        if (storedUser && storedToken) {
            setCurrentUser(JSON.parse(storedUser));
            setAccessToken(storedToken);
            setIsAuthenticated(true);
        }

        setLoading(false);
    }, []);

    // -----------------------------
    // LOGIN (email/phone + password)
    // -----------------------------
    const login = async ({ loginId, password }) => {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ loginId, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Login failed");
        }

        setSession(data);
        return data;
    };

    // -----------------------------
    // GOOGLE LOGIN (IMPORTANT FIX)
    // -----------------------------
    const loginWithGoogle = async (credential) => {
        const res = await fetch(`${API_BASE_URL}/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Google login failed");
        }

        setSession(data); // THIS is correct (good)
        return data;
    };

    // -----------------------------
    // REGISTER
    // -----------------------------
    const register = async (payload) => {
        const res = await fetch(`${API_BASE_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Registration failed");
        }

        return data; // OTP flow handled separately
    };

    // -----------------------------
    // LOGOUT
    // -----------------------------
    const logout = () => {
        clearSession();
    };

    // -----------------------------
    // SESSION SET
    // -----------------------------
    const setSession = (data) => {
        setCurrentUser(data.user);
        setAccessToken(data.accessToken);
        setIsAuthenticated(true);

        localStorage.setItem("auth_user", JSON.stringify(data.user));
        localStorage.setItem("auth_token", data.accessToken);
    };

    const clearSession = () => {
        setCurrentUser(null);
        setAccessToken(null);
        setIsAuthenticated(false);

        localStorage.removeItem("auth_user");
        localStorage.removeItem("auth_token");
    };

    // -----------------------------
    // ROLE HELPERS
    // -----------------------------
    const hasRole = (role) => currentUser?.role === role;
    const isAdmin = () => hasRole("admin");

    // -----------------------------
    // AUTH FETCH
    // -----------------------------
    const authFetch = async (url, options = {}) => {
        const res = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
                ...options.headers,
            },
        });

        if (res.status === 401) {
            logout();
            throw new Error("Session expired");
        }

        return res;
    };

    return (
        <AuthContext.Provider
            value={{
                currentUser,
                accessToken,
                isAuthenticated,
                loading,

                login,
                loginWithGoogle,
                register,
                logout,

                hasRole,
                isAdmin,
                authFetch,
                setCurrentUser,
            }}
        >
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside AuthProvider");
    }
    return context;
};