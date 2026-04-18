import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { socket, connectSocket } from "../socket.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const ChatList = ({ onSelectUser }) => {
    const { currentUser, accessToken } = useAuth();

    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState("");
    const [relations, setRelations] = useState({
        connections: [],
        sent: [],
        received: [],
    });
    const [loading, setLoading] = useState(false);

    // -------------------------
    // FETCH USERS
    // -------------------------
    const fetchUsers = async (query = "") => {
        try {
            if (!accessToken) return;
            setLoading(true);

            const url = query
                ? `${API_BASE_URL}/api/users?search=${query}`
                : `${API_BASE_URL}/api/users`;

            const res = await axios.get(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            setUsers(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("USER FETCH ERROR:", err);
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    // -------------------------
    // FETCH RELATIONS
    // -------------------------
    const fetchRelations = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/users/relations`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            setRelations({
                connections: (res.data.connections || []).map(String),
                sent: (res.data.connectionRequestsSent || []).map(String),
                received: (res.data.connectionRequestsReceived || []).map(String),
            });
        } catch (err) {
            console.error("RELATION ERROR:", err);
        }
    };

    // -------------------------
    // INIT LOAD
    // -------------------------
    useEffect(() => {
        if (!accessToken) return;
        fetchUsers();
        fetchRelations();
    }, [accessToken]);

    // -------------------------
    // SOCKET INIT
    // -------------------------
    useEffect(() => {
        if (!accessToken || !currentUser?._id) return;

        connectSocket(currentUser._id);

        const handleRefresh = () => fetchRelations();

        socket.on("request_received", handleRefresh);
        socket.on("request_accepted", handleRefresh);
        socket.on("request_rejected", handleRefresh);
        socket.on("connection_updated", handleRefresh);

        return () => {
            socket.off("request_received", handleRefresh);
            socket.off("request_accepted", handleRefresh);
            socket.off("request_rejected", handleRefresh);
            socket.off("connection_updated", handleRefresh);
        };
    }, [accessToken, currentUser?._id]);

    // -------------------------
    // SEARCH (DEBOUNCED)
    // -------------------------
    useEffect(() => {
        if (!accessToken) return;
        const t = setTimeout(() => fetchUsers(search), 300);
        return () => clearTimeout(t);
    }, [search, accessToken]);

    // -------------------------
    // HELPERS
    // -------------------------
    const isConnected = (id) => relations.connections.includes(String(id));
    const isSent = (id) => relations.sent.includes(String(id));
    const isReceived = (id) => relations.received.includes(String(id));

    // -------------------------
    // ACTIONS
    // -------------------------
    const handleRequest = async (id) => {
        await axios.post(
            `${API_BASE_URL}/api/users/request/${id}`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        fetchRelations();
    };

    const handleAccept = async (id) => {
        await axios.post(
            `${API_BASE_URL}/api/users/accept/${id}`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        fetchRelations();
    };

    const handleReject = async (id) => {
        await axios.post(
            `${API_BASE_URL}/api/users/reject/${id}`,
            {},
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        fetchRelations();
    };

    // -------------------------
    // AVATAR COLOR (consistent per user)
    // -------------------------
    const avatarColors = [
        "bg-emerald-500", "bg-blue-500", "bg-purple-500",
        "bg-orange-500", "bg-pink-500", "bg-teal-500",
        "bg-rose-500", "bg-indigo-500",
    ];

    const getAvatarColor = (id) => {
        const index = parseInt(String(id).slice(-1), 16) % avatarColors.length;
        return avatarColors[index];
    };

    // -------------------------
    // UI
    // -------------------------
    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">

            {/* ── SEARCH BAR ── */}
            <div className="px-3 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-3 py-2 shadow-sm">
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
                        placeholder="Search users..."
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* ── USER LIST ── */}
            <div className="flex-1 overflow-y-auto">

                {/* Pending requests banner */}
                {relations.received.length > 0 && (
                    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block animate-pulse"></span>
                            {relations.received.length} pending connection request{relations.received.length > 1 ? "s" : ""}
                        </p>
                    </div>
                )}

                {loading ? (
                    /* Skeleton loader */
                    <div className="p-3 space-y-1">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
                                <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                                    <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                            </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No users found</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try a different search term</p>
                    </div>
                ) : (
                    <div className="py-1">
                        {users.map((u) => {
                            const self = String(u._id) === String(currentUser?._id);
                            const connected = isConnected(u._id);
                            const sent = isSent(u._id);
                            const received = isReceived(u._id);

                            return (
                                <div
                                    key={u._id}
                                    onClick={() => onSelectUser(u)}
                                    className="flex items-center gap-3 px-3 py-3 mx-1 rounded-xl cursor-pointer
                                        hover:bg-gray-100 dark:hover:bg-gray-800
                                        active:bg-gray-200 dark:active:bg-gray-700
                                        transition-colors duration-100"
                                >
                                    {/* Avatar */}
                                    <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 ${getAvatarColor(u._id)}`}>
                                        {u.username?.charAt(0)?.toUpperCase() || "U"}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                {u.username}
                                                {self && (
                                                    <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 font-normal">(You)</span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                            {u.email || u.phone || "—"}
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    {!self && (
                                        <div
                                            className="flex gap-1.5 items-center flex-shrink-0"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {connected && (
                                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                    Connected
                                                </span>
                                            )}

                                            {!connected && !sent && !received && (
                                                <button
                                                    onClick={() => handleRequest(u._id)}
                                                    className="text-xs font-medium px-3 py-1 rounded-full
                                                        bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
                                                        dark:bg-emerald-600 dark:hover:bg-emerald-500
                                                        text-white transition-colors"
                                                >
                                                    Connect
                                                </button>
                                            )}

                                            {sent && (
                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-2.5 py-0.5 rounded-full">
                                                    Sent
                                                </span>
                                            )}

                                            {received && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleAccept(u._id)}
                                                        className="text-xs font-medium px-2.5 py-1 rounded-full
                                                            bg-emerald-500 hover:bg-emerald-600
                                                            dark:bg-emerald-600 dark:hover:bg-emerald-500
                                                            text-white transition-colors"
                                                    >
                                                        Accept
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(u._id)}
                                                        className="text-xs font-medium px-2.5 py-1 rounded-full
                                                            bg-red-100 hover:bg-red-200
                                                            dark:bg-red-900/40 dark:hover:bg-red-800/60
                                                            text-red-600 dark:text-red-400
                                                            transition-colors"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatList;