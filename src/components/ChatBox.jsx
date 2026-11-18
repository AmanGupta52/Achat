import { useCallback, useEffect, useRef, useState } from "react";
import api, { getErrorMessage } from "../api";
import { socket, sendTypingEvent } from "../socket";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import Message from "./Message";
import DeleteMessageDialog from "./DeleteMessageDialog";
import UserInfo from "./UserInfo";
import { dayLabel, formatLastSeen } from "../utils/time";

const MAX_LENGTH = 4000;

/** Apply a deletion to a message list (idempotent, so socket + HTTP results can both call it). */
const applyDeletion = (list, messageId, scope) =>
    scope === "everyone"
        ? list.map((m) => (m._id === messageId ? { ...m, deleted: true, content: "" } : m))
        : list.filter((m) => m._id !== messageId);

/** Add a message, or replace it if one with the same id already exists. */
const upsert = (list, msg) =>
    list.some((m) => m._id === msg._id) ? list.map((m) => (m._id === msg._id ? { ...m, ...msg } : m)) : [...list, msg];

/**
 * One open conversation.
 * Rendered with `key={selectedUser._id}` by the parent, so switching chats remounts it —
 * state resets cleanly and there are no stale messages or "reload loops".
 */
const ChatBox = ({ selectedUser, onBack }) => {
    const { currentUser } = useAuth();
    const myId = String(currentUser?._id);
    const peerId = String(selectedUser._id);

    const [peer, setPeer] = useState(selectedUser);
    const [peerTyping, setPeerTyping] = useState(false);
    const [messages, setMessages] = useState([]);
    const [status, setStatus] = useState("loading"); // loading | ready | error
    const [input, setInput] = useState("");

    const [showInfo, setShowInfo] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    const bottomRef = useRef(null);
    const firstScroll = useRef(true);
    const typingStopTimer = useRef(null);
    const peerTypingTimer = useRef(null);
    const iAmTyping = useRef(false);

    // ───────── load history (and mark it read) ─────────
    const loadMessages = useCallback(async () => {
        try {
            const { data } = await api.get(`/api/chat/${peerId}`);
            setMessages((prev) => {
                // keep unsent/failed local messages when a reload happens (e.g. after reconnect)
                const local = prev.filter((m) => m.pending || m.failed);
                return [...data, ...local];
            });
            setStatus("ready");
            api.put(`/api/chat/read/${peerId}`).catch(() => {});
        } catch {
            setStatus((s) => (s === "loading" ? "error" : s));
        }
    }, [peerId]);

    useEffect(() => {
        loadMessages();
    }, [loadMessages]);

    // fresh online / last-seen info for the header
    useEffect(() => {
        let cancelled = false;
        api.get(`/api/users/${peerId}`)
            .then(({ data }) => !cancelled && setPeer((p) => ({ ...p, ...data })))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [peerId]);

    // ───────── realtime ─────────
    useEffect(() => {
        const onReceive = (msg) => {
            if (msg.sender !== peerId) return; // other chats are handled by the list
            setMessages((prev) => upsert(prev, msg));
            setPeerTyping(false);
            api.put(`/api/chat/read/${peerId}`).catch(() => {}); // chat is open → it's read
        };

        // my own message echoed by the server (keeps my other tabs in sync)
        const onSent = (msg) => {
            if (msg.receiver !== peerId) return;
            setMessages((prev) => upsert(prev, msg));
        };

        const onDelivered = ({ messageId }) =>
            setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, delivered: true } : m)));

        const onRead = ({ readerId }) => {
            if (readerId !== peerId) return;
            setMessages((prev) => prev.map((m) => (m.sender === myId ? { ...m, delivered: true, read: true } : m)));
        };

        const onTyping = ({ sender, isTyping }) => {
            if (sender !== peerId) return;
            setPeerTyping(!!isTyping);
            clearTimeout(peerTypingTimer.current);
            if (isTyping) peerTypingTimer.current = setTimeout(() => setPeerTyping(false), 4000);
        };

        const onPresence = ({ userId, isOnline, lastSeen }) => {
            if (userId === peerId) setPeer((p) => ({ ...p, isOnline, lastSeen }));
        };

        // someone deleted a message (scope "everyone" → placeholder, "me" → gone from my view)
        const onDeleted = ({ messageId, scope }) => setMessages((prev) => applyDeletion(prev, messageId, scope));

        // either side disconnected → this conversation is no longer available
        const onConnectionRemoved = ({ userId }) => {
            if (userId === peerId) onBack();
        };

        socket.on("receive_message", onReceive);
        socket.on("message_sent", onSent);
        socket.on("message_delivered", onDelivered);
        socket.on("messages_read", onRead);
        socket.on("typing", onTyping);
        socket.on("presence", onPresence);
        socket.on("message_deleted", onDeleted);
        socket.on("connection_removed", onConnectionRemoved);
        socket.on("connect", loadMessages); // fetch anything missed while disconnected

        return () => {
            socket.off("receive_message", onReceive);
            socket.off("message_sent", onSent);
            socket.off("message_delivered", onDelivered);
            socket.off("messages_read", onRead);
            socket.off("typing", onTyping);
            socket.off("presence", onPresence);
            socket.off("message_deleted", onDeleted);
            socket.off("connection_removed", onConnectionRemoved);
            socket.off("connect", loadMessages);
            clearTimeout(peerTypingTimer.current);
        };
    }, [peerId, myId, loadMessages, onBack]);

    // stop "typing…" when leaving the chat
    useEffect(() => {
        return () => {
            clearTimeout(typingStopTimer.current);
            if (iAmTyping.current) sendTypingEvent(peerId, false);
        };
    }, [peerId]);

    // ───────── auto-scroll ─────────
    useEffect(() => {
        if (!messages.length) return;
        bottomRef.current?.scrollIntoView({ behavior: firstScroll.current ? "auto" : "smooth" });
        firstScroll.current = false;
    }, [messages.length, peerTyping]);

    // ───────── typing indicator (outgoing) ─────────
    const emitTyping = (value) => {
        if (iAmTyping.current === value) return;
        iAmTyping.current = value;
        sendTypingEvent(peerId, value);
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setInput(value);
        clearTimeout(typingStopTimer.current);

        if (value) {
            emitTyping(true);
            typingStopTimer.current = setTimeout(() => emitTyping(false), 1500);
        } else {
            emitTyping(false);
        }
    };

    // ───────── sending ─────────
    const postMessage = async (text, tempId, isRetry) => {
        if (isRetry) {
            setMessages((prev) => prev.map((m) => (m._id === tempId ? { ...m, pending: true, failed: false } : m)));
        } else {
            setMessages((prev) => [
                ...prev,
                {
                    _id: tempId,
                    sender: myId,
                    receiver: peerId,
                    content: text,
                    createdAt: new Date().toISOString(),
                    delivered: false,
                    read: false,
                    pending: true,
                },
            ]);
        }

        try {
            const { data } = await api.post("/api/chat/send", { receiverId: peerId, content: text });

            // the socket echo may already have added the saved message → never show it twice
            setMessages((prev) =>
                prev.some((m) => m._id === data._id)
                    ? prev.filter((m) => m._id !== tempId)
                    : prev.map((m) => (m._id === tempId ? data : m))
            );
        } catch (err) {
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === tempId ? { ...m, pending: false, failed: true, error: getErrorMessage(err, "Not sent") } : m
                )
            );
        }
    };

    const handleSend = () => {
        const text = input.trim();
        if (!text) return;

        setInput("");
        clearTimeout(typingStopTimer.current);
        emitTyping(false);

        postMessage(text, `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, false);
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ───────── deleting ─────────
    const openDelete = (message) => {
        setDeleteError("");
        setDeleteTarget(message);
    };

    const confirmDelete = async (scope) => {
        const target = deleteTarget;
        if (!target) return;

        // a message that never reached the server only exists locally
        if (target.failed) {
            setMessages((prev) => prev.filter((m) => m._id !== target._id));
            setDeleteTarget(null);
            return;
        }

        setDeleting(true);
        setDeleteError("");
        try {
            await api.delete(`/api/chat/message/${target._id}`, { params: { scope } });
            setMessages((prev) => applyDeletion(prev, target._id, scope));
            setDeleteTarget(null);
        } catch (err) {
            setDeleteError(getErrorMessage(err, "Could not delete the message. Please try again."));
        } finally {
            setDeleting(false);
        }
    };

    // ───────── header text ─────────
    const statusText = peerTyping ? "typing…" : peer.isOnline ? "online" : formatLastSeen(peer.lastSeen);
    const statusClass = peerTyping || peer.isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400";

    // ───────── render ─────────
    let lastDay = "";

    return (
        <div className="relative overflow-hidden flex flex-col h-full w-full bg-[#efeae2] dark:bg-gray-900">
            {/* HEADER */}
            <div className="h-16 bg-white dark:bg-gray-800 flex items-center px-3 gap-3 border-b dark:border-gray-700 shadow-sm flex-shrink-0">
                <button
                    onClick={onBack}
                    className="md:hidden p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Back to chats"
                >
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* clicking the contact opens their details (and the Disconnect option) */}
                <button
                    onClick={() => setShowInfo(true)}
                    aria-label="View contact info"
                    className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg py-1 -my-1 px-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                    <Avatar user={peer} showStatus />
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-white truncate text-sm">{peer.username}</div>
                        <div className={`text-xs truncate ${statusClass}`}>{statusText}</div>
                    </div>
                </button>
            </div>

            {/* MESSAGES */}
            <div className="flex-1 px-2 py-4 md:px-6 overflow-y-auto">
                {status === "loading" ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : status === "error" ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                        <p className="text-sm text-gray-600 dark:text-gray-300">Couldn't load this conversation.</p>
                        <button
                            onClick={() => { setStatus("loading"); loadMessages(); }}
                            className="text-xs font-medium px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            Try again
                        </button>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-sm">
                            No messages yet. Say hello! 👋
                        </p>
                    </div>
                ) : (
                    messages.map((m) => {
                        const label = dayLabel(m.createdAt);
                        const showDay = label !== lastDay;
                        lastDay = label;

                        return (
                            <div key={m._id}>
                                {showDay && (
                                    <div className="flex justify-center my-3">
                                        <span className="text-[11px] px-3 py-1 rounded-full bg-white/90 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shadow-sm">
                                            {label}
                                        </span>
                                    </div>
                                )}
                                <Message
                                    message={m}
                                    own={m.sender === myId}
                                    onRetry={(failed) => postMessage(failed.content, failed._id, true)}
                                    onDelete={openDelete}
                                />
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* INPUT */}
            <div className="px-3 py-3 md:px-4 bg-gray-100 dark:bg-gray-800 border-t dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-full px-4 py-2 shadow-sm">
                    <input
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        type="text"
                        maxLength={MAX_LENGTH}
                        placeholder="Type a message"
                        aria-label="Message"
                        className="flex-1 outline-none bg-transparent text-gray-900 dark:text-white text-sm placeholder-gray-400 min-w-0"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 flex items-center justify-center transition-colors flex-shrink-0"
                        aria-label="Send message"
                    >
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                        </svg>
                    </button>
                </div>
            </div>

            {showInfo && (
                <UserInfo user={peer} onClose={() => setShowInfo(false)} onDisconnected={onBack} />
            )}

            {deleteTarget && (
                <DeleteMessageDialog
                    message={deleteTarget}
                    own={deleteTarget.sender === myId}
                    busy={deleting}
                    error={deleteError}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={confirmDelete}
                />
            )}
        </div>
    );
};

export default ChatBox;
