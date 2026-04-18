import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
    const { currentUser, accessToken, logout, setCurrentUser } = useAuth();

    const [open, setOpen] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [saving, setSaving] = useState(false);

    const [username, setUsername] = useState(currentUser?.username || "");
    const [phone, setPhone] = useState(currentUser?.phone || "");

    const [darkMode, setDarkMode] = useState(
        localStorage.getItem("dark_mode") === "true"
    );

    const dropdownRef = useRef();

    const firstLetter = currentUser?.username
        ? currentUser.username.charAt(0).toUpperCase()
        : "U";

    // ── Close dropdown on outside click ──
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ── Dark mode ──
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        localStorage.setItem("dark_mode", darkMode);
    }, [darkMode]);

    // ── Sync inputs when currentUser changes ──
    useEffect(() => {
        setUsername(currentUser?.username || "");
        setPhone(currentUser?.phone || "");
    }, [currentUser]);

    // ── Save profile ──
    const handleSaveProfile = async () => {
        try {
            setSaving(true);
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/auth/update-profile`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ username, phone }),
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            setCurrentUser(data.user);
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            setShowProfile(false);
        } catch (err) {
            console.error("PROFILE UPDATE ERROR:", err);
            alert(err.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Avatar color consistent per user ──
    const avatarColors = [
        "bg-emerald-500", "bg-blue-500", "bg-purple-500",
        "bg-orange-500", "bg-pink-500", "bg-teal-500",
    ];
    const avatarColor = avatarColors[
        (currentUser?.username?.charCodeAt(0) || 0) % avatarColors.length
    ];

    return (
        <>
            {/* ══════════════════════════════
                NAVBAR
            ══════════════════════════════ */}
            <div className="flex items-center justify-between
                bg-emerald-700 dark:bg-gray-900
                text-white px-4 h-14 flex-shrink-0
                border-b border-emerald-800 dark:border-gray-700 shadow-sm z-10">

                {/* Logo */}
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.549 4.116 1.51 5.845L.057 23.03a.75.75 0 00.914.914l5.184-1.453A11.953 11.953 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.9 0-3.68-.512-5.21-1.402l-.374-.22-3.878 1.086 1.086-3.878-.22-.374A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                        </svg>
                    </div>
                    <h1 className="text-base font-bold tracking-wide">WhatsApp Clone</h1>
                </div>

                {/* Right: Avatar + Dropdown */}
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setOpen(!open)}
                        className={`w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center font-bold text-sm text-white
                            ring-2 ring-white/30 hover:ring-white/60 transition-all cursor-pointer select-none`}
                        aria-label="Open menu"
                    >
                        {firstLetter}
                    </button>

                    {/* ── Dropdown ── */}
                    {open && (
                        <div className="absolute right-0 mt-2 w-52 rounded-xl shadow-xl overflow-hidden z-50
                            bg-white dark:bg-gray-800
                            border border-gray-100 dark:border-gray-700">

                            {/* User info header */}
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {currentUser?.username}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                    {currentUser?.email || currentUser?.phone || ""}
                                </p>
                            </div>

                            {/* Menu items */}
                            <div className="py-1">
                                <button
                                    onClick={() => { setShowProfile(true); setOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200
                                        hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    Profile
                                </button>

                                <button
                                    onClick={() => { setShowSettings(true); setOpen(false); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200
                                        hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Settings
                                </button>

                                <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

                                <button
                                    onClick={logout}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400
                                        hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════
                PROFILE MODAL
            ══════════════════════════════ */}
            {showProfile && (
                <div
                    className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowProfile(false); }}
                >
                    <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden
                        border border-gray-100 dark:border-gray-700">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Profile</h2>
                            <button
                                onClick={() => setShowProfile(false)}
                                className="w-7 h-7 rounded-full flex items-center justify-center
                                    hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Avatar preview */}
                        <div className="flex justify-center pt-6 pb-2">
                            <div className={`w-16 h-16 rounded-full ${avatarColor} flex items-center justify-center text-2xl font-bold text-white`}>
                                {username?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                        </div>

                        {/* Fields */}
                        <div className="px-5 pb-5 space-y-3 mt-2">
                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Username</label>
                                <input
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-colors
                                        bg-gray-50 dark:bg-gray-800
                                        border border-gray-200 dark:border-gray-600
                                        text-gray-900 dark:text-gray-100
                                        placeholder-gray-400 dark:placeholder-gray-500
                                        focus:border-emerald-500 dark:focus:border-emerald-400
                                        focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20"
                                    placeholder="Enter username"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Phone</label>
                                <input
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm rounded-lg outline-none transition-colors
                                        bg-gray-50 dark:bg-gray-800
                                        border border-gray-200 dark:border-gray-600
                                        text-gray-900 dark:text-gray-100
                                        placeholder-gray-400 dark:placeholder-gray-500
                                        focus:border-emerald-500 dark:focus:border-emerald-400
                                        focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-400/20"
                                    placeholder="Enter phone number"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Email</label>
                                <input
                                    value={currentUser?.email || ""}
                                    disabled
                                    className="w-full px-3 py-2.5 text-sm rounded-lg
                                        bg-gray-100 dark:bg-gray-700/50
                                        border border-gray-200 dark:border-gray-600
                                        text-gray-400 dark:text-gray-500
                                        cursor-not-allowed"
                                />
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => setShowProfile(false)}
                                    className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors
                                        bg-gray-100 dark:bg-gray-700
                                        text-gray-700 dark:text-gray-200
                                        hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={saving}
                                    className="flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors
                                        bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400
                                        dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-emerald-800
                                        text-white disabled:cursor-not-allowed"
                                >
                                    {saving ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════
                SETTINGS MODAL
            ══════════════════════════════ */}
            {showSettings && (
                <div
                    className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
                >
                    <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden
                        border border-gray-100 dark:border-gray-700">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
                            <button
                                onClick={() => setShowSettings(false)}
                                className="w-7 h-7 rounded-full flex items-center justify-center
                                    hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-1">
                            {/* Dark mode toggle row */}
                            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                        {darkMode ? (
                                            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M21.752 15.002A9.718 9.718 0 0118 15.75 9.75 9.75 0 018.25 6a9.718 9.718 0 01.002-3.752 9.75 9.75 0 1013.5 12.754z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                                            </svg>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Dark Mode</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {darkMode ? "Dark theme active" : "Light theme active"}
                                        </p>
                                    </div>
                                </div>

                                {/* Toggle switch */}
                                <button
                                    onClick={() => setDarkMode(!darkMode)}
                                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none
                                        ${darkMode
                                            ? "bg-emerald-500 dark:bg-emerald-600"
                                            : "bg-gray-300 dark:bg-gray-600"
                                        }`}
                                    aria-label="Toggle dark mode"
                                >
                                    <span
                                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                                            transition-transform duration-200
                                            ${darkMode ? "translate-x-5" : "translate-x-0"}`}
                                    />
                                </button>
                            </div>

                            {/* App version */}
                            <div className="flex items-center justify-between py-3">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Version</span>
                                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                                    1.0.0
                                </span>
                            </div>
                        </div>

                        <div className="px-5 pb-5">
                            <button
                                onClick={() => setShowSettings(false)}
                                className="w-full py-2.5 text-sm font-medium rounded-lg transition-colors
                                    bg-gray-100 dark:bg-gray-700
                                    text-gray-700 dark:text-gray-200
                                    hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Navbar;