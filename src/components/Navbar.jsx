import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
    const { currentUser, accessToken, logout, setCurrentUser } = useAuth();

    const [open, setOpen] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const [username, setUsername] = useState(currentUser?.username || "");
    const [phone, setPhone] = useState(currentUser?.phone || "");

    const [darkMode, setDarkMode] = useState(
        localStorage.getItem("dark_mode") === "true"
    );

    const dropdownRef = useRef();

    const firstLetter = currentUser?.username
        ? currentUser.username.charAt(0).toUpperCase()
        : "U";

    // close dropdown
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // -----------------------------
    // DARK MODE
    // -----------------------------
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        localStorage.setItem("dark_mode", darkMode);
    }, [darkMode]);

    // -----------------------------
    // SAVE PROFILE (frontend only)
    // -----------------------------
    const handleSaveProfile = async () => {
        try {
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/api/auth/update-profile`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({
                        username,
                        phone,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message);
            }

            // ✅ update frontend state
            setCurrentUser(data.user);
            localStorage.setItem("auth_user", JSON.stringify(data.user));

            setShowProfile(false);

        } catch (err) {
            console.error("PROFILE UPDATE ERROR:", err);
            alert(err.message);
        }
    };
    return (
        <>
            <div className="flex items-center justify-between bg-emerald-800 text-white px-4 h-16 dark:bg-gray-900">

                <h1 className="text-xl font-bold">WhatsApp Clone</h1>

                <div className="relative" ref={dropdownRef}>

                    {/* Avatar */}
                    <div
                        onClick={() => setOpen(!open)}
                        className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center font-bold cursor-pointer"
                    >
                        {firstLetter}
                    </div>

                    {/* Dropdown */}
                    {open && (
                        <div className="absolute right-0 mt-2 w-44 bg-white text-black rounded-lg shadow-lg overflow-hidden dark:bg-gray-800 dark:text-white">
                            <div className="px-4 py-2 border-b text-sm font-medium">
                                {currentUser?.username}
                            </div>

                            <button
                                onClick={() => {
                                    setShowProfile(true);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"                            >
                                Profile
                            </button>

                            <button
                                onClick={() => {
                                    setShowSettings(true);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"                            >
                                Settings
                            </button>

                            <button
                                onClick={logout}
                                className="w-full text-left px-4 py-2 hover:bg-red-100 dark:hover:bg-red-900 text-red-600"                            >
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ================= PROFILE MODAL ================= */}
            {showProfile && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white w-[350px] p-6 rounded-xl shadow-lg dark:bg-gray-900 dark:text-white">
                        <h2 className="text-lg font-semibold mb-4">Profile</h2>

                        <div className="space-y-3">
                            <input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="Username"
                            />

                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full border p-2 rounded dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="Phone"
                            />

                            <input
                                value={currentUser?.email || ""}
                                disabled
                                className="w-full border p-2 rounded bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                        </div>

                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setShowProfile(false)}
                                className="px-3 py-1 bg-gray-200 text-black rounded dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 hover:bg-gray-300 transition-colors"                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleSaveProfile}
                                className="px-3 py-1 bg-emerald-600 text-white rounded"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= SETTINGS MODAL ================= */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white w-[350px] p-6 rounded-xl shadow-lg dark:bg-gray-900 dark:text-white">
                        <h2 className="text-lg font-semibold mb-4">Settings</h2>

                        <div className="flex items-center justify-between">
                            <span>Dark Mode</span>

                            <input
                                type="checkbox"
                                checked={darkMode}
                                onChange={() => setDarkMode(!darkMode)}
                            />
                        </div>

                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => setShowSettings(false)}
                                className="px-3 py-1 bg-gray-200 text-black rounded dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 hover:bg-gray-300 transition-colors"                            >
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