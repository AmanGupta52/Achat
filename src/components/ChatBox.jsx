import Message from "./Message";
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { socket, sendSocketMessage } from "../socket.js";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const ChatBox = ({ selectedUser }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");

    const { accessToken, logout, currentUser } = useAuth();

    // ✅ SINGLE SOURCE OF TRUTH
    const myId = currentUser?._id?.toString();

    // -----------------------------
    // LOAD MESSAGES
    // -----------------------------
    const loadMessages = useCallback(async () => {
        if (!selectedUser || !accessToken) return;

        try {
            const res = await axios.get(
                `${API_BASE}/api/chat/${selectedUser._id}`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            setMessages(res.data || []);

            // mark as read
            await axios.put(
                `${API_BASE}/api/chat/read/${selectedUser._id}`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            // notify sender
            socket.emit("mark_read", {
                sender: selectedUser._id.toString(),
            });

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
                {
                    receiverId: selectedUser._id,
                    content: tempMessage.content,
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            const savedMessage = {
                ...res.data,
                sender: res.data.sender.toString(),
                receiver: res.data.receiver.toString(),
            };

            // replace temp message
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === tempId ? savedMessage : m
                )
            );

            // socket emit
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
    // SOCKET LISTENERS
    // -----------------------------
    useEffect(() => {
        if (!selectedUser || !myId) return;

        setMessages([]);
        loadMessages();

        const messageHandler = (msg) => {
            const senderId = msg.sender?.toString();

            // ignore own messages
            if (senderId === myId) return;

            // only current chat
            if (senderId !== selectedUser._id.toString()) return;

            setMessages((prev) => {
                const exists = prev.some((m) => m._id === msg._id);
                return exists ? prev : [...prev, msg];
            });
        };

        const deliveredHandler = ({ messageId }) => {
            setMessages((prev) =>
                prev.map((m) =>
                    m._id === messageId
                        ? { ...m, delivered: true }
                        : m
                )
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

    return (
        <div className="flex-[2] flex flex-col h-full bg-[#efeae2] dark:bg-gray-900">

            {/* HEADER */}
            <div className="h-16 bg-white dark:bg-gray-800 flex items-center px-4 border-b dark:border-gray-700">
                {selectedUser ? (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold">
                            {selectedUser?.username?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <div>
                            <div className="font-semibold text-black dark:text-white">
                                {selectedUser.username}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                online
                            </div>
                        </div>
                    </div>
                ) : (
                    <div>Select a chat</div>
                )}
            </div>

            {/* MESSAGES */}
            <div className="flex-1 p-4 overflow-y-auto">
                {messages.map((m) => {
                    const senderId = m.sender?.toString();

                    return (
                        <Message
                            key={m._id}
                            message={m}
                            own={senderId === myId}
                        />
                    );
                })}
            </div>

            {/* INPUT */}
            <div className="p-4 bg-gray-100 dark:bg-gray-800 flex items-center gap-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    type="text"
                    placeholder="Type a message"
                    className="flex-1 p-2 rounded-lg outline-none bg-white text-black dark:bg-gray-700 dark:text-white"
                />

                <button
                    onClick={handleSend}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg"
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default ChatBox;