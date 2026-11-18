import { useCallback, useEffect, useRef, useState } from "react";
import api, { getErrorMessage } from "../api";
import { socket } from "../socket";
import Avatar from "./Avatar";
import { formatListTime } from "../utils/time";

/* ───────────────────────── small presentational pieces ───────────────────────── */

const Skeleton = () => (
    <div className="p-3 space-y-1">
        {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
                <div className="w-11 h-11 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                    <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
                </div>
            </div>
        ))}
    </div>
);

const EmptyState = ({ title, hint, action }) => (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        </div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
        {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[220px]">{hint}</p>}
        {action}
    </div>
);

const SectionLabel = ({ children, count }) => (
    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-2">
        {children}
        {count !== undefined && (
            <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 normal-case tracking-normal">
                {count}
            </span>
        )}
    </div>
);

const btn = "text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

/** Right-hand action area of a "person" row, depending on the relationship. */
const PersonActions = ({ user, busy, onConnect, onAccept, onReject, onCancel }) => {
    switch (user.status) {
        case "connected":
            return (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Connected
                </span>
            );
        case "sent":
            return (
                <button
                    disabled={busy}
                    onClick={() => onCancel(user)}
                    title="Cancel request"
                    className={`${btn} bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400`}
                >
                    Requested ✕
                </button>
            );
        case "received":
            return (
                <div className="flex gap-1">
                    <button disabled={busy} onClick={() => onAccept(user)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                        Accept
                    </button>
                    <button disabled={busy} onClick={() => onReject(user)} className={`${btn} bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-800/60 text-red-600 dark:text-red-400`}>
                        Reject
                    </button>
                </div>
            );
        default:
            return (
                <button disabled={busy} onClick={() => onConnect(user)} className={`${btn} bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white`}>
                    {busy ? "..." : "Connect"}
                </button>
            );
    }
};

const rowBase =
    "flex items-center gap-3 px-3 py-3 mx-1 rounded-xl transition-colors duration-100";
const rowClickable =
    "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700";

/* ───────────────────────────────── component ───────────────────────────────── */

/**
 * Left column of the app.
 *  - default page  → only my CONNECTED accounts (with last message + unread badge)
 *  - typing        → live search across everyone (connected people first)
 *  - "Show non-connected users" button → everyone I'm not connected with yet
 */
const ChatList = ({ activeUserId, onSelectUser }) => {
    const [search, setSearch] = useState("");
    const [discover, setDiscover] = useState(false);

    const [connections, setConnections] = useState(null); // null = still loading
    const [requests, setRequests] = useState({ received: [], sent: [] });
    const [results, setResults] = useState({ key: null, items: [], error: false });
    const [refreshTick, setRefreshTick] = useState(0);

    const [busyId, setBusyId] = useState(null);
    const [notice, setNotice] = useState("");

    const term = search.trim();
    const showingResults = discover || term.length > 0;
    const resultsKey = `${discover ? "d" : "s"}:${term}`;
    const resultsLoading = showingResults && results.key !== resultsKey;

    // Always-fresh copies for socket handlers (they must not capture stale state)
    const connectionsRef = useRef(null);
    const activeRef = useRef(activeUserId);
    useEffect(() => {
        connectionsRef.current = connections;
        activeRef.current = activeUserId;
    });

    // ───────── loaders ─────────
    const loadConnections = useCallback(async () => {
        try {
            const { data } = await api.get("/api/users/connections");
            setConnections(Array.isArray(data) ? data : []);
        } catch (err) {
            setConnections((prev) => prev ?? []);
            setNotice(getErrorMessage(err, "Could not load your chats"));
        }
    }, []);

    const loadRequests = useCallback(async () => {
        try {
            const { data } = await api.get("/api/users/requests");
            setRequests({ received: data.received || [], sent: data.sent || [] });
        } catch {
            /* non-critical */
        }
    }, []);

    const refreshAll = useCallback(() => {
        loadConnections();
        loadRequests();
        setRefreshTick((t) => t + 1);
    }, [loadConnections, loadRequests]);

    useEffect(() => {
        loadConnections();
        loadRequests();
    }, [loadConnections, loadRequests]);

    // ───────── search / discover (debounced, stale responses are cancelled) ─────────
    useEffect(() => {
        if (!showingResults) return;

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const { data } = await api.get("/api/users", {
                    params: { search: term || undefined, filter: discover ? "not_connected" : undefined },
                    signal: controller.signal,
                });
                setResults({ key: resultsKey, items: Array.isArray(data) ? data : [], error: false });
            } catch (err) {
                if (err.code === "ERR_CANCELED") return;
                setResults({ key: resultsKey, items: [], error: true });
            }
        }, term ? 300 : 0);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [showingResults, term, discover, resultsKey, refreshTick]);

    // ───────── realtime ─────────
    useEffect(() => {
        const bumpConversation = (userId, patch) => {
            setConnections((prev) => {
                if (!prev) return prev;
                const idx = prev.findIndex((u) => u._id === userId);
                if (idx === -1) return prev;
                const updated = { ...prev[idx], ...patch(prev[idx]) };
                return [updated, ...prev.filter((_, i) => i !== idx)]; // move to top
            });
        };

        const onReceive = (m) => {
            if (!connectionsRef.current?.some((u) => u._id === m.sender)) return refreshAll();
            const isOpen = activeRef.current === m.sender;
            bumpConversation(m.sender, (u) => ({
                lastMessage: m.content.slice(0, 120),
                lastMessageAt: m.createdAt,
                lastMessageFromMe: false,
                unreadCount: isOpen ? 0 : (u.unreadCount || 0) + 1,
            }));
        };

        const onSent = (m) =>
            bumpConversation(m.receiver, () => ({
                lastMessage: m.content.slice(0, 120),
                lastMessageAt: m.createdAt,
                lastMessageFromMe: true,
            }));

        const onPresence = ({ userId, isOnline, lastSeen }) => {
            const patch = (u) => (u._id === userId ? { ...u, isOnline, lastSeen } : u);
            setConnections((prev) => prev && prev.map(patch));
            setResults((prev) => ({ ...prev, items: prev.items.map(patch) }));
        };

        socket.on("receive_message", onReceive);
        socket.on("message_sent", onSent);
        socket.on("presence", onPresence);
        socket.on("request_received", refreshAll);
        socket.on("request_accepted", refreshAll);
        socket.on("request_rejected", refreshAll);
        socket.on("connection_removed", refreshAll); // someone disconnected → refresh both lists
        socket.on("message_deleted", loadConnections); // last-message preview may have changed
        socket.on("connect", refreshAll); // catch up after a reconnect

        return () => {
            socket.off("receive_message", onReceive);
            socket.off("message_sent", onSent);
            socket.off("presence", onPresence);
            socket.off("request_received", refreshAll);
            socket.off("request_accepted", refreshAll);
            socket.off("request_rejected", refreshAll);
            socket.off("connection_removed", refreshAll);
            socket.off("message_deleted", loadConnections);
            socket.off("connect", refreshAll);
        };
    }, [refreshAll, loadConnections]);

    // ───────── actions ─────────
    /** Update one person's status inside the search/discover results. */
    const patchResult = (id, status) =>
        setResults((prev) => ({
            ...prev,
            items: prev.items
                .map((u) => (u._id === id ? { ...u, status } : u))
                // once connected, a person no longer belongs in "not connected"
                .filter((u) => !(discover && u._id === id && status === "connected")),
        }));

    const act = async (user, request, nextStatus) => {
        setBusyId(user._id);
        setNotice("");
        try {
            await request();
            patchResult(user._id, nextStatus);
            loadRequests();
            if (nextStatus === "connected") loadConnections();
        } catch (err) {
            setNotice(getErrorMessage(err, "Action failed. Please try again."));
            refreshAll(); // state may have changed on the other side
        } finally {
            setBusyId(null);
        }
    };

    const onConnect = (u) => act(u, () => api.post(`/api/users/request/${u._id}`), "sent");
    const onCancel = (u) => act(u, () => api.delete(`/api/users/request/${u._id}`), "none");
    const onAccept = (u) => act(u, () => api.post(`/api/users/accept/${u._id}`), "connected");
    const onReject = (u) => act(u, () => api.post(`/api/users/reject/${u._id}`), "none");

    const openChat = (user) => {
        setConnections((prev) => prev && prev.map((u) => (u._id === user._id ? { ...u, unreadCount: 0 } : u)));
        onSelectUser(user);
    };

    const actions = { onConnect, onCancel, onAccept, onReject };

    // ───────── render helpers ─────────
    const renderConnectedRow = (u) => {
        const unread = u._id === activeUserId ? 0 : u.unreadCount || 0;
        return (
            <div
                key={u._id}
                onClick={() => openChat(u)}
                className={`${rowBase} ${rowClickable} ${u._id === activeUserId ? "bg-gray-100 dark:bg-gray-800" : ""}`}
            >
                <Avatar user={u} showStatus />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.username}</span>
                        <span className={`text-[11px] flex-shrink-0 ${unread ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-gray-400 dark:text-gray-500"}`}>
                            {formatListTime(u.lastMessageAt)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className={`text-xs truncate ${unread ? "text-gray-800 dark:text-gray-200 font-medium" : "text-gray-500 dark:text-gray-400"}`}>
                            {u.lastMessage
                                ? `${u.lastMessageFromMe ? "You: " : ""}${u.lastMessage}`
                                : u.isOnline ? "online" : "Say hello 👋"}
                        </span>
                        {unread > 0 && (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                                {unread > 99 ? "99+" : unread}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderPersonRow = (u) => {
        const connected = u.status === "connected";
        return (
            <div
                key={u._id}
                onClick={connected ? () => openChat(u) : undefined}
                className={`${rowBase} ${connected ? rowClickable : ""}`}
            >
                <Avatar user={u} showStatus />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.username}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{u.email || u.phone || "—"}</div>
                </div>
                <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <PersonActions user={u} busy={busyId === u._id} {...actions} />
                </div>
            </div>
        );
    };

    // ───────── UI ─────────
    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900">
            {/* Search + discover button */}
            <div className="px-3 pt-3 pb-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-2">
                <div className="flex items-center gap-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-3 py-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
                        placeholder={discover ? "Search people you're not connected with…" : "Search name, email or phone…"}
                        aria-label="Search users"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} aria-label="Clear search" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <button
                    onClick={() => { setDiscover((d) => !d); setNotice(""); }}
                    aria-pressed={discover}
                    className={`w-full flex items-center justify-center gap-2 text-xs font-medium py-2 rounded-full border transition-colors
                        ${discover
                            ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
                            : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {discover ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        )}
                    </svg>
                    {discover ? "Back to my chats" : "Show non-connected users"}
                </button>
            </div>

            {notice && (
                <div className="px-4 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-center justify-between gap-2">
                    <span>{notice}</span>
                    <button onClick={() => setNotice("")} aria-label="Dismiss" className="font-bold">×</button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {/* ───────── MODE A: search / discover results ───────── */}
                {showingResults ? (
                    resultsLoading ? (
                        <Skeleton />
                    ) : results.error ? (
                        <EmptyState
                            title="Couldn't load users"
                            hint="Check your connection and try again."
                            action={<button onClick={() => setRefreshTick((t) => t + 1)} className="mt-3 text-xs font-medium text-emerald-600 hover:underline">Retry</button>}
                        />
                    ) : results.items.length === 0 ? (
                        <EmptyState
                            title={term ? "No users found" : "You're connected with everyone 🎉"}
                            hint={term ? "Try a different name, email or phone number." : "There is nobody left to connect with right now."}
                        />
                    ) : (
                        <div className="py-1">
                            <SectionLabel count={results.items.length}>
                                {discover ? "Not connected" : "Search results"}
                            </SectionLabel>
                            {results.items.map(renderPersonRow)}
                        </div>
                    )
                ) : /* ───────── MODE B: my connected accounts ───────── */ connections === null ? (
                    <Skeleton />
                ) : (
                    <>
                        {requests.received.length > 0 && (
                            <div className="border-b border-gray-100 dark:border-gray-800 bg-amber-50/60 dark:bg-amber-900/10 pb-1">
                                <SectionLabel count={requests.received.length}>Connection requests</SectionLabel>
                                {requests.received.map(renderPersonRow)}
                            </div>
                        )}

                        {connections.length === 0 ? (
                            <EmptyState
                                title="No connections yet"
                                hint="Connect with people to start chatting."
                                action={
                                    <button
                                        onClick={() => setDiscover(true)}
                                        className="mt-3 text-xs font-medium px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                        Find people
                                    </button>
                                }
                            />
                        ) : (
                            <div className="py-1">
                                <SectionLabel count={connections.length}>Connected</SectionLabel>
                                {connections.map(renderConnectedRow)}
                            </div>
                        )}

                        {requests.sent.length > 0 && (
                            <div className="pb-2">
                                <SectionLabel count={requests.sent.length}>Waiting for reply</SectionLabel>
                                {requests.sent.map(renderPersonRow)}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ChatList;
