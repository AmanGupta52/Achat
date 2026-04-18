import Message from "./Message";
import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import { socket, sendSocketMessage } from "../socket.js";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const ChatBox = ({ selectedUser, onBack }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");

    const { accessToken, logout, currentUser } = useAuth();
    const myId = currentUser?._id?.toString();
    const bottomRef = useRef(null);

    // -----------------------------
    // AUTO SCROLL
    // -----------------------------
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // -----------------------------
    // LOAD MESSAGES
    // -----------------------------
    const loadMessages = useCallback(async () => {
        if (!selectedUser || !accessToken) return;

        try {
            const res = await axios.get(
                `${API_BASE}/api/chat/${selectedUser._id}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            setMessages(res.data || []);

            await axios.put(
                `${API_BASE}/api/chat/read/${selectedUser._id}`,
                {},
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            socket.emit("mark_read", { sender: selectedUser._id.toString() });

        } catch (err) {
            console.error("LOAD MESSAGES ERROR:", err);
            if (err.response?.status === 401) logout();
        }
    }, [selectedUser, accessToken, logout]);

    // -----------------------------
    // SEND MESSAGE
    // -----------------------------
    const handleSend = async () => {
        if (!input.trim() || !selectedUser || !accessToken) return;

        const tempId = Date.now().toString();
        const tempMessage = {
            _id: tempId,
            sender: myId,
            receiver: selectedUser._id.toString(),
            content: input,
            createdAt: new Date().toISOString(),
            delivered: false,
            read: false,
        };

        setMessages((prev) => [...prev, tempMessage]);
        setInput("");

        try {
            const res = await axios.post(
                `${API_BASE}/api/chat/send`,
                { receiverId: selectedUser._id, content: tempMessage.content },
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            const savedMessage = {
                ...res.data,
                sender: res.data.sender.toString(),
                receiver: res.data.receiver.toString(),
            };

            setMessages((prev) =>
                prev.map((m) => (m._id === tempId ? savedMessage : m))
            );

            sendSocketMessage({
                _id: savedMessage._id,
                sender: savedMessage.sender,
                receiver: savedMessage.receiver,
                content: savedMessage.content,
                createdAt: savedMessage.createdAt,
            });

        } catch (err) {
            console.error("SEND MESSAGE ERROR:", err);
            if (err.response?.status === 401) logout();
        }
    };

    // -----------------------------
    // ENTER KEY SUPPORT
    // -----------------------------
    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // -----------------------------
    // SOCKET LISTENERS
    // -----------------------------
    useEffect(() => {
        if (!selectedUser || !myId) return;

        setMessages([]);
        loadMessages();

        const messageHandler = (msg) => {
            const senderId = msg.sender?.toString();
            if (senderId === myId) return;
            if (senderId !== selectedUser._id.toString()) return;

            setMessages((prev) => {
                const exists = prev.some((m) => m._id === msg._id);
                return exists ? prev : [...prev, msg];
            });
        };

        const deliveredHandler = ({ messageId }) => {
            setMessages((prev) =>
                prev.map((m) => m._id === messageId ? { ...m, delivered: true } : m)
            );
        };

        const readHandler = ({ senderId }) => {
            setMessages((prev) =>
                prev.map((m) =>
                    m.sender?.toString() === senderId?.toString()
                        ? { ...m, read: true }
                        : m
                )
            );
        };

        socket.on("receive_message", messageHandler);
        socket.on("message_delivered", deliveredHandler);
        socket.on("messages_read", readHandler);

        return () => {
            socket.off("receive_message", messageHandler);
            socket.off("message_delivered", deliveredHandler);
            socket.off("messages_read", readHandler);
        };
    }, [selectedUser, loadMessages, myId]);

    // -----------------------------
    // EMPTY STATE
    // -----------------------------
    if (!selectedUser) {
        return (
            <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-gray-900 gap-4">
                <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                    <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                    </svg>
                </div>
                <div className="text-center">
                    <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                        WhatsApp Clone
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Select a conversation to start chatting
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full bg-[#efeae2] dark:bg-gray-900">

            {/* ── HEADER ── */}
            <div className="h-16 bg-white dark:bg-gray-800 flex items-center px-3 gap-3 border-b dark:border-gray-700 shadow-sm flex-shrink-0">

                {/* Back button — mobile only */}
                <button
                    onClick={onBack}
                    className="md:hidden p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Go back"
                >
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Avatar */}
                <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0 text-sm">
                    {selectedUser?.username?.charAt(0)?.toUpperCase() || "U"}
                </div>

                {/* Name & status */}
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-black dark:text-white truncate text-sm">
                        {selectedUser.username}
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">online</span>
                    </div>
                </div>
            </div>

            {/* ── MESSAGES ── */}
            <div className="flex-1 px-3 py-4 md:px-6 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-sm">
                            No messages yet. Say hello! 👋
                        </p>
                    </div>
                ) : (
                    messages.map((m) => (
                        <Message
                            key={m._id}
                            message={m}
                            own={m.sender?.toString() === myId}
                        />
                    ))
                )}
                <div ref={bottomRef} />
            </div>

            {/* ── INPUT BAR ── */}
            <div className="px-3 py-3 md:px-4 bg-gray-100 dark:bg-gray-800 border-t dark:border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-full px-4 py-2 shadow-sm">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        type="text"
                        placeholder="Type a message"
                        className="flex-1 outline-none bg-transparent text-black dark:text-white text-sm placeholder-gray-400 min-w-0"
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

        </div>
    );
};

export default ChatBox;