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
    // FETCH RELATIONS (SOURCE OF TRUTH)
    // -------------------------
    const fetchRelations = async () => {
        try {
            const res = await axios.get(
                `${API_BASE_URL}/api/users/relations`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );

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
    // SOCKET INIT (FIXED)
    // -------------------------
    useEffect(() => {
        if (!accessToken || !currentUser?._id) return;

        // connect socket correctly
        connectSocket(currentUser._id);

        const handleRefresh = () => {
            // lightweight refresh only for correctness
            fetchRelations();
        };

        const handleRequestReceived = () => fetchRelations();
        const handleRequestAccepted = () => fetchRelations();
        const handleRequestRejected = () => fetchRelations();

        socket.on("request_received", handleRequestReceived);
        socket.on("request_accepted", handleRequestAccepted);
        socket.on("request_rejected", handleRequestRejected);
        socket.on("connection_updated", handleRefresh);

        return () => {
            socket.off("request_received", handleRequestReceived);
            socket.off("request_accepted", handleRequestAccepted);
            socket.off("request_rejected", handleRequestRejected);
            socket.off("connection_updated", handleRefresh);
        };
    }, [accessToken, currentUser?._id]);

    // -------------------------
    // SEARCH (DEBOUNCED)
    // -------------------------
    useEffect(() => {
        if (!accessToken) return;

        const t = setTimeout(() => {
            fetchUsers(search);
        }, 300);

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
    // UI
    // -------------------------
    return (
        <div className="flex-1 overflow-y-auto bg-white border-r dark:bg-gray-900 dark:border-gray-700">

            <div className="p-4 bg-gray-100 border-b flex gap-2 dark:bg-gray-800 dark:border-gray-700">
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 p-2 text-sm bg-white text-black border rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    placeholder="Search users..."
                />
            </div>

            {loading ? (
                <p className="p-4 text-sm">Loading...</p>
            ) : (
                users.map((u) => {
                    const self = String(u._id) === String(currentUser?._id);

                    return (
                        <div
                            key={u._id}
                            className="flex justify-between p-4 border-b cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700"
                            onClick={() => onSelectUser(u)}
                        >

                            <div>
                                <div className="text-black dark:text-white">{u.username}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {u.email || u.phone}
                                </div>
                            </div>

                            {!self && (
                                <div
                                    className="flex gap-2 items-center"
                                    onClick={(e) => e.stopPropagation()}
                                >

                                    {isConnected(u._id) && (
                                        <span className="text-green-600 text-xs dark:text-green-400">
                                            Connected
                                        </span>
                                    )}

                                    {!isConnected(u._id) &&
                                        !isSent(u._id) &&
                                        !isReceived(u._id) && (
                                            <button
                                                onClick={() => handleRequest(u._id)}
                                                className="bg-blue-500 text-white text-xs px-3 py-1 hover:bg-blue-600 dark:hover:bg-blue-400"
                                            >
                                                Connect
                                            </button>
                                        )}

                                    {isSent(u._id) && (
                                        <span className="text-gray-500 text-xs dark:text-gray-400">
                                            Request Sent
                                        </span>
                                    )}

                                    {isReceived(u._id) && (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => handleAccept(u._id)}
                                                className="bg-green-500 text-white text-xs px-2 hover:bg-green-600 dark:hover:bg-green-400"
                                            >
                                                Accept
                                            </button>
                                            <button
                                                onClick={() => handleReject(u._id)}
                                                className="bg-red-500 text-white text-xs px-2 hover:bg-red-600 dark:hover:bg-red-400"
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    )}

                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default ChatList;