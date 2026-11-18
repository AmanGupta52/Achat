import { useState } from "react";
import Navbar from "../components/Navbar";
import ChatList from "../components/ChatList";
import ChatBox from "../components/ChatBox";

const EmptyChat = () => (
    <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-[#f0f2f5] dark:bg-gray-900 gap-4">
        <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
            <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
        </div>
        <div className="text-center">
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">WhatsApp Clone</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select a conversation to start chatting</p>
        </div>
    </div>
);

const Chat = () => {
    const [selectedUser, setSelectedUser] = useState(null);

    return (
        <div className="h-dvh flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-950">
            <Navbar />

            <div className="flex flex-1 min-h-0">
                {/* LEFT: connected accounts / search — hidden on mobile while a chat is open */}
                <div
                    className={`flex-col border-r border-gray-200 dark:border-gray-700 w-full md:w-[340px] lg:w-[380px] flex-shrink-0 min-h-0
                        ${selectedUser ? "hidden md:flex" : "flex"}`}
                >
                    <ChatList activeUserId={selectedUser?._id} onSelectUser={setSelectedUser} />
                </div>

                {/* RIGHT: conversation — hidden on mobile until a user is picked */}
                <div className={`flex-col flex-1 min-w-0 min-h-0 ${selectedUser ? "flex" : "hidden md:flex"}`}>
                    {selectedUser ? (
                        <ChatBox
                            key={selectedUser._id}
                            selectedUser={selectedUser}
                            onBack={() => setSelectedUser(null)}
                        />
                    ) : (
                        <EmptyChat />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Chat;
